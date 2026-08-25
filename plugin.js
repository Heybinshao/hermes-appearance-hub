/**
 * Hermes Appearance Hub — 外观整合面板：纸纹 + 字体 + 原生界面缩放。
 *
 * 整合（不修改原插件）：
 *   - hermes-paper-texture  纸纹：宣纸质感噪点层（明暗自动适配）
 *   - hermes-font-wenkai    字体：界面字体 = 霞鹜文楷
 *
 * 用法：
 *   - 状态栏「外观」按钮 → 标准状态栏弹窗（DropdownMenu，与核心工具一致），
 *     两个开关 + 原生界面缩放档位即时生效。
 *   - 「界面缩放」直接驱动 Hermes 原生缩放（window.hermesDesktop.zoom.setPercent）
 *     —— 与 Settings → Appearance → 界面缩放、View 菜单同一套机制，互相实时同步。
 *   - 状态栏右键菜单可勾选显示/隐藏本入口（toggleLabel）。
 *   - 原两个插件建议在 Settings → Plugins 中关闭，避免纸纹叠加。
 *
 * 机制：注入/移除均用本插件专属 DOM id，与两个原插件互不干扰；
 *       插件被禁用/重载时 onDispose 清理全部注入，不留残留。
 *       状态栏入口用 declarative data 通道（variant:'menu' + menuContent），
 *       不自定义 Popover —— 与核心状态栏工具同一条渲染路径，最稳。
 */
import { haptic, host, icons, Switch, SegmentedControl, Input, Textarea, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@hermes/plugin-sdk'
import { useState, useEffect } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

const ID = 'hermes-appearance-hub'
const PAPER_KEY = 'paper.enabled'
const FONT_KEY = 'font.enabled'
const WELCOME_KEY = 'welcome-v1'

// 界面缩放档位：直接复用 Hermes 原生预设（90/100/110/125/150/175 均为原生支持值）。
// 与官方 Settings UI_SCALE_PRESETS 对齐（appearance-settings.tsx）——90% 是官方
// 「实际大小」基准（Cmd+0 落点，electron/zoom.ts DEFAULT_ZOOM_LEVEL），缺了它
// Cmd+0 后没有任何按钮高亮。
// id 用字符串（SegmentedControl<T extends string> 要求），percent 用于调原生接口。
const ZOOM_OPTIONS = [
  { id: '90', label: '90%', percent: 90 },
  { id: '100', label: '100%', percent: 100 },
  { id: '110', label: '110%', percent: 110 },
  { id: '125', label: '125%', percent: 125 },
  { id: '150', label: '150%', percent: 150 },
  { id: '175', label: '175%', percent: 175 }
]

// 与 hermes-paper-texture 同机制，独立 DOM id 避免与原插件抢元素
const PAPER_LAYER_ID = ID + '-paper'
// 与 hermes-font-wenkai 同机制，独立 style id
const FONT_STYLE_ID = ID + '-font-style'

// ── 开场标识（intro splash）─────────────────────────────────────────
// 原生机制：src/store/intro-splash.ts 用 localStorage 键 hermes.desktop.intro-splash.v1
// （storedBoolean 只在模块加载读一次，无 storage 监听 → 写键仅重启后生效，
//   即时生效全靠本插件的 CSS 注入层）。渲染钩子：[data-slot="aui_intro"]，
//   字标 = p.fit-text（双 span 测量结构），提示语 = p.fit-text 相邻的 p。
const INTRO_MODE_KEY = 'intro.mode'            // 'native' | 'custom' | 'off'
const INTRO_HEADLINE_KEY = 'intro.headline'    // 自定义字标
const INTRO_TAGLINE_KEY = 'intro.tagline'      // 自定义提示语（空 = 跟随原生随机文案）
const INTRO_STYLE_ID = ID + '-intro-style'
const INTRO_NATIVE_KEY = 'hermes.desktop.intro-splash.v1'  // 只写不改名，与原生设置页保持一致

// ── 纸纹试验配方（暗色治泛白 / 浅色治发灰）──────────────────────────
// 暗色 screen 泛白根因：fractalNoise 均值~50% 灰 + screen（只提亮）→ 整屏抬向灰白。
//   思路：噪点分布「贴地」——大部分像素近黑（screen 下不影响底色），少数颗粒微亮。
// 浅色 multiply 发灰同理反向：噪点应「贴顶」——大部分近白（multiply 不影响底色），少数纤维压暗。
// 档位从左到右由轻到重；默认「极轻」。
const DARK_RECIPES = {
  light: { label: '极轻', baseFreq: 0.9, octaves: 3, gain: 1.3, offset: -0.15, blur: 0.6, opacity: 0.12 },
  subtle: { label: '微调', baseFreq: 0.9, octaves: 3, gain: 1.3, offset: -0.35, blur: 0.6, opacity: 0.2 },
  classic: { label: '经典', baseFreq: 0.9, octaves: 3, gain: 1.3, offset: -0.15, blur: 0.6, opacity: 0.2 },
  ground: { label: '贴地', baseFreq: 0.9, octaves: 3, gain: 2.2, offset: -0.55, blur: 0.6, opacity: 0.2 }
}
const LIGHT_RECIPES = {
  light: { label: '极轻', baseFreq: 0.72, octaves: 4, gain: 1.3, offset: 0.3, blur: null, opacity: 0.18 },
  subtle: { label: '微调', baseFreq: 0.72, octaves: 4, gain: 1.15, offset: 0.25, blur: null, opacity: 0.28 },
  classic: { label: '经典', baseFreq: 0.72, octaves: 4, gain: null, offset: null, blur: null, opacity: 0.3 },
  top: { label: '贴顶', baseFreq: 0.72, octaves: 4, gain: 1.2, offset: 0.05, blur: null, opacity: 0.35 }
}
const DARK_RECIPE_KEY = 'paper.darkRecipe'
const LIGHT_RECIPE_KEY = 'paper.lightRecipe'

// ── 移植：密度 / 标签栏 / 聊天背景 / 窗口透明 ────────────────────────
const DENSITY_KEY = 'hermes.desktop.sessionListDensity'
const DENSITY_OPTIONS = [
  { id: 'compact', label: '紧凑' },
  { id: 'comfortable', label: '舒适' },
  { id: 'detailed', label: '详细' }
]
const TABSTRIP_KEY = 'hermes.desktop.tabStripDefault'
const TABSTRIP_OPTIONS = [
  { id: 'auto', label: '自动' },
  { id: 'always', label: '始终' },
  { id: 'never', label: '从不' }
]
const BACKDROP_KEY = 'hermes.desktop.backdrop.v1'
const TRANSLUCENCY_KEY = 'hermes.desktop.translucency.v2'
const GLASS_MATERIALS = ['under-window', 'popover', 'titlebar', 'header']
const GLASS_SCOPES = ['window', 'sidebar']
const FROST_LABELS = { 'under-window': '深邃', popover: '柔和', titlebar: '明亮', header: '透亮' }
const SCOPE_LABELS = { window: '整个窗口', sidebar: '仅侧边栏' }
const SLIDER_STYLE = {
  height: '4px',
  WebkitAppearance: 'none',
  background: 'var(--ui-stroke-tertiary)',
  borderRadius: '9999px',
  accentColor: 'var(--dt-primary)'
}

const INTRO_OPTIONS = [
  { id: 'native', label: '原生文案' },
  { id: 'custom', label: '自定义' }
]

let ctxRef = null
let paperObserver = null

// ── 纸纹（照搬 hermes-paper-texture 的配方）────────────────────────
function makeTexture(baseFreq, octaves, gain, offset, blur) {
  const colorMatrix =
    gain != null
      ? "<feColorMatrix type='matrix' values='" + gain + ' 0 0 0 ' + offset +
        ' 0 ' + gain + ' 0 0 ' + offset +
        ' 0 0 ' + gain + ' 0 ' + offset +
        " 0 0 0 1 0'/>"
      : "<feColorMatrix type='saturate' values='0'/>"
  const blurFilter =
    blur != null ? "<feGaussianBlur stdDeviation='" + blur + "'/>" : ''
  const svg =
    "<svg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'>" +
    "<filter id='n'>" +
    "<feTurbulence type='fractalNoise' baseFrequency='" + baseFreq +
    "' numOctaves='" + octaves + "' stitchTiles='stitch'/>" +
    colorMatrix + blurFilter +
    '</filter>' +
    "<rect width='100%' height='100%' filter='url(#n)'/>" +
    '</svg>'
  return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")'
}

function applyPaperMode() {
  const layer = document.getElementById(PAPER_LAYER_ID)
  if (!layer) return
  const html = document.documentElement
  const dark =
    html.classList.contains('dark') || html.dataset.hermesMode === 'dark'

  if (dark) {
    const key = ctxRef ? ctxRef.storage.get(DARK_RECIPE_KEY, 'light') : 'light'
    const r = DARK_RECIPES[key] || DARK_RECIPES.light
    layer.style.backgroundImage = makeTexture(r.baseFreq, r.octaves, r.gain, r.offset, r.blur)
    layer.style.opacity = String(r.opacity)
    layer.style.mixBlendMode = 'screen'
  } else {
    const key = ctxRef ? ctxRef.storage.get(LIGHT_RECIPE_KEY, 'light') : 'light'
    const r = LIGHT_RECIPES[key] || LIGHT_RECIPES.light
    layer.style.backgroundImage = makeTexture(r.baseFreq, r.octaves, r.gain, r.offset, r.blur)
    layer.style.opacity = String(r.opacity)
    layer.style.mixBlendMode = 'multiply'
  }
}

function injectPaper() {
  // 清理 nous-theme-kit 时代的历史残留（原纸纹插件同样处理）
  const oldLayer = document.getElementById('nous-paper-texture')
  if (oldLayer) oldLayer.remove()
  const oldStyle = document.getElementById('nous-paper-style')
  if (oldStyle) oldStyle.remove()

  let layer = document.getElementById(PAPER_LAYER_ID)
  if (!layer) {
    layer = document.createElement('div')
    layer.id = PAPER_LAYER_ID
    document.body.prepend(layer)
  }
  layer.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:2147483647',
    'pointer-events:none',
    'background-size:205px 205px'
  ].join(';')

  applyPaperMode()

  if (!paperObserver) {
    paperObserver = new MutationObserver(applyPaperMode)
    paperObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-hermes-mode']
    })
  }
}

