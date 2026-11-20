/**
 * dsh-usage-dashboard — browser half.
 *
 * One store reads the Host summary; two surfaces render it: a button in the
 * sidebar foot (`sidebar.footer.action`) that pops a compact panel, and a full
 * page in Settings (`settings.section`). Both read the same store, so opening
 * either costs at most one request.
 *
 * Plain JavaScript with no JSX and no module imports: React comes from the
 * browser module table, styles are package-owned and removed with the run, and
 * every colour comes from a `--dsw-alias-*` token so light and dark both work.
 * Only the hook surface the shipped bundles use is touched here
 * (useState / useEffect / useRef / useMemo / useCallback).
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-usage-dashboard',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'token-usage'
    const SECTION_ID = 'token-usage'
    const FOOT_ID = 'token-usage-foot'
    const DAY_MS = 86_400_000
    const AUTO_REFRESH_MS = 20_000
    const API = (() => {
      try {
        return new URL('api/token-usage-dashboard/summary', document.baseURI).pathname
      } catch {
        return '/api/token-usage-dashboard/summary'
      }
    })()

    /* ------------------------------------------------------------------ copy */

    const DICTS = {
      en: {
        'section.title': 'Usage statistics',
        'foot.today': 'Today',
        'foot.loading': 'Loading',
        'foot.empty': 'No usage yet',
        'foot.error': 'Usage unavailable',
        'panel.title': 'Token usage',
        'panel.calls': 'calls',
        'panel.refresh': 'Refresh',
        'panel.close': 'Close',
        'panel.days14': 'Last 14 days',
        'panel.full': 'Full report: Settings → Usage statistics',
        'page.title': 'Usage statistics',
        'page.badge': 'Token usage',
        'strip.total': 'Total tokens',
        'strip.peak': 'Peak day tokens',
        'strip.today': 'Tokens today',
        'strip.streak': 'Current streak',
        'strip.bestStreak': 'Longest streak',
        'strip.days': 'days',
        'heat.title': 'Token activity',
        'heat.daily': 'Daily',
        'heat.weekly': 'Weekly',
        'heat.cumulative': 'Cumulative',
        'heat.less': 'Less',
        'heat.more': 'More',
        'range.title': 'Time range',
        'range.7': 'Last 7 days',
        'range.30': 'Last 30 days',
        'trend.title': 'Daily token trend',
        'legend.note': 'Colors identify models only',
        'page.models': 'Model breakdown',
        'page.route': 'Route',
        'page.input': 'Input',
        'page.output': 'Output',
        'page.cacheRead': 'Cache read',
        'page.cacheWrite': 'Cache write',
        'page.calls': 'Calls',
        'page.tokens': 'Tokens',
        'page.share': 'Share',
        'page.last': 'Last used',
        'page.today': 'Today',
        'page.other': 'Other',
        'page.empty': 'Nothing to count yet: no model call in this window reported usage.',
        'page.error': 'The usage summary could not be read.',
        'page.retry': 'Retry',
        'page.stale': 'The last refresh failed; these figures may be out of date.',
      },
      zh: {
        'section.title': '使用统计',
        'foot.today': '今天',
        'foot.loading': '加载中',
        'foot.empty': '暂无用量',
        'foot.error': '用量读取失败',
        'panel.title': 'Token 用量',
        'panel.calls': '次调用',
        'panel.refresh': '刷新',
        'panel.close': '关闭',
        'panel.days14': '近 14 天',
        'panel.full': '完整报表：设置 → 使用统计',
        'page.title': '使用统计',
        'page.badge': 'Token 用量',
        'strip.total': '累计 Token 数',
        'strip.peak': '峰值 Token 数',
        'strip.today': '今日 Token 数',
        'strip.streak': '当前连续天数',
        'strip.bestStreak': '最长连续天数',
        'strip.days': '天',
        'heat.title': 'Token 活动',
        'heat.daily': '每日',
        'heat.weekly': '每周',
        'heat.cumulative': '累计',
        'heat.less': '少',
        'heat.more': '多',
        'range.title': '时间范围',
        'range.7': '近 7 日',
        'range.30': '近 30 日',
        'trend.title': '每日 Token 趋势图',
        'legend.note': '颜色仅用于区分模型',
        'page.models': '模型明细',
        'page.route': '路由',
        'page.input': '输入',
        'page.output': '输出',
        'page.cacheRead': '缓存读取',
        'page.cacheWrite': '缓存写入',
        'page.calls': '调用次数',
        'page.tokens': 'Token',
        'page.share': '占比',
        'page.last': '最近使用',
        'page.today': '今天',
        'page.other': '其他',
        'page.empty': '当前窗口内还没有可统计的用量。',
        'page.error': '用量数据读取失败。',
        'page.retry': '重试',
        'page.stale': '上次刷新失败，以下数据可能已过期。',
      },
    }

    /* --------------------------------------------------------------- numbers */

    /** Compact token figure: 12.3K, 4.5M. Rounding promotes 999.99K to 1.0M. */
    function formatTokens(value) {
      const n = Number.isFinite(value) ? value : 0
      const abs = Math.abs(n)
      if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(abs >= 10_000_000_000 ? 0 : 1)}B`
      if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`
      if (abs >= 1_000) {
        const shown = (n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)
        // The rounded reading can reach 1000 (999.99K): promote to the next unit
        // instead of printing "1000K".
        return Math.abs(Number(shown)) >= 1_000
          ? `${(n / 1_000_000).toFixed(1)}M`
          : `${shown}K`
      }
      return String(Math.round(n))
    }

    /** Grouped exact figure: 1,234,567. */
    function formatExact(value, locale) {
      const n = Number.isFinite(value) ? value : 0
      try {
        return new Intl.NumberFormat(locale).format(Math.round(n))
      } catch {
        return String(Math.round(n))
      }
    }

    function formatShare(share) {
      const pct = (Number.isFinite(share) ? share : 0) * 100
      if (pct > 0 && pct < 0.1) return '<0.1%'
      return `${pct.toFixed(pct >= 10 ? 0 : 1)}%`
    }

    /**
     * Summary-strip figure in the user's own units: zh reads 亿/万 like the
     * reference dashboard, every other locale reads B/M/K.
     */
    function formatBig(value, locale) {
      const n = Number.isFinite(value) ? value : 0
      const abs = Math.abs(n)
      if (typeof locale === 'string' && locale.startsWith('zh')) {
        if (abs >= 100_000_000) return `${(n / 100_000_000).toFixed(abs >= 1_000_000_000 ? 0 : 1)} 亿`
        if (abs >= 10_000) {
          const shown = (n / 10_000).toFixed(abs >= 100_000 ? 0 : 1)
          // The rounded reading can reach 10000 (9999.99 万): promote to 亿.
          return Math.abs(Number(shown)) >= 10_000
            ? `${(n / 100_000_000).toFixed(1)} 亿`
            : `${shown} 万`
        }
        return formatExact(n, locale)
      }
      return formatTokens(n)
    }

    /** `2026-11-20` -> `11/20`, so a dense axis stays legible. */
    function shortDay(day) {
      if (typeof day !== 'string' || day.length < 10) return ''
      return `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`
    }

    /** Month display name for `YYYY-MM` under `locale`; falls back to English. */
    function monthName(month, locale) {
      const index = Number(month.slice(5, 7)) - 1
      if (!(index >= 0 && index < 12)) return ''
      try {
        return new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' })
          .format(new Date(`${month}-01T00:00:00Z`))
      } catch {
        return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][index]
      }
    }

    /** `2026-11-20` -> `11月20日` (zh) or `Nov 20` (en), for chart axes. */
    function axisDay(day, locale) {
      if (typeof day !== 'string' || day.length < 10) return ''
      const month = Number(day.slice(5, 7))
      const date = Number(day.slice(8, 10))
      if (typeof locale === 'string' && locale.startsWith('zh')) return `${month}月${date}日`
      return `${monthName(day.slice(0, 7), locale)} ${date}`
    }

    /** `2026-11-20` -> `2026年11月20日` (zh) or `2026-11-20` (en), for tooltips. */
    function fullDay(day, locale) {
      if (typeof day !== 'string' || day.length < 10) return ''
      if (typeof locale === 'string' && locale.startsWith('zh')) {
        return `${Number(day.slice(0, 4))}年${Number(day.slice(5, 7))}月${Number(day.slice(8, 10))}日`
      }
      return day
    }

    /**
     * Current and longest run of consecutive usage days.
     * @returns `{ current, best, peak }` in days, plus the single busiest day's tokens.
     */
    function streaksOf(axis) {
      let current = 0
      let best = 0
      let run = 0
      let peak = 0
      for (const entry of axis) {
        peak = Math.max(peak, entry.row?.total ?? 0)
        if ((entry.row?.total ?? 0) > 0) {
          run += 1
          best = Math.max(best, run)
        } else {
          run = 0
        }
      }
      // The current streak exempts exactly one trailing quiet day (today is
      // not over yet); a longer gap really ended the streak.
      let index = axis.length - 1
      if (index >= 0 && (axis[index].row?.total ?? 0) === 0) index -= 1
      while (index >= 0 && (axis[index].row?.total ?? 0) > 0) {
        current += 1
        index -= 1
      }
      return { current, best, peak }
    }

    /**
     * One line series per model over `axis`: the model's daily totals,
     * zero-filled BY INDEX so a model's points stay on their own dates even
     * when it misses days.
     * @returns rows sorted by range total, each `{ key, provider, model, values, total }`.
     */
    function seriesOf(axis) {
      const byKey = new Map()
      axis.forEach((entry, position) => {
        for (const item of entry.row?.models ?? []) {
          const key = item.key ?? `${item.provider}\u0000${item.model}`
          const series = byKey.get(key) ?? {
            key, provider: item.provider, model: item.model,
            values: Array(axis.length).fill(0), total: 0,
          }
          series.values[position] = item.total
          series.total += item.total
          byKey.set(key, series)
        }
      })
      return [...byKey.values()].sort((a, b) => b.total - a.total)
    }

    /**
     * Smooth SVG path through points via a Catmull-Rom spline converted to
     * cubic beziers — the rounded trend curve of the reference dashboard.
     * @returns the `d` attribute; empty string for fewer than two points.
     */
    function smoothPath(points, width, height, max) {
      const usable = points.length
      if (usable < 2) return ''
      const limit = Math.max(1, max)
      const step = usable === 1 ? 0 : width / (usable - 1)
      const coords = points.map((value, index) => [
        index * step,
        height - (Math.min(value, limit) / limit) * height,
      ])
      let path = `M ${coords[0][0].toFixed(1)} ${coords[0][1].toFixed(1)}`
      for (let i = 0; i < coords.length - 1; i++) {
        const p0 = coords[i - 1] ?? coords[i]
        const p1 = coords[i]
        const p2 = coords[i + 1]
        const p3 = coords[i + 2] ?? p2
        const c1x = p1[0] + (p2[0] - p0[0]) / 6
        const c1y = p1[1] + (p2[1] - p0[1]) / 6
        const c2x = p2[0] - (p3[0] - p1[0]) / 6
        const c2y = p2[1] - (p3[1] - p1[1]) / 6
        path += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`
      }
      return path
    }

    /** Every day from the window start to today; a day nobody used reads zero. */
    function dayAxis(summary) {
      if (summary === undefined || typeof summary.today !== 'string' || typeof summary.windowStart !== 'string') return []
      if (!/^\d{4}-\d{2}-\d{2}$/.test(summary.today) || !/^\d{4}-\d{2}-\d{2}$/.test(summary.windowStart)) return []
      // Malformed day rows never crash a render: they are skipped, not trusted.
      const byDay = new Map()
      for (const row of summary.days ?? []) {
        if (row !== null && typeof row === 'object' && typeof row.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.day)) {
          byDay.set(row.day, row)
        }
      }
      const out = []
      const start = Date.parse(`${summary.windowStart}T00:00:00Z`)
      const end = Date.parse(`${summary.today}T00:00:00Z`)
      if (Number.isNaN(start) || Number.isNaN(end) || end < start) return []
      for (let time = start; time <= end && out.length < 366; time += DAY_MS) {
        const day = new Date(time).toISOString().slice(0, 10)
        out.push({ day, row: byDay.get(day) })
      }
      return out
    }

    /* ----------------------------------------------------------------- store */

    /**
     * One shared read model: the surfaces subscribe, the store owns the
     * request and the timer that only runs while at least one surface is
     * mounted. One fetch covers every view — the heatmap wants a year and the
     * trend chart wants a week — so window switches are local slices with no
     * request and no race.
     */
    function createStore() {
      const listeners = new Set()
      let state = { status: 'idle', summary: undefined, error: undefined }
      let running = undefined
      let queued = false
      let mounted = 0
      let timer = undefined

      const publish = () => {
        for (const listener of [...listeners]) listener()
      }
      const set = patch => {
        state = { ...state, ...patch }
        publish()
      }

      async function fetchSummary(force) {
        const query = force ? '?days=365&refresh=1' : '?days=365'
        const response = await fetch(`${API}${query}`, {
          credentials: 'same-origin',
          headers: { accept: 'application/json' },
          redirect: 'error',
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return await response.json()
      }

      /** Pump one refresh at a time; a request arriving mid-flight runs right after. */
      function pump(force) {
        if (running !== undefined) {
          queued = queued || force
          return
        }
        set({ status: state.summary === undefined ? 'loading' : 'refreshing' })
        running = (async () => {
          try {
            set({ status: 'ready', summary: await fetchSummary(force), error: undefined })
          } catch (error) {
            // Keep the last good summary: a stale figure with a stated reason
            // beats a blank page.
            set({ status: 'error', error: String(error?.message ?? error) })
          } finally {
            running = undefined
            if (queued) {
              queued = false
              pump(true)
            }
          }
        })()
      }

      function refresh(options = {}) {
        pump(options.force === true)
        return running ?? Promise.resolve()
      }

      return {
        get: () => state,
        subscribe(listener) {
          listeners.add(listener)
          mounted += 1
          if (state.status === 'idle' || state.status === 'error') void refresh()
          if (timer === undefined) {
            timer = setInterval(() => { void refresh({ force: true }) }, AUTO_REFRESH_MS)
          }
          return () => {
            listeners.delete(listener)
            mounted -= 1
            if (mounted <= 0 && timer !== undefined) {
              clearInterval(timer)
              timer = undefined
            }
          }
        },
        refresh,
      }
    }

    /** Subscribe a component to the store without depending on newer React hooks. */
    function useStore(store) {
      const [snapshot, setSnapshot] = React.useState(store.get)
      React.useEffect(() => store.subscribe(() => { setSnapshot(store.get()) }), [store])
      return snapshot
    }

    /**
     * The active locale, re-read on every locale or dictionary change. Bound
     * `t` keeps a stable identity, so a surface that rendered only through it
     * would not repaint on a language switch; subscribing here fixes both the
     * copy and the number format.
     */
    function useLocaleTag(ctx) {
      const read = React.useCallback(() => {
        try {
          return ctx.locale.getLocale().active
        } catch {
          return 'en'
        }
      }, [ctx])
      const [tag, setTag] = React.useState(read)
      React.useEffect(() => {
        setTag(read())
        return ctx.locale.subscribe(() => { setTag(read()) })
      }, [ctx, read])
      return tag
    }

    /* ------------------------------------------------------------------- css */

    const CSS = `
.tud-foot-layer { position: relative; flex: none; display: flex; align-items: center; width: 100%; }
.tud-foot { display: inline-flex; align-items: center; gap: 8px; width: calc(100% + 4px); height: 42px;
  margin: 0 -2px; padding: 0 10px 0 8px; border: none; border-radius: 12px; background: transparent;
  color: var(--dsw-alias-label-primary); font: inherit; font-size: 14px; cursor: pointer; overflow: hidden; text-align: left; }
.tud-foot:hover { background: var(--dsw-alias-interactive-bg-hover); }
.tud-foot[data-active] { background: var(--dsw-alias-interactive-bg-hover); }
.tud-foot-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tud-foot-value { flex: none; margin-left: auto; color: var(--dsw-alias-label-secondary);
  font-size: 12px; font-variant-numeric: tabular-nums; }
.tud-foot-layer.rail { width: 36px; }
.tud-foot.rail { justify-content: center; gap: 0; width: 36px; height: 36px; margin: 0; padding: 0; border-radius: 50%; }

.tud-panel { position: fixed; isolation: isolate; z-index: 30; display: flex; flex-direction: column;
  width: 380px; max-width: calc(100vw - 24px); max-height: 62vh; overflow: hidden; border-radius: 12px;
  box-shadow: var(--dsw-elevation-prominent); --dsw-elevation-stroke-color: var(--dsw-alias-border-l1); }
.tud-panel::before { position: absolute; z-index: -1; inset: 0; border-radius: inherit;
  background: var(--dsw-specific-menu); backdrop-filter: var(--dsw-menu-backdrop-filter); content: ''; pointer-events: none; }
.tud-head { flex: none; display: flex; align-items: center; gap: 8px; padding: 12px 14px 6px;
  color: var(--dsw-alias-label-primary); font-size: 13px; font-weight: 600; }
.tud-head-actions { margin-left: auto; display: flex; gap: 2px; }
.tud-icon-button { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px;
  border: none; border-radius: 8px; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; }
.tud-icon-button:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.tud-icon-button:disabled { cursor: default; opacity: 0.5; }
.tud-body { overflow-y: auto; padding: 0 14px 14px;
  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2); --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-bg-l2); }

