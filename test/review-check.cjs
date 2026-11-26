// Regression checks for the review findings: extracted-from-source behavior.
const fs = require('node:fs')
const path = require('node:path')
const src = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8')

// Pull out the real functions by slicing between their markers and eval them.
function slice(startMarker, endMarker) {
  const a = src.indexOf(startMarker)
  const b = src.indexOf(endMarker, a)
  if (a < 0 || b < 0) throw new Error('marker not found: ' + startMarker)
  return src.slice(a, b)
}
const helpers = [
  slice('function seriesOf(axis)', '/**'),
  slice('function streaksOf(axis)', '/**'),
  slice('function formatBig(value, locale)', '/** `2026-11-20`'),
  slice('function formatTokens(value)', '/** Grouped exact figure'),
  slice('function formatExact(value, locale)', 'function formatShare'),
  slice('function monthName(month, locale)', 'function axisDay'),
  slice('function axisDay(day, locale)', 'function fullDay'),
  slice('function fullDay(day, locale)', 'function streaksOf'),
  slice('function donutArcs(models, palette, size = 64, strokeWidth = 8)', '/** Every day from the window start'),
].join('\n')
const DAY_MS = 86_400_000
eval(helpers)

const assert = (cond, name) => { if (!cond) { console.log('FAIL ' + name); process.exitCode = 1 } else console.log('ok ' + name) }

// 1. seriesOf: values align BY INDEX with axis positions (the old tail-fill bug).
const axis = Array.from({ length: 5 }, (_, i) => ({
  day: new Date(Date.parse('2026-11-01T00:00:00Z') + i * DAY_MS).toISOString().slice(0, 10),
  row: i === 0
    ? { models: [{ key: 'm', provider: 'p', model: 'm', total: 10 }] }
    : i === 4 ? { models: [{ key: 'm', provider: 'p', model: 'm', total: 50 }] } : { models: [] },
}))
const series = seriesOf(axis)
assert(JSON.stringify(series[0].values) === '[10,0,0,0,50]', `seriesOf aligns by index (got ${JSON.stringify(series[0].values)})`)

// 2. streaksOf: only ONE trailing quiet day is exempt.
const streakAxis = [
  ...Array.from({ length: 5 }, (_, i) => ({ day: `2026-11-${String(i + 1).padStart(2, '0')}`, row: { total: 100 } })),
  ...Array.from({ length: 20 }, (_, i) => ({ day: `2026-11-${String(i + 6).padStart(2, '0')}`, row: undefined })),
]
const s1 = streaksOf(streakAxis)
assert(s1.current === 0, `20 quiet days break the current streak (got ${s1.current})`)
assert(s1.best === 5, `longest streak still 5 (got ${s1.best})`)
const streakAxis2 = [
  ...Array.from({ length: 5 }, (_, i) => ({ day: `2026-11-${String(i + 1).padStart(2, '0')}`, row: { total: 100 } })),
  { day: '2026-11-26', row: undefined }, // today, quiet — still exempt
]
const s2 = streaksOf(streakAxis2)
assert(s2.current === 5, `one quiet today keeps streak at 5 (got ${s2.current})`)

// 3. formatBig zh: 万→亿 promotion and integer thresholds.
assert(formatBig(99_999_999, 'zh') === '1.0 亿', `99999999 zh -> 1.0 亿 (got ${formatBig(99_999_999, 'zh')})`)
assert(formatBig(480_000_000, 'zh') === '4.8 亿', `480M zh -> 4.8 亿 (got ${formatBig(480_000_000, 'zh')})`)
assert(formatBig(12_345_678, 'zh') === '1235 万', `12.3M zh -> integer 万 (got ${formatBig(12_345_678, 'zh')})`)
assert(formatBig(9999, 'zh') === '9,999', `small zh stays exact (got ${formatBig(9999, 'zh')})`)
assert(formatBig(1_500_000, 'en') === '1.5M', `en uses K/M (got ${formatBig(1_500_000, 'en')})`)

// 4. monthName localized (not a hardcoded English array).
assert(monthName('2026-11', 'zh').includes('11'), `zh month name (got ${monthName('2026-11', 'zh')})`)
assert(/Nov/i.test(monthName('2026-11', 'en')), `en month name (got ${monthName('2026-11', 'en')})`)

// 5. axisDay / fullDay formats.
assert(axisDay('2026-11-20', 'zh') === '11月20日', `axisDay zh (got ${axisDay('2026-11-20', 'zh')})`)
assert(axisDay('2026-11-20', 'en') === 'Nov 20', `axisDay en (got ${axisDay('2026-11-20', 'en')})`)
assert(fullDay('2026-11-20', 'zh') === '2026年11月20日', `fullDay zh (got ${fullDay('2026-11-20', 'zh')})`)