function removePaper() {
  const layer = document.getElementById(PAPER_LAYER_ID)
  if (layer) layer.remove()
  if (paperObserver) {
    paperObserver.disconnect()
    paperObserver = null
  }
}

// ── 字体（照搬 hermes-font-wenkai 的规则）────────────────────────
const FONT_SANS =
  '"LXGW WenKai", -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", emoji'
const FONT_MONO =
  '"LXGW WenKai Mono", Menlo, Monaco, "SF Mono", monospace, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", emoji'

function applyFont() {
  let style = document.getElementById(FONT_STYLE_ID)
  if (!style) {
    style = document.createElement('style')
    style.id = FONT_STYLE_ID
    document.head.appendChild(style)
  }
  style.textContent =
    ':root{--dt-font-sans:' + FONT_SANS + ' !important;' +
    '--dt-font-mono:' + FONT_MONO + ' !important}' +
    // tooltip 的 chip 硬编码了 [font-family:Arial,sans-serif]（tooltip.tsx），
    // 不走变量继承，需用 data-slot 定位覆盖，否则提示文字永远系统字体。
    '[data-slot="tooltip-content"] > span{font-family:var(--dt-font-sans) !important}'
}

function removeFont() {
  const style = document.getElementById(FONT_STYLE_ID)
  if (style) style.remove()
}

// ── 开场标识：DOM 文本替换层（即时生效）+ 原生键落盘（重启后一致）──────────
// 原生 Intro 结构：[data-slot="aui_intro"] 内
//   字标 = p.fit-text（双 span 测量结构，叶子 span 持文字）
//   提示语 = 容器内非 fit-text 的那个 p
// 直接替换叶子文本：fit-text 的自适应字号按真实文本测量，替换后缩放依旧正确。
// ⚠️ 勿回退 CSS 伪元素方案：font-size:0 隐藏原生文字后，::before 继承 0 号字，
//    自定义文字永远不可见（2026-08-23 实测踩坑）。
// MutationObserver 兜两种情况：弹窗打开后才新渲染的 intro、React 重渲染写回的原生文案。
const INTRO_SLOT = '[data-slot="aui_intro"]'
let introObserver = null
const introOriginalTexts = new Map()   // 叶子元素 → 原始文本（切回原生/禁用时恢复）
let introNativeLastWritten = null      // 本插件最后写入的原生键值（区分自己写 / 外部改）
let introUninstallHook = null          // setItem 包装的还原函数
let introModeSubscribers = new Set()   // 面板订阅者（外部改动时刷新弹窗 UI）

function writeIntroNative(value) {
  try {
    localStorage.setItem(INTRO_NATIVE_KEY, value)
    introNativeLastWritten = value
  } catch {
    // storage 不可用时静默跳过，注入层不受影响
  }
}

// ── 与原生设置页双向同步 ──────────────────────────────────────────
// 设置页开关 = 真实 DOM 按钮：#setting-field-appearance.intro-splash 内的
// button[role=switch]（Radix Switch，aria-label=「开场标识」）。
// 读状态 → aria-checked；写状态 → 程序化 click（走原生 onCheckedChange，
// atom/滑块/落盘全部真实更新，与手点等价）。
function findIntroSettingSwitch() {
  const field =
    document.getElementById('setting-field-appearance.intro-splash') ||
    Array.from(document.querySelectorAll('[id^="setting-field-"]')).find((el) =>
      el.querySelector('button[role="switch"][aria-label="开场标识"]')
    )
  return field ? field.querySelector('button[role="switch"]') : null
}

function readIntroSettingState() {
  const btn = findIntroSettingSwitch()
  return btn ? btn.getAttribute('aria-checked') === 'true' : null
}

// hub 档位变化时，若设置页开关可见且状态不一致，程序化点击对齐
function syncIntroSettingSwitch(mode) {
  const btn = findIntroSettingSwitch()
  if (!btn) return
  const wantOn = mode !== 'off'
  if ((btn.getAttribute('aria-checked') === 'true') !== wantOn) {
    btn.click()
  }
}

function handleIntroNativeWrite(key, value) {
  if (key !== INTRO_NATIVE_KEY) return
  if (value === introNativeLastWritten) {
    // 自己刚写的：记账已同步，无需反应
    return
  }
  const current = ctxRef ? ctxRef.storage.get(INTRO_MODE_KEY, 'native') : 'native'
  let next = null
  if (value === 'false' && current !== 'off') next = 'off'
  else if (value === 'true' && current === 'off') next = 'native'
  else {
    introNativeLastWritten = value   // 外部写入但语义无变化，认领即可
    return
  }
  introNativeLastWritten = value
  if (ctxRef) ctxRef.storage.set(INTRO_MODE_KEY, next)
  applyIntroMode(next)
  introModeSubscribers.forEach((cb) => cb(next))
}

function installIntroStorageHook() {
  if (introUninstallHook) return
  const rawSetItem = Storage.prototype.setItem
  Storage.prototype.setItem = function (key, value) {
    rawSetItem.call(this, key, value)
    try { handleIntroNativeWrite(String(key), String(value)) } catch {}
  }
  introUninstallHook = () => { Storage.prototype.setItem = rawSetItem }
}

function unsubscribeIntroMode(cb) {
  introModeSubscribers.delete(cb)
}

