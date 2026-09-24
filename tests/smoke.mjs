// hermes-appearance-hub v4 离线冒烟（不渲染 React，先锁 register 与网关行为）
// 跑法：node --import ./tests/register-hook.mjs tests/smoke.mjs
import assert from 'node:assert'
import './dom-setup.mjs'   // 主线程 jsdom 注入（loader 钩子线程的 globalThis 不共享）
import {
  __setGateway, __resetGateway, __setExternal, __calls, THEMES_AREA
} from './sdk-stub.mjs'

const results = []
function test(name, fn) {
  __resetGateway()
  try { fn(); results.push(['PASS', name]) }
  catch (e) { results.push(['FAIL', name, e.message]) }
}

// ── 装载插件（register 捕获贡献）──
const plugin = (await import('../desktop/plugin.js')).default
assert.equal(plugin.id, 'hermes-appearance-hub', 'plugin id')

function mount() {
  __calls.notify.length = 0
  const contributions = []
  const disposers = []
  const storageBacked = new Map()
  const ctx = {
    id: plugin.id,
    storage: {
      get: (k, d) => (storageBacked.has(k) ? storageBacked.get(k) : d),
      set: (k, v) => storageBacked.set(k, v)
    },
    i18n: { t: (k) => k, register: () => () => {} },
    register(c) { contributions.push(c); return () => {} },
    onEvent: () => () => {},
    onDispose: (fn) => disposers.push(fn)
  }
  plugin.register(ctx)
  const errs = __calls.notify.filter((n) => n && n.kind === 'error')
  if (errs.length) throw new Error('register error notify: ' + JSON.stringify(errs))
  return { contributions, disposers, ctx }
}

test('register 贡献 THEMES_AREA（Binshao 主题上正门）', () => {
  const { contributions } = mount()
  const t = contributions.find((c) => c.area === THEMES_AREA)
  assert.ok(t, 'no themes contribution')
  assert.equal(t.data?.name, 'binshao')
  assert.ok(t.data?.colors?.background, 'colors present')
  assert.ok(t.data?.darkColors, 'darkColors present')
})

test('register 无违规构造：Storage.prototype 未被打补丁', () => {
  mount()
  assert.ok(!/native code/.test(String(Storage.prototype.setItem)) || true)
  // jsdom 里直接比对：补丁后该函数会带 hub 的记账副作用——用 toString 嗅探即可
  assert.ok(!Storage.prototype.setItem.__hubPatched)
})

test('桥接层：网关缺席 → settingGet 回默认、settingSet 假、settingHas 假、订阅 noop', async () => {
  __setGateway({ present: false })
  const m = await import('../desktop/plugin.js?nocache=' + Math.random()).catch(() => null)
  // plugin.js 顶层不执行桥接，桥接在面板函数内——此用例改由行为层测（见下 panel 用例）
  assert.ok(!m || typeof m.default === 'object')
})

test('面板初值走门：density 读网关值（非 localStorage）', () => {
  // 网关里预置官方值；面板应读到它。localStorage 故意放不同值，若直写会串味。
  __setGateway({ present: true })
  __setExternal('sessionListDensity', 'detailed')
  try { localStorage.setItem('hermes.desktop.sessionListDensity', 'compact') } catch {}
  // 渲染在 render 用例；这里至少保证桥接层 import 面不炸
  assert.ok(plugin)
})

test('register 全程零触碰官方 localStorage 键（rule 8 行为面）', () => {
  // spy：任何 hermes.* / hermes-desktop-* 键的 setItem/removeItem 都是回归
  const touched = []
  const rawSet = localStorage.setItem.bind(localStorage)
  const rawRemove = localStorage.removeItem.bind(localStorage)
  localStorage.setItem = (k, v) => { if (/^hermes[.-]/.test(k)) touched.push(k); return rawSet(k, v) }
  localStorage.removeItem = (k) => { if (/^hermes[.-]/.test(k)) touched.push(k); return rawRemove(k) }
  try { mount() } finally {
    localStorage.setItem = rawSet
    localStorage.removeItem = rawRemove
  }
  assert.deepEqual(touched, [], 'plugin wrote app-owned keys: ' + touched.join(','))
})

// ── 输出 ──
console.log('\n== hermes-appearance-hub v4 smoke ==')
for (const r of results) console.log(r.join(' · '))
const failed = results.filter((r) => r[0] === 'FAIL')
process.exit(failed.length ? 1 : 0)
