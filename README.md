# dsh-usage-dashboard

[English](#english) | [中文](#中文)

<a id="english"></a>

A [DeepSeek Harness](https://github.com/deepseek-ai) plugin that shows daily token usage with a per-model breakdown, folded from the session logs on your machine — in the style of the z.ai / Claude usage dashboards.

Zero runtime dependencies. Two plain JavaScript files. No build step.

## Screenshots

*(see the in-app pages described below — the plugin renders inside DeepSeek Harness)*

## Where to find it

1. **Sidebar footer** — a bar-chart button above the settings gear shows today's total and opens a popover: a 14-day smooth trend chart plus a per-model share list.
2. **Settings → Usage statistics** — the full dashboard:

   | Section | What it shows |
   |---|---|
   | Summary strip | total, peak day, today, current streak, longest streak (zh locale reads 亿/万) |
   | Token activity | full-year GitHub-style heatmap, daily / weekly / cumulative modes, hover card with exact figures |
   | Time range | last 7 / 30 days, applied instantly (local slice, no request) |
   | Daily trend | one smooth multi-hue line per top model + "Other", hover card lists each model's value that day, keyboard-reachable |
   | Model table | per route: input / output / cache read / cache write / calls / total / share |

## How it works

- **Source of truth**: the session log. Every model call whose adapter reported token accounting lands one `assistant/message` event carrying `usage` and the exact `provider`/`model` route (falling back to the latest `request/header` config). This plugin folds those events and **writes nothing** to the log.
- **Performance**: attached sessions fold incrementally through `ctx.sessionProjections` and land in the persisted projection cache. Detached sessions are served from that cache with zero log I/O; only a session with no usable cache row is folded from its durable log once, under a bounded read and a wall-clock budget.
- **Fork-correct**: a forked session skips the event prefix inherited from its parent, so nothing is counted twice.
- **Resilient**: optional seams degrade instead of failing. Projection registration failure falls back to a local fold; a failed cache read falls back to the log; a failed log fold skips the session. Every HTTP path is wrapped — nothing bubbles into the host.
- **Bound state**: day buckets are pruned to 365 days, model routes per day to the 48 heaviest, so persisted state stays small no matter how many routes you use.

## Privacy and security

- **Local only.** Reads your own session logs from local disk. Makes no network requests. Sends nothing anywhere.
- **Authenticated surface.** The one API route (`GET /api/token-usage-dashboard/summary`) sits behind the Harness web server's connection trust fence — unauthenticated requests are rejected by the host before the handler runs.
- **No secrets.** The code holds no credentials, no `process.env` reads, no telemetry, no remote code.
- **No conversation content.** Aggregation touches only event types, `usage` numbers, route ids, and timestamps. Prompt and response text is never read, folded, or exposed.
- See [SECURITY.md](SECURITY.md) for the audit checklist and how to report an issue.

## Install

Requires DeepSeek Harness with the Cordis plugin system (0.2.x).

```bash
# from your profile directory (the one containing package.json with the dsh.profile block)
pnpm add <this-repo-url>
```

Then add the bundle to the profile's `dsh.profile.bundles`:

```json
{
  "dsh": {
    "profile": {
      "bundles": [
        "@local/dsh-usage-dashboard"
      ]
    }
  }
}
```

and the patch line to `cordis.patch.yml`:

```yaml
- insert:
    - id: usage-dashboard
      name: '@local/dsh-usage-dashboard'
```

Restart DeepSeek Harness (or toggle the plugin in plugin management). The data folder (`C:\Users\<you>\.dsh\storages\session_projcache\`) gains one `usageDashboard` row per session on first open; the very first dashboard open may take a couple of seconds on a large corpus.

## Compatibility

| Component | Requirement |
|---|---|
| DeepSeek Harness | 0.2.x (Cordis `sessionProjections` / `sessionProjectionCache` / `sessionPersistence` seams; degrades gracefully without them) |
| Platform | Windows / macOS / Linux (web client) |
| Runtime deps | none |

`package.json` declares `"private": true` and the scoped name `@local/dsh-usage-dashboard`; rename both if you publish it to a registry.

## Repo layout

```
index.js           host half: fold, projection, cache, HTTP surface
client.js          web half: settings page, popover, charts (React via the host module table)
locale/en.json     UI strings (en)
locale/zh.json     UI strings (zh)
icon.svg           toolbar icon
cordis.patch.yml   Cordis patch: inserts the plugin unit
```

## License

[MIT](LICENSE)

---

<a id="中文"></a>

# dsh-usage-dashboard(每日 Token 用量)

一个 [DeepSeek Harness](https://github.com/deepseek-ai) 插件:显示每天的 Token 用量并按模型细分,数据来自本机会话日志,界面风格对齐 z.ai / Claude 的用量看板。

零运行时依赖,两个纯 JavaScript 文件,无构建步骤。

## 入口

1. **侧边栏左下角** —— 设置齿轮上方的柱状图按钮,显示今天总量,点开弹出近 14 天平滑趋势图 + 各模型占比列表。
2. **设置 → 使用统计** —— 完整看板:

   | 区块 | 内容 |
   |---|---|
   | 汇总条 | 累计 / 峰值 / 今日 / 当前连续 / 最长连续天数(中文按 亿/万 计数) |
   | Token 活动 | 全年 GitHub 式热力图,每日 / 每周 / 累计三种口径,悬停卡片显示精确数字 |
   | 时间范围 | 近 7 日 / 近 30 日,即时切换(本地切片,不发请求) |
   | 每日趋势 | Top 模型各一条多彩平滑曲线 +「其他」,悬停列出当日各模型数值,支持键盘访问 |
   | 模型明细 | 按路由:输入 / 输出 / 缓存读取 / 缓存写入 / 调用次数 / 总量 / 占比 |

## 工作原理

- **唯一数据源是会话日志**:每次模型调用只要适配器上报了 token 结算,就有一条带 `usage` 和精确 `provider`/`model` 路由的 `assistant/message` 事件(缺失时回退到最近的 `request/header` 配置)。本插件折叠这些事件,**不写入任何日志**。
- **性能**:活会话经 `ctx.sessionProjections` 增量折叠并落入持久投影缓存;冷会话从缓存零 I/O 读取,只有没有可用缓存行的会话才回读一次日志,且有读取上限与时间预算。
- **Fork 正确**:fork 会话跳过继承自父会话的事件前缀,不重复计数。
- **韧性**:所有可选依赖都是降级而非失败——投影注册失败回退本地折叠,缓存读失败回退日志,日志折叠失败跳过该会话;HTTP 全路径兜底,异常不会冒泡进宿主。
- **有界状态**:日桶保留 365 天、单日模型路由保留最重的 48 个,持久状态始终很小。

## 隐私与安全

- **纯本地**。只读本机会话日志,零网络请求,不向任何地方发送数据。
- **认证面**。唯一 API 路由(`GET /api/token-usage-dashboard/summary`)在 Harness Web 服务器的连接信任栅栏之后,未认证请求由宿主先行拒绝。
- **无密钥**。代码不含凭据、不读 `process.env`、无遥测、无远程代码。
- **不碰对话内容**。聚合只涉及事件类型、`usage` 数值、路由 ID 与时间戳;提示词与回复文本从不被读取、折叠或暴露。
- 完整审计清单见 [SECURITY.md](SECURITY.md)。

## 安装

需要带 Cordis 插件体系的 DeepSeek Harness(0.2.x)。

```bash
# 在 profile 目录下(即含 dsh.profile 配置的 package.json 所在目录)
pnpm add <本仓库地址>
```

然后把 bundle 加进 profile 的 `dsh.profile.bundles`:

```json
{
  "dsh": {
    "profile": {
      "bundles": [ "@local/dsh-usage-dashboard" ]
    }
  }
}
```

并在 `cordis.patch.yml` 加一行 patch:

```yaml
- insert:
    - id: usage-dashboard
      name: '@local/dsh-usage-dashboard'
```

重启 DeepSeek Harness(或在插件管理里开关一次)。首次打开看板时若语料较大可能需要一两秒建缓存,之后即快。

## 兼容性

| 组件 | 要求 |
|---|---|
| DeepSeek Harness | 0.2.x(Cordis `sessionProjections` / `sessionProjectionCache` / `sessionPersistence` 接缝;缺失时自动降级) |
| 平台 | Windows / macOS / Linux(Web 客户端) |
| 运行时依赖 | 无 |

`package.json` 声明了 `"private": true` 和作用域包名 `@local/dsh-usage-dashboard`;若要发布到 registry,请自行改名。

## 许可

[MIT](LICENSE)