// 面板实例订阅（弹窗开时加入）：外部在设置页切开关时，浮窗高亮跟着走
function subscribeIntroMode(cb) {
  introModeSubscribers.add(cb)
  return unsubscribeIntroMode
}

function introLeafSpans(root) {
  // 字标叶子 span：没有元素子节点的 span（外层 span 只包内层 span，不算叶子）
  return Array.from(root.querySelectorAll('p.fit-text span')).filter((s) => !s.querySelector('*'))
}

function introWrite(headline, tagline) {
  const root = document.querySelector(INTRO_SLOT)
  if (!root || (!headline && !tagline)) return
  if (headline) {
    for (const el of introLeafSpans(root)) {
      if (!introOriginalTexts.has(el)) introOriginalTexts.set(el, el.textContent)
      if (el.textContent !== headline) el.textContent = headline
    }
  }
  if (tagline) {
    const p = root.querySelector('p:not(.fit-text)')
    if (p) {
      if (!introOriginalTexts.has(p)) introOriginalTexts.set(p, p.textContent)
      if (p.textContent !== tagline) p.textContent = tagline
    }
  }
}

function introRestore() {
  for (const [el, text] of introOriginalTexts) {
    if (el.isConnected && el.textContent !== text) el.textContent = text
  }
  introOriginalTexts.clear()
}

function startIntroObserver() {
  if (introObserver) return
  let scheduled = false
  introObserver = new MutationObserver(() => {
    if (scheduled) return
    scheduled = true
    queueMicrotask(() => {
      scheduled = false
      if (!ctxRef || ctxRef.storage.get(INTRO_MODE_KEY, 'native') !== 'custom') return
      introWrite(
        String(ctxRef.storage.get(INTRO_HEADLINE_KEY, '')).trim(),
        String(ctxRef.storage.get(INTRO_TAGLINE_KEY, '')).trim()
      )
    })
  })
  introObserver.observe(document.body, { childList: true, subtree: true, characterData: true })
}

function stopIntroObserver() {
  if (introObserver) {
    introObserver.disconnect()
    introObserver = null
  }
}

function applyIntroMode(mode) {
  let style = document.getElementById(INTRO_STYLE_ID)
  if (mode === 'off') {
    if (!style) {
      style = document.createElement('style')
      style.id = INTRO_STYLE_ID
      document.head.appendChild(style)
    }
    style.textContent = INTRO_SLOT + '{display:none !important}'
  } else if (style) {
    style.remove()
  }

  if (mode === 'custom') {
    const headline = ctxRef ? String(ctxRef.storage.get(INTRO_HEADLINE_KEY, '')).trim() : ''
    const tagline = ctxRef ? String(ctxRef.storage.get(INTRO_TAGLINE_KEY, '')).trim() : ''
    introWrite(headline, tagline)   // 当前已在渲染的 intro 立即替换
    startIntroObserver()            // 之后新渲染 / 被写回的交给 observer
  } else {
    stopIntroObserver()
    introRestore()
  }

  // 原生键落盘：原生/自定义 = 开；关闭 = 关。与设置页外观开关语义一一对应。
  writeIntroNative(mode === 'off' ? 'false' : 'true')
  // 设置页开关若正开着，程序化点击对齐（走原生 onCheckedChange，atom+滑块真实更新）
  syncIntroSettingSwitch(mode)
}

function resetIntroOnDispose() {
  if (introUninstallHook) {
    introUninstallHook()
    introUninstallHook = null
  }
  introModeSubscribers.clear()
  stopIntroObserver()
  introRestore()
  const style = document.getElementById(INTRO_STYLE_ID)
  if (style) style.remove()
  // 禁用插件后恢复原生显示
  try {
    localStorage.setItem(INTRO_NATIVE_KEY, 'true')
  } catch {}
}

// ── 界面缩放（直接驱动 Hermes 原生缩放，不另起 DOM 层）──────────────
// 与 Settings → Appearance → 界面缩放、View 菜单同一套机制（main process 拥有并持久化）。
// 通过 window.hermesDesktop.zoom 读写，onChanged 让原生侧改动（View 菜单 / Cmd±）实时回灌 UI。
function getNativeZoom() {
  const z = window.hermesDesktop && window.hermesDesktop.zoom
  if (!z) return null
  return z.get().then((r) => r && typeof r.percent === 'number' ? r.percent : null)
    .catch(() => null)
}

function setNativeZoom(percent) {
  const z = window.hermesDesktop && window.hermesDesktop.zoom
  if (!z) return
  z.setPercent(percent)
}

// ── 模块级常驻监听：缩放变化无论如何都回灌 ──────────────────────────
// 关键修复：原生 onChanged 是 per-renderer 的 ipcRenderer.on，主进程每次缩放
// 都会广播给「当前挂了监听的渲染进程」。若只在面板挂载时注册，则弹窗关闭期间
// （尤其在 Settings 里改缩放时）收不到广播 → 反向同步断。故在插件加载时注册常驻
// 监听，缓存到 liveZoom，面板打开时再 seed + 订阅模块级更新。
let liveZoom = null                         // 当前原生缩放 percent（模块级单一真相）
let zoomSubscribers = new Set()             // 面板实例订阅者（弹窗开时加入）
let zoomUnsubscribeNative = null            // 原生常驻监听的退订函数

function handleNativeZoomChange(percent) {
  if (typeof percent !== 'number') return
  liveZoom = percent
  zoomSubscribers.forEach((cb) => cb(percent))
}

// 插件加载时调用：挂原生常驻监听（与弹窗开关无关）
function startNativeZoomWatch() {
  if (zoomUnsubscribeNative) return
  const z = window.hermesDesktop && window.hermesDesktop.zoom
  if (!z) return
  // 立即拉一次当前值，保证 liveZoom 有初始真相
  if (typeof z.get === 'function') {
    z.get().then((r) => { if (r && typeof r.percent === 'number') liveZoom = r.percent }).catch(() => {})
  }
  if (typeof z.onChanged === 'function') {
    zoomUnsubscribeNative = z.onChanged((payload) => {
      if (payload && typeof payload.percent === 'number') handleNativeZoomChange(payload.percent)
    })
  }
}

// 面板实例订阅模块级变化（弹窗开时调用，关时退订）
function subscribeNativeZoom(cb) {
  zoomSubscribers.add(cb)
  // 订阅即刻同步一次当前缓存值，避免弹窗打开时与 liveZoom 脱节
  if (liveZoom != null) cb(liveZoom)
  return () => { zoomSubscribers.delete(cb) }
}

// ── 主题模式（明亮/暗色/跟随系统）─────────────────────────────────
// 官方机制（themes/context.tsx）：mode 存 per-profile localStorage——
//   default profile 写全局键 hermes-desktop-mode-v1；命名 profile 写
//   hermes-desktop-profile-modes-v1 record。官方监听 storage 事件
// （APPEARANCE_KEYS），setItem 即全窗口实时生效——与 zoom 同款官方管道。
const MODE_GLOBAL_KEY = 'hermes-desktop-mode-v1'
const MODE_RECORD_KEY = 'hermes-desktop-profile-modes-v1'
const THEME_MODES = [
  { id: 'light', label: '明亮' },
  { id: 'dark', label: '暗色' },
  { id: 'system', label: '系统' }
]

function readThemeMode() {
  try {
    const profile = localStorage.getItem('hermes-active-profile') || 'default'
    if (profile !== 'default') {
      const rec = JSON.parse(localStorage.getItem(MODE_RECORD_KEY) || '{}')
      if (rec[profile]) return rec[profile]
    }
    return localStorage.getItem(MODE_GLOBAL_KEY) || 'system'
  } catch {
    return 'system'
  }
}

