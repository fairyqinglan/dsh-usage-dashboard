/**
 * dsh-usage-dashboard — daily token usage with a per-model breakdown.
 *
 * Two facts drive everything here.
 *
 * 1. The session log is the only source of truth. Every model call whose
 *    adapter reported token accounting lands one `assistant/message` event
 *    carrying `usage` plus the exact `provider`/`model` route that produced it
 *    (or the latest `request/header` config when the message carries none).
 *    This plugin folds those events and writes nothing to the log.
 * 2. Reading every log on every open would be rude. Attached sessions fold
 *    incrementally through `ctx.sessionProjections` — the framework's own
 *    drive — and their values reach the persisted projection cache with it.
 *    Detached sessions are served from that cache with zero log I/O, and only
 *    a session with no usable cache row is folded from its durable log once,
 *    then kept in process memory.
 *
 * State is aggregated by (local day, provider + model), so a session's whole
 * history costs a handful of numbers, not one row per call.
 *
 * Optional seams degrade instead of failing: without `sessionProjections` the
 * plugin folds committed events itself; without `sessionProjectionCache` or
 * `sessionPersistence` only the reachable part of the corpus is counted.
 *
 * @module @local/dsh-usage-dashboard
 */

/** Cordis function-plugin name. */
export const name = 'usage-dashboard'

/** The dashboard is a web surface: the route carrier and its trust fence are required. */
export const inject = ['sessions', 'webServer', 'connection']

/** Days kept in the fold; older activity is dropped when a new day bucket opens. */
const RETENTION_DAYS = 365
const DAY_MS = 86_400_000
/** Day buckets per session before the oldest are pruned (retention plus headroom). */
const MAX_DAYS = RETENTION_DAYS + 8
/** Model routes kept inside one day bucket before the smallest are merged away. */
const MAX_MODELS_PER_DAY = 48

/** Cold sessions folded concurrently during a refresh. */
const COLD_CONCURRENCY = 2
/** Events read per cold session at most; the retention window needs only recent days. */
const COLD_READ_MAX_EVENTS = 20_000
/** Whole-refresh wall-clock budget; exceeding it keeps whatever folded so far. */
const REFRESH_BUDGET_MS = 8_000
/** A refreshed snapshot is reused inside this window unless the caller forces one. */
const REFRESH_TTL_MS = 15_000

/** Separator inside a route key; never appears in a provider or model id. */
const MODEL_SEP = '\u0000'

/** @param value - anything. @returns whether it is a usable plain object. */
function isRecord(value) {
  return typeof value === 'object' && value !== null
}

/** @param value - anything. @returns a non-negative finite integer, else 0. */
function whole(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : 0
}

/** @param value - anything. @returns a finite integer, else `fallback`. */
function integerOr(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback
}

/**
 * The day boundary used for buckets, in minutes east of UTC. `Intl` reports it
 * with the sign flipped, so it is negated. Activity recorded under another
 * zone is bucketed in this one, because one dashboard has one clock.
 */
function hostDayOffsetMinutes() {
  try {
    return -new Date().getTimezoneOffset()
  } catch {
    return 0
  }
}

/** The local calendar day of `time` under `offset` minutes east of UTC. Exported for tests. */
export function dateKeyOf(time, offset) {
  return new Date(time + offset * 60_000).toISOString().slice(0, 10)
}

/** @returns one model-route accumulator. */
function emptyBucket() {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0 }
}

/** @returns an owned copy of `bucket`, reading only its own properties. */
function ownBucket(bucket) {
  const out = emptyBucket()
  if (!isRecord(bucket)) return out
  if (Object.hasOwn(bucket, 'input')) out.input = whole(bucket.input)
  if (Object.hasOwn(bucket, 'output')) out.output = whole(bucket.output)
  if (Object.hasOwn(bucket, 'cacheRead')) out.cacheRead = whole(bucket.cacheRead)
  if (Object.hasOwn(bucket, 'cacheWrite')) out.cacheWrite = whole(bucket.cacheWrite)
  if (Object.hasOwn(bucket, 'calls')) out.calls = whole(bucket.calls)
  return out
}

/**
 * The one model-route reading: the assistant message's own provider metadata
 * wins, the latest `request/header` config is the fallback, and neither
 * present is an honest `unknown`.
 */
function routeOf(source, fallback) {
  const provider = typeof source?.provider === 'string' && source.provider !== ''
    ? source.provider
    : typeof fallback?.provider === 'string' && fallback.provider !== '' ? fallback.provider : 'unknown'
  const model = typeof source?.model === 'string' && source.model !== ''
    ? source.model
    : typeof fallback?.model === 'string' && fallback.model !== '' ? fallback.model : 'unknown'
  return { provider, model }
}

