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
/** Wallet balance memo lifetime; Platform balance moves slowly, polling it per request is rude. */
const BALANCE_TTL_MS = 60_000
/** Client version sent with an account query; the field is required by the seam. */
const VERSION = '1.1.0'

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

/** @returns true when `value` is a `YYYY-MM-DD` calendar day. */
function isDayKey(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

/**
 * Resolve a window into `{ start, end, days }`. `days` is the trailing window
 * ending today; an explicit `{ start, end }` selects an absolute range. Both
 * are clamped to the retention window so a request cannot reach older logs.
 */
function resolveWindow({ days = 30, start, end } = {}, offset = hostDayOffsetMinutes(), now = Date.now()) {
  const today = dateKeyOf(now, offset)
  const earliest = dateKeyOf(now - (RETENTION_DAYS - 1) * DAY_MS, offset)
  if (isDayKey(start) || isDayKey(end)) {
    const from = isDayKey(start) && start >= earliest ? start : earliest
    const to = isDayKey(end) && end <= today && end >= from ? end : today
    return { start: from, end: to, days: 0 }
  }
  const span = Math.min(RETENTION_DAYS, Math.max(1, Math.trunc(days)))
  return { start: dateKeyOf(now - (span - 1) * DAY_MS, offset), end: today, days: span }
}

/**
 * Split a route key once per distinct model; the same key appears on every day
 * row of a session, so caching the split removes thousands of string ops on a
 * large fold without changing the data.
 */
function routeParts(key, cache) {
  let parts = cache.get(key)
  if (parts === undefined) {
    // Preserve the original `split(SEP)[0]` / `[1]` semantics exactly: a key
    // with no separator reads (key, 'unknown'); any extra separators are
    // ignored. Splitting once per distinct key and caching the result keeps
    // the old behaviour while removing the repeated work on every day row.
    const cut = key.indexOf(MODEL_SEP)
    const provider = cut < 0 ? (key || 'unknown') : (key.slice(0, cut) || 'unknown')
    const rest = cut < 0 ? '' : key.slice(cut + 1)
    const second = rest.indexOf(MODEL_SEP)
    const model = cut < 0
      ? 'unknown'
      : (second < 0 ? (rest || 'unknown') : (rest.slice(0, second) || 'unknown'))
    parts = { provider, model }
    cache.set(key, parts)
  }
  return parts
}

/** Reduce fold states to the window's total tokens and calls — used for deltas. */
function windowTotals(states, start, end) {
  let total = 0
  let calls = 0
  for (const state of states) {
    if (state === undefined) continue
    for (const [day, table] of Object.entries(state.days)) {
      if (day < start || day > end) continue
      for (const bucket of Object.values(table)) {
        total += bucket.input + bucket.output + bucket.cacheRead + bucket.cacheWrite
        calls += bucket.calls
      }
    }
  }
  return { total, calls }
}

/**
 * Merge per-session folds into the dashboard payload.
 * @param states - fold state per counted session.
 * @param options - `{ days }` trailing window, or `{ start, end }` absolute range.
 */
export function summarize(states, options = {}) {
  const offset = hostDayOffsetMinutes()
  const now = Date.now()
  const window = resolveWindow(options, offset, now)
  const { start: windowStart, end: today } = window
  const windowDays = window.days
  const keys = new Map()
  const models = new Map()
  const dayRows = new Map()
  let calls = 0

  for (const state of states) {
    if (state === undefined) continue
    for (const [day, table] of Object.entries(state.days)) {
      if (day < windowStart || day > today) continue
      for (const [key, bucket] of Object.entries(table)) {
        calls += bucket.calls
        const { provider, model } = routeParts(key, keys)
        const entry = models.get(key) ?? {
          key, provider, model,
          input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0, lastDay: '',
        }
        entry.input += bucket.input
        entry.output += bucket.output
        entry.cacheRead += bucket.cacheRead
        entry.cacheWrite += bucket.cacheWrite
        entry.calls += bucket.calls
        if (day > entry.lastDay) entry.lastDay = day
        models.set(key, entry)

        const row = dayRows.get(day) ?? { day, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0, models: [] }
        row.input += bucket.input
        row.output += bucket.output
        row.cacheRead += bucket.cacheRead
        row.cacheWrite += bucket.cacheWrite
        row.calls += bucket.calls
        row.models.push({
          key, provider, model,
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

/**
 * Period-over-period and year-over-year comparison for a trailing window.
 * Returns raw prior totals plus relative change so the UI can render arrows.
 */
export function comparePeriods(states, days = 30) {
  const offset = hostDayOffsetMinutes()
  const now = Date.now()
  const span = Math.min(RETENTION_DAYS, Math.max(1, Math.trunc(days)))
  const today = dateKeyOf(now, offset)
  const currentStart = dateKeyOf(now - (span - 1) * DAY_MS, offset)
  const previousEnd = dateKeyOf(now - span * DAY_MS, offset)
  const previousStart = dateKeyOf(now - (2 * span - 1) * DAY_MS, offset)
  const lastYearEnd = dateKeyOf(now - (365 + span) * DAY_MS, offset)
  const lastYearStart = dateKeyOf(now - (365 + 2 * span - 1) * DAY_MS, offset)
  const current = windowTotals(states, currentStart, today)
  const previous = windowTotals(states, previousStart, previousEnd)
  const lastYear = lastYearStart < dateKeyOf(now - (RETENTION_DAYS - 1) * DAY_MS, offset)
    ? { total: 0, calls: 0, unavailable: true }
    : windowTotals(states, lastYearStart, lastYearEnd)
  const delta = (value, prior, unavailable = false) => ({
    value,
    prior,
    change: prior === 0 ? (value === 0 ? 0 : null) : (value - prior) / prior,
    ...(unavailable ? { unavailable: true } : {}),
  })
  return {
    days: span,
    currentStart,
    currentEnd: today,
    previousStart,
    previousEnd,
    lastYearStart,
    lastYearEnd,
    total: delta(current.total, previous.total),
    calls: delta(current.calls, previous.calls),
    yearOverYear: delta(current.total, lastYear.total, lastYear.unavailable === true),
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
  /** Wallet balance memo; `undefined` means "not read yet". */
  let balanceCache = undefined
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
  async function foldStored(header, eventCount) {
    let handle = undefined
    try {
      handle = await persistence.open(header.id, 'read')
      // Read the newest events only: a bounded fold of the retention window's
      // tail. `read(0, N)` returns the OLDEST N events and silently misses all
      // recent usage on a large log — the opposite of what the dashboard needs.
      // The log's exact length comes from `snapshot.eventCount` (cheap metadata)
      // when available; otherwise one unbounded read supplies the length and is
      // reused when it already fits the bound.
      const known = Number.isFinite(eventCount) ? Math.max(0, Math.trunc(eventCount)) : undefined
      const full = known === undefined || known <= COLD_READ_MAX_EVENTS ? await handle.read() : undefined
      const totalEvents = known ?? (full.events.length === 0
        ? 0
        : integerOr(full.events[full.events.length - 1].seq, full.events.length - 1) + 1)
      const start = Math.max(0, totalEvents - COLD_READ_MAX_EVENTS)
      const read = full !== undefined
        ? full
        : await handle.read(start, COLD_READ_MAX_EVENTS)
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
        await foldStored(snapshot.header, snapshot.eventCount)
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

  /**
   * Read the signed-in DeepSeek wallet balance, cached briefly so a dashboard
   * poll does not hit Platform on every refresh. Every failure mode degrades to
   * an explicit status instead of throwing or inventing a zero balance:
   * `unavailable` (no account seam / not signed in), `failed` (query rejected),
   * or a ready value with normal + bonus wallets.
   * @returns `{ status, wallets, bonusWallets, currency, readAt }`.
   */
  async function readBalance() {
    const now = Date.now()
    if (balanceCache !== undefined && now - balanceCache.at < BALANCE_TTL_MS) return balanceCache.value
    // Resolve the seam defensively: a composition without the account plugin
    // simply has no balance to show, and a throwing lookup must not take the
    // usage summary down with it.
    let account
    try {
      account = ctx.get('deepseekAccount')
    } catch {
      account = undefined
    }
    if (account === undefined || typeof account.getBalance !== 'function') {
      const value = { status: 'unavailable' }
      balanceCache = { at: now, value }
      return value
    }
    let value
    try {
      const details = await account.getBalance({
        version: VERSION,
        locale: 'en',
        timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
      })
      if (details === null) {
        // Signed out (or the grant changed mid-query): nothing to show.
        value = { status: 'unavailable' }
      } else if (details.status !== 'ready') {
        value = { status: 'failed' }
      } else {
        const wallets = (details.value ?? []).map(wallet => ({ currency: wallet.currency, balance: wallet.balance }))
        const bonusWallets = (details.bonusWallets ?? []).map(wallet => ({ currency: wallet.currency, balance: wallet.balance }))
        value = {
          status: 'ready',
          wallets,
          bonusWallets,
          currency: wallets[0]?.currency ?? bonusWallets[0]?.currency ?? null,
          readAt: now,
        }
      }
    } catch (error) {
      ctx.logger.warn(`usage-dashboard: balance read failed: ${String(error?.message ?? error)}`)
      value = { status: 'failed' }
    }
    // A transient failure is retried sooner than a real balance.
    balanceCache = { at: now, value }
    return value
  }

  /**
   * Build a summary from the query: `days=N` trailing window, or an absolute
   * `from`/`to` range; `compare=1` adds period/year comparisons.
   */
  async function buildSummary(url) {
    const days = Math.min(RETENTION_DAYS, Math.max(1, whole(Number(url.searchParams.get('days'))) || 30))
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const options = isDayKey(from) || isDayKey(to) ? { start: from, end: to } : { days }
    const data = await states({ force: url.searchParams.get('refresh') === '1' })
    const summary = summarize(data, options)
    if (url.searchParams.get('compare') === '1' && (isDayKey(from) || isDayKey(to)) === false) {
      const compareDays = Math.min(RETENTION_DAYS, Math.max(1, whole(Number(url.searchParams.get('compareDays'))) || days))
      summary.comparison = comparePeriods(data, compareDays)
    }
    // The wallet balance is a separate, optional fact: its failure never fails
    // the usage summary.
    summary.balance = await readBalance()
    return summary
  }

  /** CSV escaping: quote any field containing a comma, quote or newline. */
  function csvCell(value) {
    const text = String(value ?? '')
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }

  /** Generate one CSV attachment from a summary's day/model rows. */
  function csvOf(summary) {
    const head = ['day', 'provider', 'model', 'input', 'output', 'cacheRead', 'cacheWrite', 'calls', 'total']
    const lines = [head.join(',')]
    for (const row of summary.days) {
      for (const item of row.models) {
        lines.push([
          row.day, item.provider, item.model,
          item.input, item.output, item.cacheRead, item.cacheWrite, item.calls, item.total,
        ].map(csvCell).join(','))
      }
    }
    return lines.join('\r\n') + '\r\n'
  }

  const route = '/api/token-usage-dashboard/summary'
  const exportRoute = '/api/token-usage-dashboard/export'
  const handler = async (req, res) => {
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
    try {
      const summary = await buildSummary(url)
      if (req.path === exportRoute || url.pathname === exportRoute) {
        const format = url.searchParams.get('format') === 'json' ? 'json' : 'csv'
        const stamp = summary.today
        if (format === 'json') {
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.setHeader('content-disposition', `attachment; filename="token-usage-${stamp}.json"`)
          res.end(JSON.stringify(summary, null, 2))
        } else {
          res.setHeader('content-type', 'text/csv; charset=utf-8')
          res.setHeader('content-disposition', `attachment; filename="token-usage-${stamp}.csv"`)
          res.end(csvOf(summary))
        }
        return
      }
      sendJson(res, 200, summary)
    } catch (error) {
      ctx.logger.warn(`usage-dashboard: request failed: ${String(error?.message ?? error)}`)
      sendJson(res, 500, { code: 'usage-dashboard/request-failed', message: String(error?.message ?? error) })
    }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: route, handler }), `usage-dashboard: GET ${route}`)
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: exportRoute, handler }), `usage-dashboard: GET ${exportRoute}`)

  ctx.logger.info('usage-dashboard: daily token usage mounted at /api/token-usage-dashboard/summary and /export')
}
