# Security Policy / 安全策略

## Audit checklist (what this plugin does and does not do)

Verified against the source on every release. Each claim links to the enforcing code.

| Claim | Enforced by |
|---|---|
| No network calls | the only `fetch` is client-side, same-origin `${API}` → `GET /api/token-usage-dashboard/summary` on the Harness local web server; the host half opens no sockets |
| No credentials / secrets | grep for `api[_-]?key`, `secret`, `token =`, `Bearer`, `process.env` across the repo returns zero hits |
| Authenticated API only | `ctx.connection.requestRejection(req)` runs before the handler; unauthenticated requests get the host's rejection status and never reach data code (`index.js`, route handler) |
| GET-only surface | non-GET requests get `405` with `allow: GET`; there is no write endpoint |
| Read-only on logs | the only log access is `sessionPersistence.open(id, 'read')` → `handle.read()`; no append, no write, no delete anywhere |
| No conversation content | the fold reads only `event.type`, `event.seq`, `event.time`, `data.usage.{inputTokens,outputTokens,cacheReadTokens,cacheWriteTokens}`, `data.message.source.{provider,model}`, `data.header.config` route fields; no `text`/`content` field is touched |
| No code injection | no `eval`, no `new Function`, no dynamic `require`; client renders through React.createElement with props, never `innerHTML` |
| Bounded persisted state | day buckets pruned to 365 (+8 headroom), model routes per day to the 48 heaviest (`RETENTION_DAYS` / `MAX_DAYS` / `MAX_MODELS_PER_DAY`) |
| Bounded work | cold folds cap reads at `COLD_READ_MAX_EVENTS` events per session with a `REFRESH_BUDGET_MS` wall-clock budget; API `days` parameter is clamped to `[1, RETENTION_DAYS]` |
| Bounded output | the API serializes aggregated numbers and route ids only — never raw events, never prompt/response text |

## Reporting a vulnerability

Open a **private security advisory** via GitHub's "Report a vulnerability" button on this repository (Security tab). Please do not open a public issue for anything you believe is exploitable.

Include: the affected file and line, a minimal reproduction, and the Harness version you tested against.

## Supported versions

Only the latest published commit of `main` receives security fixes. The plugin targets DeepSeek Harness 0.2.x; a Harness trust-fence or session-store change that affects this plugin's guarantees will be handled as a release blocker.

## Threat model notes

- The HTTP surface trusts the **host's** authentication. If the Harness web server's `connection.requestRejection` fence is bypassed by a Harness bug, this plugin's route inherits that exposure; the plugin adds no second layer on purpose (the host fence is the right place).
- Data shown (route ids like provider/model names) is the same metadata the Harness UI itself renders; the plugin exposes nothing the host UI does not.
- `client.js` runs in the Harness web client with the same origin as the app; it requests no storage, no cookies, and no cross-origin resources.
