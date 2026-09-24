// @hermes/plugin-sdk 测试桩：按真实 SDK 导出面打桩（见 skill「面板离线验证」节）。
// 关键行为：
//  - host.settings：可切换的「网关」模拟——默认支持六键白名单，测试可注入扩展名单
//    或整体缺席（undefined），驱动 settingGet/Set/Has/Subscribe 的全部分支；
//  - useTheme：返回可控的 mode/themeName/availableThemes + setMode/setTheme 记录器；
//  - icons：Proxy（任意 icons.Xxx → 占位组件），免维护图标清单；
//  - SegmentedControl 等控件桩：把关键 props 投影成 data-* 属性供 DOM 断言。
import { jsx, jsxs } from 'react/jsx-runtime'

export const __events = { set: new Set() }
export const __calls = { notify: [], storage: {} }

// ── 网关模拟（v4 桥接层的对侧）──
export const DEFAULT_ALLOWLIST = [
  'sessionListDensity', 'tabStripDefault', 'backdrop.v1',
  'intro-splash.v1', 'reasoning.collapsedByDefault', 'composerPopout.gesturesEnabled'
]

const state = {
  allowlist: new Set(DEFAULT_ALLOWLIST),
  present: true,
  values: {},
  listeners: new Map()
}

export function __setGateway({ present = true, allowlist } = {}) {
  state.present = present
  state.allowlist = new Set(allowlist ?? DEFAULT_ALLOWLIST)
}
export function __resetGateway() {
  __setGateway({})
  state.values = {}
  state.listeners.clear()
}
export function __setExternal(key, value) {  // 模拟官方设置页写入 → 订阅者收通知
  state.values[key] = value
  for (const cb of state.listeners.get(key) ?? []) cb(value)
}

const host = {
  notify(o) { __calls.notify.push(o) },
  get settings() {
    if (!state.present) return undefined
    return {
      get(key) {
        if (!state.allowlist.has(key)) throw new Error(`Unsupported desktop setting: ${key}`)
        return state.values[key]
      },
      set(key, value) {
        if (!state.allowlist.has(key)) throw new Error(`Unsupported desktop setting: ${key}`)
        state.values[key] = value
      },
      subscribe(key, cb) {
        if (!state.allowlist.has(key)) throw new Error(`Unsupported desktop setting: ${key}`)
        if (!state.listeners.has(key)) state.listeners.set(key, new Set())
        state.listeners.get(key).add(cb)
        cb(state.values[key])
        return () => state.listeners.get(key)?.delete(cb)
      }
    }
  }
}

// ── UI 桩 ──
const el = (tag) => (props = {}) =>
  jsx(tag, { 'data-comp': tag, ...props })

export const Button = el('button')
export const Input = el('input')
export const Textarea = el('textarea')
export const Switch = el('switch')
export const DropdownMenu = el('dropdown-menu')
export const DropdownMenuTrigger = el('dropdown-menu-trigger')
export const DropdownMenuContent = el('dropdown-menu-content')
export const DropdownMenuItem = el('dropdown-menu-item')
export const SegmentedControl = ({ options = [], value, onChange, disabled, ...rest }) =>
  jsx('div', {
    'data-comp': 'segmented',
    'data-value': String(value ?? ''),
    'data-disabled': disabled ? '1' : '0',
    'data-options': options.map((o) => o.id).join(','),
    __change: (id) => onChange?.(id),
    ...rest
  })

// ── 状态桩 ──
let themeOverride = { mode: 'system', themeName: 'nous', availableThemes: [{ name: 'nous', label: 'Nous' }, { name: 'binshao', label: 'Binshao' }] }
export function __setThemeState(o) { themeOverride = { ...themeOverride, ...o } }
export const useTheme = () => ({
  ...themeOverride,
  setMode: (m) => { themeOverride = { ...themeOverride, mode: m }; __calls.setMode = m },
  setTheme: (n) => { themeOverride = { ...themeOverride, themeName: n }; __calls.setTheme = n }
})
export const useI18n = () => ({ locale: 'en', setLocale: () => {}, isSavingLocale: false })
export const usePluginI18n = () => (key) => key
export const useValue = (atom) => atom?.get?.()
export const icons = new Proxy({}, { get: (_t, name) => el(String(name)) })
export const haptic = () => {}
export const cn = (...xs) => xs.filter(Boolean).join(' ')

export { host, jsx, jsxs }
export const THEMES_AREA = 'themes'
export const COMPOSER_AREAS = { actions: 'composer.actions', underside: 'composer.underside' }
export const STATUSBAR_AREAS = { left: 'statusBar.left', right: 'statusBar.right' }