/**
 * @returns one new day-bucket table, pruned to the newest days and, inside the
 *   written day, to the heaviest routes. The ceiling bounds persisted state no
 *   matter how many distinct models a user routes through.
 */
function withDay(days, day, models) {
  let table = models
  const keys = Object.keys(table)
  if (keys.length > MAX_MODELS_PER_DAY) {
    const ranked = keys
      .map(key => ({ key, total: totalOf(table[key]) }))
      .sort((a, b) => b.total - a.total)
    const kept = {}
    for (const entry of ranked.slice(0, MAX_MODELS_PER_DAY)) kept[entry.key] = table[entry.key]
    table = kept
  }
  const next = { ...days, [day]: table }
  const dayKeys = Object.keys(next)
  if (dayKeys.length <= MAX_DAYS) return next
  dayKeys.sort()
  const pruned = {}
  for (const key of dayKeys.slice(dayKeys.length - MAX_DAYS)) {
    const value = next[key]
    if (value !== undefined) pruned[key] = value
  }
  return pruned
}

/** @param bucket - one model-route accumulator. @returns its token sum. */
function totalOf(bucket) {
  if (!isRecord(bucket)) return 0
  return whole(bucket.input) + whole(bucket.output) + whole(bucket.cacheRead) + whole(bucket.cacheWrite)
}

/** @returns fresh fold state for an empty log. */
export function initialDayState(inheritedEventCount = 0) {
  const offset = hostDayOffsetMinutes()
  return {
    offset,
    // Events below the fork-inherited cut are copies of another session's log,
    // which that session already accounts for; folding them would double-count.
    skipBelow: whole(inheritedEventCount),
    cutoff: dateKeyOf(Date.now() - RETENTION_DAYS * DAY_MS, offset),
    days: {},
    route: undefined,
  }
}

/**
 * The pure fold shared by the projection unit and the cold scanner. Exported
 * for tests; the plugin uses it through the projection definition below.
 * @param state - fold state.
 * @param event - one committed session event.
 * @returns the same reference when the event contributes nothing.
 */
export function foldApply(state, event) {
  if (!isRecord(event)) return state
  const data = event.data
  if (event.type === 'request/header') {
    const config = isRecord(data) && isRecord(data.header) ? data.header.config : undefined
    const route = routeOf(config, null)
    if (state.route !== undefined && state.route.provider === route.provider && state.route.model === route.model) return state
    return { ...state, route }
  }
  if (event.type !== 'assistant/message') return state
  if (!isRecord(data)) return state
  const usage = data.usage
  if (!isRecord(usage)) return state
  const input = whole(usage.inputTokens)
  const output = whole(usage.outputTokens)
  const cacheRead = whole(usage.cacheReadTokens)
  const cacheWrite = whole(usage.cacheWriteTokens)
  if (input + output + cacheRead + cacheWrite === 0) return state
  // Inherited copies belong to the parent session's own accounting; skipping
  // them keeps a fork child from counting its parent's calls twice. The event
  // seq is stable (the log is contiguous from 0), so this needs no state.
  if (integerOr(event.seq, 0) < state.skipBelow) return state
  const day = dateKeyOf(integerOr(event.time, 0), state.offset)
  if (day < state.cutoff) return state
  const { provider, model } = routeOf(isRecord(data.message) ? data.message.source : undefined, state.route)
  const key = `${provider}${MODEL_SEP}${model}`
  const dayTable = state.days[day] ?? {}
  const bucket = ownBucket(dayTable[key])
  bucket.input += input
  bucket.output += output
  bucket.cacheRead += cacheRead
  bucket.cacheWrite += cacheWrite
  bucket.calls += 1
  return { ...state, days: withDay(state.days, day, { ...dayTable, [key]: bucket }) }
}

/** @returns fold state advanced over `events`. */
function foldAll(state, events) {
  let current = state
  for (const event of events) current = foldApply(current, event)
  return current
}

/** @returns validated state, or `undefined` when the payload is not a fold. Exported for tests. */
export function normalizeState(value) {
  if (!isRecord(value) || !isRecord(value.days)) return undefined
  const offset = integerOr(value.offset, hostDayOffsetMinutes())
  const state = {
    offset,
    skipBelow: whole(value.skipBelow),
    days: {},
    route: isRecord(value.route) ? routeOf(value.route, null) : undefined,
  }
  state.cutoff = typeof value.cutoff === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.cutoff)
    ? value.cutoff
    : dateKeyOf(Date.now() - RETENTION_DAYS * DAY_MS, offset)
  for (const [day, table] of Object.entries(value.days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !isRecord(table)) continue
    const models = {}
    for (const [key, bucket] of Object.entries(table)) {
      if (key === '' || typeof key !== 'string') continue
      models[key] = ownBucket(bucket)
    }
    state.days[day] = models
  }
  return state
}

