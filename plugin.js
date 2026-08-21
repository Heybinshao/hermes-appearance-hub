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
import { haptic, host, icons, Switch, SegmentedControl } from '@hermes/plugin-sdk'
import { useState, useEffect } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

const ID = 'hermes-appearance-hub'
const PAPER_KEY = 'paper.enabled'
const FONT_KEY = 'font.enabled'
const WELCOME_KEY = 'welcome-v1'

// 界面缩放档位：直接复用 Hermes 原生预设（100/125/150/175 均为原生支持值）。
// id 用字符串（SegmentedControl<T extends string> 要求），percent 用于调原生接口。
const ZOOM_OPTIONS = [
  { id: '100', label: '100%', percent: 100 },
  { id: '125', label: '125%', percent: 125 },
  { id: '150', label: '150%', percent: 150 },
  { id: '175', label: '175%', percent: 175 }
]

// 与 hermes-paper-texture 同机制，独立 DOM id 避免与原插件抢元素
const PAPER_LAYER_ID = ID + '-paper'
// 与 hermes-font-wenkai 同机制，独立 style id
const FONT_STYLE_ID = ID + '-font-style'

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
    layer.style.backgroundImage = makeTexture(0.9, 3, 1.3, -0.15, 0.6)
    layer.style.opacity = '0.2'
    layer.style.mixBlendMode = 'screen'
  } else {
    layer.style.backgroundImage = makeTexture(0.72, 4)
    layer.style.opacity = '0.3'
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

// ── 面板 ──────────────────────────────────────────────────────────
function AppearancePanel() {
  const [paper, setPaper] = useState(() => ctxRef.storage.get(PAPER_KEY, true))
  const [font, setFont] = useState(() => ctxRef.storage.get(FONT_KEY, true))
  const [zoom, setZoomState] = useState(() => '90')

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

  const togglePaper = (next) => {
    setPaper(next)
    ctxRef.storage.set(PAPER_KEY, next)
    if (next) injectPaper()
    else removePaper()
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

  return jsxs('div', {
    className: 'flex w-72 flex-col p-3',
    children: [
      // 标题
      jsxs('div', {
        className: 'flex items-center gap-2.5 px-1 pb-2',
        children: [
          jsx('span', {
            className:
              'flex size-7 shrink-0 items-center justify-center rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated)',
            children: jsx(icons.Palette, { className: 'size-3.5 text-(--ui-text-secondary)' })
          }),
          jsxs('div', {
            className: 'min-w-0 flex-1',
            children: [
              jsx('div', { className: 'text-[0.75rem] leading-tight font-medium', children: '外观' }),
              jsx('div', {
                className: 'mt-0.5 text-[0.6875rem] leading-tight text-(--ui-text-tertiary)',
                children: '纸纹 · 字体 · 缩放'
              })
            ]
          }),
          jsx('div', {
            className: 'text-[0.625rem] text-(--ui-text-quaternary)',
            children: document.documentElement.classList.contains('dark') ||
              document.documentElement.dataset.hermesMode === 'dark'
              ? '深色'
              : '浅色'
          })
        ]
      }),

      // 纸纹
      jsxs('div', {
        className: 'flex items-center gap-2.5 rounded-md px-2 py-2 hover:bg-(--chrome-action-hover)',
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
            checked: paper,
            onCheckedChange: togglePaper,
            'aria-label': '纸纹'
          })
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
            checked: font,
            onCheckedChange: toggleFont,
            'aria-label': '字体'
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
      // 界面缩放走原生机制（window.hermesDesktop.zoom）。
      // 挂模块级常驻监听：与弹窗开关无关，保证 Settings / View 菜单 / Cmd± 改缩放时
      // 反向同步（哪怕 hub 弹窗此刻没开，下次打开也已是最新值）。
      startNativeZoomWatch()

      // 卸载/重载时清理注入，不留残留
      ctx.onDispose(() => {
        removePaper()
        removeFont()
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
          title: '外观设置 — 纸纹 · 字体 · 原生缩放',
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
