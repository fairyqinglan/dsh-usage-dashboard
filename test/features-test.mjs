// Tests for the optimization pass: absolute ranges, period comparison,
// route-key caching equivalence, and cold-tail fold correctness.
import { foldApply, initialDayState, summarize, comparePeriods, dateKeyOf } from '../index.js'

const assert = (cond, name) => {
  if (!cond) { console.log('FAIL ' + name); process.exitCode = 1 }
  else console.log('ok ' + name)
}

const DAY_MS = 86_400_000
// Anchor to the real clock: `summarize` and `comparePeriods` read `Date.now()`
// and the host timezone, so a fixed calendar date would drift out of the window
// as days pass and silently flip these assertions.
const OFFSET = -new Date().getTimezoneOffset()
const TODAY = dateKeyOf(Date.now(), OFFSET)
const dayBack = n => dateKeyOf(Date.now() - n * DAY_MS, OFFSET)
const today = TODAY

/** Build a fold state with a known token count on a single day. */
function stateOn(day, provider, model, input, output = 0, cacheRead = 0, cacheWrite = 0, calls = 1) {
  const time = Date.parse(`${day}T12:00:00Z`)
  const key = `${provider}\u0000${model}`
  return {
    offset: OFFSET,
    skipBelow: 0,
    cutoff: '2025-01-01',
    route: undefined,
    days: {
      [day]: {
        [key]: { input, output, cacheRead, cacheWrite, calls },
      },
    },
  }
}

/** Merge several day states into one fold state (simple object merge). */
function merged(...states) {
  const out = { offset: OFFSET, skipBelow: 0, cutoff: '2025-01-01', route: undefined, days: {} }
  for (const state of states) {
    for (const [day, table] of Object.entries(state.days)) {
      const dest = out.days[day] ?? (out.days[day] = {})
      for (const [key, bucket] of Object.entries(table)) dest[key] = bucket
    }
  }
  return out
}

// --- 1. Absolute range: summarize with { start, end } instead of { days }. ---
const dayA = dayBack(2)
const dayB = dayBack(10)
const dayC = dayBack(20)
const state = merged(
  stateOn(dayA, 'p1', 'm1', 100),
  stateOn(dayB, 'p2', 'm2', 200),
  stateOn(dayC, 'p3', 'm3', 400),
)
const ranged = summarize([state], { start: dayB, end: dayA })
assert(ranged.days.length === 2, `absolute range selects 2 days (got ${ranged.days.length})`)
assert(ranged.totals.total === 300, `absolute range total correct (got ${ranged.totals.total})`)
assert(ranged.windowStart === dayB, 'absolute windowStart is the requested start')
assert(!ranged.models.some(m => m.model === 'm3'), 'absolute range excludes out-of-window model')
assert(/^\d{4}-\d{2}-\d{2}$/.test(ranged.today), 'today is a valid day key for absolute range')

// --- 2. Absolute range clamps to retention window. ---
const ancient = dayBack(500)
const clamped = summarize([state], { start: ancient, end: today })
const earliest = dayBack(364)
assert(clamped.windowStart === earliest || clamped.windowStart > earliest, `ancient start clamped to retention (got ${clamped.windowStart})`)

// --- 3. Absolute range with end before start falls back to today. ---
const inverted = summarize([state], { start: dayC, end: dayA })
assert(inverted.days.length >= 1, 'inverted range still produces a valid summary')

// --- 4. comparePeriods: same-length previous window. ---
// Current 7-day window: 300 tokens (dayA=100 + dayB=200).
// Previous 7-day window (day 8-14 back): 200 tokens (dayB at -10 days).
// Wait, dayB at -10 is in the previous 7-day window (day 8-14 back).
const cmp = comparePeriods([state], 7)
assert(cmp.days === 7, 'comparison window is 7 days')
assert(cmp.total.value === 100, `current 7-day total is 100 (dayA only; got ${cmp.total.value})`)
assert(cmp.total.prior === 200, `previous 7-day total is 200 (dayB; got ${cmp.total.prior})`)
assert(Math.abs(cmp.total.change - (-0.5)) < 1e-9, `WoW change is -50% (got ${cmp.total.change})`)
assert(cmp.currentStart <= dayA && cmp.currentEnd === today, 'comparison current window bounds are sane')