/** The schema face the projection machinery needs: it only ever calls `parse`. */
const stateSchema = {
  parse(value) {
    const state = normalizeState(value)
    if (state === undefined) throw new TypeError('usageDashboard projection state is not a usage fold')
    return state
  },
}

/** The client view drops the fold-local route and keeps the aggregated days. */
const viewSchema = {
  parse(value) {
    const state = normalizeState(value)
    if (state === undefined) throw new TypeError('usageDashboard view is not a usage fold')
    return { offset: state.offset, cutoff: state.cutoff, days: state.days }
  },
}

/**
 * The `ctx.sessionProjections` unit. The key is this plugin's own: DSH's
 * token-meter already registers `tokenUsage` (whole-session totals), and the
 * registry refuses to share a key across definitions. `summary: false` keeps
 * the days out of every Session list row; the dashboard reads the key by name.
 */
const usageDashboardDefinition = {
  key: 'usageDashboard',
  stateVersion: 2,
  stateSchema,
  init: (_header, inheritedEventCount) => initialDayState(inheritedEventCount),
  apply: (state, event) => foldApply(state, event),
  wire: {
    viewSchema,
    view: state => ({ offset: state.offset, cutoff: state.cutoff, days: state.days }),
    summary: false,
  },
}

/** @param view - a cached or live wire view. @returns fold state shaped for the merger. */
function stateFromView(view) {
  const state = normalizeState(view)
  if (state === undefined) return undefined
  state.route = undefined
  return state
}

/**
 * Merge per-session folds into the dashboard payload.
 * @param states - fold state per counted session.
 * @param options - requested window in days.
 */
export function summarize(states, { days = 30 } = {}) {
  const windowDays = Math.min(RETENTION_DAYS, Math.max(1, Math.trunc(days)))
  const offset = hostDayOffsetMinutes()
  const now = Date.now()
  const today = dateKeyOf(now, offset)
  const windowStart = dateKeyOf(now - (windowDays - 1) * DAY_MS, offset)
  const models = new Map()
  const dayRows = new Map()
  let calls = 0

  for (const state of states) {
    if (state === undefined) continue
    for (const [day, table] of Object.entries(state.days)) {
      if (day < windowStart || day > today) continue
      for (const [key, bucket] of Object.entries(table)) {
        calls += bucket.calls
        const model = models.get(key) ?? {
          key,
          provider: key.split(MODEL_SEP)[0] ?? 'unknown',
          model: key.split(MODEL_SEP)[1] ?? 'unknown',
          input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0, lastDay: '',
        }
        model.input += bucket.input
        model.output += bucket.output
        model.cacheRead += bucket.cacheRead
        model.cacheWrite += bucket.cacheWrite
        model.calls += bucket.calls
        if (day > model.lastDay) model.lastDay = day
        models.set(key, model)

        const row = dayRows.get(day) ?? { day, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0, models: [] }
        row.input += bucket.input
        row.output += bucket.output
        row.cacheRead += bucket.cacheRead
        row.cacheWrite += bucket.cacheWrite
        row.calls += bucket.calls
        row.models.push({
          key,
          provider: key.split(MODEL_SEP)[0] ?? 'unknown',
          model: key.split(MODEL_SEP)[1] ?? 'unknown',
          input: bucket.input,
          output: bucket.output,
          cacheRead: bucket.cacheRead,
          cacheWrite: bucket.cacheWrite,
          calls: bucket.calls,
          total: bucket.input + bucket.output + bucket.cacheRead + bucket.cacheWrite,
        })
        dayRows.set(day, row)
      }
    }
  }

  const modelRows = [...models.values()]
    .map(entry => ({ ...entry, total: entry.input + entry.output + entry.cacheRead + entry.cacheWrite }))
    .sort((a, b) => b.total - a.total || (a.key < b.key ? -1 : 1))
  const grandTotal = modelRows.reduce((sum, entry) => sum + entry.total, 0)
  for (const entry of modelRows) entry.share = grandTotal === 0 ? 0 : entry.total / grandTotal

  const dayList = [...dayRows.values()]
    .map(row => ({ ...row, total: row.input + row.output + row.cacheRead + row.cacheWrite }))
    .sort((a, b) => (a.day < b.day ? -1 : 1))
  for (const row of dayList) row.models.sort((a, b) => b.total - a.total)

  const todayRows = dayList.filter(row => row.day === today)
  return {
    generatedAt: now,
    today,
    windowStart,
    windowDays,
    retentionDays: RETENTION_DAYS,
    dayOffsetMinutes: offset,
    sessions: states.length,
    totals: {
      total: grandTotal,
      input: modelRows.reduce((sum, entry) => sum + entry.input, 0),
      output: modelRows.reduce((sum, entry) => sum + entry.output, 0),
      cacheRead: modelRows.reduce((sum, entry) => sum + entry.cacheRead, 0),
      cacheWrite: modelRows.reduce((sum, entry) => sum + entry.cacheWrite, 0),
      calls,
      today: todayRows.reduce((sum, row) => sum + row.total, 0),
      todayCalls: todayRows.reduce((sum, row) => sum + row.calls, 0),
    },
    models: modelRows,
    days: dayList,
  }
}

