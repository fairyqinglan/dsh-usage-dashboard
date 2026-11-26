// Quick fold self-test: pure functions from the host half, real event shapes.
import { foldApply, initialDayState, summarize, normalizeState, dateKeyOf } from '../index.js'

const assert = (cond, name) => { if (!cond) { console.log('FAIL ' + name); process.exitCode = 1 } else console.log('ok ' + name) }

const base = Date.parse('2026-11-18T10:00:00Z')

// A fork child: 2 inherited events (seq 0-1) copied from its parent's log.
const events = [
  // inherited: header + a call the parent already counted
  { type: 'request/header', seq: 0, time: base, data: { header: { config: { provider: 'openai', model: 'gpt-5' } } } },
  {
    type: 'assistant/message', seq: 1, time: base + 500,
    data: {
      message: { role: 'assistant', source: { kind: 'model', provider: 'openai', model: 'gpt-5' } },
      usage: { inputTokens: 9999, outputTokens: 9999 },
    },
  },
  // own work below this line
  {
    type: 'assistant/message', seq: 2, time: base + 1000,
    data: {
      message: { role: 'assistant', source: { kind: 'model', provider: 'openai', model: 'gpt-5' } },
      usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 10, cacheWriteTokens: 5 },
    },
  },
  // its own source names another route: source must win over request/header
  {
    type: 'assistant/message', seq: 3, time: base + 2000,
    data: {
      message: { role: 'assistant', source: { kind: 'model', provider: 'qodercn', model: 'qfmodel' } },
      usage: { inputTokens: 200, outputTokens: 300 },
    },
  },
  // no usage: contributes nothing (same reference)
  { type: 'assistant/message', seq: 4, time: base + 3000, data: { message: { role: 'assistant', source: { kind: 'model', provider: 'x', model: 'y' } } } },
  // zeroed usage: contributes nothing (same reference)
  {
    type: 'assistant/message', seq: 5, time: base + 4000,
    data: { message: { role: 'assistant', source: { kind: 'model', provider: 'x', model: 'y' } }, usage: { inputTokens: 0, outputTokens: 0 } },
  },
  // model source without provider/model: falls back to the latest request/header route
  {
    type: 'assistant/message', seq: 6, time: base + 5000,
    data: { message: { role: 'assistant', source: { kind: 'model' } }, usage: { outputTokens: 7 } },
  },
]

let state = initialDayState(2)
let sameRefs = 0
for (const e of events) {
  const next = foldApply(state, e)
  if (next === state) sameRefs++
  state = next
}

assert(sameRefs === 3, `irrelevant + inherited events keep the same state reference (got ${sameRefs})`)
assert(state.skipBelow === 2, 'skipBelow carried the inherited cut')

const day = dateKeyOf(base + 1000, state.offset)
const table = state.days[day]
assert(table !== undefined, 'bucketed under the event day')
const openai = table['openai\u0000gpt-5']
assert(openai !== undefined, 'openai/gpt-5 bucket exists')
assert(openai.input === 100, `openai input = 100 (got ${openai.input}, inherited 9999 excluded)`)
assert(openai.output === 57 && openai.cacheRead === 10 && openai.cacheWrite === 5, 'openai output/cache exact (header fallback folded in)')
assert(openai.calls === 2, `openai counted twice: own call + header-fallback call (got ${openai.calls})`)
const qoder = table['qodercn\u0000qfmodel']
assert(qoder && qoder.input === 200 && qoder.output === 300 && qoder.calls === 1, 'source metadata beats request/header')

// With no request/header at all, a routeless call is honestly "unknown".
let bare = foldApply(initialDayState(0), {
  type: 'assistant/message', seq: 0, time: base,
  data: { message: { role: 'assistant', source: { kind: 'model' } }, usage: { outputTokens: 3 } },
})
const bareDay = dateKeyOf(base, bare.offset)
assert(bare.days[bareDay]['unknown\u0000unknown']?.output === 3, 'routeless call with no header counts as unknown')

// State survives a JSON round trip (projection cache boundary).
const revived = normalizeState(JSON.parse(JSON.stringify(state)))
assert(revived !== undefined, 'state survives JSON round trip')
assert(revived.days[day]['openai\u0000gpt-5'].input === 100, 'round-tripped totals intact')
assert(revived.skipBelow === 2, 'round-tripped inherited cut intact')

// Summarize: totals, ranking, share.
const summary = summarize([revived], { days: 30 })
assert(summary.totals.input === 300, `summary input total (got ${summary.totals.input})`)
assert(summary.totals.output === 357, `summary output total (got ${summary.totals.output})`)
assert(summary.totals.calls === 3, `summary calls (got ${summary.totals.calls})`)
assert(summary.models.length === 2, `two routes reported (got ${summary.models.length})`)
assert(summary.models[0].provider === 'qodercn', 'routes ranked by total (qodercn first)')
assert(Math.abs(summary.models.reduce((s, m) => s + m.share, 0) - 1) < 1e-9, 'shares sum to 1')
assert(summary.days.length === 1 && summary.days[0].models.length === 2, 'one day with two model rows')

// Window filtering: a 2-day window starting after the event day shows nothing.
const narrow = summarize([revived], { days: 2 })
assert(narrow.days.length <= 1, 'window shrinks the day list')

const empty = summarize([], { days: 7 })
assert(empty.totals.total === 0 && empty.models.length === 0 && empty.days.length === 0, 'empty corpus summarises to zeros')

console.log(process.exitCode ? 'FAILED' : 'ALL PASS')