.tud-hero { display: flex; align-items: baseline; gap: 10px; padding: 2px 0 10px; }
.tud-hero-value { color: var(--dsw-alias-label-primary); font-size: 26px; line-height: 1.15; font-weight: 650;
  font-variant-numeric: tabular-nums; }
.tud-hero-note { color: var(--dsw-alias-label-secondary); font-size: 12px; }
.tud-caption { margin: 10px 0 6px; color: var(--dsw-alias-label-secondary); font-size: 11px;
  letter-spacing: 0.04em; text-transform: uppercase; }

.tud-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px;
  padding: 6px 0; border-top: 1px solid var(--dsw-alias-border-l1); }
.tud-row:first-of-type { border-top: none; }
.tud-row-name { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.tud-row-model { color: var(--dsw-alias-label-primary); font-size: 13px; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
.tud-row-provider { color: var(--dsw-alias-label-tertiary); font-size: 11px; }
.tud-row-share { text-align: right; font-variant-numeric: tabular-nums; }
.tud-row-total { display: block; color: var(--dsw-alias-label-primary); font-size: 13px; }
.tud-row-pct { display: block; color: var(--dsw-alias-label-secondary); font-size: 11px; }
.tud-meter { grid-column: 1 / -1; height: 4px; border-radius: 2px; background: var(--dsw-alias-bg-layer-2); overflow: hidden; }
.tud-meter-fill { height: 100%; border-radius: 2px; background: var(--dsw-alias-brand-primary); }

.tud-state { padding: 16px 4px; display: flex; align-items: center; justify-content: center; gap: 8px;
  color: var(--dsw-alias-label-secondary); font-size: 12px; }
.tud-state button { border: none; border-radius: 8px; padding: 3px 8px; background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; cursor: pointer; }

.tud-page { display: flex; flex-direction: column; gap: 16px; padding: 4px 2px 32px; }
.tud-page-head { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.tud-page-title { color: var(--dsw-alias-label-primary); font-size: 19px; font-weight: 700; }
.tud-badge { padding: 3px 10px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary); font-size: 11px; }
.tud-segmented { display: inline-flex; gap: 2px; padding: 2px; border-radius: 10px;
  background: var(--dsw-alias-bg-layer-2); }
.tud-segmented button { border: none; border-radius: 8px; padding: 4px 10px; background: transparent;
  color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; cursor: pointer; }
.tud-segmented button[data-active] { background: var(--dsw-alias-bg-overlay); color: var(--dsw-alias-label-primary); }

/* Summary strip: one card, five cells split by hairlines — the reference header. */
.tud-strip { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 14px; background: var(--dsw-alias-bg-layer-1); overflow: hidden; }
.tud-strip-cell { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 18px 12px;
  border-left: 1px solid var(--dsw-alias-border-l1); }
.tud-strip-cell:first-child { border-left: none; }
.tud-strip-value { color: var(--dsw-alias-label-primary); font-size: clamp(15px, 2.2vw, 21px); font-weight: 650;
  font-variant-numeric: tabular-nums; white-space: nowrap; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
.tud-strip-label { color: var(--dsw-alias-label-secondary); font-size: 12px; text-align: center; }

.tud-block { border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1); padding: 14px; }
.tud-block-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 10px; }
.tud-block-head .tud-block-title { margin-bottom: 0; }
.tud-block-head .tud-segmented { margin-left: auto; }
.tud-block-title { color: var(--dsw-alias-label-primary); font-size: 13px; font-weight: 600; margin-bottom: 10px; }

/* GitHub-style activity heatmap: fixed cells, month ruler, less/more legend. */
.tud-heat-block { display: flex; flex-direction: column; }
.tud-heat-wrap { overflow-x: auto;
  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2); --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2); }
