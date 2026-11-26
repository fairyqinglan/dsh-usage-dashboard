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
    const EXPORT_API = (() => {
      try {
        return new URL('api/token-usage-dashboard/export', document.baseURI).pathname
      } catch {
        return '/api/token-usage-dashboard/export'
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
        'panel.selectDay': 'Click the chart to inspect a day',
        'panel.clear': 'Clear selection',
        'panel.dayView': 'Day view',
        'panel.allView': '14-day total',
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
        'heat.less': 'Less',
        'heat.more': 'More',
        'heat.pick': 'Click a day to see its model breakdown',
        'dist.title': 'Token distribution',
        'dist.today': 'Today',
        'dist.day': 'Distribution',
        'dist.none': 'No usage on this day',
        'dist.clear': 'Back to today',
        'range.title': 'Time range',
        'range.7': 'Last 7 days',
        'range.30': 'Last 30 days',
        'range.90': 'Last 90 days',
        'range.custom': 'Custom',
        'range.from': 'From',
        'range.to': 'To',
        'range.apply': 'Apply',
        'range.invalid': 'Use valid dates within the window.',
        'compare.title': 'Period comparison',
        'compare.previous': 'vs previous period',
        'compare.lastYear': 'vs last year',
        'compare.calls': 'calls',
        'compare.flat': 'no change',
        'compare.unavailable': 'not enough history',
        'export.title': 'Export',
        'export.csv': 'CSV',
        'export.json': 'JSON',
        'panel.export': 'Export data',
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
        'panel.selectDay': '点击曲线图查看某一天',
        'panel.clear': '清除选择',
        'panel.dayView': '单日视图',
        'panel.allView': '近 14 天合计',
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
        'heat.less': '少',
        'heat.more': '多',
        'heat.pick': '点击某一天查看当天的模型分布',
        'dist.title': 'Token 分布',
        'dist.today': '今日',
        'dist.day': '分布',
        'dist.none': '当天暂无用量',
        'dist.clear': '返回今日',
        'range.title': '时间范围',
        'range.7': '近 7 日',
        'range.30': '近 30 日',
        'range.90': '近 90 日',
        'range.custom': '自定义',
        'range.from': '开始',
        'range.to': '结束',
        'range.apply': '应用',
        'range.invalid': '请输入窗口内的有效日期。',
        'compare.title': '环比对比',
        'compare.previous': '较上一周期',
        'compare.lastYear': '较去年同期',
        'compare.calls': '次调用',
        'compare.flat': '持平',
        'compare.unavailable': '历史数据不足',
        'export.title': '导出',
        'export.csv': 'CSV',
        'export.json': 'JSON',
        'panel.export': '导出数据',
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

    /**
     * SVG donut segments for a model share list. Each arc is one full circle
     * drawn with a dash equal to its exact share; `stroke-dashoffset` shifts it
     * to its start so consecutive arcs meet precisely — no gaps, closed ring.
     * Both dasharray and dashoffset animate via CSS, so switching days morphs
     * the ring smoothly while staying a closed loop.
     */
    function donutArcs(models, palette, size = 64, strokeWidth = 8) {
      const total = models.reduce((sum, entry) => sum + Math.max(0, entry.total ?? 0), 0)
      if (total <= 0) return { arcs: [], total: 0, radius: size / 2 - strokeWidth / 2 - 1 }
      // Keep the outer stroke edge (radius + strokeWidth/2) inside the viewBox
      // with a 1px margin, so the ring is never clipped by the SVG boundary.
      const radius = size / 2 - strokeWidth / 2 - 1
      const circumference = 2 * Math.PI * radius
      let travelled = 0
      const arcs = models.map(entry => {
        const fraction = Math.max(0, entry.total ?? 0) / total
        const length = fraction * circumference
        const key = entry.key ?? `${entry.provider}\u0000${entry.model}`
        // dashoffset advances the dash pattern: a NEGATIVE offset shifts the
        // dash forward along the path so this arc starts at `travelled`,
        // exactly where the previous arc ended. (A positive offset would push
        // it backwards, breaking the ring.) Shares sum to 1, so the last arc
        // closes against the first with no gap.
        const arc = {
          key,
          color: palette.color(key),
          dash: `${length.toFixed(3)} ${(circumference - length).toFixed(3)}`,
          offset: (-travelled).toFixed(3),
        }
        travelled += length
        return arc
      }).filter(arc => Number(arc.dash.split(' ')[0]) > 0)
      return { arcs, total, circumference, radius }
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

      async function fetchSummary(force, range, compareDays) {
        const params = new URLSearchParams({ days: '365', compare: '1', compareDays: '7' })
        if (compareDays !== undefined) params.set('compareDays', String(compareDays))
        if (force) params.set('refresh', '1')
        if (range !== undefined && range.from !== undefined && range.to !== undefined) {
          params.set('from', range.from)
          params.set('to', range.to)
        }
        const response = await fetch(`${API}?${params}`, {
          credentials: 'same-origin',
          headers: { accept: 'application/json' },
          redirect: 'error',
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return await response.json()
      }

      /** Pump one refresh at a time; a request arriving mid-flight runs right after. */
      function pump(force, range, compareDays) {
        if (running !== undefined) {
          queued = queued || force
          pendingRange = range
          pendingCompareDays = compareDays
          return
        }
        set({ status: state.summary === undefined ? 'loading' : 'refreshing' })
        running = (async () => {
          try {
            set({ status: 'ready', summary: await fetchSummary(force, range, compareDays), error: undefined })
          } catch (error) {
            // Keep the last good summary: a stale figure with a stated reason
            // beats a blank page.
            set({ status: 'error', error: String(error?.message ?? error) })
          } finally {
            running = undefined
            if (queued) {
              queued = false
              pump(true, pendingRange, pendingCompareDays)
              pendingRange = undefined
              pendingCompareDays = undefined
            }
          }
        })()
      }

      let pendingRange = undefined
      let pendingCompareDays = undefined

      function refresh(options = {}) {
        pump(options.force === true, options.range, options.compareDays)
        return running ?? Promise.resolve()
      }

      /** Build an export URL for the current window; the browser downloads it. */
      function exportUrl(format, range) {
        const params = new URLSearchParams({ days: '365', format })
        if (range !== undefined && range.from !== undefined && range.to !== undefined) {
          params.set('from', range.from)
          params.set('to', range.to)
        }
        return `${EXPORT_API}?${params}`
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
        exportUrl,
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

/* Activity block: heatmap above, distribution ring below. */
.tud-activity-grid { display: flex; flex-direction: column; gap: 18px; }
.tud-activity-side { border-top: 1px solid var(--dsw-alias-border-l1); padding-top: 14px; }
/* GitHub-style activity heatmap: fixed cells, month ruler, less/more legend. */
.tud-heat-block { display: flex; flex-direction: column; }
.tud-heat-wrap { overflow-x: auto;
  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2); --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2); }
.tud-heat { display: grid; grid-auto-flow: column; grid-template-rows: repeat(7, 13px);
  grid-auto-columns: 13px; gap: 3px; width: max-content; padding: 2px 0; }
.tud-heat-cell { width: 13px; height: 13px; border-radius: 3px; padding: 0; border: none;
  background: var(--dsw-alias-bg-layer-2); transition: transform 140ms ease, box-shadow 140ms ease; }
/* Blue intensity ladder that follows the host theme: each level mixes more
   blue into the SAME background token used by empty cells. Level 1 is closest
   to the background, level 4 farthest — so "lighter → deeper" always reads in
   the same direction whether the theme background is white or black. */
.tud-heat-cell[data-level="1"] { background: color-mix(in srgb, #3b82d6 22%, var(--dsw-alias-bg-layer-2)); }
.tud-heat-cell[data-level="2"] { background: color-mix(in srgb, #3b82d6 45%, var(--dsw-alias-bg-layer-2)); }
.tud-heat-cell[data-level="3"] { background: color-mix(in srgb, #3b82d6 68%, var(--dsw-alias-bg-layer-2)); }
.tud-heat-cell[data-level="4"] { background: color-mix(in srgb, #3b82d6 90%, var(--dsw-alias-bg-layer-2)); }
.tud-heat-cell[data-selected] { outline: 2px solid var(--dsw-alias-label-primary); outline-offset: 1px;
  box-shadow: 0 0 0 3px color-mix(in srgb, #3b82d6 45%, transparent); transform: scale(1.15); z-index: 1; }
button.tud-heat-cell { cursor: pointer; }
button.tud-heat-cell:hover:not([data-selected]) { transform: scale(1.15); }
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

/* Period-over-period comparison strip. */
.tud-compare { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
.tud-compare-card { border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; padding: 10px 12px;
  background: var(--dsw-alias-bg-layer-1); display: flex; flex-direction: column; gap: 4px; }
.tud-compare-label { color: var(--dsw-alias-label-secondary); font-size: 11px; }
.tud-compare-value { color: var(--dsw-alias-label-primary); font-size: 15px; font-weight: 600;
  font-variant-numeric: tabular-nums; display: flex; align-items: baseline; gap: 6px; }
.tud-compare-delta { font-size: 12px; font-weight: 600; }
.tud-compare-delta[data-dir="up"] { color: var(--dsw-alias-state-success-primary); }
.tud-compare-delta[data-dir="down"] { color: var(--dsw-alias-state-error-primary); }
.tud-compare-delta[data-dir="flat"] { color: var(--dsw-alias-label-tertiary); }
.tud-compare-sub { color: var(--dsw-alias-label-tertiary); font-size: 10px; }

/* Custom range inputs. */
.tud-custom-range { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 8px; }
.tud-custom-range input { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary);
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; padding: 4px 8px; font: inherit; font-size: 12px; }
.tud-custom-range button { border: none; border-radius: 8px; padding: 5px 12px; background: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-bg-base); font: inherit; font-size: 12px; cursor: pointer; }
.tud-custom-range button:disabled { opacity: 0.5; cursor: default; }
.tud-range-error { color: var(--dsw-alias-state-error-primary); font-size: 11px; width: 100%; }

/* Export button group. */
.tud-export { display: inline-flex; gap: 4px; }
.tud-export button { border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px;
  padding: 4px 10px; background: transparent; color: var(--dsw-alias-label-secondary);
  font: inherit; font-size: 12px; cursor: pointer; }
.tud-export button:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }

/* Settings-page distribution ring: closed donut + centre total + legend. */
.tud-dist { display: flex; align-items: center; gap: 22px; flex-wrap: wrap; padding: 4px 2px; }
.tud-dist-ring { position: relative; flex: none; width: 120px; height: 120px; }
.tud-dist-svg { overflow: visible; }
.tud-dist-seg { transition: stroke-dasharray 520ms cubic-bezier(0.22, 1, 0.36, 1),
  stroke-dashoffset 520ms cubic-bezier(0.22, 1, 0.36, 1), stroke 300ms ease; }
.tud-dist-centre { position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 2px; pointer-events: none; }
.tud-dist-value { color: var(--dsw-alias-label-primary); font-size: 20px; font-weight: 700;
  font-variant-numeric: tabular-nums; }
.tud-dist-unit { color: var(--dsw-alias-label-tertiary); font-size: 10px; }
.tud-dist-info { flex: 1 1 360px; min-width: 0; }
.tud-dist-label { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px;
  color: var(--dsw-alias-label-primary); font-size: 13px; font-weight: 600; }
.tud-dist-date { color: var(--dsw-alias-label-tertiary); font-size: 11px; font-weight: 400; }
.tud-dist-empty { color: var(--dsw-alias-label-secondary); font-size: 12px; padding: 8px 0; }
/* Distribution legend: model name left, its token spend right-aligned. */
.tud-dist-legend { display: flex; flex-direction: column; gap: 6px; min-width: 0; width: 100%; }
.tud-dist-row { display: flex; align-items: center; gap: 8px; }
.tud-dist-row .tud-tip-name { flex: 1 1 auto; min-width: 0; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-primary); }
.tud-dist-tokens { flex: none; color: var(--dsw-alias-label-primary); font-size: 12px;
  font-variant-numeric: tabular-nums; font-weight: 600; }
.tud-dist-share { flex: none; min-width: 42px; text-align: right; color: var(--dsw-alias-label-tertiary);
  font-size: 11px; font-variant-numeric: tabular-nums; }

/* Popover donut: model share ring. */
.tud-donut-wrap { display: flex; align-items: center; gap: 14px; }
.tud-donut { flex: none; overflow: visible; }
.tud-donut-seg { transition: stroke-dasharray 480ms cubic-bezier(0.22, 1, 0.36, 1),
  stroke-dashoffset 480ms cubic-bezier(0.22, 1, 0.36, 1), stroke 300ms ease; }
.tud-donut-legend { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.tud-donut-row { display: flex; align-items: center; gap: 6px; color: var(--dsw-alias-label-secondary);
  font-size: 11px; transition: opacity 260ms ease; }
.tud-donut-row .tud-tip-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tud-hero-value { transition: opacity 200ms ease; }
/* Selected-day marker on the trend chart. */
.tud-trend-selected { transition: x1 180ms ease, x2 180ms ease; }
/* No browser square on the per-day hit targets; a soft keyboard-only cue. */
.tud-trend-hit { outline: none; }
.tud-trend-hit:focus-visible { stroke: var(--dsw-alias-brand-primary); stroke-width: 1.5;
  stroke-dasharray: 2 3; rx: 4; }
.tud-pick-hint { color: var(--dsw-alias-label-tertiary); font-size: 10px; margin-left: auto; }
.tud-pick-clear { border: none; border-radius: 6px; padding: 2px 6px; margin-left: 6px;
  background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary);
  font: inherit; font-size: 10px; cursor: pointer; }
.tud-pick-clear:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }

/* Narrow screens / small windows: collapse the 5-cell strip and tighten blocks. */
@media (max-width: 680px) {
  .tud-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .tud-strip-cell { padding: 12px 8px; }
  .tud-strip-cell:nth-child(3) { border-left: none; border-top: 1px solid var(--dsw-alias-border-l1); }
  .tud-strip-cell:nth-child(n+4) { border-top: 1px solid var(--dsw-alias-border-l1); }
  .tud-panel { width: calc(100vw - 24px); max-height: 74vh; }
  .tud-compare { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .tud-page { gap: 12px; }
}
@media (max-width: 420px) {
  .tud-strip { grid-template-columns: 1fr; }
  .tud-strip-cell { border-left: none; border-top: 1px solid var(--dsw-alias-border-l1); }
  .tud-strip-cell:first-child { border-top: none; }
}
/* Respect reduced-motion preferences (currently only subtle transitions here). */
@media (prefers-reduced-motion: reduce) {
  .tud-panel, .tud-tip, .tud-segmented button,
  .tud-donut-seg, .tud-donut-row, .tud-hero-value, .tud-trend-selected { transition: none !important; }
}
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
      const allModels = aggregateModels(axis)
      const [selectedDay, setSelectedDay] = React.useState(null)
      // A selected day narrows the breakdown to that day's own rows; anything
      // else shows the full 14-day aggregate. Palette stays keyed by the full
      // window so a model keeps its colour across the animation.
      const selectedEntry = selectedDay === null ? undefined : axis.find(entry => entry.day === selectedDay)
      const models = selectedDay !== null
        ? aggregateModels([{ day: selectedDay, row: selectedEntry?.row }])
        : allModels
      const palette = React.useMemo(() => pagePalette(allModels), [allModels])
      const dayTotal = selectedDay !== null
        ? (selectedEntry?.row?.total ?? 0)
        : (summary?.totals?.today ?? 0)
      const dayCalls = selectedDay !== null
        ? (selectedEntry?.row?.calls ?? 0)
        : (summary?.totals?.todayCalls ?? 0)
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
            h('a', {
              className: 'tud-icon-button',
              href: store.exportUrl('csv', undefined),
              title: t('panel.export'),
              'aria-label': t('panel.export'),
              download: '',
            }, h('span', { 'aria-hidden': true }, '↧')),
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
                  h('span', { className: 'tud-hero-value' }, formatTokens(dayTotal)),
                  h('span', { className: 'tud-hero-note' },
                    selectedDay === null
                      ? `${t('page.today')} · ${dayCalls} ${t('panel.calls')}`
                      : `${fullDay(selectedDay, locale)} · ${dayCalls} ${t('panel.calls')}`)),
                (() => {
                  const comparison = summary.comparison
                  if (comparison === undefined || comparison.days !== 7) return null
                  // Today vs the same weekday last week, approximated by the
                  // current 7-day window total vs its prior period.
                  const delta = deltaOf(comparison.total, t, locale)
                  if (delta === null) return null
                  return h('div', { className: 'tud-hero' },
                    h('span', { className: `tud-compare-delta`, 'data-dir': delta.dir }, delta.text),
                    h('span', { className: 'tud-hero-note' }, `${t('compare.previous')} · ${comparison.days}${t('strip.days')}`))
                })(),
                snapshot.status === 'error'
                  ? h(State, { text: t('page.stale'), onRetry: () => { void store.refresh({ force: true }) }, t })
                  : null,
                models.length > 0 ? (() => {
                  const ring = donutArcs(models, palette, 60)
                  // Show the top routes of the *current* view (day or window);
                  // colours come from the stable full-window palette.
                  const top = models.slice(0, 5)
                  return h('div', { className: 'tud-donut-wrap' },
                    h('svg', {
                      className: 'tud-donut', width: 60, height: 60, viewBox: '0 0 60 60',
                      role: 'img', 'aria-label': `${selectedDay === null ? t('panel.allView') : t('panel.dayView')} · ${t('page.models')}`,
                    }, h('g', { transform: 'rotate(-90 30 30)' },
                      ...ring.arcs.map(arc => h('circle', {
                        key: arc.key,
                        className: 'tud-donut-seg',
                        cx: 30, cy: 30, r: ring.radius,
                        stroke: arc.color, strokeWidth: 8, fill: 'none',
                        'stroke-dasharray': arc.dash,
                        'stroke-dashoffset': arc.offset,
                      })))),
                    h('div', { className: 'tud-donut-legend' },
                      ...top.map(entry => {
                        const key = entry.key ?? `${entry.provider}\u0000${entry.model}`
                        return h('div', { className: 'tud-donut-row', key },
                          h('span', { className: 'tud-tip-dot', style: { background: palette.color(key) } }),
                          h('span', { className: 'tud-tip-name' }, entry.model),
                          h('span', null, formatShare(entry.share ?? 0)))
                      })))
                })() : null,
                axis.length === 0 ? null : h('div', null,
                  h('div', { className: 'tud-caption' },
                    `${t('trend.title')} · ${t('panel.days14')}`,
                    selectedDay === null
                      ? h('span', { className: 'tud-pick-hint' }, t('panel.selectDay'))
                      : h('button', { type: 'button', className: 'tud-pick-clear', onClick: () => setSelectedDay(null) }, t('panel.clear'))),
                  h(TrendChart, {
                    axis, locale, t, compact: true,
                    selectable: true, selectedDay, onSelectDay: setSelectedDay,
                  })),
                h('div', { className: 'tud-caption' },
                  selectedDay === null ? t('page.models') : `${t('panel.dayView')} · ${fullDay(selectedDay, locale)}`),
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

    const RANGES = [7, 30, 90]
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

    /** Arrow + delta label for one comparison metric. */
    function deltaOf(metric, t, locale, unit) {
      if (metric === undefined || metric === null) return null
      const { value, prior, change, unavailable } = metric
      if (unavailable) return { text: t('compare.unavailable'), dir: 'flat' }
      if (change === null) return { text: prior === 0 && value > 0 ? '+' + formatTokens(value) : t('compare.flat'), dir: prior === 0 && value > 0 ? 'up' : 'flat' }
      const pct = change * 100
      const dir = pct > 0.05 ? 'up' : pct < -0.05 ? 'down' : 'flat'
      const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '─'
      const abs = Math.abs(pct)
      const shown = abs >= 100 ? Math.round(abs) : abs.toFixed(1)
      return { text: `${arrow} ${shown}%`, dir, prior: `${formatTokens(prior)}${unit ?? ''}` }
    }

    /** Period-over-period and year-over-year comparison cards. */
    function ComparisonStrip({ comparison, t, locale }) {
      if (comparison === undefined) return null
      const prev = deltaOf(comparison.total, t, locale)
      const yoy = deltaOf(comparison.yearOverYear, t, locale)
      if (prev === null && yoy === null) return null
      const cards = []
      if (prev !== null) cards.push({
        key: 'prev',
        label: `${t('compare.previous')} · ${comparison.days}${t('strip.days')}`,
        delta: prev,
        metric: comparison.total,
      })
      if (yoy !== null) cards.push({
        key: 'yoy',
        label: t('compare.lastYear'),
        delta: yoy,
        metric: comparison.yearOverYear,
      })
      return h('div', { className: 'tud-compare', role: 'group', 'aria-label': t('compare.title') },
        ...cards.map(card => h('div', { className: 'tud-compare-card', key: card.key },
          h('span', { className: 'tud-compare-label' }, card.label),
          h('span', { className: 'tud-compare-value' },
            h('span', { className: 'tud-compare-delta', 'data-dir': card.delta.dir }, card.delta.text)),
          card.delta.prior !== undefined
            ? h('span', { className: 'tud-compare-sub' }, `${formatTokens(card.metric.prior)} → ${formatTokens(card.metric.value)}`)
            : null)))
    }

    /**
     * Closed donut showing one day's (or today's) per-model token distribution,
     * with the day's total in the centre and a compact legend beside it. Arcs
     * animate between days via CSS dasharray/dashoffset transitions.
     */
    function DistributionRing({ axis, day, locale, t }) {
      const entry = day === null || day === undefined
        ? undefined
        : axis.find(item => item.day === day)
      const viewDay = entry?.day ?? axis[axis.length - 1]?.day
      const models = aggregateModels(viewDay === undefined ? [] : [{ day: viewDay, row: entry?.row }])
      const palette = React.useMemo(() => pagePalette(models), [models])
      const total = models.reduce((sum, m) => sum + m.total, 0)
      const strokeWidth = 14
      const ring = donutArcs(models, palette, 120, strokeWidth)
      const centre = 60
      return h('div', { className: 'tud-dist' },
        h('div', { className: 'tud-dist-ring' },
          h('svg', {
            width: 120, height: 120, viewBox: '0 0 120 120',
            className: 'tud-dist-svg',
            role: 'img', 'aria-label': `${t('dist.title')} · ${viewDay ?? ''}`,
          }, h('g', { transform: `rotate(-90 ${centre} ${centre})` },
            ...ring.arcs.map(arc => h('circle', {
              key: arc.key,
              className: 'tud-donut-seg tud-dist-seg',
              cx: centre, cy: centre, r: ring.radius,
              stroke: arc.color, strokeWidth, fill: 'none',
              'stroke-dasharray': arc.dash,
              'stroke-dashoffset': arc.offset,
            })))),
          h('div', { className: 'tud-dist-centre' },
            h('span', { className: 'tud-dist-value' }, formatTokens(total)),
            h('span', { className: 'tud-dist-unit' }, t('page.tokens')))),
        h('div', { className: 'tud-dist-info' },
          h('div', { className: 'tud-dist-label' },
            day === null || day === undefined ? t('dist.today') : t('dist.day'),
            h('span', { className: 'tud-dist-date' }, viewDay ?? '')),
          models.length === 0
            ? h('div', { className: 'tud-dist-empty' }, t('dist.none'))
            : h('div', { className: 'tud-dist-legend' },
              ...models.map(m => {
                const key = m.key ?? `${m.provider}\u0000${m.model}`
                return h('div', { className: 'tud-dist-row', key },
                  h('span', { className: 'tud-tip-dot', style: { background: palette.color(key) } }),
                  h('span', { className: 'tud-tip-name' }, m.model),
                  h('span', { className: 'tud-dist-tokens' }, formatTokens(m.total)),
                  h('span', { className: 'tud-dist-share' }, formatShare(m.share ?? 0)))
              }))))
    }

    /**
     * GitHub-style activity heatmap over the full retained year. Each cell is
     * that single day's tokens (sqrt-scaled intensity). Cells are selectable:
     * clicking one reports the day through `onSelectDay` so the distribution
     * ring can show that day's model breakdown.
     */
    function ActivityHeatmap({ axis, locale, t, selectedDay, onSelectDay }) {
      // Hooks first: an early return must not change hook order between renders.
      const tipState = useTip()
      const wrapRef = React.useRef(null)
      React.useEffect(() => {
        const wrap = wrapRef.current
        if (wrap !== null && wrap !== undefined) wrap.scrollLeft = wrap.scrollWidth
      }, [])

      const dayValue = entry => entry.row?.total ?? 0
      const hasUsage = axis.some(entry => dayValue(entry) > 0)
      if (axis.length === 0 || !hasUsage) return h(State, { text: t('page.empty') })

      const values = axis.map(entry => dayValue(entry))
      const max = Math.max(1, ...values)
      const levelOf = value => (value <= 0 ? 0 : Math.min(4, Math.max(1, Math.ceil(Math.sqrt(value / max) * 4))))

      const tipFor = position => {
        const entry = axis[position]
        return h('div', null,
          h('div', { className: 'tud-tip-day' }, fullDay(entry.day, locale)),
          h('div', null, `${formatExact(values[position], locale)} ${t('page.tokens')}`),
          h('div', { className: 'tud-tip-note' }, t('heat.pick')))
      }

      // Column-major cells: placeholder padding before the first day and after
      // today keeps every real day on its weekday row.
      const firstDow = (new Date(`${axis[0].day}T00:00:00Z`).getUTCDay() + 6) % 7
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
            day: entry.day,
            level: levelOf(values[position]),
            position,
            selected: entry.day === selectedDay,
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
              : h('button', {
                key: cell.key,
                type: 'button',
                className: 'tud-heat-cell',
                'data-level': cell.level,
                'data-selected': cell.selected || undefined,
                role: 'img',
                'aria-label': cell.label,
                'aria-pressed': cell.selected,
                onClick: () => { onSelectDay(cell.day === selectedDay ? null : cell.day) },
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
    function TrendChart({ axis, locale, t, compact, selectedDay, onSelectDay, selectable, showLegend = false }) {
      // Hooks first: an early return must not change hook order between renders.
      // No tooltip here: the distribution ring already shows a day's date and
      // model split, so a hover card would repeat the same information.
      const [hoverIndex, setHoverIndex] = React.useState(null)
      const svgRef = React.useRef(null)
      const selectIndex = selectedDay === undefined || selectedDay === null
        ? null
        : axis.findIndex(entry => entry.day === selectedDay)

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

      // Hover only moves the visual guide (line + dots); it deliberately does
      // not open an information card — that would duplicate the distribution
      // ring's date and per-model breakdown.
      const onMove = event => {
        const index = indexAt(event.clientX)
        if (index === null) return
        setHoverIndex(index)
      }
      const onLeave = () => {
        setHoverIndex(null)
      }
      /** Click (or Enter/Space on a day target) toggles that day's selection. */
      const onPick = index => {
        if (selectable !== true || onSelectDay === undefined || index === null || index < 0) return
        const day = axis[index]?.day
        if (day === undefined) return
        onSelectDay(day === selectedDay ? null : day)
      }
      const onChartClick = event => { onPick(indexAt(event.clientX)) }

      return h('div', null,
        showLegend ? h('div', { className: 'tud-legend' },
          ...lines.map(line => h('span', { className: 'tud-legend-chip', key: line.label },
            h('span', { className: 'tud-legend-dot', style: { background: line.color } }),
            line.label)),
          h('span', { className: 'tud-legend-note' }, t('legend.note'))) : null,
        h('svg', {
          className: 'tud-trend',
          viewBox: `0 0 ${W} ${H}`,
          role: 'group',
          'aria-label': t('trend.title'),
          ref: svgRef,
          onMouseMove: onMove,
          onMouseLeave: onLeave,
          onClick: selectable === true ? onChartClick : undefined,
          style: selectable === true ? { cursor: 'pointer' } : undefined,
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
          // Selected-day guide: a solid accent rule that stays until cleared.
          selectIndex !== null && selectIndex >= 0 ? h('line', {
            key: 'selected',
            className: 'tud-trend-selected',
            x1: padL + selectIndex * step, x2: padL + selectIndex * step,
            y1: padT, y2: padT + plotH,
            stroke: 'var(--dsw-alias-brand-primary)',
            strokeWidth: 2,
          }) : null,
          selectIndex !== null && selectIndex >= 0 ? lines.map(line => h('circle', {
            key: `sel-${line.label}`,
            cx: padL + selectIndex * step,
            cy: padT + plotH - (Math.min(line.values[selectIndex] ?? 0, max) / max) * plotH,
            r: 5,
            fill: line.color,
            stroke: 'var(--dsw-alias-bg-base)',
            strokeWidth: 1.5,
          })) : null,
          // Hover guide: skip it entirely when the hovered day is the selected
          // day — the selected guide + markers above already mark that spot,
          // so drawing both would show two lines and two sets of dots.
          hoverIndex === null || hoverIndex === selectIndex ? null : h('line', {
            key: 'guide',
            x1: padL + hoverIndex * step, x2: padL + hoverIndex * step,
            y1: padT, y2: padT + plotH,
            stroke: 'var(--dsw-alias-label-tertiary)',
            strokeDasharray: '3 4',
            strokeWidth: 1,
          }),
          hoverIndex === null || hoverIndex === selectIndex ? null : lines.map(line => h('circle', {
            key: `dot-${line.label}`,
            cx: padL + hoverIndex * step,
            cy: padT + plotH - (Math.min(line.values[hoverIndex] ?? 0, max) / max) * plotH,
            r: 4,
            fill: line.color,
            stroke: 'var(--dsw-alias-bg-base)',
            strokeWidth: 1.5,
          })),
          // Hit targets exist only for selectable charts (the popover). The
          // settings-page trend chart is display-only: rendering focusable
          // rects there would draw a browser focus square on click while doing
          // nothing. Hover guides work off the svg's mousemove + coordinates,
          // so no rects are needed for a static chart.
          ...(selectable === true ? axis.map((entry, position) => {
            const detail = `${fullDay(entry.day, locale)} · ${formatExact(entry.row?.total ?? 0, locale)}${
              (entry.row?.models ?? [])
                .slice(0, 4)
                .map(item => `; ${item.model} ${formatExact(item.total, locale)}`)
                .join('')}`
            return h('rect', {
              key: `hit-${entry.day}`,
              className: 'tud-trend-hit',
              x: padL + position * step - step / 2,
              y: padT,
              width: Math.max(step, 2),
              height: plotH,
              fill: 'transparent',
              tabIndex: 0,
              role: 'button',
              'aria-label': detail,
              'aria-pressed': entry.day === selectedDay,
              onClick: () => onPick(position),
              onKeyDown: event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onPick(position)
                }
              },
            })
          }) : []),
          ...axis.map((entry, position) => position % labelEvery === 0 || position === n - 1
            ? h('text', {
              key: `x-${entry.day}`,
              x: padL + position * step,
              y: H - 8,
              fill: 'var(--dsw-alias-label-tertiary)',
              fontSize: 11,
              textAnchor: position === n - 1 ? 'end' : (position === 0 ? 'start' : 'middle'),
            }, axisDay(entry.day, locale))
            : null)))
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
      const [activityDay, setActivityDay] = React.useState(null)
      const [customOpen, setCustomOpen] = React.useState(false)
      const [from, setFrom] = React.useState('')
      const [to, setTo] = React.useState('')
      const [rangeError, setRangeError] = React.useState(false)

      const head = h('div', { className: 'tud-page-head' },
        h('div', { className: 'tud-page-title' }, t('page.title')),
        h('span', { className: 'tud-badge' }, t('page.badge')),
        h('div', { className: 'tud-export', role: 'group', 'aria-label': t('export.title') },
          h('button', { type: 'button', onClick: () => { window.location.href = store.exportUrl('csv', undefined) } }, t('export.csv')),
          h('button', { type: 'button', onClick: () => { window.location.href = store.exportUrl('json', undefined) } }, t('export.json'))))

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

      const heatBlock = h('div', { className: 'tud-block' },
        h('div', { className: 'tud-block-head' },
          h('div', { className: 'tud-block-title' }, t('heat.title')),
          activityDay !== null
            ? h('button', { type: 'button', className: 'tud-pick-clear', onClick: () => setActivityDay(null) }, t('dist.clear'))
            : null),
        h('div', { className: 'tud-activity-grid' },
          h(ActivityHeatmap, { axis, locale, t, selectedDay: activityDay, onSelectDay: setActivityDay }),
          h('div', { className: 'tud-activity-side' },
            h('div', { className: 'tud-block-title' }, t('dist.title')),
            h(DistributionRing, { axis, day: activityDay, locale, t }))))

      const applyCustom = () => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
          setRangeError(true)
          return
        }
        setRangeError(false)
        void store.refresh({ force: true, range: { from, to } })
      }
      const rangeSegment = h('div', { className: 'tud-segmented', role: 'group', 'aria-label': t('range.title') },
        ...RANGES.map(days => h('button', {
          key: days,
          type: 'button',
          'data-active': !customOpen && range === days || undefined,
          'aria-pressed': !customOpen && range === days,
          onClick: () => { setCustomOpen(false); setRange(days); void store.refresh({ force: true, compareDays: days }) },
        }, t(`range.${days}`))),
        h('button', {
          key: 'custom',
          type: 'button',
          'data-active': customOpen || undefined,
          'aria-pressed': customOpen,
          onClick: () => { setCustomOpen(current => !current) },
        }, t('range.custom')))
      const rangeRow = h('div', null,
        h('div', { className: 'tud-range-row' },
          h('span', { className: 'tud-range-label' }, t('range.title')),
          rangeSegment),
        customOpen ? h('div', { className: 'tud-custom-range' },
          h('label', null, t('range.from'), h('input', {
            type: 'date', value: from, max: summary.today,
            onChange: e => { setFrom(e.target.value); setRangeError(false) },
          })),
          h('label', null, t('range.to'), h('input', {
            type: 'date', value: to, max: summary.today,
            onChange: e => { setTo(e.target.value); setRangeError(false) },
          })),
          h('button', { type: 'button', onClick: applyCustom }, t('range.apply')),
          rangeError ? h('span', { className: 'tud-range-error', role: 'alert' }, t('range.invalid')) : null) : null)

      const trendBlock = h('div', { className: 'tud-block' },
        h('div', { className: 'tud-block-title' }, t('trend.title')),
        hasRangeUsage ? h(TrendChart, { axis: rangeAxis, locale, t }) : h(State, { text: t('page.empty') }))

      const comparisonBlock = h(ComparisonStrip, { comparison: summary.comparison, t, locale })

      const tableBlock = h('div', { className: 'tud-block' },
        h('div', { className: 'tud-block-title' }, `${t('page.models')} · ${customOpen ? t('range.custom') : t(`range.${range}`)}`),
        models.length === 0
          ? h(State, { text: t('page.empty') })
          : h(ModelTable, { models, palette, t, locale }))

      return h('div', { className: 'tud-page' },
        head,
        snapshot.status === 'error'
          ? h(State, { text: t('page.stale'), onRetry: () => { void store.refresh({ force: true }) }, t })
          : null,
        h(SummaryStrip, { axis, totals: summary.totals, locale, t }),
        comparisonBlock,
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