// 6. Source checks: the trend chart no longer repeats a separate legend, and
//    it has no hover information card — the distribution ring already shows a
//    day's date and per-model split, so a tooltip would duplicate it. Hover
//    only moves the visual guide, and a selected day never double-draws marks.
assert(src.includes('showLegend = false') && src.includes('showLegend ? h('), 'trend legend is opt-in and off by default')
assert(!src.includes("h(TrendChart, { axis: rangeAxis, locale, t, showLegend"), 'settings trend chart does not duplicate a legend')
assert(src.includes('hoverIndex === null || hoverIndex === selectIndex ? null'), 'hover markers are skipped on the selected day (no overlap)')
// The trend chart's own source span has no tooltip layer; extract just that
// function to assert the removal without affecting the heatmap's tooltip.
const trendSrc = src.slice(src.indexOf('function TrendChart('), src.indexOf('function ModelTable('))
assert(!trendSrc.includes('useTip') && !trendSrc.includes('TipLayer') && !trendSrc.includes('tipFor'), 'trend chart has no hover information card (no duplicated date/model info)')
assert(!trendSrc.includes("h('title'"), 'trend chart has no native title tooltip either')
assert(trendSrc.includes("'aria-label': detail"), 'trend day targets keep accessible labels')
assert(src.includes('onSelectDay(cell.day') && src.includes("onClick: () => { onSelectDay(cell.day === selectedDay ? null : cell.day) }"), 'heatmap cells are clickable to select a day')
assert(src.includes('DistributionRing') && src.includes('aggregateModels(viewDay === undefined'), 'distribution ring shows the selected day breakdown')
assert(!src.includes('HEAT_MODES') && !src.includes('weekly'), 'weekly/cumulative modes removed from the activity block')
assert(src.includes('tabIndex: 0'), 'trend hit targets are keyboard reachable')
assert(!src.includes("preserveAspectRatio: 'none'"), 'trend SVG is not distorted')

// 7. Donut arcs form a CLOSED ring: arc lengths sum to the full circumference
//    (no gaps), each arc starts exactly where the previous one ended, and the
//    dasharray/dashoffset pair animates smoothly between days.
const palette = { color: () => 'var(--dsw-alias-brand-primary)' }
const ring = donutArcs(
  [{ key: 'a', total: 3 }, { key: 'b', total: 1 }],
  palette,
  64,
)
assert(ring.arcs.length === 2, `donut emits one arc per model (got ${ring.arcs.length})`)
const dashLengths = ring.arcs.map(a => Number(a.dash.split(' ')[0]))
assert(Math.abs(dashLengths[0] / dashLengths[1] - 3) < 0.01, `donut arcs are exactly proportional (got ${dashLengths.map(n => n.toFixed(1))})`)
const ringSum = dashLengths.reduce((a, b) => a + b, 0)
assert(Math.abs(ringSum - ring.circumference) < 0.01, `arc lengths close the ring (sum ${ringSum.toFixed(2)} vs circumference ${ring.circumference.toFixed(2)})`)
// Offsets: first arc starts at 0, each next starts where the previous ended.
// SVG advances the dash pattern with a NEGATIVE offset, so each arc's offset
// is the negative of its cumulative start length.
assert(Number(ring.arcs[0].offset) === 0, 'first arc starts at the origin')
assert(Math.abs(Number(ring.arcs[1].offset) + dashLengths[0]) < 0.01, 'second arc starts where the first ends (negative dashoffset)')
assert(ring.arcs.every(a => Number(a.offset) <= 0), 'all dash offsets are <= 0 (pattern advances forward)')
assert(ring.arcs.every(a => typeof a.dash === 'string' && typeof a.offset === 'string' && a.key), 'donut arcs carry dash + offset + key for CSS animation')
// The stroke's outer edge must fit inside the viewBox so the ring is not
// clipped by an SVG boundary (the "square cutting the ring" symptom).
assert(ring.radius + 8 / 2 <= 64 / 2, `ring outer edge fits viewBox (r=${ring.radius} + 4 <= 32)`)
const bigRing = donutArcs([{ key: 'a', total: 1 }], palette, 120, 14)
assert(bigRing.radius + 14 / 2 <= 120 / 2, `distribution ring not clipped (r=${bigRing.radius} + 7 <= 60)`)
assert(donutArcs([{ key: 'x', total: 0 }], palette, 64).arcs.length === 0, 'zero-usage donut is empty')

// 8. Day-pick interaction: the chart accepts a selection and clears it, the
//    panel narrows the breakdown to that day, and arcs animate via CSS.
assert(src.includes('selectedDay') && src.includes('onSelectDay') && src.includes('setSelectedDay'), 'trend chart has day-selection state')
assert(src.includes("event.key === 'Enter' || event.key === ' '"), 'day selection is keyboard reachable')
assert(src.includes('tud-donut-seg') && src.includes('stroke-dasharray') && src.includes('stroke-dashoffset'), 'donut segments animate via CSS dasharray/dashoffset transition')
assert(src.includes("transform: 'rotate(-90 30 30)'"), 'donut ring uses one fixed rotation from 12 o\'clock')
assert(src.includes('aggregateModels([{ day: selectedDay'), 'breakdown narrows to the selected day')
assert(src.includes('models.length === 0') && src.includes("h(State, { text: t('page.empty') })"), 'empty-day state is handled')
assert(src.includes('tud-pick-clear') && src.includes("setSelectedDay(null)"), 'selection can be cleared')

console.log(process.exitCode ? 'REGRESSION FAILED' : 'REGRESSION ALL PASS')