.tud-heat { display: grid; grid-auto-flow: column; grid-template-rows: repeat(7, 13px);
  grid-auto-columns: 13px; gap: 3px; width: max-content; padding: 2px 0; }
.tud-heat-cell { width: 13px; height: 13px; border-radius: 3px; background: var(--dsw-alias-bg-layer-2); }
.tud-heat-cell[data-level="1"] { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 28%, var(--dsw-alias-bg-layer-2)); }
.tud-heat-cell[data-level="2"] { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 52%, var(--dsw-alias-bg-layer-2)); }
.tud-heat-cell[data-level="3"] { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 76%, var(--dsw-alias-bg-layer-2)); }
.tud-heat-cell[data-level="4"] { background: var(--dsw-alias-brand-primary); }
.tud-heat-months { display: grid; grid-auto-flow: column; grid-auto-columns: 13px; gap: 3px;
  width: max-content; margin-top: 6px; }
.tud-heat-month { color: var(--dsw-alias-label-tertiary); font-size: 10px; line-height: 14px;
  white-space: nowrap; overflow: visible; }
.tud-heat-legend { display: flex; align-items: center; gap: 4px; margin-top: 8px;
  color: var(--dsw-alias-label-tertiary); font-size: 11px; justify-content: flex-end; }

/* Range row between the heatmap and the trend chart. */
.tud-range-row { display: flex; align-items: center; gap: 12px; }
.tud-range-label { color: var(--dsw-alias-label-primary); font-size: 13px; font-weight: 600; }
.tud-range-row .tud-segmented { margin-left: auto; }

