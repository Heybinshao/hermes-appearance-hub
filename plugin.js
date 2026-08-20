/**
 * Hermes Appearance Hub — 外观整合面板：纸纹 + 字体 二合一开关。
 *
 * 整合（不修改原插件）：
 *   - hermes-paper-texture  纸纹：宣纸质感噪点层（明暗自动适配）
 *   - hermes-font-wenkai    字体：界面字体 = 霞鹜文楷
 *
 * 用法：
 *   - 状态栏「外观」按钮 → 标准状态栏弹窗（DropdownMenu，与核心工具一致），
 *     两个开关即时生效，设置持久化（ctx.storage）。
 *   - 状态栏右键菜单可勾选显示/隐藏本入口（toggleLabel）。
 *   - 原两个插件建议在 Settings → Plugins 中关闭，避免纸纹叠加。
 *
 * 机制：注入/移除均用本插件专属 DOM id，与两个原插件互不干扰；
 *       插件被禁用/重载时 onDispose 清理全部注入，不留残留。
 *       状态栏入口用 declarative data 通道（variant:'menu' + menuContent），
 *       不自定义 Popover —— 与核心状态栏工具同一条渲染路径，最稳。
 */
import { haptic, host, icons, Switch } from '@hermes/plugin-sdk'
import { useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

const ID = 'hermes-appearance-hub'
const PAPER_KEY = 'paper.enabled'
const FONT_KEY = 'font.enabled'
const WELCOME_KEY = 'welcome-v1'

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
    '--dt-font-mono:' + FONT_MONO + ' !important}'
}

function removeFont() {
  const style = document.getElementById(FONT_STYLE_ID)
  if (style) style.remove()
}

// ── 面板 ──────────────────────────────────────────────────────────
function AppearancePanel() {
  const [paper, setPaper] = useState(() => ctxRef.storage.get(PAPER_KEY, true))
  const [font, setFont] = useState(() => ctxRef.storage.get(FONT_KEY, true))

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

  return jsxs('div', {
    className: 'flex w-72 flex-col p-2',
    children: [
      // 标题
      jsxs('div', {
        className: 'flex items-center gap-2.5 px-2 pt-1.5 pb-2',
        children: [
          jsx('span', {
            className:
              'flex size-7 shrink-0 items-center justify-center rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated)',
            children: jsx(icons.Palette, { className: 'size-3.5 text-(--ui-text-secondary)' })
          }),
          jsxs('div', {
            className: 'min-w-0 flex-1',
            children: [
              jsx('div', { className: 'text-[13px] leading-tight font-medium', children: '外观' }),
              jsx('div', {
                className: 'mt-0.5 text-[11px] leading-tight text-(--ui-text-tertiary)',
                children: '纸纹 · 字体'
              })
            ]
          }),
          jsx('div', {
            className: 'text-[10px] text-(--ui-text-quaternary)',
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
              jsx('div', { className: 'text-[12.5px] leading-tight', children: '纸纹' }),
              jsx('div', {
                className: 'mt-0.5 text-[10.5px] leading-tight text-(--ui-text-tertiary)',
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
              jsx('div', { className: 'text-[12.5px] leading-tight', children: '字体' }),
              jsx('div', {
                className: 'mt-0.5 text-[10.5px] leading-tight text-(--ui-text-tertiary)',
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

      // 底部提示
      jsx('div', {
        className: 'border-t border-(--ui-stroke-secondary) px-2 pt-1.5 pb-0.5 text-[10px] text-(--ui-text-quaternary)',
        children: '修改即时生效 · 重启后保留'
      })
    ]
  })
}

// ── 插件入口 ──────────────────────────────────────────────────────
export default {
  id: ID,
  name: 'Appearance Hub',
  description: '外观整合面板：纸纹 + 霞鹜文楷字体，状态栏一键开关。',
  register(ctx) {
    try {
      ctxRef = ctx

      // 按持久化状态初始化（默认开启，与原插件行为一致）
      if (ctx.storage.get(PAPER_KEY, true)) injectPaper()
      if (ctx.storage.get(FONT_KEY, true)) applyFont()

      // 卸载/重载时清理注入，不留残留
      ctx.onDispose(() => {
        removePaper()
        removeFont()
        ctxRef = null
      })

      if (!ctx.storage.get(WELCOME_KEY, false)) {
        ctx.storage.set(WELCOME_KEY, true)
        host.notify({ kind: 'info', message: '外观 Hub 已就绪 — 纸纹与字体可在状态栏「外观」开关' })
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
          title: '外观设置 — 纸纹与字体',
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