function writeThemeMode(mode) {
  try {
    const profile = localStorage.getItem('hermes-active-profile') || 'default'
    if (profile === 'default') {
      // 同键重写也会触发原生 storage 监听（同窗口 setItem 不自动派发，手动补发）
      localStorage.setItem(MODE_GLOBAL_KEY, mode)
      window.dispatchEvent(new StorageEvent('storage', { key: MODE_GLOBAL_KEY }))
    } else {
      const rec = JSON.parse(localStorage.getItem(MODE_RECORD_KEY) || '{}')
      rec[profile] = mode
      localStorage.setItem(MODE_RECORD_KEY, JSON.stringify(rec))
      window.dispatchEvent(new StorageEvent('storage', { key: MODE_RECORD_KEY }))
    }
  } catch {}
}

function resolvedDark() {
  return document.documentElement.classList.contains('dark') ||
    document.documentElement.dataset.hermesMode === 'dark'
}

// ── 移植项读写 ────────────────────────────────────────────────────
function readSimpleKey(key, fallback, valid) {
  try {
    const v = localStorage.getItem(key)
    return v && valid.includes(v) ? v : fallback
  } catch { return fallback }
}

function writeSimpleKey(key, value) {
  try {
    localStorage.setItem(key, value)
    window.dispatchEvent(new StorageEvent('storage', { key }))
  } catch {}
}

// ── 官方 store 实时通道：动态 import 官方 chunk，直接调 nanostores atom ──
let officialStores = null

async function loadOfficialStores() {
  officialStores ??= {}
  let foundBoolAtoms = null
  try {
    // 1) 从 DOM script 标签拿主 bundle URL（assets 同目录）
    const scriptEl = document.querySelector('script[src*="index-"]')
    if (!scriptEl) return officialStores
    const mainUrl = new URL(scriptEl.src, location.href)
    const base = new URL('./', mainUrl)
    // 2) fetch 主 bundle 抠出 chunk 文件名
    const mainSrc = await (await fetch(mainUrl)).text()
    // density chunk
    const m1 = mainSrc.match(/([\w-]*session-list-density-[A-Za-z0-9_-]+\.js)/)
    if (m1 && !officialStores.density) {
      try {
        const mod = await import(/* @vite-ignore */ new URL('./' + m1[1], base).href)
        for (const k of Object.keys(mod)) {
          const v = mod[k]
          if (!v || typeof v.get !== 'function' || typeof v.set !== 'function') continue
          const cur = v.get()
          if (cur === 'compact' || cur === 'comfortable' || cur === 'detailed') {
            if (!officialStores.density) officialStores.density = v
            continue
          }
          // 收集 boolean atom（backdrop / intro-splash / 命令面板开关等）
          if (typeof cur === 'boolean') {
            if (!foundBoolAtoms) foundBoolAtoms = []
            foundBoolAtoms.push(v)
          }
        }
        // 统一键验证：找出写 BACKDROP_KEY 的 boolean atom（即 $backdrop），
        // 探测后全部还原。与密度同款机制。
        // 探测期间临时隐藏开场标识 DOM 防止 intro-splash atom 被翻转时的视觉闪烁
        const introEl = document.querySelector('[data-slot="aui_intro"]')
        const prevVis = introEl ? introEl.style.visibility : ''
        if (introEl) introEl.style.visibility = 'hidden'
        if (foundBoolAtoms && foundBoolAtoms.length >= 2) {
          const snapshot = foundBoolAtoms.map(a => a.get())
          const beforeBd = localStorage.getItem(BACKDROP_KEY)
          let bdIdx = -1
          for (let bi = 0; bi < foundBoolAtoms.length; bi++) {
            foundBoolAtoms[bi].set(!snapshot[bi])
            if (localStorage.getItem(BACKDROP_KEY) !== beforeBd) { bdIdx = bi }
            foundBoolAtoms[bi].set(snapshot[bi])
            if (bdIdx >= 0) break
          }
          if (bdIdx >= 0) {
            officialStores.backdrop = foundBoolAtoms[bdIdx]
            console.info('[appearance-hub] ✅ backdrop atom 已识别')
          }
        }
        // 恢复开场标识可见性（探测时临时隐藏防闪烁）
        if (introEl) introEl.style.visibility = prevVis
      } catch {}
    }
    // store chunk（tabStrip）
    const chunks = [...mainSrc.matchAll(/([\w-]*store-[A-Za-z0-9_-]+\.js)/g)].map(m2 => m2[1])
    for (const name of chunks) {
      if (officialStores.tabStrip) break
      try {
        const mod = await import(/* @vite-ignore */ new URL('./' + name, base).href)
        for (const k of Object.keys(mod)) {
          const v = mod[k]
          if (!v || typeof v.get !== 'function' || typeof v.set !== 'function') continue
          const cur = v.get()
          if (cur === 'auto' || cur === 'always' || cur === 'never') { officialStores.tabStrip = v; break }
        }
      } catch {}
    }
  } catch {}
  return officialStores
}

function readBackdrop() {
  try { return localStorage.getItem(BACKDROP_KEY) === 'true' } catch { return false }
}

function writeBackdrop(on) {
  try {
    localStorage.setItem(BACKDROP_KEY, String(on))
    window.dispatchEvent(new StorageEvent('storage', { key: BACKDROP_KEY }))
  } catch {}
}

function readTranslucencyBook() {
  try {
    const raw = JSON.parse(localStorage.getItem(TRANSLUCENCY_KEY) || 'null')
    if (raw && typeof raw === 'object') {
      return {
        mode: raw.mode === 'glass' || raw.mode === 'clear' ? raw.mode : 'clear',
        base: raw.base || {}, light: raw.light || {}, dark: raw.dark || {}
      }
    }
  } catch {}
  return { mode: 'clear', base: {}, light: {}, dark: {} }
}

function currentIntensity() {
  const dark = resolvedDark()
  const book = readTranslucencyBook()
  const slot = dark ? (book.dark.intensity ?? book.base.intensity) : (book.light.intensity ?? book.base.intensity)
  if (typeof slot === 'number') return slot
  return dark ? 22 : 66
}

function writeIntensity(intensity) {
  const dark = resolvedDark()
  const book = readTranslucencyBook()
  const slot = dark ? 'dark' : 'light'
  book[slot] = { ...book[slot], intensity }
  try {
    localStorage.setItem(TRANSLUCENCY_KEY, JSON.stringify(book))
    window.dispatchEvent(new StorageEvent('storage', { key: TRANSLUCENCY_KEY }))
  } catch {}
  pushTranslucencyIpc(book, dark)
}

function pushTranslucencyIpc(book, dark) {
  // 实时驱动原生窗口透明效果（官方 IPC 通道）
  const slot = book[dark ? 'dark' : 'light'] || {}
  const base = book.base || {}
  const defaults = dark ? { intensity: 22, fade: 0, material: 'titlebar', scope: 'window' }
                        : { intensity: 66, fade: 1, material: 'header', scope: 'window' }
  try {
    window.hermesDesktop?.setTranslucency?.({
      mode: book.mode,
      intensity: slot.intensity ?? base.intensity ?? defaults.intensity,
      fade: slot.fade ?? base.fade ?? defaults.fade,
      material: slot.material ?? base.material ?? defaults.material,
      scope: slot.scope ?? base.scope ?? defaults.scope,
      glassSupported: true
    })
  } catch {}
}


// ── 主题（皮肤）───────────────────────────────────────────────────
// 与模式同款官方管道：skin 存 hermes-desktop-theme-v2（default）/ profile-themes record，
// 官方 storage 监听实时生效。列表 = 原生 BUILTIN_THEME_LIST（presets.ts）。
const SKIN_GLOBAL_KEY = 'hermes-desktop-theme-v2'
const SKIN_RECORD_KEY = 'hermes-desktop-profile-themes-v1'
const THEMES = [
  { id: 'nous', label: 'Nous' },
  { id: 'nous-alt', label: 'Nous Alt' },
  { id: 'github', label: 'GitHub' },
  { id: 'catppuccin', label: 'Catppuccin' },
  { id: 'everforest', label: 'Everforest' },
  { id: 'solarized', label: 'Solarized' },
  { id: 'midnight', label: 'Midnight' },
  { id: 'ember', label: 'Ember' },
  { id: 'mono', label: 'Mono' },
  { id: 'cyberpunk', label: 'Cyberpunk' },
  { id: 'slate', label: 'Slate' }
]

