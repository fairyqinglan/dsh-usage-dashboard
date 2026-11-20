# Contributing

Thanks for considering a contribution!

## Development setup

The plugin lives as a linked bundle inside a DeepSeek Harness profile:

```
<profile-dir>/            e.g. ~/.dsh/profiles/desktop
  package.json            lists @local/dsh-usage-dashboard in dsh.profile.bundles
  cordis.patch.yml        contains the `include: usage-dashboard` insert
<repo>/dsh-usage-dashboard   this repository, pnpm-linked into the profile
```

Edit the files here; changes to `index.js` (host half) and `client.js` (web half) are picked up by toggling the plugin off/on in Harness plugin management, then refreshing the web client.

## Code conventions

- Plain ESM JavaScript, no TypeScript, no build step, no runtime dependencies.
- `client.js` runs in the Harness web client: React comes from the host module table, only `useState`/`useEffect`/`useRef`/`useMemo`/`useCallback` are reliable, and colors must use `--dsw-alias-*` theme tokens so both light and dark themes work.
- All user-facing strings go through the locale dictionaries (`locale/en.json`, `locale/zh.json`) — keep both in sync.
- Fold logic (`foldApply`, `summarize`, `initialDayState`, `normalizeState`) is pure and exported for tests; keep it that way. A fold must return the same reference when an event contributes nothing.

## Testing

```
node --check index.js && node --check client.js    # syntax
node fold-test.mjs                                  # fold semantics (21 assertions)
node client-smoke.cjs                               # render smoke through a mocked fetch
node review-check.cjs                               # regression checks for past findings
```

(The test scripts live in a sibling dev folder; copy them in or adapt paths when running from a fresh clone.)

## Pull requests

1. Keep the security claims in [SECURITY.md](SECURITY.md) true: no network calls, no new data exposure, no unbounded state. If your change touches one of those rows, update the doc in the same PR.
2. Update both README languages if you change user-visible behavior.
3. One logical change per PR; include before/after behavior in the description.
