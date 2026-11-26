// Render smoke test v3: drives the plugin's own store through a mocked fetch,
// renders the redesigned settings page (summary strip, heatmap, trend chart,
// model table) and the footer popover, asserting on real displayed output.
const fs = require('node:fs')

let moduleExports
const fakeLoad = spec => { moduleExports = spec.factory(() => ReactStub) }

let hookIndex = 0
const hookStore = []
const cleanups = []
const ReactStub = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  useState(initial) {
    const i = hookIndex++
    if (!(i in hookStore)) hookStore[i] = typeof initial === 'function' ? initial() : initial
    return [hookStore[i], v => { hookStore[i] = typeof v === 'function' ? v(hookStore[i]) : v }]
  },
  useEffect(fn) {
    const slot = hookIndex++
    const last = hookStore['sig' + slot]
    hookStore['sig' + slot] = 'x'
    if (last === 'x') return
    const cleanup = fn()
    if (typeof cleanup === 'function') cleanups.push(cleanup)
  },
  useRef(initial) {
    const i = hookIndex++
    if (!(i in hookStore)) hookStore[i] = { current: initial }
    return hookStore[i]
  },
  useMemo(fn) { return fn() },
  useCallback(fn) { return fn },
}

// Synthetic year: a big spike ~2 days ago, smaller runs earlier, one gap.
const DAY_MS = 86_400_000
const today = new Date().toISOString().slice(0, 10)
const dayList = []
const mkModel = (key, provider, model, total) => ({
  key, provider, model, input: Math.round(total * 0.4), output: Math.round(total * 0.6),
  cacheRead: 0, cacheWrite: 0, calls: 2, total,
})
for (let back = 364; back >= 0; back -= 1) {
  const day = new Date(Date.parse(`${today}T00:00:00Z`) - back * DAY_MS).toISOString().slice(0, 10)
  let total = 0
  const models = []
  if (back === 2) {
    models.push(mkModel('openai\u0000gpt-5', 'openai', 'gpt-5', 480_000_000))
    models.push(mkModel('qodercn\u0000qfmodel', 'qodercn', 'qfmodel', 120_000_000))
  } else if (back < 7 && back !== 5) {
    models.push(mkModel('openai\u0000gpt-5', 'openai', 'gpt-5', 12_345_678))
    models.push(mkModel('qodercn\u0000qfmodel', 'qodercn', 'qfmodel', 3_210_000))
    models.push(mkModel('mimo\u0000mimo-v2.6-pro', 'mimo', 'mimo-v2.6-pro', 987_000))
  } else if (back > 300 && back % 17 === 0) {
    models.push(mkModel('legacy\u0000old-model', 'legacy', 'old-model', 5_000_000))
  }
  for (const m of models) total += m.total
  if (total > 0) dayList.push({ day, total, input: total, output: 0, cacheRead: 0, cacheWrite: 0, calls: models.length * 2, models })
}
const summary = {
  generatedAt: Date.now(),
  today,
  windowStart: dayList[0]?.day ?? today,
  windowDays: 365,
  retentionDays: 365,
  dayOffsetMinutes: -new Date().getTimezoneOffset(),
  sessions: 12,
  totals: {
    total: dayList.reduce((s, d) => s + d.total, 0),
    input: 0, output: 0, cacheRead: 0, cacheWrite: 0,
    calls: dayList.reduce((s, d) => s + d.calls, 0),
    today: dayList.find(d => d.day === today)?.total ?? 0,
    todayCalls: dayList.find(d => d.day === today)?.calls ?? 0,
  },
  models: [],
  days: dayList,
}

global.window = {
  __ModuleLoader__: { load: fakeLoad },
  addEventListener() {}, removeEventListener() {},
  innerWidth: 1280, innerHeight: 800,
}
global.document = {
  baseURI: 'http://127.0.0.1:60047/',
  createElement: () => ({ style: {}, remove() {} }),
  head: { appendChild() {} },
  addEventListener() {}, removeEventListener() {},
  activeElement: null,
}
global.requestAnimationFrame = fn => { fn(); return 1 }
global.cancelAnimationFrame = () => {}
global.fetch = () => Promise.resolve({ ok: true, json: async () => summary })
global.setInterval = () => 0
global.clearInterval = () => {}