function readThemeSkin() {
  try {
    const profile = localStorage.getItem('hermes-desktop-active-profile-v1') || 'default'
    if (profile !== 'default') {
      const rec = JSON.parse(localStorage.getItem(SKIN_RECORD_KEY) || '{}')
      if (rec[profile]) return rec[profile]
    }
    return localStorage.getItem(SKIN_GLOBAL_KEY) || 'nous'
  } catch {
    return 'nous'
  }
}

function writeThemeSkin(skin) {
  try {
    const profile = localStorage.getItem('hermes-desktop-active-profile-v1') || 'default'
    if (profile === 'default') {
      localStorage.setItem(SKIN_GLOBAL_KEY, skin)
      window.dispatchEvent(new StorageEvent('storage', { key: SKIN_GLOBAL_KEY }))
    } else {
      const rec = JSON.parse(localStorage.getItem(SKIN_RECORD_KEY) || '{}')
      rec[profile] = skin
      localStorage.setItem(SKIN_RECORD_KEY, JSON.stringify(rec))
      window.dispatchEvent(new StorageEvent('storage', { key: SKIN_RECORD_KEY }))
    }
  } catch {}
}

// ── 面板 ──────────────────────────────────────────────────────────
function AppearancePanel() {
  const [paper, setPaper] = useState(() => ctxRef.storage.get(PAPER_KEY, true))
  const [darkRecipe, setDarkRecipeState] = useState(() => {
    const v = ctxRef.storage.get(DARK_RECIPE_KEY, 'light')
    return DARK_RECIPES[v] ? v : 'light'
  })
  const [lightRecipe, setLightRecipeState] = useState(() => {
    const v = ctxRef.storage.get(LIGHT_RECIPE_KEY, 'light')
    return LIGHT_RECIPES[v] ? v : 'light'
  })
  const [themeMode, setThemeModeState] = useState(() => readThemeMode())
  const [density, setDensityState] = useState(() =>
    readSimpleKey(DENSITY_KEY, 'compact', ['compact', 'comfortable', 'detailed']))
  const [tabStrip, setTabStripState] = useState(() =>
    readSimpleKey(TABSTRIP_KEY, 'auto', ['auto', 'always', 'never']))
  const [backdrop, setBackdropState] = useState(() => readBackdrop())
  const [translucencyMode, setTranslucencyModeState] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(TRANSLUCENCY_KEY) || 'null')
      return raw?.mode === 'glass' ? 'glass' : 'clear'
    } catch { return 'clear' }
  })
  const [intensity, setIntensityState] = useState(() => currentIntensity())
  const [fade, setFadeState] = useState(() => {
    try {
      const dark = resolvedDark()
      const raw = JSON.parse(localStorage.getItem(TRANSLUCENCY_KEY) || 'null')
      const slot = dark ? (raw?.dark?.fade ?? raw?.base?.fade) : (raw?.light?.fade ?? raw?.base?.fade)
      return typeof slot === 'number' ? slot : (dark ? 0 : 1)
    } catch { return 0 }
  })
  const [glassMaterial, setGlassMaterialState] = useState(() => {
    try {
      const dark = resolvedDark()
      const raw = JSON.parse(localStorage.getItem(TRANSLUCENCY_KEY) || 'null')
      return dark ? (raw?.dark?.material ?? raw?.base?.material ?? 'titlebar')
                  : (raw?.light?.material ?? raw?.base?.material ?? 'header')
    } catch { return 'titlebar' }
  })
  const [glassScope, setGlassScopeState] = useState(() => {
    try {
      const dark = resolvedDark()
      const raw = JSON.parse(localStorage.getItem(TRANSLUCENCY_KEY) || 'null')
      return dark ? (raw?.dark?.scope ?? raw?.base?.scope ?? 'window')
                  : (raw?.light?.scope ?? raw?.base?.scope ?? 'window')
    } catch { return 'window' }
  })
  const [font, setFont] = useState(() => ctxRef.storage.get(FONT_KEY, true))
  const [zoom, setZoomState] = useState(() => '90')
  const [introOn, setIntroOn] = useState(() => {
    try { return localStorage.getItem(INTRO_NATIVE_KEY) !== 'false' } catch { return true }
  })
  const [introMode, setIntroModeState] = useState(() => {
    const v = ctxRef.storage.get(INTRO_MODE_KEY, 'native')
    return v === 'custom' ? 'custom' : 'native'
  })
  const [introHeadline, setIntroHeadline] = useState(() => ctxRef.storage.get(INTRO_HEADLINE_KEY, 'HERMES AGENT'))
  const [introTagline, setIntroTagline] = useState(() => ctxRef.storage.get(INTRO_TAGLINE_KEY, ''))

  // 面板挂载后建立同步：优先用模块级 liveZoom 缓存，未缓存则回退原生读取；
  // 订阅模块级变化（弹窗关闭即退订，但原生常驻监听在 register 时已挂，故反向永不断）
  useEffect(() => {
    if (liveZoom != null) {
      setZoomState(String(liveZoom))
    } else {
      const init = getNativeZoom()
      if (init && typeof init.then === 'function') {
        init.then((p) => { if (p != null) { liveZoom = p; setZoomState(String(p)) } }).catch(() => {})
      }
    }
    const off = subscribeNativeZoom((p) => setZoomState(String(p)))
    return typeof off === 'function' ? off : undefined
  }, [])

  // 开场标识档位订阅：设置页切开关时，浮窗高亮即时跟平（推送模型，与 zoom 同款）
  useEffect(() => {
    const off = subscribeIntroMode((mode) => {
      setIntroModeState(mode)
      if (mode !== 'custom') {
        // 外部改开关不会带文字变化，仅同步档位即可
        ctxRef && applyIntroMode(mode)
      }
    })
    return typeof off === 'function' ? off : undefined
  }, [])

  // 主题/模式跟随：别处（设置页/另一窗口）改外观时，本窗口原生 storage 监听已处理
  // 界面重绘；这里只需让弹窗高亮跟上——监听同一组键。
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === MODE_GLOBAL_KEY || e.key === MODE_RECORD_KEY ||
          e.key === SKIN_GLOBAL_KEY || e.key === SKIN_RECORD_KEY) {
        setThemeModeState(readThemeMode())
        setThemeState(readThemeSkin())
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const togglePaper = (next) => {
    setPaper(next)
    ctxRef.storage.set(PAPER_KEY, next)
    if (next) injectPaper()
    else removePaper()
    haptic('tap')
  }

  const setThemeMode = (mode) => {
    setThemeModeState(mode)
    writeThemeMode(mode)
    haptic('tap')
  }

  const setDarkRecipe = (id) => {
    setDarkRecipeState(id)
    ctxRef.storage.set(DARK_RECIPE_KEY, id)
    applyPaperMode()
    haptic('tap')
  }

  const setLightRecipe = (id) => {
    setLightRecipeState(id)
    ctxRef.storage.set(LIGHT_RECIPE_KEY, id)
    applyPaperMode()
    haptic('tap')
  }

  const [theme, setThemeState] = useState(() => readThemeSkin())
  const setTheme = (id) => {
    setThemeState(id)
    writeThemeSkin(id)
    haptic('tap')
  }

  const setDensity = (id) => {
    setDensityState(id)
    loadOfficialStores().then((s) => {
      if (s?.density) s.density.set(id)
      else writeSimpleKey(DENSITY_KEY, id)
    })
    haptic('tap')
  }

  const setTabStrip = (id) => {
    setTabStripState(id)
    loadOfficialStores().then((s) => {
      if (s?.tabStrip) s.tabStrip.set(id)
      else writeSimpleKey(TABSTRIP_KEY, id)
    })
    haptic('tap')
  }

  const toggleBackdrop = (on) => {
    setBackdropState(on)
    loadOfficialStores().then((s) => {
      // 官方 atom 实时切换界面（Backdrop.tsx 直接订阅此 atom）
      if (s?.backdrop) s.backdrop.set(on)
      else writeBackdrop(on)
    })
    haptic('tap')
  }

  const changeTranslucencyMode = (mode) => {
    setTranslucencyModeState(mode)
    try {
      const book = readTranslucencyBook()
      book.mode = mode
      localStorage.setItem(TRANSLUCENCY_KEY, JSON.stringify(book))
      pushTranslucencyIpc(book, resolvedDark())
    } catch {}
    setTimeout(() => setIntensityState(currentIntensity()), 0)
    haptic('tap')
  }

  const changeIntensity = (value) => {
    setIntensityState(value)
    clearTimeout(changeIntensity._t)
    changeIntensity._t = setTimeout(() => writeIntensity(value), 250)
  }

  const writeGlassField = (field, value) => {
    const dark = resolvedDark()
    try {
      const book = JSON.parse(localStorage.getItem(TRANSLUCENCY_KEY) || '{}')
      const slot = dark ? 'dark' : 'light'
      book[slot] = { ...(book[slot] || {}), [field]: value }
      if (!book.mode) book.mode = 'clear'
      localStorage.setItem(TRANSLUCENCY_KEY, JSON.stringify(book))
      window.dispatchEvent(new StorageEvent('storage', { key: TRANSLUCENCY_KEY }))
      pushTranslucencyIpc(book, dark)
    } catch {}
  }

  const changeFade = (value) => {
    setFadeState(value)
    clearTimeout(changeFade._t)
    changeFade._t = setTimeout(() => writeGlassField('fade', value), 250)
  }

  const setGlassMaterial = (m3) => {
    setGlassMaterialState(m3)
    writeGlassField('material', m3)
    haptic('tap')
  }

  const setGlassScope = (s3) => {
    setGlassScopeState(s3)
    writeGlassField('scope', s3)
    haptic('tap')
  }

    const toggleFont = (next) => {
    setFont(next)
    ctxRef.storage.set(FONT_KEY, next)
    if (next) applyFont()
    else removeFont()
    haptic('tap')
  }

  const setZoom = (id) => {
    setZoomState(id)
    setNativeZoom(Number(id))
    haptic('tap')
  }

    const toggleIntro = (on) => {
    setIntroOn(on)
    try {
      localStorage.setItem(INTRO_NATIVE_KEY, on ? 'true' : 'false')
      window.dispatchEvent(new StorageEvent('storage', { key: INTRO_NATIVE_KEY }))
    } catch {}
    if (!on) {
      stopIntroObserver()
      introRestore()
    } else {
      const mode = ctxRef.storage.get(INTRO_MODE_KEY, 'native')
      applyIntroMode(mode === 'custom' ? 'custom' : 'native')
    }
    haptic('tap')
  }

  const setIntroMode = (mode) => {
    setIntroModeState(mode)
    ctxRef.storage.set(INTRO_MODE_KEY, mode)
    applyIntroMode(mode)
    haptic('tap')
  }

  // 边输入边生效：停手 400ms 防抖落盘 + 重刷替换层，无需失焦/按回车确认
  useEffect(() => {
    if (introMode !== 'custom') return
    const t = setTimeout(() => {
      if (!ctxRef) return
      const headline = String(introHeadline).trim() || 'HERMES AGENT'
      const tagline = String(introTagline).trim()
      ctxRef.storage.set(INTRO_HEADLINE_KEY, headline)
      ctxRef.storage.set(INTRO_TAGLINE_KEY, tagline)
      applyIntroMode('custom')
    }, 400)
    return () => clearTimeout(t)
  }, [introHeadline, introTagline, introMode])

  return jsxs('div', {
    className: 'flex flex-col p-3',
    style: { width: '21rem' },
    children: [
      // 标题（右上角 = 主题三档切换：明亮/暗色/系统）
      jsxs('div', {
        className:
          'mb-1 flex items-center gap-2.5 border-b border-(--ui-stroke-secondary) px-1 pb-2',
        children: [
          jsx('span', {
            className:
              'flex size-7 shrink-0 items-center justify-center rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated)',
            children: jsx(icons.Palette, { className: 'size-3.5 text-(--ui-text-secondary)' })
          }),
          jsx('div', { className: 'min-w-0 flex-1 text-[0.75rem] leading-tight font-medium', children: '外观' }),
          jsx(SegmentedControl, {
            options: THEME_MODES,
            value: themeMode,
            onChange: setThemeMode,
            className: 'shrink-0 scale-90'
          })
        ]
      }),
      // 主题（原生皮肤列表，平铺网格）
      jsxs('div', {
        className: 'flex flex-col gap-1.5 rounded-md px-2 py-2 hover:bg-(--chrome-action-hover)',
        children: [
          jsxs('div', {
            className: 'flex items-center gap-2.5',
            children: [
              jsx('span', {
                className: 'flex size-6 shrink-0 items-center justify-center',
                children: jsx(icons.Palette, { className: 'size-3.5 text-(--ui-text-secondary)' })
              }),
              jsx('div', { className: 'min-w-0 flex-1 text-[0.75rem] leading-tight', children: '主题' })
            ]
          }),
          jsx(
            'div',
            {
              style: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '4px', padding: '0 10px' },
              children: THEMES.map((t) =>
                jsx(
                  'button',
                  {
                    type: 'button',
                    onClick: () => setTheme(t.id),
                    className:
                      'rounded-md border px-1.5 py-1 text-[0.625rem] transition-colors ' +
                      (t.id === theme
                        ? 'border-(--ui-accent) bg-(--ui-control-active-background) font-medium text-(--ui-text-primary)'
                        : 'border-(--ui-stroke-secondary) text-(--ui-text-secondary) hover:bg-(--chrome-action-hover)'),
                    children: t.label
                  },
                  t.id
                )
              )
            }
          )
        ]
      }),

      // 字体
      jsxs('div', {
        className: 'flex items-center gap-2.5 rounded-md px-2 py-2 hover:bg-(--chrome-action-hover)',
        children: [
          jsx('span', {
            className: 'flex size-6 shrink-0 items-center justify-center',
            children: jsx(icons.CircleLetterA, { className: 'size-3.5 text-(--ui-text-secondary)' })
          }),
          jsxs('div', {
            className: 'min-w-0 flex-1',
            children: [
              jsx('div', { className: 'text-[0.75rem] leading-tight', children: '字体' }),
              jsx('div', {
                className: 'mt-0.5 text-[0.6875rem] leading-tight text-(--ui-text-tertiary)',
                children: '界面字体 · 霞鹜文楷'
              })
            ]
          }),
          jsx(Switch, {
            style: { marginRight: '2px' },
            checked: font,
            onCheckedChange: toggleFont,
            'aria-label': '字体'
          })
        ]
      }),

      // 纸纹（开关 + 配方同属一个悬浮高亮容器）
      jsxs('div', {
        className: 'flex flex-col gap-1 rounded-md px-2 py-2 hover:bg-(--chrome-action-hover)',
        children: [
          jsxs('div', {
            className: 'flex items-center gap-2.5',
            children: [
              jsx('span', {
                className: 'flex size-6 shrink-0 items-center justify-center',
                children: jsx(icons.Layers3, { className: 'size-3.5 text-(--ui-text-secondary)' })
              }),
              jsxs('div', {
                className: 'min-w-0 flex-1',
                children: [
                  jsx('div', { className: 'text-[0.75rem] leading-tight', children: '纸纹' }),
                  jsx('div', {
                    className: 'mt-0.5 text-[0.6875rem] leading-tight text-(--ui-text-tertiary)',
                    children: '宣纸噪点层 · 随明暗自动切换'
                  })
                ]
              }),
              jsx(Switch, {
                style: { marginRight: '2px' },
                checked: paper,
                onCheckedChange: togglePaper,
                'aria-label': '纸纹'
              })
            ]
          }),

          // 配方（明亮在上，暗色在下；从左到右由轻到重，默认极轻）
          jsxs('div', {
            className: 'flex items-center gap-2 px-0.5',
            children: [
              jsx('span', {
                className: 'shrink-0 text-[0.625rem] text-(--ui-text-quaternary)',
                children: '明亮配方'
              }),
              jsx(SegmentedControl, {
                options: Object.entries(LIGHT_RECIPES).map(([id, r]) => ({ id, label: r.label })),
                value: lightRecipe,
                onChange: setLightRecipe,
                className: 'min-w-0 flex-1'
              })
            ]
          }),
          jsxs('div', {
            className: 'flex items-center gap-2 px-0.5',
            children: [
              jsx('span', {
                className: 'shrink-0 text-[0.625rem] text-(--ui-text-quaternary)',
                children: '暗色配方'
              }),
              jsx(SegmentedControl, {
                options: Object.entries(DARK_RECIPES).map(([id, r]) => ({ id, label: r.label })),
                value: darkRecipe,
                onChange: setDarkRecipe,
                className: 'min-w-0 flex-1'
              })
            ]
          })
        ]
      }),

      // 标签栏
      jsxs('div', {
        className: 'flex items-center gap-2.5 rounded-md px-2 py-2 hover:bg-(--chrome-action-hover)',
        children: [
          jsx('span', {
            className: 'flex size-6 shrink-0 items-center justify-center',
            children: jsx(icons.AppWindow, { className: 'size-3.5 text-(--ui-text-secondary)' })
          }),
          jsxs('div', {
            className: 'min-w-0 flex-1',
            children: [
              jsx('div', { className: 'text-[0.75rem] leading-tight', children: '标签栏' }),
              jsx('div', {
                className: 'mt-0.5 text-[0.6875rem] leading-tight text-(--ui-text-tertiary)',
                children: '切换/新建会话后生效'
              })
            ]
          }),
          jsx(SegmentedControl, {
            options: TABSTRIP_OPTIONS,
            value: tabStrip,
            onChange: setTabStrip,
            className: 'shrink-0'
          })
        ]
      }),

      // 会话列表密度
      jsxs('div', {
        className: 'flex items-center gap-2.5 rounded-md px-2 py-2 hover:bg-(--chrome-action-hover)',
        children: [
          jsx('span', {
            className: 'flex size-6 shrink-0 items-center justify-center',
            children: jsx(icons.FileText, { className: 'size-3.5 text-(--ui-text-secondary)' })
          }),
          jsx('div', { className: 'min-w-0 flex-1 text-[0.75rem] leading-tight', children: '会话列表密度' }),
          jsx(SegmentedControl, {
            options: DENSITY_OPTIONS,
            value: density,
            onChange: setDensity,
            className: 'shrink-0'
          })
        ]
      }),

      // 聊天背景
      jsxs('div', {
        className: 'flex items-center gap-2.5 rounded-md px-2 py-2 hover:bg-(--chrome-action-hover)',
        children: [
          jsx('span', {
            className: 'flex size-6 shrink-0 items-center justify-center',
            children: jsx(icons.FileImage, { className: 'size-3.5 text-(--ui-text-secondary)' })
          }),
          jsxs('div', {
            className: 'min-w-0 flex-1',
            children: [
              jsx('div', { className: 'text-[0.75rem] leading-tight', children: '聊天背景' }),
              jsx('div', {
                className: 'mt-0.5 text-[0.6875rem] leading-tight text-(--ui-text-tertiary)',
                children: '对话后方那张淡淡的雕像图片'
              })
            ]
          }),
          jsx(SegmentedControl, {
            options: [
              { id: 'off', label: '关' },
              { id: 'on', label: '开' }
            ],
            value: backdrop ? 'on' : 'off',
            onChange: (id) => toggleBackdrop(id === 'on'),
            className: 'shrink-0'
          })
        ]
      }),

      // 窗口透明
      jsxs('div', {
        className: 'flex flex-col gap-1.5 rounded-md px-2 py-2 hover:bg-(--chrome-action-hover)',
        children: [
          jsxs('div', {
            className: 'flex items-center gap-2.5',
            children: [
              jsx('span', {
                className: 'flex size-6 shrink-0 items-center justify-center',
                children: jsx(icons.Eye, { className: 'size-3.5 text-(--ui-text-secondary)' })
              }),
              jsx('div', { className: 'min-w-0 flex-1 text-[0.75rem] leading-tight', children: '窗口透明' }),
              jsx(SegmentedControl, {
                options: [
                  { id: 'clear', label: '透明' },
                  { id: 'glass', label: '玻璃' }
                ],
                value: translucencyMode,
                onChange: changeTranslucencyMode,
                className: 'shrink-0'
              })
            ]
          }),
          jsxs('div', {
            className: 'flex items-center gap-2 px-0.5',
            children: [
              jsx('span', {
                className: 'shrink-0 text-[0.625rem] text-(--ui-text-quaternary)',
                children: translucencyMode === 'glass' ? '色调' : '强度'
              }),
              jsx('input', {
                type: 'range',
                min: 0,
                max: 100,
                step: 1,
                value: intensity,
                onChange: (e) => changeIntensity(Number(e.target.value)),
                style: SLIDER_STYLE,
                className: 'min-w-0 flex-1 cursor-pointer',
                'aria-label': '透明强度'
              }),
              jsx('span', {
                style: { width: '32px' },
                className: 'shrink-0 text-right text-[0.625rem] tabular-nums text-(--ui-text-tertiary)',
                children: intensity + '%'
              })
            ]
          }),
          translucencyMode === 'glass' &&
            jsxs('div', {
              className: 'flex flex-col gap-1',
              children: [
                jsxs('div', {
                  className: 'flex items-center gap-2 px-0.5',
                  children: [
                    jsx('span', {
                      className: 'shrink-0 text-[0.625rem] text-(--ui-text-quaternary)',
                      children: '淡出'
                    }),
                    jsx('input', {
                      type: 'range',
                      min: 0,
                      max: 100,
                      step: 1,
                      value: fade,
                      onChange: (e) => changeFade(Number(e.target.value)),
                      style: SLIDER_STYLE,
                      className: 'min-w-0 flex-1 cursor-pointer',
                      'aria-label': '淡出'
                    }),
                    jsx('span', {
                      style: { width: '32px' },
                      className: 'shrink-0 text-right text-[0.625rem] tabular-nums text-(--ui-text-tertiary)',
                      children: fade + '%'
                    })
                  ]
                }),
                jsxs('div', {
                  className: 'flex items-center gap-2 px-0.5',
                  children: [
                    jsx('span', {
                      className: 'shrink-0 text-[0.625rem] text-(--ui-text-quaternary)',
                      children: '磨砂质感'
                    }),
                    jsx(SegmentedControl, {
                      options: GLASS_MATERIALS.map((m3) => ({ id: m3, label: FROST_LABELS[m3] })),
                      value: glassMaterial,
                      onChange: setGlassMaterial,
                      className: 'min-w-0 flex-1'
                    })
                  ]
                }),
                jsxs('div', {
                  className: 'flex items-center gap-2 px-0.5',
                  children: [
                    jsx('span', {
                      className: 'shrink-0 text-[0.625rem] text-(--ui-text-quaternary)',
                      children: '应用范围'
                    }),
                    jsx(SegmentedControl, {
                      options: GLASS_SCOPES.map((s3) => ({ id: s3, label: SCOPE_LABELS[s3] })),
                      value: glassScope,
                      onChange: setGlassScope,
                      className: 'min-w-0 flex-1'
                    })
                  ]
                })
              ]
            })
        ]
      }),

      // 开场标识（新会话空态字标 + 提示语）
      jsxs('div', {
        className: 'flex flex-col gap-1.5 rounded-md px-2 py-2 hover:bg-(--chrome-action-hover)',
        children: [
          jsxs('div', {
            className: 'flex items-center gap-2.5',
            children: [
              jsx('span', {
                className: 'flex size-6 shrink-0 items-center justify-center',
                children: jsx(icons.MessageSquareText, { className: 'size-3.5 text-(--ui-text-secondary)' })
              }),
              jsxs('div', {
                className: 'min-w-0 flex-1',
                children: [
                  jsx('div', { className: 'text-[0.75rem] leading-tight', children: '开场标识' }),
                  jsx('div', {
                    className: 'mt-0.5 text-[0.6875rem] leading-tight text-(--ui-text-tertiary)',
                    children: '新建会话的字标与提示语'
                  })
                ]
              }),
              jsx(SegmentedControl, {
                options: [
                  { id: 'off', label: '关' },
                  { id: 'on', label: '开' }
                ],
                value: introOn ? 'on' : 'off',
                onChange: (id2) => toggleIntro(id2 === 'on'),
                className: 'shrink-0'
              })
            ]
          }),
          introOn &&
            jsxs('div', {
              className: 'flex flex-col gap-1.5 px-0.5',
              children: [
                jsx(SegmentedControl, {
                  options: INTRO_OPTIONS,
                  value: introMode,
                  onChange: setIntroMode,
                  className: 'w-full'
                }),
                introMode === 'custom' &&
                  jsxs('div', {
                    className: 'flex flex-col gap-1.5',
                    children: [
                      jsx(Input, {
                        value: introHeadline,
                        onChange: (e) => setIntroHeadline(e.target.value),
                        placeholder: '字标，如 BINSHAO',
                        className: 'h-7 text-[0.6875rem]',
                        'aria-label': '自定义字标'
                      }),
                      jsx(Textarea, {
                        value: introTagline,
                        onChange: (e) => setIntroTagline(e.target.value),
                        placeholder: '提示语（留空跟随原生随机文案）',
                        rows: 2,
                        className: 'text-[0.6875rem]',
                        'aria-label': '自定义提示语'
                      })
                    ]
                  })
              ]
            })
        ]
      }),
      // 界面缩放
      jsxs('div', {
        className: 'flex flex-col gap-1.5 rounded-md px-2 py-2 hover:bg-(--chrome-action-hover)',
        children: [
          jsxs('div', {
            className: 'flex items-center gap-2.5',
            children: [
              jsx('span', {
                className: 'flex size-6 shrink-0 items-center justify-center',
                children: jsx('svg', {
                  viewBox: '0 0 16 16',
                  fill: 'none',
                  stroke: 'currentColor',
                  strokeWidth: 1.3,
                  strokeLinecap: 'round',
                  strokeLinejoin: 'round',
                  className: 'size-3.5 text-(--ui-text-secondary)',
                  children: jsx('path', { d: 'M2.5 5.5V2.5h3M13.5 5.5V2.5h-3M2.5 10.5v3h3M13.5 10.5v3h-3' })
                })
              }),
              jsxs('div', {
                className: 'min-w-0 flex-1',
                children: [
                  jsx('div', { className: 'text-[0.75rem] leading-tight', children: '界面缩放' }),
                  jsx('div', {
                    className: 'mt-0.5 text-[0.6875rem] leading-tight text-(--ui-text-tertiary)',
                    children: '原生缩放 · 与设置/View菜单同步'
                  })
                ]
              })
            ]
          }),
          jsx(SegmentedControl, {
            options: ZOOM_OPTIONS,
            value: zoom,
            onChange: setZoom,
            className: 'w-full'
          })
        ]
      }),

      // 底部提示
      jsx('div', {
        className: 'mt-1 border-t border-(--ui-stroke-secondary) px-1 pt-2 text-[0.625rem] text-(--ui-text-quaternary)',
        children: '修改即时生效 · 重启后保留'
      })
    ]
  })
}

