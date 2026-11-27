// Host-side wallet balance outcome mapping. `readBalance` lives inside apply's
// closure, so it is extracted from source and given a stub `ctx` + closure
// constants — the same technique review-check.cjs uses for client helpers.
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8')
const start = src.indexOf('  async function readBalance() {')
const end = src.indexOf('/**\n   * Build a summary from the query', start)
if (start < 0 || end < 0) {
  console.log('FAIL could not locate readBalance in index.js')
  process.exit(1)
}
const fnText = src.slice(start, end).trim()
const body = fnText.slice(0, fnText.lastIndexOf('  }') + 3)

const BALANCE_TTL_MS = 60_000
const VERSION = '1.1.0'
let balanceCache
const ctx = { logger: { warn() {} }, get: () => globalThis.__account }
const readBalance = eval(`(${body})`)

const assert = (cond, name) => {
  if (cond) console.log('ok ' + name)
  else { console.log('FAIL ' + name); process.exitCode = 1 }
}

globalThis.__account = undefined
assert((await readBalance()).status === 'unavailable', 'missing account seam -> unavailable')

globalThis.__account = { getBalance: async () => null }
balanceCache = undefined
assert((await readBalance()).status === 'unavailable', 'signed out (null) -> unavailable')

globalThis.__account = { getBalance: async () => ({ status: 'failed' }) }
balanceCache = undefined
assert((await readBalance()).status === 'failed', 'failed query -> failed, never a zero balance')

globalThis.__account = {
  getBalance: async () => ({
    status: 'ready',
    value: [{ currency: 'CNY', balance: '128.45' }],
    bonusWallets: [{ currency: 'CNY', balance: '5' }],
  }),
}
balanceCache = undefined
const ready = await readBalance()
assert(ready.status === 'ready', 'ready outcome passes through')
assert(ready.wallets[0].balance === '128.45', 'balance string kept verbatim (no float rounding)')
assert(ready.bonusWallets.length === 1, 'bonus wallets preserved')
assert(ready.currency === 'CNY', 'currency surfaced')

globalThis.__account = { getBalance: async () => { throw new Error('boom') } }
balanceCache = undefined
assert((await readBalance()).status === 'failed', 'throwing seam -> failed, never propagates')

let calls = 0
globalThis.__account = {
  getBalance: async () => {
    calls += 1
    return { status: 'ready', value: [{ currency: 'CNY', balance: '1' }], bonusWallets: [] }
  },
}
balanceCache = undefined
await readBalance(); await readBalance(); await readBalance()
assert(calls === 1, `balance is cached within its TTL (platform calls=${calls})`)

console.log(process.exitCode ? 'BALANCE FAILED' : 'BALANCE ALL PASS')