/* Trend chart: legend chips above a full-width smoothed SVG line plot. */
.tud-legend { display: flex; flex-wrap: wrap; gap: 14px; margin: 4px 0 10px; }
.tud-legend-chip { display: inline-flex; align-items: center; gap: 6px;
  color: var(--dsw-alias-label-primary); font-size: 12px; }
.tud-legend-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.tud-legend-note { color: var(--dsw-alias-label-tertiary); font-size: 10px; margin-left: auto; align-self: center; }
.tud-trend { width: 100%; height: auto; aspect-ratio: 800 / 260; display: block; }

/* Floating pointer tooltip for chart and heatmap hover detail. */
.tud-tip { position: fixed; z-index: 60; min-width: 160px; max-width: 280px; padding: 10px 12px;
  border-radius: 10px; background: var(--dsw-specific-menu); color: var(--dsw-alias-label-primary);
  border: 1px solid var(--dsw-alias-border-l1); box-shadow: var(--dsw-elevation-prominent);
  font-size: 12px; line-height: 1.5; pointer-events: none;
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1); }
.tud-tip-day { color: var(--dsw-alias-label-primary); font-weight: 600; margin-bottom: 2px; }
.tud-tip-note { color: var(--dsw-alias-label-tertiary); font-size: 11px; }
.tud-tip-row { display: flex; align-items: center; gap: 6px; }
.tud-tip-row .tud-tip-name { flex: 1 1 auto; min-width: 0; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
.tud-tip-row .tud-tip-value { flex: none; color: var(--dsw-alias-label-secondary);
  font-variant-numeric: tabular-nums; }
.tud-tip-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }

/* Popover's compact stacked day chart. */
.tud-footnote { margin-top: 10px; color: var(--dsw-alias-label-tertiary); font-size: 11px; }

.tud-table { width: 100%; border-collapse: collapse; }
.tud-table th { text-align: left; padding: 6px 8px; color: var(--dsw-alias-label-tertiary); font-size: 11px;
  font-weight: 500; border-bottom: 1px solid var(--dsw-alias-border-l1); white-space: nowrap; }
.tud-table td { padding: 8px; border-bottom: 1px solid var(--dsw-alias-border-l1); font-size: 12px;
  color: var(--dsw-alias-label-primary); font-variant-numeric: tabular-nums; }
.tud-table th.num, .tud-table td.num { text-align: right; }
.tud-table tr:last-child td { border-bottom: none; }
.tud-td-name { display: flex; flex-direction: column; gap: 2px; min-width: 0; max-width: 260px; }
.tud-td-model { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tud-td-provider { color: var(--dsw-alias-label-tertiary); font-size: 11px; }
.tud-sharecell { white-space: nowrap; }
.tud-scroll { overflow-x: auto;
  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2); --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2); }