const path = require('node:path')
eval(fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8'))

const assert = (cond, name) => { if (!cond) { console.log('FAIL ' + name); process.exitCode = 1 } else console.log('ok ' + name) }

const slots = {}
const fakeCtx = {
  locale: {
    register() { return () => {} },
    bind() { return key => key },
    subscribe() { return () => {} },
    getLocale() { return { active: 'zh' } },
  },
  slots: {
    inject(key, cb) { slots[key] = cb() },
    register(options, component) { return { options, component } },
  },
  effect(fn) { const c = fn(); return typeof c === 'function' ? c : () => {} },
}
moduleExports.apply(fakeCtx)

function renderAll(component, props) {
  const strings = []
  const nodes = []
  const walk = node => {
    if (node === null || node === undefined || typeof node !== 'object') return
    if (Array.isArray(node)) { for (const n of node) walk(n); return }
    if (typeof node.type === 'function') {
      hookIndex = 0
      walk(node.type(node.props || {}))
      hookIndex = 0
      return
    }
    nodes.push(node)
    for (const child of node.children || []) {
      if (typeof child === 'string') strings.push(child)
      else walk(child)
    }
  }
  hookIndex = 0
  walk(component(props))
  hookIndex = 0
  return { strings, nodes }
}

const t = key => key
const footer = slots['sidebar.footer.action'].component
const page = slots['settings.section'].component

// First render pass starts the store; the mocked fetch settles in a tick.
renderAll(page, { t, ctx: fakeCtx })
renderAll(footer, { wide: true, t, ctx: fakeCtx })

setTimeout(() => {
  try {
    // ---- settings page ----
    const { strings, nodes } = renderAll(page, { t, ctx: fakeCtx })
    const joined = strings.join(' | ')

    assert(strings.includes('page.title') && strings.includes('page.badge'), 'page header renders title + badge')
    // Summary strip: all five cells (labels) present.
    for (const key of ['strip.total', 'strip.peak', 'strip.today', 'strip.streak', 'strip.bestStreak']) {
      assert(strings.includes(key), `summary strip cell ${key} rendered`)
    }
    // Heatmap: day cells rendered with intensity levels, plus month ruler + legend.
    const heatCells = nodes.filter(n => n.props && n.props.className === 'tud-heat-cell')
    assert(heatCells.length > 300, `heatmap renders year grid (got ${heatCells.length} cells)`)
    assert(heatCells.some(c => String(c.props['data-level']) === '4'), 'heatmap has a top-intensity day (spike visible)')
    // Heatmap cells are clickable; distribution ring shows today's breakdown.
    const heatButtons = nodes.filter(n => n.props && n.props.className === 'tud-heat-cell' && n.props.onClick !== undefined)
    assert(heatButtons.length > 300, `heatmap cells are clickable (got ${heatButtons.length})`)
    assert(strings.includes('dist.title') && strings.includes('page.tokens'), 'distribution ring block renders')
    assert(strings.includes('heat.less') && strings.includes('heat.more'), 'heatmap legend renders')

    // Range toggle + trend chart.
    assert(strings.includes('range.title') && strings.includes('range.7') && strings.includes('range.30'), 'range toggle renders')
    assert(strings.includes('trend.title'), 'trend chart block renders')
    const paths = nodes.filter(n => n.type === 'path' && n.props && typeof n.props.d === 'string' && n.props.d.startsWith('M'))
    assert(paths.length >= 3, `trend chart draws one smooth path per model (got ${paths.length})`)
    assert(paths.every(p => p.props.d.includes(' C ')), 'trend paths use bezier smoothing')
    // Model names come from the model table, not a duplicate chart legend.
    assert(strings.includes('gpt-5') && strings.includes('qfmodel'), 'model names appear in the model table')
    assert(!strings.includes('legend.note'), 'trend chart does not repeat a separate legend')
    const svgs = nodes.filter(n => n.type === 'svg' && n.props && typeof n.props.onMouseMove === 'function')
    assert(svgs.length >= 1, 'trend chart has live mouse tracking for the visual guide')
    // No floating information card: the distribution ring already shows a
    // day's date and model split, so a tooltip would duplicate it.
    assert(!strings.includes('legend.note'), 'no duplicated chart legend')
    assert(!joined.includes('hover card'), 'no duplicate hover card copy')

    // zh big-number units in the strip (480M+ spike day -> 亿 reading).
    assert(joined.includes('亿'), `strip uses zh 亿 units (values: ${strings.filter(s => /[0-9]/.test(s)).slice(0, 8).join(' / ')})`)

    // Model table follows the selected range (7 days default), title says so.
    assert(joined.includes('page.models') && joined.includes('range.7'), 'model table block renders with range suffix')
    assert(joined.includes('gpt-5'), 'table lists gpt-5')
    assert(!joined.includes('old-model'), 'table scoped to 7-day range (no 17-day-old model)')

    // ---- popover ----
    const panel = renderAll(footer, { wide: true, t, ctx: fakeCtx })
    // Closed popover: just the trigger button; no crash is the assertion.
    assert(panel.strings.includes('foot.today'), 'footer button renders (wide)')

    console.log(process.exitCode ? 'SMOKE FAILED' : 'SMOKE ALL PASS')
  } catch (error) {
    console.log('FAIL smoke crashed: ' + (error && error.stack ? error.stack.split('\n').slice(0, 4).join(' / ') : error))
    process.exitCode = 1
  }
}, 50)