// ── 插件入口 ──────────────────────────────────────────────────────
export default {
  id: ID,
  name: 'Hermes Appearance Hub',
  description: '外观整合面板：纸纹 + 霞鹜文楷字体 + 原生界面缩放，状态栏一键开关。',
  register(ctx) {
    try {
      ctxRef = ctx

      // 按持久化状态初始化（默认开启，与原插件行为一致）
      if (ctx.storage.get(PAPER_KEY, true)) injectPaper()
      if (ctx.storage.get(FONT_KEY, true)) applyFont()
      // 开场标识：先与原生键对账（设置页关过 → 插件跟到关闭档），再按档位恢复注入；
      // 挂 setItem 钩子后，设置页开关改动即时推送过来（与缩放 onChanged 同款推送模型）
      try {
        const nativeVal = localStorage.getItem(INTRO_NATIVE_KEY)
        if (nativeVal != null) introNativeLastWritten = nativeVal
        if (nativeVal === 'false') ctx.storage.set(INTRO_MODE_KEY, 'off')
        else if (nativeVal === 'true' && ctx.storage.get(INTRO_MODE_KEY, 'native') === 'off') {
          ctx.storage.set(INTRO_MODE_KEY, 'native')
        }
      } catch {}
      applyIntroMode(ctx.storage.get(INTRO_MODE_KEY, 'native'))
      installIntroStorageHook()
      // 界面缩放走原生机制（window.hermesDesktop.zoom）。
      // 挂模块级常驻监听：与弹窗开关无关，保证 Settings / View 菜单 / Cmd± 改缩放时
      // 反向同步（哪怕 hub 弹窗此刻没开，下次打开也已是最新值）。
      startNativeZoomWatch()
      // 预热官方 store 识别（后台异步，启动时闪烁不可见）：
      // 避免用户首次点聊天背景时键验证法探测导致开场标识闪动
      loadOfficialStores().catch(() => {})

      // 卸载/重载时清理注入，不留残留
      ctx.onDispose(() => {
        removePaper()
        removeFont()
        resetIntroOnDispose()
        if (typeof zoomUnsubscribeNative === 'function') zoomUnsubscribeNative()
        zoomUnsubscribeNative = null
        zoomSubscribers.clear()
        ctxRef = null
      })

      if (!ctx.storage.get(WELCOME_KEY, false)) {
        ctx.storage.set(WELCOME_KEY, true)
        host.notify({ kind: 'info', message: '外观 Hub 已就绪 — 纸纹、字体、原生缩放在状态栏「外观」开关' })
      }

      // 标准状态栏条目：variant:'menu' + menuContent = 核心 DropdownMenu 弹窗，
      // 与 gateway / 命令中心等核心工具同一渲染路径；toggleLabel 使其出现在
      // 状态栏右键菜单（可勾选显隐）。
      ctx.register({
        id: 'hub',
        area: 'statusBar.right',
        order: 100,
        data: {
          id: 'hub',                                    // 必填：右键显隐按此 id 持久化，缺了会存成 null 被过滤
          variant: 'menu',                              // → 核心 DropdownMenu
          label: '外观',
          icon: jsx(icons.Palette, { className: 'size-3.5' }),
          title: '外观设置',
          menuAlign: 'end',
          menuContent: jsx(AppearancePanel, {}),
          menuClassName: 'w-auto border-(--ui-stroke-secondary) p-0',
          toggleLabel: '外观设置'
        }
      })
    } catch (e) {
      host.notify({ kind: 'error', message: '外观 Hub 注入失败: ' + (e && e.message) })
    }
  }
}