// --- 5. comparePeriods with no data: all zeros, change 0. ---
const emptyCmp = comparePeriods([], 7)
assert(emptyCmp.total.value === 0 && emptyCmp.total.prior === 0, 'empty comparison has zero totals')
assert(emptyCmp.total.change === 0, 'empty comparison change is 0')

// --- 6. comparePeriods with new usage where prior was zero: change null. ---
const onlyToday = merged(stateOn(today, 'p', 'm', 500))
const newCmp = comparePeriods([onlyToday], 7)
assert(newCmp.total.prior === 0 && newCmp.total.change === null, 'new usage with zero prior yields null change')

// --- 7. Year-over-year unavailable when prior year is beyond retention. ---
assert(cmp.yearOverYear.unavailable === true, 'YoY flagged unavailable when window is beyond 365-day retention')

// --- 8. Route-key parsing equivalence with the original split()[0]/[1]. ---
// A provider id with an embedded separator: original `split(SEP)[0]` gives
// 'provider', `[1]` gives 'weird' (the '|model' tail is ignored). Our cached
// parser must match that exactly.
const twoRoutes = merged(
  stateOn(dayA, 'provider\u0000weird\u0000model', 'x', 100),
  stateOn(dayA, 'provider', 'model', 200),
)
const parsed = summarize([twoRoutes], { days: 3 })
const providers = parsed.models.map(m => `${m.provider}|${m.model}`).sort()
assert(providers.includes('provider|weird'), 'multi-separator key matches original split()[0]/[1]')
assert(providers.includes('provider|model'), 'normal key parses correctly')

// --- 9. Cold-tail fold: only the newest events are folded when reading a tail. ---
// Simulate a large log: 20000 old events (no usage) + 3 recent usage events.
// The fold should include only the tail's usage when given the tail events.
const cutoff = '2025-01-01'
const tailEvents = [
  { type: 'assistant/message', seq: 20000, time: Date.parse(`${dayA}T10:00:00Z`), data: { message: { source: { provider: 'p', model: 'm' } }, usage: { inputTokens: 111 } } },
  { type: 'assistant/message', seq: 20001, time: Date.parse(`${dayA}T11:00:00Z`), data: { message: { source: { provider: 'p', model: 'm' } }, usage: { inputTokens: 222 } } },
  { type: 'assistant/message', seq: 20002, time: Date.parse(`${dayA}T12:00:00Z`), data: { message: { source: { provider: 'p', model: 'm' } }, usage: { inputTokens: 333 } } },
]
let tailState = initialDayState(0)
for (const event of tailEvents) tailState = foldApply(tailState, event)
const tailSummary = summarize([tailState], { days: 3 })
assert(tailSummary.totals.total === 666, `cold tail fold counts all recent usage (got ${tailSummary.totals.total})`)
assert(tailSummary.totals.calls === 3, 'cold tail fold counts all recent calls')

// --- 10. Inherited-prefix skip works with a tail that starts after the cut. ---
let inheritedState = initialDayState(2)
const withInherited = [
  { type: 'assistant/message', seq: 0, time: Date.parse(`${dayA}T09:00:00Z`), data: { message: { source: { provider: 'p', model: 'm' } }, usage: { inputTokens: 9999 } } },
  { type: 'assistant/message', seq: 1, time: Date.parse(`${dayA}T09:30:00Z`), data: { message: { source: { provider: 'p', model: 'm' } }, usage: { inputTokens: 9999 } } },
  ...tailEvents.map(e => ({ ...e, seq: e.seq + 2 })),
]
for (const event of withInherited) inheritedState = foldApply(inheritedState, event)
const inheritedSummary = summarize([inheritedState], { days: 3 })
assert(inheritedSummary.totals.total === 666, `inherited prefix excluded from fold (got ${inheritedSummary.totals.total})`)

console.log(process.exitCode ? 'FEATURES FAILED' : 'FEATURES ALL PASS')