`

    /* ------------------------------------------------------- pointer tooltip */

    /**
     * Pointer-following tooltip state shared by the chart and the heatmap:
     * `show(content, event)` pins a rendered node near the cursor, `hide`
     * clears it. The layer is fixed-positioned so it escapes scroll clips.
     */
    function useTip() {
      const [tip, setTip] = React.useState(null)
      const show = React.useCallback((content, event) => {
        setTip({ content, x: event.clientX, y: event.clientY })
      }, [])
      const hide = React.useCallback(() => { setTip(null) }, [])
      return { tip, show, hide }
    }

    /** The floating card for one `useTip` state; flips near viewport edges. */
    function TipLayer({ tip }) {
      if (tip === null || tip === undefined) return null
      const width = 240
      const height = 110
      const vw = typeof window === 'undefined' ? 1280 : window.innerWidth
      const vh = typeof window === 'undefined' ? 800 : window.innerHeight
      const left = tip.x + 14 + width > vw ? Math.max(8, tip.x - width - 14) : tip.x + 14
      const top = tip.y + 14 + height > vh ? Math.max(8, tip.y - height - 14) : tip.y + 14
      return h('div', {
        className: 'tud-tip',
        style: { left: `${left}px`, top: `${top}px` },
        role: 'presentation',
      }, tip.content)
    }

    /* ------------------------------------------------------------ primitives */

    function BarChartIcon({ size = 16 }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', 'aria-hidden': true,
        style: { display: 'block', flex: 'none' },
      },
        h('path', { d: 'M2.6 11.4h1.9V6.1H2.6zM7 11.4h1.9V3.2H7zM11.4 11.4h1.9V8.1h-1.9z', fill: 'currentColor' }),
        h('path', { d: 'M1.6 13.4h12.8', stroke: 'currentColor', strokeWidth: 1.1, strokeLinecap: 'round' }))
    }

    function RefreshIcon() {
      return h('svg', { width: 14, height: 14, viewBox: '0 0 16 16', 'aria-hidden': true, style: { display: 'block' } },
        h('path', {
          d: 'M13.2 8a5.2 5.2 0 1 1-1.6-3.75', fill: 'none', stroke: 'currentColor',
          strokeWidth: 1.4, strokeLinecap: 'round',
        }),
        h('path', { d: 'M13.4 1.9v2.9h-2.9', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }))
    }

    function CloseIcon() {
      return h('svg', { width: 14, height: 14, viewBox: '0 0 16 16', 'aria-hidden': true, style: { display: 'block' } },
        h('path', { d: 'M4 4l8 8M12 4l-8 8', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }))
    }

    /** Close on Escape and on any pointer press outside the given refs. */
    function useDismiss(open, onClose, refs) {
      React.useEffect(() => {
        if (!open) return undefined
        const onKey = (event) => {
          if (event.key === 'Escape') onClose()
        }
        const onPointer = (event) => {
          const target = event.target
          for (const ref of refs) {
            const node = ref.current
            if (node != null && node.contains(target)) return
          }
          onClose()
        }
        window.addEventListener('keydown', onKey)
        window.addEventListener('pointerdown', onPointer, true)
        return () => {
          window.removeEventListener('keydown', onKey)
          window.removeEventListener('pointerdown', onPointer, true)
        }
      }, [open, onClose, refs])
    }

    /**
     * Place a fixed surface beside its trigger without leaving the viewport:
     * above when there is room, otherwise below. Repainted on resize and on any
     * scroll, because the sidebar itself scrolls.
     */
    function useAnchor(open, triggerRef, panelRef, gap = 10) {
      const [style, setStyle] = React.useState({ position: 'fixed', left: '-9999px', top: '-9999px' })
      React.useEffect(() => {
        if (!open) return undefined
        const place = () => {
          const trigger = triggerRef.current
          const panel = panelRef.current
          if (trigger == null || panel == null) return
          const rect = trigger.getBoundingClientRect()
          const size = panel.getBoundingClientRect()
          const margin = 12
          const left = Math.max(margin, Math.min(rect.left, window.innerWidth - size.width - margin))
          const above = rect.top - gap - size.height
          const top = above >= margin
            ? above
            : Math.min(rect.bottom + gap, Math.max(margin, window.innerHeight - size.height - margin))
          setStyle({ position: 'fixed', left: `${Math.round(left)}px`, top: `${Math.round(top)}px` })
        }
        place()
        const raf = requestAnimationFrame(place)
        window.addEventListener('resize', place)
        window.addEventListener('scroll', place, true)
        return () => {
          cancelAnimationFrame(raf)
          window.removeEventListener('resize', place)
          window.removeEventListener('scroll', place, true)
        }
      }, [open, triggerRef, panelRef, gap])
      return style
    }

    function ModelRows({ models, palette, t }) {
      const max = Math.max(1, ...models.map(entry => entry.total))
      return h('div', null,
        ...models.map(entry => {
          const key = entry.key ?? `${entry.provider}\u0000${entry.model}`
          return h('div', { className: 'tud-row', key },
            h('div', { className: 'tud-row-name' },
              h('span', { className: 'tud-row-model' },
                palette === undefined ? null : h('span', { className: 'tud-tip-dot', style: { background: palette.color(key), marginRight: '6px', verticalAlign: 'middle' } }),
                entry.model),
              h('span', { className: 'tud-row-provider' }, entry.provider)),
            h('div', { className: 'tud-row-share' },
              h('span', { className: 'tud-row-total' }, formatTokens(entry.total)),
              h('span', { className: 'tud-row-pct' }, formatShare(entry.share ?? 0))),
            h('div', { className: 'tud-meter' },
              h('div', {
                className: 'tud-meter-fill',
                style: { width: `${(entry.total / max) * 100}%`, ...(palette === undefined ? {} : { background: palette.color(key) }) },
              })))
        }))
    }

    function State({ text, onRetry, t }) {
      return h('div', { className: 'tud-state' },
        h('span', null, text),
        onRetry === undefined ? null : h('button', { type: 'button', onClick: onRetry }, t('page.retry')))
    }

    /* ------------------------------------------------------------ the popover */

    function UsagePanel({ store, t, onClose, panelRef, style, ctx }) {
      const snapshot = useStore(store)
      const locale = useLocaleTag(ctx)
      const summary = snapshot.summary
      const axis = dayAxis(summary).slice(-14)
      // Same window as the chart below it: the popover is one coherent 14-day view.
      const models = aggregateModels(axis)
      const palette = React.useMemo(() => pagePalette(models), [models])
      // Keep focus inside the popover and hand it back to the trigger on close.
      React.useEffect(() => {
        const panel = panelRef.current
        if (panel === null || panel === undefined) return undefined
        panel.focus()
        const onTab = (event) => {
          if (event.key !== 'Tab') return
          const focusable = panel.querySelectorAll('button:not(:disabled)')
          if (focusable.length === 0) return
          const first = focusable[0]
          const last = focusable[focusable.length - 1]
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last.focus()
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first.focus()
          }
        }
        panel.addEventListener('keydown', onTab)
        return () => panel.removeEventListener('keydown', onTab)
      }, [panelRef])
      return h('div', { className: 'tud-panel', ref: panelRef, style, role: 'dialog', 'aria-label': t('panel.title'), tabIndex: -1 },
        h('div', { className: 'tud-head' },
          h(BarChartIcon, { size: 15 }),
          h('span', null, t('panel.title')),
          h('div', { className: 'tud-head-actions' },
            h('button', {
              type: 'button',
              className: 'tud-icon-button',
              title: t('panel.refresh'),
              'aria-label': t('panel.refresh'),
              disabled: snapshot.status === 'refreshing',
              onClick: () => { void store.refresh({ force: true }) },
            }, h(RefreshIcon, null)),
            h('button', {
              type: 'button', className: 'tud-icon-button', title: t('panel.close'),
              'aria-label': t('panel.close'), onClick: onClose,
            }, h(CloseIcon, null)))),
        h('div', { className: 'tud-body' },
          snapshot.status === 'error' && summary === undefined
            ? h(State, { text: t('page.error'), onRetry: () => { void store.refresh({ force: true }) }, t })
            : summary === undefined
              ? h(State, { text: t('foot.loading') })
              : h('div', null,
                h('div', { className: 'tud-hero' },
                  h('span', { className: 'tud-hero-value' }, formatTokens(summary.totals?.today)),
                  h('span', { className: 'tud-hero-note' }, `${t('page.today')} · ${summary.totals?.todayCalls ?? 0} ${t('panel.calls')}`)),
                snapshot.status === 'error'
                  ? h(State, { text: t('page.stale'), onRetry: () => { void store.refresh({ force: true }) }, t })
                  : null,
                axis.length === 0 ? null : h('div', null,
                  h('div', { className: 'tud-caption' }, `${t('trend.title')} · ${t('panel.days14')}`),
                  h(TrendChart, { axis, locale, t, compact: true })),
                h('div', { className: 'tud-caption' }, t('page.models')),
                models.length === 0
                  ? h(State, { text: t('page.empty') })
                  : h(ModelRows, { models, palette, t }),
                h('div', { className: 'tud-footnote' }, t('panel.full')))))
    }

    /* ------------------------------------------------------- footer button */

    function FooterAction({ wide, store, t, ctx }) {
      const [open, setOpen] = React.useState(false)
      useLocaleTag(ctx)
      const triggerRef = React.useRef(null)
      const panelRef = React.useRef(null)
      const refs = React.useMemo(() => [triggerRef, panelRef], [])
      // Closing returns focus to the button that opened the popover.
      const close = React.useCallback(() => {
        setOpen(false)
        if (triggerRef.current !== null) triggerRef.current.focus()
      }, [])
      useDismiss(open, close, refs)
      const style = useAnchor(open, triggerRef, panelRef)
      const snapshot = useStore(store)
      const today = snapshot.summary?.totals?.today
      const loading = snapshot.summary === undefined && snapshot.status !== 'error'
      const failed = snapshot.status === 'error'
      const value = failed
        ? ''
        : snapshot.summary === undefined
          ? ''
          : today === 0 ? '' : formatTokens(today)
      // One title for both widths: it names the feature first, then today's figure.
      const title = failed
        ? t('foot.error')
        : loading
          ? t('foot.loading')
          : `${t('panel.title')} · ${t('foot.today')}: ${value || t('foot.empty')}`
      return h('div', { className: `tud-foot-layer${wide ? '' : ' rail'}` },
        h('button', {
          ref: triggerRef,
          type: 'button',
          className: `tud-foot${wide ? '' : ' rail'}`,
          'data-active': open || undefined,
          'aria-haspopup': 'dialog',
          'aria-expanded': open,
          'aria-label': title,
          title,
          onClick: () => { setOpen(current => !current) },
        },
          h(BarChartIcon, { size: wide ? 16 : 17 }),
          wide ? h('span', { className: 'tud-foot-label' }, t('foot.today')) : null,
          wide
            ? h('span', { className: 'tud-foot-value' }, failed ? t('foot.error') : value || (loading ? '…' : t('foot.empty')))
            : null),
        open ? h(UsagePanel, { store, t, onClose: close, panelRef, style, ctx }) : null)
    }

    /* --------------------------------------------------------- settings page */

    const RANGES = [7, 30]
    const HEAT_MODES = ['daily', 'weekly', 'cumulative']
    /**
     * Categorical series colours for the trend lines and legend — one clearly
     * distinct hue per model, in the reference dashboard's multi-hue style.
     * These hues are chart categories, not state meanings; the legend carries
     * a note saying so. The last slot is the neutral "Other" aggregate.
     */
    const SERIES_COLORS = [
      'var(--dsw-alias-brand-primary)',
      'var(--dsw-alias-state-success-primary)',
      'color-mix(in srgb, var(--dsw-alias-brand-primary) 55%, var(--dsw-alias-state-error-primary))',
      'var(--dsw-alias-state-error-primary)',
      'var(--dsw-alias-state-warn-primary)',
      'var(--dsw-alias-label-secondary)',
    ]

    /** Palette keyed by rank: top-5 routes get their hue, everything else shares "Other". */
    function pagePalette(models) {
      const index = new Map(models.map((entry, position) => [
        entry.key ?? `${entry.provider}\u0000${entry.model}`,
        Math.min(position, SERIES_COLORS.length - 1),
      ]))
      return {
        color: key => SERIES_COLORS[index.get(key) ?? SERIES_COLORS.length - 1],
      }
    }

    /**
     * Aggregate the per-day per-model rows of `axis` into one model table for
     * the rendered range, sharing the summary's row shape.
     */
    function aggregateModels(axis) {
      const map = new Map()
      for (const { day, row } of axis) {
        for (const item of row?.models ?? []) {
          const key = item.key ?? `${item.provider}\u0000${item.model}`
          const acc = map.get(key) ?? {
            key, provider: item.provider, model: item.model,
            input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0, total: 0, lastDay: '',
          }
          acc.input += item.input ?? 0
          acc.output += item.output ?? 0
          acc.cacheRead += item.cacheRead ?? 0
          acc.cacheWrite += item.cacheWrite ?? 0
          acc.calls += item.calls ?? 0
          acc.total += item.total ?? 0
          if (day > acc.lastDay) acc.lastDay = day
          map.set(key, acc)
        }
      }
      const models = [...map.values()].sort((a, b) => b.total - a.total)
      const total = models.reduce((sum, entry) => sum + entry.total, 0)
      for (const entry of models) entry.share = total === 0 ? 0 : entry.total / total
      return models
    }

    /** The 5-cell summary strip: cumulative, peak, today, and both streaks. */
    function SummaryStrip({ axis, totals, locale, t }) {
      const streaks = streaksOf(axis)
      const cells = [
        { value: formatBig(totals.total, locale), label: t('strip.total') },
        { value: formatBig(streaks.peak, locale), label: t('strip.peak') },
        { value: formatBig(totals.today, locale), label: t('strip.today') },
        { value: `${streaks.current} ${t('strip.days')}`, label: t('strip.streak') },
        { value: `${streaks.best} ${t('strip.days')}`, label: t('strip.bestStreak') },
      ]
      return h('div', { className: 'tud-strip' },
        ...cells.map(cell => h('div', { className: 'tud-strip-cell', key: cell.label },
          h('span', { className: 'tud-strip-value' }, cell.value),
          h('span', { className: 'tud-strip-label' }, cell.label))))
    }

    /**
     * GitHub-style activity heatmap over the full retained year.
     * Columns are weeks (Monday first), rows are weekdays. `mode` selects the
     * measured value: the day's tokens, its week's tokens, or the running
     * cumulative total. Cell level is sqrt-scaled so heavy days stay readable.
     */
    function ActivityHeatmap({ axis, mode, locale, t }) {
      // Hooks first: an early return must not change hook order between renders.
      const tipState = useTip()
      const wrapRef = React.useRef(null)
      React.useEffect(() => {
        const wrap = wrapRef.current
        if (wrap !== null && wrap !== undefined) wrap.scrollLeft = wrap.scrollWidth
      }, [mode])

      const dayValue = entry => entry.row?.total ?? 0
      const hasUsage = axis.some(entry => dayValue(entry) > 0)
      if (axis.length === 0 || !hasUsage) return h(State, { text: t('page.empty') })

      // Weekly: every cell of a week column carries that week's total.
      const firstDow = (new Date(`${axis[0].day}T00:00:00Z`).getUTCDay() + 6) % 7
      const weekTotals = []
      let weekSum = 0
      axis.forEach((entry, position) => {
        const slot = firstDow + position
        if (slot % 7 === 0 && position > 0) {
          weekTotals.push(weekSum)
          weekSum = 0
        }
        weekSum += dayValue(entry)
      })
      weekTotals.push(weekSum)

      // Cumulative: the running total through each day.
      let running = 0
      const values = axis.map((entry, position) => {
        const value = dayValue(entry)
        if (mode === 'weekly') return weekTotals[Math.floor((firstDow + position) / 7)] ?? 0
        running += value
        return mode === 'cumulative' ? running : value
      })
      const max = Math.max(1, ...values)
      const levelOf = value => (value <= 0 ? 0 : Math.min(4, Math.max(1, Math.ceil(Math.sqrt(value / max) * 4))))

      /**
       * Hover card: the date it is, the tokens it measured, and the measure's
       * own scope (a plain day, its week, or the running total).
       */
      const tipFor = position => {
        const dayText = fullDay(axis[position].day, locale)
        const valueText = `${formatExact(values[position], locale)} ${t('page.tokens')}`
        const dailyText = `${formatExact(dayValue(axis[position]), locale)} ${t('page.tokens')}`
        if (mode === 'weekly') {
          const weekStart = Math.max(0, Math.floor((firstDow + position) / 7) * 7 - firstDow)
          const weekEnd = Math.min(axis.length - 1, weekStart + 6)
          return h('div', null,
            h('div', { className: 'tud-tip-day' }, `${dayText} · ${t('heat.weekly')}`),
            h('div', null, `${shortDay(axis[weekStart].day)}–${shortDay(axis[weekEnd].day)} · ${valueText}`),
            h('div', { className: 'tud-tip-note' }, `${t('heat.daily')}: ${dailyText}`))
        }
        if (mode === 'cumulative') {
          return h('div', null,
            h('div', { className: 'tud-tip-day' }, dayText),
            h('div', null, `${t('heat.cumulative')}: ${valueText}`),
            h('div', { className: 'tud-tip-note' }, `${t('heat.daily')}: ${dailyText}`))
        }
        return h('div', null,
          h('div', { className: 'tud-tip-day' }, dayText),
          h('div', null, valueText))
      }

      // Column-major cells: placeholder padding before the first day and after
      // today keeps every real day on its weekday row.
      const totalSlots = firstDow + axis.length
      const columns = Math.ceil(totalSlots / 7)
      const cells = []
      for (let slot = 0; slot < columns * 7; slot += 1) {
        const position = slot - firstDow
        const entry = position >= 0 && position < axis.length ? axis[position] : undefined
        cells.push(entry === undefined
          ? { empty: true, key: `pad-${slot}` }
          : {
            key: entry.day,
            level: levelOf(values[position]),
            position,
            label: `${fullDay(entry.day, locale)} · ${formatExact(values[position], locale)}`,
          })
      }

      // Month labels sit under the column that first carries the month's days.
      const monthLabels = []
      let lastMonth = ''
      for (let column = 0; column < columns; column += 1) {
        let label = ''
        for (let row = 0; row < 7 && label === ''; row += 1) {
          const position = column * 7 + row - firstDow
          const entry = position >= 0 && position < axis.length ? axis[position] : undefined
          const month = entry === undefined ? '' : entry.day.slice(0, 7)
          if (month !== '' && month !== lastMonth) {
            lastMonth = month
            label = locale.startsWith('zh')
              ? `${Number(month.slice(5, 7))}月`
              : monthName(month, locale)
          }
        }
        monthLabels.push({ key: `m-${column}`, label })
      }

      return h('div', { className: 'tud-heat-block' },
        h('div', { className: 'tud-heat-wrap', ref: wrapRef },
          h('div', { className: 'tud-heat', role: 'group', 'aria-label': t('heat.title') },
            ...cells.map(cell => cell.empty
              ? h('span', { key: cell.key, className: 'tud-heat-cell', 'aria-hidden': true })
              : h('span', {
                key: cell.key,
                className: 'tud-heat-cell',
                'data-level': cell.level,
                role: 'img',
                'aria-label': cell.label,
                onMouseEnter: event => tipState.show(tipFor(cell.position), event),
                onMouseMove: event => tipState.show(tipFor(cell.position), event),
                onMouseLeave: tipState.hide,
              }))),
          h('div', { className: 'tud-heat-months', 'aria-hidden': true },
            ...monthLabels.map(item => h('span', { key: item.key, className: 'tud-heat-month' }, item.label ?? '')))),
        h('div', { className: 'tud-heat-legend' },
          h('span', null, t('heat.less')),
          ...[0, 1, 2, 3, 4].map(level => h('span', {
            key: level,
            className: 'tud-heat-cell',
            'data-level': level,
          })),
          h('span', null, t('heat.more'))),
        h(TipLayer, { tip: tipState.tip }))
    }

    /** The daily trend chart: one smooth line per top model, plus "Other". */
    function TrendChart({ axis, locale, t, compact }) {
      // Hooks first: an early return must not change hook order between renders.
      const tipState = useTip()
      const [hoverIndex, setHoverIndex] = React.useState(null)
      const svgRef = React.useRef(null)

      const series = seriesOf(axis)
      if (series.length === 0) return h(State, { text: t('page.empty') })
      const top = series.slice(0, SERIES_COLORS.length - 1)
      const rest = series.slice(SERIES_COLORS.length - 1)
      const lines = top.map((entry, position) => ({
        label: entry.model,
        color: SERIES_COLORS[position],
        values: entry.values,
      }))
      if (rest.length > 0) {
        lines.push({
          label: t('page.other'),
          color: SERIES_COLORS[SERIES_COLORS.length - 1],
          values: axis.map((_, position) => rest.reduce((sum, entry) => sum + (entry.values[position] ?? 0), 0)),
        })
      }
      const max = Math.max(1, ...lines.flatMap(line => line.values))

      const W = 800
      const H = compact ? 150 : 260
      const padL = 10
      const padR = 10
      const padT = compact ? 10 : 16
      const padB = compact ? 18 : 30
      const plotW = W - padL - padR
      const plotH = H - padT - padB
      const n = axis.length
      const step = n > 1 ? plotW / (n - 1) : 0
      const labelEvery = Math.max(1, Math.ceil(n / (compact ? 5 : 8)))

      /** Pointer x (in page pixels) -> the nearest day index. */
      const indexAt = clientX => {
        const svg = svgRef.current
        if (svg === null || svg === undefined || n === 0) return null
        const rect = svg.getBoundingClientRect()
        if (rect.width <= 0) return null
        const viewX = ((clientX - rect.left) / rect.width) * W
        return Math.max(0, Math.min(n - 1, Math.round((viewX - padL) / (step || 1))))
      }

      /** Hover card: the date, then every model's value that day with its line colour. */
      const tipFor = index => {
        const entry = axis[index]
        const rows = lines
          .map(line => ({ label: line.label, color: line.color, value: line.values[index] ?? 0 }))
          .sort((a, b) => b.value - a.value)
        return h('div', null,
          h('div', { className: 'tud-tip-day' },
            `${fullDay(entry.day, locale)} · ${formatExact(entry.row?.total ?? 0, locale)} ${t('page.tokens')}`),
          ...rows.map(row => h('div', { className: 'tud-tip-row', key: row.label },
            h('span', { className: 'tud-tip-dot', style: { background: row.color } }),
            h('span', { className: 'tud-tip-name' }, row.label),
            h('span', { className: 'tud-tip-value' }, formatExact(row.value, locale)))))
      }

      const onMove = event => {
        const index = indexAt(event.clientX)
        if (index === null) return
        setHoverIndex(index)
        tipState.show(tipFor(index), event)
      }
      const onLeave = () => {
        setHoverIndex(null)
        tipState.hide()
      }

      return h('div', null,
        h('div', { className: 'tud-legend' },
          ...lines.map(line => h('span', { className: 'tud-legend-chip', key: line.label },
            h('span', { className: 'tud-legend-dot', style: { background: line.color } }),
            line.label)),
          h('span', { className: 'tud-legend-note' }, t('legend.note'))),
        h('svg', {
          className: 'tud-trend',
          viewBox: `0 0 ${W} ${H}`,
          role: 'group',
          'aria-label': t('trend.title'),
          ref: svgRef,
          onMouseMove: onMove,
          onMouseLeave: onLeave,
        },
          ...[0, 0.25, 0.5, 0.75, 1].map(level => h('line', {
            key: level,
            x1: padL, x2: W - padR,
            y1: padT + plotH * (1 - level), y2: padT + plotH * (1 - level),
            stroke: 'var(--dsw-alias-border-l1)',
            strokeDasharray: '4 5',
            strokeWidth: 1,
          })),
          ...lines.map(line => h('path', {
            key: line.label,
            d: smoothPath(line.values, plotW, plotH, max),
            transform: `translate(${padL} ${padT})`,
            fill: 'none',
            stroke: line.color,
            strokeWidth: 2.5,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
          })),
          // Hover guide: a vertical rule at the tracked day plus a marker on
          // each line, so "which model is this" reads straight off the graph.
          hoverIndex === null ? null : h('line', {
            key: 'guide',
            x1: padL + hoverIndex * step, x2: padL + hoverIndex * step,
            y1: padT, y2: padT + plotH,
            stroke: 'var(--dsw-alias-label-tertiary)',
            strokeDasharray: '3 4',
            strokeWidth: 1,
          }),
          hoverIndex === null ? null : lines.map(line => h('circle', {
            key: `dot-${line.label}`,
            cx: padL + hoverIndex * step,
            cy: padT + plotH - (Math.min(line.values[hoverIndex] ?? 0, max) / max) * plotH,
            r: 4,
            fill: line.color,
            stroke: 'var(--dsw-alias-bg-base)',
            strokeWidth: 1.5,
          })),
          ...axis.map((entry, position) => {
            // One focusable hit target per day keeps the per-day figures
            // reachable without a mouse; the <title> serves hover.
            const detail = `${fullDay(entry.day, locale)} · ${formatExact(entry.row?.total ?? 0, locale)}${
              (entry.row?.models ?? [])
                .slice(0, 4)
                .map(item => `; ${item.model} ${formatExact(item.total, locale)}`)
                .join('')}`
            return h('rect', {
              key: `hit-${entry.day}`,
              x: padL + position * step - step / 2,
              y: padT,
              width: Math.max(step, 2),
              height: plotH,
              fill: 'transparent',
              tabIndex: 0,
              role: 'img',
              'aria-label': detail,
            }, h('title', null, detail))
          }),
          ...axis.map((entry, position) => position % labelEvery === 0 || position === n - 1
            ? h('text', {
              key: `x-${entry.day}`,
              x: padL + position * step,
              y: H - 8,
              fill: 'var(--dsw-alias-label-tertiary)',
              fontSize: 11,
              textAnchor: position === n - 1 ? 'end' : (position === 0 ? 'start' : 'middle'),
            }, axisDay(entry.day, locale))
            : null)),
        h(TipLayer, { tip: tipState.tip }))
    }

    function ModelTable({ models, palette, t, locale }) {
      const header = h('thead', null, h('tr', null,
        h('th', null, t('page.route')),
        h('th', { className: 'num' }, t('page.input')),
        h('th', { className: 'num' }, t('page.output')),
        h('th', { className: 'num' }, t('page.cacheRead')),
        h('th', { className: 'num' }, t('page.cacheWrite')),
        h('th', { className: 'num' }, t('page.calls')),
        h('th', { className: 'num' }, t('page.tokens')),
        h('th', { className: 'num' }, t('page.share')),
        h('th', { className: 'num' }, t('page.last'))))
      const rows = models.map(entry => {
        const share = Math.round((entry.share ?? 0) * 100)
        return h('tr', { key: entry.key ?? `${entry.provider}\u0000${entry.model}` },
          h('td', null, h('div', { className: 'tud-td-name' },
            h('span', { className: 'tud-td-model' }, entry.model),
            h('span', { className: 'tud-td-provider' }, entry.provider))),
          h('td', { className: 'num' }, formatExact(entry.input, locale)),
          h('td', { className: 'num' }, formatExact(entry.output, locale)),
          h('td', { className: 'num' }, formatExact(entry.cacheRead, locale)),
          h('td', { className: 'num' }, formatExact(entry.cacheWrite, locale)),
          h('td', { className: 'num' }, formatExact(entry.calls, locale)),
          h('td', { className: 'num' }, formatExact(entry.total, locale)),
          h('td', { className: 'num' }, h('span', { className: 'tud-sharecell' },
            h('span', { className: 'tud-meter', style: { width: '54px', display: 'inline-block' } },
              h('span', { className: 'tud-meter-fill', style: { display: 'block', width: `${share}%`, background: palette.color(entry.key) } })),
            h('span', { style: { marginLeft: '6px' } }, formatShare(entry.share ?? 0)))),
          h('td', { className: 'num' }, h('time', { dateTime: entry.lastDay, title: entry.lastDay }, shortDay(entry.lastDay))))
      })
      return h('div', { className: 'tud-scroll' },
        h('table', { className: 'tud-table' }, header, h('tbody', null, ...rows)))
    }

    function SettingsPage({ store, t, ctx }) {
      const snapshot = useStore(store)
      const locale = useLocaleTag(ctx)
      const summary = snapshot.summary
      const [range, setRange] = React.useState(7)
      const [heatMode, setHeatMode] = React.useState('daily')

      const head = h('div', { className: 'tud-page-head' },
        h('div', { className: 'tud-page-title' }, t('page.title')),
        h('span', { className: 'tud-badge' }, t('page.badge')))

      if (snapshot.status === 'error' && summary === undefined) {
        return h('div', { className: 'tud-page' },
          head,
          h(State, { text: t('page.error'), onRetry: () => { void store.refresh({ force: true }) }, t }))
      }
      if (summary === undefined) {
        return h('div', { className: 'tud-page' }, head, h(State, { text: t('foot.loading') }))
      }

      const axis = dayAxis(summary)
      const rangeAxis = axis.slice(-range)
      const models = aggregateModels(rangeAxis)
      const palette = pagePalette(models)
      const hasRangeUsage = rangeAxis.some(entry => (entry.row?.total ?? 0) > 0)

      const heatSegment = h('div', { className: 'tud-segmented', role: 'group', 'aria-label': t('heat.title') },
        ...HEAT_MODES.map(mode => h('button', {
          key: mode,
          type: 'button',
          'data-active': heatMode === mode || undefined,
          'aria-pressed': heatMode === mode,
          onClick: () => { setHeatMode(mode) },
        }, t(`heat.${mode}`))))
      const heatBlock = h('div', { className: 'tud-block' },
        h('div', { className: 'tud-block-head' },
          h('div', { className: 'tud-block-title' }, t('heat.title')),
          heatSegment),
        h(ActivityHeatmap, { axis, mode: heatMode, locale, t }))

      const rangeSegment = h('div', { className: 'tud-segmented', role: 'group', 'aria-label': t('range.title') },
        ...RANGES.map(days => h('button', {
          key: days,
          type: 'button',
          'data-active': range === days || undefined,
          'aria-pressed': range === days,
          onClick: () => { setRange(days) },
        }, t(`range.${days}`))))
      const rangeRow = h('div', { className: 'tud-range-row' },
        h('span', { className: 'tud-range-label' }, t('range.title')),
        rangeSegment)

      const trendBlock = h('div', { className: 'tud-block' },
        h('div', { className: 'tud-block-title' }, t('trend.title')),
        hasRangeUsage ? h(TrendChart, { axis: rangeAxis, locale, t }) : h(State, { text: t('page.empty') }))

      const tableBlock = h('div', { className: 'tud-block' },
        h('div', { className: 'tud-block-title' }, `${t('page.models')} · ${t(`range.${range}`)}`),
        models.length === 0
          ? h(State, { text: t('page.empty') })
          : h(ModelTable, { models, palette, t, locale }))

      return h('div', { className: 'tud-page' },
        head,
        snapshot.status === 'error'
          ? h(State, { text: t('page.stale'), onRetry: () => { void store.refresh({ force: true }) }, t })
          : null,
        h(SummaryStrip, { axis, totals: summary.totals, locale, t }),
        heatBlock,
        rangeRow,
        trendBlock,
        tableBlock)
    }

    /* ---------------------------------------------------------------- apply */

    return {
      inject: ['locale', 'slots'],
      apply(ctx) {
        const t = ctx.locale.bind(NS)
        ctx.effect(() => ctx.locale.register(NS, 'en', DICTS.en), 'token-usage: en dictionary')
        ctx.effect(() => ctx.locale.register(NS, 'zh', DICTS.zh), 'token-usage: zh dictionary')

        const store = createStore()
        ctx.effect(() => {
          // One package-owned sheet for the whole run; removing it on unload takes
          // every rule with it, so a disable leaves no styling behind.
          const sheet = document.createElement('style')
          sheet.textContent = CSS
          document.head.appendChild(sheet)
          return () => { sheet.remove() }
        }, 'token-usage: styles')

        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action',
          id: FOOT_ID,
          order: 40,
          label: () => t('panel.title'),
        }, props => h(FooterAction, { ...props, store, t, ctx })))

        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: SECTION_ID,
          order: 60,
          label: () => t('section.title'),
          locale: NS,
        }, () => h(SettingsPage, { store, t, ctx })))

        ctx.slots.inject('settings.section.icon', () => ctx.slots.register({
          name: 'settings.section.icon',
          id: SECTION_ID,
        }, props => h(BarChartIcon, { size: typeof props?.size === 'number' ? props.size : 16 })))
      },
    }
  },
})