/** Yield so a background fold cannot starve the agent loop. */
function yieldEventLoop() {
  return new Promise(resolve => setTimeout(resolve, 0))
}

/** Write one JSON response; `no-store` because usage is a live fact. */
function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}

/**
 * Mount the fold and its one read route.
 * @param ctx - the plugin context.
 */
export async function apply(ctx) {
  /** Optional seams, resolved once. Each absent seam narrows coverage only. */
  const projections = ctx.get('sessionProjections')
  const projectionCache = ctx.get('sessionProjectionCache')
  const persistence = ctx.get('sessionPersistence')

  /** Fold state for sessions the projection registry does not cover. */
  const local = new Map()
  /** Cold fold state by session id: `{ state, foldedThrough }`, where
   *  `foldedThrough` is the log position the fold covers, used to decide
   *  whether the stored log grew since we last looked. */
  const cold = new Map()
  /** In-flight cold refresh, shared by concurrent requests. */
  let refreshing = undefined
  let refreshedAt = 0
  /** Reads one session's live fold from whichever source this composition provides. */
  let localFold = undefined

  if (projections !== undefined) {
    // The route must not depend on registration succeeding: a key conflict or a
    // registry quirk would otherwise fail the plugin's activation and take the
    // whole dashboard offline. Fall back to the local fold instead.
    try {
      const handle = await projections.register(usageDashboardDefinition)
      ctx.effect(() => { void handle.dispose().catch(() => {}) }, 'usage-dashboard: usageDashboard release')
      localFold = session => {
        try {
          return handle.stateOf(session)
        } catch (error) {
          // A fold must never break the read: degrade to the local copy.
          ctx.logger.warn(`usage-dashboard: projection read failed for ${session.id}: ${String(error?.message ?? error)}`)
          return local.get(session.id)
        }
      }
    } catch (error) {
      ctx.logger.warn(`usage-dashboard: projection registration failed, folding locally: ${String(error?.message ?? error)}`)
    }
  }
  if (localFold === undefined) {
    // No registry (or registration failed): fold committed events here, still
    // incrementally per session.
    ctx.on('session/event', (session, event) => {
      const existing = local.get(session.id)
      local.set(session.id, foldApply(existing ?? initialDayState(session.inheritedEventCount), event))
    })
    ctx.on('session/disposed', (session) => { local.delete(session.id) })
    localFold = session => local.get(session.id)
  }

  /** @returns fold state for every attached session. */
  function attachedStates() {
    const out = []
    for (const session of ctx.sessions.list()) {
      const state = localFold(session)
      if (state !== undefined) out.push(state)
    }
    return out
  }

  /** @returns cached fold state plus its watermark for one stored session, when the cache has it. */
  function cachedState(header) {
    if (projectionCache === undefined) return undefined
    try {
      const block = projectionCache.cachedSnapshot(header, ['usageDashboard'])
      if (block === undefined) return undefined
      const state = stateFromView(block.values.usageDashboard)
      return state === undefined ? undefined : { state, foldedThrough: block.asOfSeq }
    } catch (error) {
      ctx.logger.warn(`usage-dashboard: cache read failed for ${header.id}: ${String(error?.message ?? error)}`)
      return undefined
    }
  }

  /** Fold one stored session from its durable log; the last resort for cold data. */
  async function foldStored(header) {
    let handle = undefined
    try {
      handle = await persistence.open(header.id, 'read')
      // Bounded read: a pathologically large log folds its newest events only,
      // which is exactly what the retention window can display anyway.
      const read = await handle.read(0, COLD_READ_MAX_EVENTS)
      // The handle's exact inherited cut is what keeps a fork child from
      // counting its parent's already-counted calls a second time.
      const state = foldAll(initialDayState(handle.inheritedEventCount), read.events)
      const foldedThrough = read.events.length === 0 ? -1 : read.events[read.events.length - 1].seq
      cold.set(header.id, { state, foldedThrough })
    } catch (error) {
      ctx.logger.warn(`usage-dashboard: cold fold failed for ${header.id}: ${String(error?.message ?? error)}`)
    } finally {
      if (handle !== undefined) await handle.close().catch(() => {})
    }
  }

  /**
   * Refresh the cold part of the corpus: cache rows first (zero log I/O),
   * durable logs only where no usable row exists.
   */
  async function refreshCold() {
    const attached = new Set(ctx.sessions.list().map(session => session.id))
    const snapshots = await persistence.list()
    const present = new Set()
    const missing = []
    for (const snapshot of snapshots) {
      const header = snapshot.header
      if (header === undefined || attached.has(header.id)) continue
      present.add(header.id)
      const cached = cachedState(header)
      if (cached !== undefined) {
        cold.set(header.id, cached)
        continue
      }
      const known = cold.get(header.id)
      if (known === undefined) {
        missing.push(snapshot)
        continue
      }
      // Keep the in-process fold when it already covers the stored log, or when
      // the backend reports no event count to compare against: refolding a whole
      // log on every open would cost more than the exactness is worth.
      if (!Number.isFinite(snapshot.eventCount) || known.foldedThrough < snapshot.eventCount - 1) missing.push(snapshot)
    }
    for (const sessionId of [...cold.keys()]) {
      if (!present.has(sessionId) && !attached.has(sessionId)) cold.delete(sessionId)
    }
    if (missing.length === 0) return
    const startedAt = Date.now()
    let cursor = 0
    const worker = async () => {
      while (cursor < missing.length) {
        if (Date.now() - startedAt > REFRESH_BUDGET_MS) return
        const snapshot = missing[cursor++]
        if (snapshot === undefined) return
        await foldStored(snapshot.header)
        if (cursor < missing.length) await yieldEventLoop()
      }
    }
    await Promise.all(Array.from({ length: Math.min(COLD_CONCURRENCY, missing.length) }, () => worker()))
  }

  /** @returns every fold state the plugin can currently see. */
  async function states({ force = false } = {}) {
    if (persistence !== undefined && (force || Date.now() - refreshedAt > REFRESH_TTL_MS)) {
      if (refreshing === undefined) {
        refreshing = refreshCold()
          .catch(error => ctx.logger.warn(`usage-dashboard: refresh failed: ${String(error?.message ?? error)}`))
          .finally(() => { refreshing = undefined })
      }
      // A non-forcing caller gets attached sessions now; cold values land as they arrive.
      if (force) await refreshing
      refreshedAt = Date.now()
    }
    // A session that was cold-folded and has since been opened is covered by its
    // live fold, which folds the whole log: drop the stale cold copy so nothing
    // reaches the dashboard twice.
    const attachedIds = new Set(ctx.sessions.list().map(session => session.id))
    for (const sessionId of [...cold.keys()]) {
      if (attachedIds.has(sessionId)) cold.delete(sessionId)
    }
    return [...attachedStates(), ...[...cold.values()].map(entry => entry.state)]
  }

  const route = '/api/token-usage-dashboard/summary'
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: route,
    handler: async (req, res) => {
      const rejection = ctx.connection.requestRejection(req)
      if (rejection !== undefined) {
        res.statusCode = rejection
        res.end()
        return
      }
      if (req.method !== 'GET') {
        res.statusCode = 405
        res.setHeader('allow', 'GET')
        res.end()
        return
      }
      const url = new URL(String(req.url), 'http://localhost')
      const days = Math.min(RETENTION_DAYS, Math.max(1, whole(Number(url.searchParams.get('days'))) || 30))
      try {
        sendJson(res, 200, summarize(await states({ force: url.searchParams.get('refresh') === '1' }), { days }))
      } catch (error) {
        ctx.logger.warn(`usage-dashboard: summary failed: ${String(error?.message ?? error)}`)
        sendJson(res, 500, { code: 'usage-dashboard/summary-failed', message: String(error?.message ?? error) })
      }
    },
  }), `usage-dashboard: GET ${route}`)

  ctx.logger.info('usage-dashboard: daily token usage mounted at /api/token-usage-dashboard/summary')
}
