/**
 * Hermes Appearance Hub — 外观整合面板。
 *
 * 用法：
 *   - 状态栏「外观」按钮 → 标准状态栏弹窗（DropdownMenu，与核心工具一致），
 *     主题/语言/字体/纸纹/缩放/标签栏/密度/聊天背景/消息气泡/窗口透明/开场标识即时生效。
 *   - 「界面缩放」直接驱动 Hermes 原生缩放（window.hermesDesktop.zoom.setPercent）
 *     —— 与 Settings → Appearance → 界面缩放、View 菜单同一套机制，互相实时同步。
 *   - 状态栏右键菜单可勾选显示/隐藏本入口（toggleLabel）。
 *
 * 机制：注入/移除均用本插件专属 DOM id；
 *       插件被禁用/重载时 onDispose 清理全部注入，不留残留。
 *       状态栏入口用 declarative data 通道（variant:'menu' + menuContent），
 *       不自定义 Popover —— 与核心状态栏工具同一条渲染路径，最稳。
 */
import { haptic, host, icons, SegmentedControl, Input, Textarea, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, usePluginI18n, useI18n } from '@hermes/plugin-sdk'
import { useState, useEffect, useRef } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

// ── i18n 文案树（跟随 app 的 display.language，解析链：当前 locale → en → 键名）──
// 与官方设置页用词对齐（i18n/en.ts、zh.ts、zh-hant.ts appearance 段）；
// 仅插件特有概念（纸纹配方档位、单双栏布局）为自有翻译。主题名不翻译。
export const LOCALES = {
  en: {
    statusbar: { label: 'Appearance', title: 'Appearance Settings', toggleLabel: 'Appearance Settings' },
    language: { title: 'Language', desc: 'Choose the language for the desktop interface.' },
    theme: {
      title: 'Appearance',
      titleDesc: 'Pick a fixed mode or let Hermes follow your system setting.',
      modeLight: 'Light', modeDark: 'Dark', modeSystem: 'System',
      gridTitle: 'Theme',
      gridDesc: 'Desktop palettes only. The selected mode is applied on top.'
    },
    font: { title: 'LXGW', desc: 'Interface font · requires LXGW WenKai installed' },
    paper: {
      title: 'Paper Texture', desc: 'Rice-paper grain layer · follows light/dark',
      recipeLight: 'Light recipe', recipeDark: 'Dark recipe',
      recipeLightSet: { light: 'Light', subtle: 'Subtle', classic: 'Classic', top: 'Topped' },
      recipeDarkSet: { light: 'Light', subtle: 'Subtle', classic: 'Classic', ground: 'Grounded' }
    },
    tabstrip: { title: 'Tab Strip', desc: 'Show tabs above a zone. Auto hides them when a zone holds a single pane.', auto: 'Auto', always: 'Always', never: 'Never' },
    density: { title: 'Session List Density', desc: 'Choose how much context appears beneath session titles in the sidebar.', compact: 'Compact', comfortable: 'Comfortable', detailed: 'Detailed' },
    bubble: { title: 'Message Bubbles', desc: 'How transparent your own messages are. 0 is solid, 100 keeps only the outline.' },
    backdrop: { title: 'Chat Backdrop', desc: 'The faint statue image behind the conversation.', off: 'Off', on: 'On' },
    translucency: {
      title: 'Window Translucency', desc: 'See your desktop through the whole window, text and all. Tuned separately for light and dark.',
      clear: 'Clear', glass: 'Glass',
      tint: 'Tint', intensityLabel: 'Intensity', fade: 'Fade',
      materialTitle: 'Frost',
      materials: { 'under-window': 'Deep', popover: 'Soft', titlebar: 'Bright', header: 'Glare' },
      scopeTitle: 'Area',
      scopes: { window: 'Whole window', sidebar: 'Sidebar only' }
    },
    intro: {
      title: 'Intro Splash', desc: 'The wordmark and prompt shown on an empty chat.', off: 'Off', on: 'On',
      native: 'Native copy', custom: 'Custom',
      headlinePlaceholder: 'Wordmark, e.g. BINSHAO', taglinePlaceholder: 'Prompt (leave empty to follow native random copy)'
    },
    behavior: {
      title: 'Chat Behavior',
      toolView: 'Tool Call Display', toolViewDesc: 'Product hides raw tool payloads; Technical shows full input/output.', product: 'Product', technical: 'Technical',
      reasoning: 'Collapse Thinking by Default', reasoningDesc: 'Keep streamed reasoning available without expanding it until you open it.',
      embeds: 'Inline Embeds', embedsDesc: 'Rich previews from third-party sites (YouTube, X, …). Ask shows a placeholder; Always auto-loads; Off keeps plain links.', ask: 'Ask', always: 'Always', offEmbed: 'Off',
      popout: 'Floating Composer', popoutDesc: 'Allow dragging the composer out of its dock. Off locks it at the bottom.',
      appActions: 'App Actions', appActionsDesc: 'Where Settings, Layout, and HUD sit in the titlebar. Right leaves room for tabs.', left: 'Left', right: 'Right'
    },
    zoom: { title: 'UI Scale', desc: 'Native scaling · synced with Settings/View menu' },
    footer: { tip: 'Hover any setting for details · Changes apply instantly' },
    notify: { ready: 'Appearance Hub ready — use the Appearance toggle in the status bar', failed: 'Appearance Hub injection failed: ' }
  },
  zh: {
    statusbar: { label: '外观', title: '外观设置', toggleLabel: '外观设置' },
    language: { title: '语言', desc: '选择桌面界面的语言。' },
    theme: {
      title: '外观',
      titleDesc: '选择固定模式，或让 Hermes 跟随系统设置。',
      modeLight: '明亮', modeDark: '暗色', modeSystem: '跟随系统',
      gridTitle: '主题',
      gridDesc: '仅桌面端调色板。所选模式叠加其上。'
    },
    font: { title: '霞鹜文楷', desc: '界面字体 · 需将 LXGW WenKai 安装到系统' },
    paper: {
      title: '纸纹模拟', desc: '宣纸噪点层 · 随明暗自动切换',
      recipeLight: '明亮配方', recipeDark: '暗色配方',
      recipeLightSet: { light: '极轻', subtle: '微调', classic: '经典', top: '贴顶' },
      recipeDarkSet: { light: '极轻', subtle: '微调', classic: '经典', ground: '贴地' }
    },
    tabstrip: { title: '标签栏', desc: '在分区上方显示标签。自动模式会在分区只有一个面板时隐藏标签。', auto: '自动', always: '始终', never: '从不' },
    density: { title: '会话列表密度', desc: '选择侧边栏会话标题下方显示的信息量。', compact: '紧凑', comfortable: '舒适', detailed: '详细' },
    bubble: { title: '消息气泡', desc: '你自己的消息有多透明。0 为不透明，100 时只保留边框。' },
    backdrop: { title: '聊天背景', desc: '对话后方那张淡淡的雕像图片', off: '关', on: '开' },
    translucency: {
      title: '窗口透明', desc: '让整个窗口（包括文字）透出桌面。明暗模式分别调节。',
      clear: '透明', glass: '玻璃',
      tint: '色调', intensityLabel: '强度', fade: '淡出',
      materialTitle: '磨砂质感',
      materials: { 'under-window': '深邃', popover: '柔和', titlebar: '明亮', header: '透亮' },
      scopeTitle: '应用范围',
      scopes: { window: '整个窗口', sidebar: '仅侧边栏' }
    },
    intro: {
      title: '开场标识', desc: '空白对话中显示的字标和提示语', off: '关', on: '开',
      native: '原生文案', custom: '自定义',
      headlinePlaceholder: '字标，如 BINSHAO', taglinePlaceholder: '提示语（留空跟随原生随机文案）'
    },
    behavior: {
      title: '对话行为',
      toolView: '工具调用显示', toolViewDesc: '产品模式隐藏原始工具数据；技术模式显示完整输入/输出。', product: '产品', technical: '技术',
      reasoning: '默认折叠推理过程', reasoningDesc: '保留流式推理内容，但在你打开前保持折叠。',
      embeds: '内嵌预览', embedsDesc: '富预览会从第三方网站（YouTube、X 等）加载。询问显示占位符；总是自动加载；关闭保留纯链接。', ask: '询问', always: '总是', offEmbed: '关闭',
      popout: '悬浮输入框', popoutDesc: '允许将输入框拖出底部停靠区。关闭后，输入框会锁定在底部。',
      appActions: '应用操作', appActionsDesc: '设置、布局和 HUD 放在标题栏左侧还是右侧。选右侧可给标签留出左边空间。', left: '左侧', right: '右侧'
    },
    zoom: { title: '界面缩放', desc: '缩放整个应用的文字和界面，与系统设置/View 菜单同步。' },
    footer: { tip: '悬停任一设置项查看说明 · 改动即时生效' },
    notify: { ready: '外观 Hub 已就绪 — 状态栏「外观」开关', failed: '外观 Hub 注入失败: ' }
  },
  'zh-hant': {
    statusbar: { label: '外觀', title: '外觀設定', toggleLabel: '外觀設定' },
    language: { title: '語言', desc: '選擇桌面介面的語言。' },
    theme: {
      title: '外觀',
      titleDesc: '選擇固定模式，或讓 Hermes 跟隨系統設定。',
      modeLight: '明亮', modeDark: '深色', modeSystem: '跟隨系統',
      gridTitle: '主題',
      gridDesc: '僅限桌面端的調色盤。所選模式會套用在其上。'
    },
    font: { title: '霞鶩文楷', desc: '介面字型 · 需將 LXGW WenKai 安裝到系統' },
    paper: {
      title: '紙紋模擬', desc: '宣紙噪點層 · 隨明暗自動切換',
      recipeLight: '明亮配方', recipeDark: '暗色配方',
      recipeLightSet: { light: '極輕', subtle: '微調', classic: '經典', top: '貼頂' },
      recipeDarkSet: { light: '極輕', subtle: '微調', classic: '經典', ground: '貼地' }
    },
    tabstrip: { title: '分頁列', desc: '在分區上方顯示分頁。自動模式會在分區只有一個面板時隱藏分頁。', auto: '自動', always: '一律', never: '永不' },
    density: { title: '工作階段列表密度', desc: '選擇側邊欄工作階段標題下方顯示的資訊量。', compact: '緊湊', comfortable: '舒適', detailed: '詳細' },
    bubble: { title: '訊息氣泡', desc: '你自己的訊息有多透明。0 為不透明，100 時只保留邊框。' },
    backdrop: { title: '聊天背景', desc: '對話後方那張淡淡的雕像圖片。', off: '關閉', on: '開啟' },
    translucency: {
      title: '視窗透明', desc: '讓整個視窗（包括文字）透出桌面。明暗模式分別調節。',
      clear: '透明', glass: '玻璃',
      tint: '色調', intensityLabel: '強度', fade: '淡出',
      materialTitle: '磨砂質感',
      materials: { 'under-window': '深邃', popover: '柔和', titlebar: '明亮', header: '透亮' },
      scopeTitle: '套用範圍',
      scopes: { window: '整個視窗', sidebar: '僅側邊欄' }
    },
    intro: {
      title: '開場標識', desc: '空白對話中顯示的字標和提示語。', off: '關閉', on: '開啟',
      native: '原生文案', custom: '自訂',
      headlinePlaceholder: '字標，例如 BINSHAO', taglinePlaceholder: '提示語（留空跟隨原生隨機文案）'
    },
    behavior: {
      title: '對話行為',
      toolView: '工具呼叫顯示', toolViewDesc: '產品模式會隱藏原始工具 payload；技術模式會顯示完整輸入/輸出。', product: '產品', technical: '技術',
      reasoning: '預設摺疊推理過程', reasoningDesc: '保留串流推理內容，但在您開啟前維持摺疊。',
      embeds: '內嵌預覽', embedsDesc: '豐富預覽會從第三方網站（YouTube、X 等）載入。詢問會在你允許前顯示佔位符；一律會自動載入；關閉則保留純連結。', ask: '詢問', always: '一律', offEmbed: '關閉',
      popout: '懸浮輸入框', popoutDesc: '允許將輸入框拖出底部停靠區。關閉後，輸入框會鎖定在底部。',
      appActions: '應用操作', appActionsDesc: '設定、版面與 HUD 放在標題列左側或右側。選右側可把左側留給分頁。', left: '左側', right: '右側'
    },
    zoom: { title: '介面縮放', desc: '縮放整個應用程式的文字與介面，與設定/檢視選單同步。' },
    footer: { tip: '懸停任一設定項查看說明 · 變更即時生效' },
    notify: { ready: '外觀 Hub 已就緒 — 狀態列「外觀」開關', failed: '外觀 Hub 注入失敗: ' }
  }
}

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

const PAPER_LAYER_ID = ID + '-paper'
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
  light: { labelKey: 'paper.recipeDarkSet.light', baseFreq: 0.9, octaves: 3, gain: 1.3, offset: -0.15, blur: 0.6, opacity: 0.12 },
  subtle: { labelKey: 'paper.recipeDarkSet.subtle', baseFreq: 0.9, octaves: 3, gain: 1.3, offset: -0.35, blur: 0.6, opacity: 0.2 },
  classic: { labelKey: 'paper.recipeDarkSet.classic', baseFreq: 0.9, octaves: 3, gain: 1.3, offset: -0.15, blur: 0.6, opacity: 0.2 },
  ground: { labelKey: 'paper.recipeDarkSet.ground', baseFreq: 0.9, octaves: 3, gain: 2.2, offset: -0.55, blur: 0.6, opacity: 0.2 }
}
const LIGHT_RECIPES = {
  light: { labelKey: 'paper.recipeLightSet.light', baseFreq: 0.72, octaves: 4, gain: 1.3, offset: 0.3, blur: null, opacity: 0.18 },
  subtle: { labelKey: 'paper.recipeLightSet.subtle', baseFreq: 0.72, octaves: 4, gain: 1.15, offset: 0.25, blur: null, opacity: 0.28 },
  classic: { labelKey: 'paper.recipeLightSet.classic', baseFreq: 0.72, octaves: 4, gain: null, offset: null, blur: null, opacity: 0.3 },
  top: { labelKey: 'paper.recipeLightSet.top', baseFreq: 0.72, octaves: 4, gain: 1.2, offset: 0.05, blur: null, opacity: 0.35 }
}
const DARK_RECIPE_KEY = 'paper.darkRecipe'
const LIGHT_RECIPE_KEY = 'paper.lightRecipe'

// ── 移植：密度 / 标签栏 / 聊天背景 / 窗口透明 ────────────────────────
const DENSITY_KEY = 'hermes.desktop.sessionListDensity'
const DENSITY_OPTIONS = [
  { id: 'compact', labelKey: 'density.compact' },
  { id: 'comfortable', labelKey: 'density.comfortable' },
  { id: 'detailed', labelKey: 'density.detailed' }
]
const TABSTRIP_KEY = 'hermes.desktop.tabStripDefault'
const TABSTRIP_OPTIONS = [
  { id: 'auto', labelKey: 'tabstrip.auto' },
  { id: 'always', labelKey: 'tabstrip.always' },
  { id: 'never', labelKey: 'tabstrip.never' }
]
const BACKDROP_KEY = 'hermes.desktop.backdrop.v1'
// 消息气泡：官方 store/user-bubble-transparency.ts 的 subscribe 副作用等价实现——
// 根节点 CSS 变量 + 同键持久化。0=不透明(默认，移除变量)，v>0 保留 (100-v)% 填充。
const USER_BUBBLE_KEY = 'hermes.desktop.user-bubble-transparency.v1'

// ── 对话行为五件套（官方存储键，语义以官方源码为准）────────────────
// toolView.technical / reasoning.collapsedByDefault / composerPopout.gesturesEnabled
//   = boolean 键（'true'/'false'）；embed-mode = 'ask'|'always'|'off'（默认 ask）；
//   titlebarAppActions = 'left'|'right'（默认 right）。
const TOOL_VIEW_KEY = 'hermes.desktop.toolView.technical'
const REASONING_KEY = 'hermes.desktop.reasoning.collapsedByDefault'
const EMBED_MODE_KEY = 'hermes.desktop.embed-mode'
const POPOUT_KEY = 'hermes.desktop.composerPopout.gesturesEnabled'
const APP_ACTIONS_KEY = 'hermes.desktop.titlebarAppActions'

function readBoolKey(key, fallback) {
  try {
    const v = localStorage.getItem(key)
    return v === 'true' ? true : v === 'false' ? false : fallback
  } catch { return fallback }
}

function writeBoolKey(key, on) {
  try {
    localStorage.setItem(key, String(on))
    window.dispatchEvent(new StorageEvent('storage', { key }))
  } catch {}
}

function clampBubble(value) {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0
}

function applyUserBubble(value) {
  const v = clampBubble(value)
  try {
    if (v === 0) {
      document.documentElement.style.removeProperty('--user-bubble-keep')
      localStorage.removeItem(USER_BUBBLE_KEY)
    } else {
      document.documentElement.style.setProperty('--user-bubble-keep', (100 - v) + '%')
      localStorage.setItem(USER_BUBBLE_KEY, String(v))
    }
  } catch {}
}
const TRANSLUCENCY_KEY = 'hermes.desktop.translucency.v2'
const GLASS_MATERIALS = ['under-window', 'popover', 'titlebar', 'header']
const GLASS_SCOPES = ['window', 'sidebar']
const FROST_LABELS = { 'under-window': 'translucency.materials.under-window', popover: 'translucency.materials.popover', titlebar: 'translucency.materials.titlebar', header: 'translucency.materials.header' }
const SCOPE_LABELS = { window: 'translucency.scopes.window', sidebar: 'translucency.scopes.sidebar' }
const SLIDER_STYLE = {
  height: '4px',
  WebkitAppearance: 'none',
  background: 'var(--ui-stroke-tertiary)',
  borderRadius: '9999px',
  accentColor: 'var(--dt-primary)'
}

// 嵌套行：左标签定宽(内联样式，宿主CSS不编译插件的tailwind类) + 右控件吃满。
// 必须定义在模块顶层——放组件函数体内会每帧产生新函数引用，React 视为不同组件类型
// 而卸载重挂子树，拖动滑杆的原生手势会被打断（表现为拖不动）。
const ControlRow = ({ label, children }) =>
  jsxs('div', {
    className: 'flex items-center gap-2',
    children: [
      jsx('span', {
        style: { width: '52px', flexShrink: 0 },
        className: 'text-[0.625rem] leading-tight text-(--ui-text-quaternary)',
        children: label
      }),
      jsx('div', { className: 'min-w-0 flex-1', children })
    ]
  })

// 行为/设置行（工具调用显示/折叠推理/内嵌预览/悬浮输入框/应用操作/密度等共用）：
// 无图标无简介——单行标题 + 右侧定宽控件；stacked=en 纵向通栏。
// onEnter 由面板注入（hover→底部说明带联动）。
// 必须模块级定义——放组件体内每次渲染新引用，React 卸载重挂子树。
const BehaviorRow = ({ title, options, value, onChange, stacked, onEnter }) =>
  jsxs('div', {
    onMouseEnter: onEnter,
    className: stacked
      ? 'flex flex-col gap-1.5 rounded-md px-2 py-2 hover:bg-(--chrome-action-hover)'
      : 'flex items-center gap-2.5 rounded-md px-2 py-2 hover:bg-(--chrome-action-hover)',
    children: [
      jsx('div', {
        className: 'flex min-w-0 flex-1 items-center gap-2.5',
        children: jsx('div', { className: 'min-w-0 text-[0.75rem] leading-tight', children: title })
      }),
      jsx(SegmentedControl, {
        options,
        value,
        onChange,
        className: stacked ? 'w-full' : 'ml-auto',
        style: stacked ? undefined : { width: '150px', flexShrink: 0 }
      })
    ]
  })

const INTRO_OPTIONS = [
  { id: 'native', labelKey: 'intro.native' },
  { id: 'custom', labelKey: 'intro.custom' }
]

let ctxRef = null
let paperObserver = null

// ── 纸纹 ────────────────────────────────────────────────────────
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

// ── 字体 ────────────────────────────────────────────────────────
const FONT_SANS =
  '"LXGW WenKai", -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", emoji'
const FONT_MONO =
  '"LXGW WenKai Mono", Menlo, Monaco, "SF Mono", monospace, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", emoji'
// 只用本机已装的 LXGW WenKai；未安装则 CSS 回退到后面的系统字体栈。不走 CDN。

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
    // tooltip 的 chip 硬编码了 [font-family:Arial,sans-serif]（tooltip.tsx），不走变量继承，
    // 需用 data-slot 定位覆盖，否则提示文字永远系统字体。
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
  // 新两档语义：开关只控制显隐，不改变 introMode（native/custom 保持不变）。
  // false = 暂时隐藏注入层；true = 按 hub 当前档位恢复。
  introNativeLastWritten = value
  const current = ctxRef ? ctxRef.storage.get(INTRO_MODE_KEY, 'native') : 'native'
  if (value === 'false') {
    stopIntroObserver()
    introRestore()
    const style = document.getElementById(INTRO_STYLE_ID)
    if (style) style.remove()
  } else {
    applyIntroMode(current)
  }
  // 推送给面板的语义 = 最终开/关状态：官方页切关推 'off'（面板跟平到「关」），
  // 切开推当前档位（面板跟平到存档档位）
  introModeSubscribers.forEach((cb) => cb(value === 'false' ? 'off' : current))
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
  // 官方 atom 通道（优先）：直接驱动 $introSplash（官方订阅链：设置页 UI/React
  // 渲染/落盘全同步）。必须先记账再 set——atom.set 会经官方 persistBoolean 落盘
  // 触发 setItem 钩子，后记账会被误判为外部改动。
  const introAtom = officialStores && officialStores.introSplash
  if (introAtom) {
    try {
      introNativeLastWritten = mode === 'off' ? 'false' : 'true'
      introAtom.set(mode !== 'off')
      if (mode === 'custom') {
        const headline = ctxRef ? String(ctxRef.storage.get(INTRO_HEADLINE_KEY, '')).trim() : ''
        const tagline = ctxRef ? String(ctxRef.storage.get(INTRO_TAGLINE_KEY, '')).trim() : ''
        introWrite(headline, tagline)   // 当前已在渲染的 intro 立即替换
        startIntroObserver()            // 之后新渲染 / 被写回的交给 observer
      } else {
        stopIntroObserver()
        introRestore()
      }
      return
    } catch {
      // atom 调用失败 → 落入下方 CSS 兜底路径
    }
  }
  // ── 兜底路径（atom 未识别/抛错）：CSS 注入隐藏 + 程序化点击同步官方设置页 ──
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

  // 原生键落盘：原生/自定义 = 开；关闭 = 关。先记账再写键，避免钩子误判。
  introNativeLastWritten = mode === 'off' ? 'false' : 'true'
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
  { id: 'light', labelKey: 'theme.modeLight' },
  { id: 'dark', labelKey: 'theme.modeDark' },
  { id: 'system', labelKey: 'theme.modeSystem' }
]

function readThemeMode() {
  try {
    // 活跃 profile 键与官方 ThemeProvider 一致（hermes-desktop-active-profile-v1）；
    // 旧键 hermes-active-profile 在官方代码中不存在，曾导致多 profile 下模式误读 default 槽
    const profile = localStorage.getItem('hermes-desktop-active-profile-v1') || 'default'
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
    // 与 readThemeMode 同键，跟官方 ThemeProvider 的 Xt setter 对齐
    const profile = localStorage.getItem('hermes-desktop-active-profile-v1') || 'default'
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
    if (m1 && !officialStores.probed) {
      try {
        const mod = await import(/* @vite-ignore */ new URL('./' + m1[1], base).href)
        officialStores.probed = true   // 探测完整执行过一次才标记（fetch/import 失败保留下次重试机会）
        for (const k of Object.keys(mod)) {
          const v = mod[k]
          if (!v || typeof v.get !== 'function' || typeof v.set !== 'function') continue
          const cur = v.get()
          if (cur === 'compact' || cur === 'comfortable' || cur === 'detailed') {
            if (!officialStores.density) officialStores.density = v
            continue
          }
          // 字符串枚举 atom：值域互斥即身份（toolView/embedMode/appActions）。
          // tabStrip('auto'|'always'|'never') 不在此 chunk，无 'always' 撞值风险。
          if (cur === 'product' || cur === 'technical') { officialStores.toolViewMode ??= v; continue }
          if (cur === 'ask' || cur === 'always' || cur === 'off') { officialStores.embedMode ??= v; continue }
          if (cur === 'left' || cur === 'right') { officialStores.appActions ??= v; continue }
          // 收集 boolean atom（backdrop / intro-splash / reasoning / 命令面板开关等）
          if (typeof cur === 'boolean') {
            if (!foundBoolAtoms) foundBoolAtoms = []
            foundBoolAtoms.push(v)
          }
        }
        // ── boolean atom 全量翻转扫描：一次遍历认领 backdrop / intro-splash /
        // reasoning 三个带 persist 订阅的 atom（翻转引发目标键写入即命中），
        // 同时记录「翻转不引发任何 localStorage 写入」的 atom——
        // $composerPopoutGesturesEnabled 无 persist 订阅，翻转零写入，是唯一
        // 可靠区分特征（reactions/tips 等虽有订阅但写自己的键，计入写入）。
        // 探测期间临时隐藏开场标识 DOM 防闪烁，并抑制 setItem 钩子
        // （防止 intro-splash atom 被翻转时误移除自定义注入层）。
        const introEl = document.querySelector('[data-slot="aui_intro"]')
        const prevVis = introEl ? introEl.style.visibility : ''
        if (introEl) introEl.style.visibility = 'hidden'
        if (introUninstallHook) {
          introUninstallHook()
          introUninstallHook = null
        }
        if (foundBoolAtoms && foundBoolAtoms.length) {
          const snapshot = foundBoolAtoms.map(a => a.get())
          let writeCount = 0
          const flippedKeys = []
          const rawSI = Storage.prototype.setItem
          Storage.prototype.setItem = function (...args) { writeCount++; flippedKeys.push(String(args[0])); return rawSI.apply(this, args) }
          const zeroWrite = []
          const probeDetail = []
          const watchKeys = [
            ['backdrop', BACKDROP_KEY],
            ['introSplash', INTRO_NATIVE_KEY],
            ['reasoningCollapsed', REASONING_KEY]
          ]
          const baseline = Object.fromEntries(watchKeys.map(([, k]) => [k, localStorage.getItem(k)]))
          const nextFrame = () => new Promise((r) => setTimeout(r, 0))
          try {
            for (let bi = 0; bi < foundBoolAtoms.length; bi++) {
              const a = foundBoolAtoms[bi]
              const wroteBefore = writeCount
              a.set(!snapshot[bi])
              await nextFrame()   // 官方 persist 有 microtask/帧级节流，等它 flush 再读键
              const wroteKeys = flippedKeys.slice(wroteBefore)
              const wroteZero = wroteKeys.length === 0
              let hitKey = null
              for (const [name, k] of watchKeys) {
                const now = localStorage.getItem(k)
                if (now !== baseline[k]) {
                  baseline[k] = now        // 滚动基线：已被认领的 atom 不再干扰后续比对
                  if (!officialStores[name]) hitKey = name
                }
              }
              a.set(snapshot[bi])   // 还原（persist 随之写回原值）
              await nextFrame()     // 等还原的写盘也 flush，避免污染下一 atom 的比对
              probeDetail.push(snapshot[bi] + '|' + wroteKeys.join('+') + (hitKey ? '>' + hitKey : ''))
              if (hitKey) officialStores[hitKey] = a
              else if (wroteZero) zeroWrite.push(bi)
            }
          } finally {
            Storage.prototype.setItem = rawSI
          }
          // popout gestures：零写入候选 + 值匹配（键存在时对照键值，缺省 true）。
          // 仅唯一命中才认领；多义/零命中 = 放弃（面板退回 localStorage 直写，重启生效）
          if (!officialStores.popoutGestures) {
            let want = true
            try { const k = localStorage.getItem(POPOUT_KEY); if (k === 'false') want = false } catch {}
            const cands = zeroWrite.filter((i) => snapshot[i] === want)
            if (cands.length === 1) officialStores.popoutGestures = foundBoolAtoms[cands[0]]
            // 诊断：认领失败时打印候选构成，定位是零写入 atom 过多还是过少
            else console.error('[appearance-hub] popout claim failed: want=' + want +
              ' zeroWrite=[' + zeroWrite.join(',') + '] boolTotal=' + snapshot.length +
              ' detail=[' + probeDetail.join(' ;; ') + ']')
          }
          for (const key of ['backdrop', 'introSplash', 'reasoningCollapsed', 'popoutGestures']) {
            if (officialStores[key]) {
              if (!officialStores._recognized) officialStores._recognized = []
              officialStores._recognized.push(key)
            }
          }
          // 探针走 error 级——renderer console.info 不落盘，只有 error 可事后 grep
          console.error('[appearance-hub] probe done: string-atoms=[' +
            ['toolViewMode', 'embedMode', 'appActions'].filter((k) => officialStores[k]).join(',') +
            '] bool-atoms=[' + (officialStores._recognized || []).join(',') + ']')
        }
        // 恢复开场标识可见性 + 重装 setItem 钩子
        if (introEl) introEl.style.visibility = prevVis
        installIntroStorageHook()
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

// 明暗空槽镜像读取：当前模式槽没显式设置的字段，借用另一槽的显式值，
// 再回落 base、最后出厂默认。只影响读取/推送，不写回落盘数据（不污染官方设置页账本）。
// 解决「暗色调好参数、切回明亮却回落出厂默认（fade=1≈不透明）」的跟随体感问题。
function resolveBookField(book, field, dark) {
  const slot = book[dark ? 'dark' : 'light'] || {}
  const other = book[dark ? 'light' : 'dark'] || {}
  const base = book.base || {}
  const fallback = dark ? { intensity: 22, fade: 0, material: 'titlebar', scope: 'window' }
                        : { intensity: 66, fade: 1, material: 'header', scope: 'window' }
  return slot[field] ?? other[field] ?? base[field] ?? fallback[field]
}

function currentIntensity() {
  const dark = resolvedDark()
  const book = readTranslucencyBook()
  return resolveBookField(book, 'intensity', dark)
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
  // 实时驱动原生窗口透明效果（官方 IPC 通道）；取值走明暗空槽镜像
  const defaults = dark ? { intensity: 22, fade: 0, material: 'titlebar', scope: 'window' }
                        : { intensity: 66, fade: 1, material: 'header', scope: 'window' }
  try {
    window.hermesDesktop?.setTranslucency?.({
      mode: book.mode,
      intensity: resolveBookField(book, 'intensity', dark),
      fade: resolveBookField(book, 'fade', dark),
      material: resolveBookField(book, 'material', dark),
      scope: resolveBookField(book, 'scope', dark),
      glassSupported: true
    })
  } catch {}
}


// ── 主题（皮肤）───────────────────────────────────────────────────
// 与模式同款官方管道：skin 存 hermes-desktop-theme-v2（default）/ profile-themes record，
// 官方 storage 监听实时生效。列表 = 原生 BUILTIN_THEME_LIST（presets.ts）。
// ── Binshao 用户主题（Obsidian Primary 移植）──────────────────────
// 种子值由混合链反解生成（solve-seeds.mjs，正向验证 0 偏差）：官方 skin 消费端
// getBaseColors 走 resolveTheme → user themes 在解析链内，写 user-themes key 即生效。
// register 幂等注入 + 热更新：每次 register 重写（localStorage 被清自愈）。
const USER_THEME_KEY = 'hermes-desktop-user-themes-v1'
const BINSHAO_PATCH_ID = 'hub-binshao-patch'
const USER_THEMES = 
{
  "binshao": {
    "name": "binshao",
    "label": "Binshao",
    "description": "暖纸色系移植版，明暗双模式。",
    "colors": {
      "background": "#eee6db",
      "foreground": "#4f351c",
      "card": "#ecdecb",
      "cardForeground": "#4f351c",
      "muted": "#f2ece3",
      "mutedForeground": "#755d3e",
      "popover": "#d9c2a3",
      "popoverForeground": "#4f351c",
      "primary": "#a4896e",
      "primaryForeground": "#fcfaf8",
      "secondary": "#f2ece3",
      "secondaryForeground": "#4f351c",
      "accent": "#f1ede7",
      "accentForeground": "#4f351c",
      "border": "#e4d7c3",
      "input": "#d7c4a8",
      "ring": "#a4896e",
      "midground": "#a4896e",
      "midgroundForeground": "#fcfaf8",
      "composerRing": "#a4896e",
      "destructive": "#bf3f36",
      "destructiveForeground": "#fcfaf8",
      "sidebarBackground": "#ebe3d6",
      "sidebarBorder": "#cfb696",
      "userBubble": "#ecdecb",
      "userBubbleBorder": "#e4d7c3"
    },
    "darkColors": {
      "background": "#352b22",
      "foreground": "#f3e6d4",
      "card": "#644e35",
      "cardForeground": "#f3e6d4",
      "muted": "#2a231d",
      "mutedForeground": "#d2b48a",
      "popover": "#4f3f2d",
      "popoverForeground": "#f3e6d4",
      "primary": "#e0b56a",
      "primaryForeground": "#1c1814",
      "secondary": "#2a231d",
      "secondaryForeground": "#f3e6d4",
      "accent": "#ded1c2",
      "accentForeground": "#1c1814",
      "border": "#6b563d",
      "input": "#48392c",
      "ring": "#e0b56a",
      "midground": "#c9a06a",
      "midgroundForeground": "#1c1814",
      "composerRing": "#e0b56a",
      "destructive": "#e02f29",
      "destructiveForeground": "#f0e4d5",
      "sidebarBackground": "#1c1814",
      "sidebarBorder": "#9a8060",
      "userBubble": "#4f3f2d",
      "userBubbleBorder": "#6b563d"
    },
    "terminal": {
      "foreground": "#4f351c",
      "cursor": "#a4896e",
      "selectionBackground": "rgba(248, 197, 46, 0.2)",
      "black": "#432e14",
      "red": "#df453a",
      "green": "#3eb174",
      "yellow": "#ecb936",
      "blue": "#2a90cb",
      "magenta": "#9f72bb",
      "cyan": "#63a2bb",
      "white": "#fcfaf8",
      "brightBlack": "#b79d7b",
      "brightRed": "#d9746d",
      "brightGreen": "#8bc1a4",
      "brightYellow": "#e7c56f",
      "brightBlue": "#63a2bb",
      "brightMagenta": "#cba7dc",
      "brightCyan": "#63a2bb",
      "brightWhite": "#fcfaf8"
    },
    "darkTerminal": {
      "foreground": "#f3e6d4",
      "cursor": "#e0b56a",
      "selectionBackground": "rgba(249, 207, 81, 0.2)",
      "black": "#1f1a14",
      "red": "#f7685e",
      "green": "#2ea873",
      "yellow": "#e5aa1f",
      "blue": "#4db2d1",
      "magenta": "#6260c3",
      "cyan": "#6abfd2",
      "white": "#f0e4d5",
      "brightBlack": "#6b563d",
      "brightRed": "#fb8479",
      "brightGreen": "#4ec68e",
      "brightYellow": "#dfb64e",
      "brightBlue": "#6abfd2",
      "brightMagenta": "#8a87d9",
      "brightCyan": "#6abfd2",
      "brightWhite": "#f0e4d5"
    }
  }
}
// 层2配色补丁：选中黄/输入框底/行内代码（applyTheme 管道外的硬编码色），
// 作用域锁 [data-hermes-theme="binshao"]，不泄漏其他主题。
const BINSHAO_PATCH_CSS = `[data-hermes-theme="binshao"] {
  --ui-selection-background: rgba(248, 197, 46, 0.2);
  --ui-bg-input: #f8f5f1;
  --ui-inline-code-background: color-mix(in srgb, #5e544b 26%, transparent);
  --ui-inline-code-foreground: #4f351c;
}
[data-hermes-theme="binshao"].dark {
  --ui-selection-background: rgba(249, 207, 81, 0.2);
  --ui-bg-input: #302921;
  --ui-inline-code-background: color-mix(in srgb, #ffffff 7%, transparent);
  --ui-inline-code-foreground: rgba(255, 255, 255, 0.88);
}
`

function injectBinshaoTheme() {
  try {
    const raw = localStorage.getItem(USER_THEME_KEY)
    const record = raw ? JSON.parse(raw) : {}
    Object.assign(record, USER_THEMES)
    localStorage.setItem(USER_THEME_KEY, JSON.stringify(record))
  } catch {}
  document.getElementById(BINSHAO_PATCH_ID)?.remove()
  const style = document.createElement('style')
  style.id = BINSHAO_PATCH_ID
  style.textContent = BINSHAO_PATCH_CSS
  document.head.appendChild(style)
}

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
  { id: 'slate', label: 'Slate' },
  { id: 'binshao', label: 'Binshao' }
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
  // 响应式翻译器：locale 切换即重渲染（模块级 OPTIONS 的 labelKey 也在此统一取词）
  const t = usePluginI18n(ID)
  const label = (o) => (o.labelKey ? t(o.labelKey) : o.label)
  // setLocale/isSavingLocale 来自官方 I18nProvider（useI18n 即官方 context），语言三键走同一官方通道
  const { locale, setLocale: setNativeLocale, isSavingLocale } = useI18n()
  // en 纵向通栏开关：现全线统一「左标题右控件」横排（原 en 例外已废，
  // 分支保留——后续若要重调 en 布局，改这一行即可全局生效）
  const stackedLayout = false
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
  const [bubble, setBubbleState] = useState(() => {
    try { return clampBubble(localStorage.getItem(USER_BUBBLE_KEY) || 0) } catch { return 0 }
  })
  const changeBubble = (v) => {
    setBubbleState(v)
    applyUserBubble(v)
  }
  const [tabStrip, setTabStripState] = useState(() =>
    readSimpleKey(TABSTRIP_KEY, 'auto', ['auto', 'always', 'never']))
  const [backdrop, setBackdropState] = useState(() => readBackdrop())
  // ── 对话行为五件套：状态读官方键；写入 atom 优先、localStorage 直写兜底 ──
  const [toolViewMode, setToolViewModeState] = useState(() =>
    readBoolKey(TOOL_VIEW_KEY, false) ? 'technical' : 'product')
  const [reasoningCollapsed, setReasoningState] = useState(() => readBoolKey(REASONING_KEY, false))
  const [embedMode, setEmbedModeState] = useState(() =>
    readSimpleKey(EMBED_MODE_KEY, 'ask', ['ask', 'always', 'off']))
  const [popoutEnabled, setPopoutState] = useState(() => readBoolKey(POPOUT_KEY, true))
  const [appActionsSide, setAppActionsState] = useState(() =>
    readSimpleKey(APP_ACTIONS_KEY, 'right', ['left', 'right']))

  const changeToolViewMode = (id) => {
    setToolViewModeState(id)
    loadOfficialStores().then((s) => {
      if (s?.toolViewMode) s.toolViewMode.set(id)
      else writeBoolKey(TOOL_VIEW_KEY, id === 'technical')   // 直写 = 重启后生效
    })
    haptic('tap')
  }
  const changeReasoning = (on) => {
    setReasoningState(on)
    loadOfficialStores().then((s) => {
      if (s?.reasoningCollapsed) s.reasoningCollapsed.set(on)
      else writeBoolKey(REASONING_KEY, on)
    })
    haptic('tap')
  }
  const changeEmbedMode = (id) => {
    setEmbedModeState(id)
    loadOfficialStores().then((s) => {
      // embedMode 是 persistentAtom——set 即写穿官方键 + 全窗口即时生效
      if (s?.embedMode) s.embedMode.set(id)
      else writeSimpleKey(EMBED_MODE_KEY, id)
    })
    haptic('tap')
  }
  const changePopout = (on) => {
    setPopoutState(on)
    loadOfficialStores().then((s) => {
      // 官方导出函数三件事：atom set（即时）+ persistBoolean 落盘 + 关时清 zones。
      // hub 等价复刻取二：atom.set 即时生效（use-composer-popout 里
      // poppedOut && gesturesEnabled——关手势时浮框自动归位停靠）+ 同键直写落盘
      // （'true'/'false' 与官方 persistBoolean 同格式）。zone.poppedOut 存档不清，
      // 与官方的差异仅在「关了再开，浮框位置复活」——边缘场景，接受。
      if (s?.popoutGestures) s.popoutGestures.set(on)
      writeBoolKey(POPOUT_KEY, on)
    })
    haptic('tap')
  }
  const changeAppActions = (id) => {
    setAppActionsState(id)
    loadOfficialStores().then((s) => {
      if (s?.appActions) s.appActions.set(id)
      else writeSimpleKey(APP_ACTIONS_KEY, id)
    })
    haptic('tap')
  }
  const [translucencyMode, setTranslucencyModeState] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(TRANSLUCENCY_KEY) || 'null')
      return raw?.mode === 'glass' ? 'glass' : 'clear'
    } catch { return 'clear' }
  })
  const [intensity, setIntensityState] = useState(() => currentIntensity())
  const [fade, setFadeState] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(TRANSLUCENCY_KEY) || 'null')
      if (!raw) return resolvedDark() ? 0 : 1
      return resolveBookField(raw, 'fade', resolvedDark())
    } catch { return 0 }
  })
  const [glassMaterial, setGlassMaterialState] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(TRANSLUCENCY_KEY) || 'null')
      if (!raw) return resolvedDark() ? 'titlebar' : 'header'
      return resolveBookField(raw, 'material', resolvedDark())
    } catch { return 'titlebar' }
  })
  const [glassScope, setGlassScopeState] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(TRANSLUCENCY_KEY) || 'null')
      if (!raw) return 'window'
      return resolveBookField(raw, 'scope', resolvedDark())
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
  // 订阅回调里读最新档位用（避免闭包过期）
  const introModeRef = useRef(introMode)
  useEffect(() => { introModeRef.current = introMode }, [introMode])
  const [introHeadline, setIntroHeadline] = useState(() => ctxRef.storage.get(INTRO_HEADLINE_KEY, 'HERMES AGENT'))
  const [introTagline, setIntroTagline] = useState(() => ctxRef.storage.get(INTRO_TAGLINE_KEY, ''))

  // ── 底部说明带联动：悬停/聚焦任一设置行 → 150ms 防抖后换文案；离开定格最后一条；
  //    面板每次重开（组件重挂载）回占位。hovered 存 desc 键名，t() 缺键自动回退。
  const [hovered, setHovered] = useState(null)
  const hoverTimer = useRef(null)
  useEffect(() => () => clearTimeout(hoverTimer.current), [])
  const hover = (descKey) => {
    clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setHovered(descKey), 150)
  }

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
      setIntroOn(mode !== 'off')
      setIntroModeState(mode === 'off' ? introModeRef.current : mode)
      if (mode !== 'off') {
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
      // 必须补发 storage 事件：官方 atom 监听此键同步账本，漏发会让官方揣着旧账本，
      // 在下次明暗切换时用旧值覆盖刚设的参数（偶发失效根因）
      window.dispatchEvent(new StorageEvent('storage', { key: TRANSLUCENCY_KEY }))
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
    if (!on) {
      // 关 = 三态走 'off'：applyIntroMode 统一做 CSS 隐藏 + 落盘原生键 false +
      // 同步官方设置页开关，与用户手点官方页开关等效（即时生效）
      applyIntroMode('off')
    } else {
      // 开 = 按 Hub 存档档位恢复（native/custom）；恢复到 off 之外的档位
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

  // ── 面板结构（双栏改造）：原单列 children 原地转为区块列表，零转写、渲染不变 ──
  // ── 对齐总纲（设计宪法）──
  // 1. 右缘：全面板唯一基线 = 区块 px-2 的 8px；任何控件不得用 marginRight/内层 px 偏移离开此线
  // 2. 左缘两级：一级 = px-2 的 8px（图标/标题/展开项）；展开项与上方控件同宽通栏，不缩进
  // 3. 控件左缘三级：嵌套行 = ControlRow 结构（左标签内联定宽52px + gap-2，右栏flex-1）；
  //    定宽禁用 tailwind arbitrary 类——宿主Tailwind不为插件文件编译，w-[52px] 会静默失效
  // 1'. 四角同一基线：标题行/底部行也用 px-2，禁 px-1——全面板只有一条左右基线
  // 5'. 布局关键值禁依赖宿主编译的 tailwind 类（pr-3 曾未编译致双栏不对称、w-[52px] 曾未编译
  //     致 en 控件起点参差）；定宽/定距一律内联 style={{...}}
  const secChildren = [
      // 标题（右上角 = 主题三档切换：明亮/暗色/系统）
      jsxs('div', {
        className:
          'mb-1 flex items-center gap-2.5 border-b border-(--ui-stroke-secondary) px-2 pb-2',
        children: [
          jsx('span', {
            className:
              'flex size-7 shrink-0 items-center justify-center rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated)',
            children: jsx(icons.Palette, { className: 'size-3.5 text-(--ui-text-secondary)' })
          }),
          jsx('div', { className: 'min-w-0 flex-1 text-[0.75rem] leading-tight font-medium', children: t('theme.title') }),
          // 语言三键：包外层 div 挂 hover→说明带（SDK 组件不保证透传 DOM props）
          jsx('div', {
            style: { flexShrink: 0 },
            onMouseEnter: () => hover('language.desc'),
            children: jsx(SegmentedControl, {
              options: [
                { id: 'zh', label: '简' },
                { id: 'zh-hant', label: '繁' },
                { id: 'en', label: 'EN' }
              ],
              value: locale,
              onChange: (id) => { setNativeLocale(id); haptic('tap') },
              disabled: isSavingLocale,
              className: 'scale-90',
              'aria-label': t('language.title')
            })
          }),
          jsx('div', {
            style: { flexShrink: 0 },
            onMouseEnter: () => hover('theme.titleDesc'),
            children: jsx(SegmentedControl, {
              options: THEME_MODES.map((m) => ({ ...m, label: label(m) })),
              value: themeMode,
              onChange: setThemeMode,
              className: 'scale-90'
            })
          })
        ]
      }),
      // 主题（原生皮肤列表，平铺网格）
      jsxs('div', {
        onMouseEnter: () => hover('theme.gridDesc'),
        className: 'flex flex-col gap-1.5 rounded-md px-2 py-2 hover:bg-(--chrome-action-hover)',
        children: [
          jsx('div', { className: 'min-w-0 text-[0.75rem] leading-tight', children: t('theme.gridTitle') }),
          jsx(
            'div',
            {
              style: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '4px', padding: '0' },
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
      // 字体（关/开；无图标无简介，hover→说明带）
      jsx(BehaviorRow, {
        title: t('font.title'),
        options: [
          { id: 'off', label: t('intro.off') },
          { id: 'on', label: t('intro.on') }
        ],
        value: font ? 'on' : 'off',
        onChange: (id) => toggleFont(id === 'on'),
        stacked: stackedLayout,
        onEnter: () => hover('font.desc')
      }),

      // 纸纹（开关 + 配方同属一个悬浮高亮容器）
      jsxs('div', {
        onMouseEnter: () => hover('paper.desc'),
        className: 'flex flex-col gap-1 rounded-md px-2 py-2 hover:bg-(--chrome-action-hover)',
        children: [
          jsxs('div', {
            className: 'flex items-center gap-2.5',
            children: [
              jsx('div', { className: 'min-w-0 flex-1 text-[0.75rem] leading-tight', children: t('paper.title') }),
              jsx(SegmentedControl, {
                options: [
                  { id: 'off', label: t('intro.off') },
                  { id: 'on', label: t('intro.on') }
                ],
                value: paper ? 'on' : 'off',
                onChange: (id) => togglePaper(id === 'on'),
                style: { width: '150px', flexShrink: 0 },
                'aria-label': t('paper.title')
              })
            ]
          }),

          // 配方（明亮在上，暗色在下；从左到右由轻到重，默认极轻；纸纹关闭时禁用选择）
          // 官方 SegmentedControl 的 disabled 不屏蔽 hover 高亮（Chromium :hover
          // 对 disabled button 仍生效），且不透传 style——外层 div 掐指针感知兜底
          jsx('div', {
            style: { pointerEvents: paper ? undefined : 'none' },
            children: jsxs('div', {
              className: 'flex items-center gap-2',
              children: [
                jsx('span', {
                  className: 'shrink-0 text-[0.625rem] text-(--ui-text-quaternary)',
                  children: t('paper.recipeLight')
                }),
                jsx(SegmentedControl, {
                  options: Object.entries(LIGHT_RECIPES).map(([id, r]) => ({ id, label: t(r.labelKey) })),
                  value: lightRecipe,
                  onChange: setLightRecipe,
                  disabled: !paper,
                  className: 'min-w-0 flex-1'
                })
              ]
            })
          }),
          jsx('div', {
            style: { pointerEvents: paper ? undefined : 'none' },
            children: jsxs('div', {
              className: 'flex items-center gap-2',
              children: [
                jsx('span', {
                  className: 'shrink-0 text-[0.625rem] text-(--ui-text-quaternary)',
                  children: t('paper.recipeDark')
                }),
                jsx(SegmentedControl, {
                  options: Object.entries(DARK_RECIPES).map(([id, r]) => ({ id, label: t(r.labelKey) })),
                  value: darkRecipe,
                  onChange: setDarkRecipe,
                  disabled: !paper,
                  className: 'min-w-0 flex-1'
                })
              ]
            })
          })
        ]
      }),

      // 标签栏（BehaviorRow：单行标题+定宽控件；en 纵向通栏）
      jsx(BehaviorRow, {
        title: t('tabstrip.title'),
        options: TABSTRIP_OPTIONS.map((o) => ({ ...o, label: label(o) })),
        value: tabStrip,
        onChange: setTabStrip,
        stacked: stackedLayout,
        onEnter: () => hover('tabstrip.desc')
      }),

      // 会话列表密度（en 例外：官方全词控件约 209px，横排放不下 → 该行单独纵向换行）
      jsx(BehaviorRow, {
        title: t('density.title'),
        options: DENSITY_OPTIONS.map((o) => ({ ...o, label: label(o) })),
        value: density,
        onChange: setDensity,
        stacked: locale === 'en',
        onEnter: () => hover('density.desc')
      }),

      // 消息气泡（滑杆行无对应 BehaviorRow 形态，仅去图标+挂 hover）
      jsxs('div', {
        onMouseEnter: () => hover('bubble.desc'),
        className: stackedLayout
          ? 'flex flex-col gap-1.5 rounded-md px-2 py-2 hover:bg-(--chrome-action-hover)'
          : 'flex items-center gap-2.5 rounded-md px-2 py-2 hover:bg-(--chrome-action-hover)',
        children: [
          jsx('div', { className: 'min-w-0 flex-1 text-[0.75rem] leading-tight', children: t('bubble.title') }),
          jsxs('div', {
            className: 'flex min-w-0 items-center gap-2' + (stackedLayout ? '' : ' ml-auto'),
            children: [
              jsx('input', {
                type: 'range',
                min: 0,
                max: 100,
                step: 1,
                value: bubble,
                onChange: (e) => changeBubble(Number(e.target.value)),
                style: SLIDER_STYLE,
                className: stackedLayout ? 'min-w-0 w-full cursor-pointer' : 'min-w-0 flex-1 cursor-pointer',
                'aria-label': t('bubble.title')
              }),
              jsx('span', {
                style: { width: '32px', flexShrink: 0 },
                className: 'text-right text-[0.625rem] tabular-nums text-(--ui-text-tertiary)',
                children: bubble + '%'
              })
            ]
          })
        ]
      }),

      // 聊天背景
      jsx(BehaviorRow, {
        title: t('backdrop.title'),
        options: [
          { id: 'off', label: t('backdrop.off') },
          { id: 'on', label: t('backdrop.on') }
        ],
        value: backdrop ? 'on' : 'off',
        onChange: (id) => toggleBackdrop(id === 'on'),
        stacked: false,
        onEnter: () => hover('backdrop.desc')
      }),

      // 窗口透明（整块 hover 显示总说明；嵌套参数行不再单列文案）
      jsxs('div', {
        onMouseEnter: () => hover('translucency.desc'),
        className: 'flex flex-col gap-1.5 rounded-md px-2 py-2 hover:bg-(--chrome-action-hover)',
        children: [
          jsxs('div', {
            className: 'flex items-center gap-2.5',
            children: [
              jsx('div', { className: 'min-w-0 flex-1 text-[0.75rem] leading-tight', children: t('translucency.title') }),
              jsx(SegmentedControl, {
                options: [
                  { id: 'clear', label: t('translucency.clear') },
                  { id: 'glass', label: t('translucency.glass') }
                ],
                value: translucencyMode,
                onChange: changeTranslucencyMode,
                className: 'shrink-0'
              })
            ]
          }),
          jsx(ControlRow, {
            label: translucencyMode === 'glass' ? t('translucency.tint') : t('translucency.intensityLabel'),
            children: jsxs('div', {
              className: 'flex min-w-0 items-center gap-2',
              children: [
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
                  style: { width: '32px', flexShrink: 0 },
                  className: 'text-right text-[0.625rem] tabular-nums text-(--ui-text-tertiary)',
                  children: intensity + '%'
                })
              ]
            })
          }),
          translucencyMode === 'glass' &&
            jsxs('div', {
              className: 'flex flex-col gap-1',
              children: [
                jsx(ControlRow, {
                  label: t('translucency.fade'),
                  children: jsxs('div', {
                    className: 'flex min-w-0 items-center gap-2',
                    children: [
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
                        style: { width: '32px', flexShrink: 0 },
                        className: 'text-right text-[0.625rem] tabular-nums text-(--ui-text-tertiary)',
                        children: fade + '%'
                      })
                    ]
                  })
                }),
                jsx(ControlRow, {
                  label: t('translucency.materialTitle'),
                  children: jsx(SegmentedControl, {
                    options: GLASS_MATERIALS.map((m3) => ({ id: m3, label: t(FROST_LABELS[m3]) })),
                    value: glassMaterial,
                    onChange: setGlassMaterial,
                    className: 'w-full'
                  })
                }),
                jsx(ControlRow, {
                  label: t('translucency.scopeTitle'),
                  children: jsx(SegmentedControl, {
                    options: GLASS_SCOPES.map((s3) => ({ id: s3, label: t(SCOPE_LABELS[s3]) })),
                    value: glassScope,
                    onChange: setGlassScope,
                    className: 'w-full'
                  })
                })
              ]
            })
        ]
      }),

      // 开场标识（新会话空态字标 + 提示语）
      jsxs('div', {
        onMouseEnter: () => hover('intro.desc'),
        className: 'flex flex-col gap-1.5 rounded-md px-2 py-2 hover:bg-(--chrome-action-hover)',
        children: [
          jsxs('div', {
            className: 'flex items-center gap-2.5',
            children: [
              jsx('div', { className: 'min-w-0 flex-1 text-[0.75rem] leading-tight', children: t('intro.title') }),
              jsx(SegmentedControl, {
                options: [
                  { id: 'off', label: t('intro.off') },
                  { id: 'on', label: t('intro.on') }
                ],
                value: introOn ? 'on' : 'off',
                onChange: (id2) => toggleIntro(id2 === 'on'),
                className: 'ml-auto',
                style: { width: '150px', flexShrink: 0 }
              })
            ]
          }),
          // 展开区常驻：关 → 整块禁交互（同纸纹配方手法：外层掐指针感知灭 hover）；
          // 开+原生文案 → 仅输入区禁用；开+自定义 → 全部可用
          jsxs('div', {
            style: { pointerEvents: introOn ? undefined : 'none' },
            className: 'flex flex-col gap-1.5',
            children: [
              jsx(SegmentedControl, {
                options: INTRO_OPTIONS.map((o) => ({ ...o, label: label(o) })),
                value: introMode,
                onChange: setIntroMode,
                disabled: !introOn,
                className: 'w-full'
              }),
              jsxs('div', {
                // custom 子区独立掐指针：开+原生时也不可点，且不响应 hover
                style: { pointerEvents: introOn && introMode === 'custom' ? undefined : 'none' },
                className: 'flex flex-col gap-1.5',
                children: [
                  jsx(Input, {
                    value: introHeadline,
                    onChange: (e) => setIntroHeadline(e.target.value),
                    placeholder: t('intro.headlinePlaceholder'),
                    disabled: !introOn || introMode !== 'custom',
                    className: 'h-7 text-[0.6875rem]',
                    'aria-label': '自定义字标'
                  }),
                  jsx(Textarea, {
                    value: introTagline,
                    onChange: (e) => setIntroTagline(e.target.value),
                    placeholder: t('intro.taglinePlaceholder'),
                    disabled: !introOn || introMode !== 'custom',
                    // 固定高度、不给拖拽调大小（右下角 resize 手柄关闭）
                    style: { height: '3.5rem', resize: 'none' },
                    className: 'text-[0.6875rem]',
                    'aria-label': '自定义提示语'
                  })
                ]
              })
            ]
          })
        ]
      }),
      // ── 对话行为五件套（搬自官方设置页外观段，同键直驱官方状态）──
      jsx(BehaviorRow, {
        title: t('behavior.toolView'),
        options: [
          { id: 'product', label: t('behavior.product') },
          { id: 'technical', label: t('behavior.technical') }
        ],
        value: toolViewMode,
        onChange: changeToolViewMode,
        stacked: stackedLayout,
        onEnter: () => hover('behavior.toolViewDesc')
      }),
      jsx(BehaviorRow, {
        title: t('behavior.reasoning'),
        options: [
          { id: 'off', label: t('intro.off') },
          { id: 'on', label: t('intro.on') }
        ],
        value: reasoningCollapsed ? 'on' : 'off',
        onChange: (id) => changeReasoning(id === 'on'),
        stacked: stackedLayout,
        onEnter: () => hover('behavior.reasoningDesc')
      }),
      jsx(BehaviorRow, {
        title: t('behavior.embeds'),
        options: [
          { id: 'ask', label: t('behavior.ask') },
          { id: 'always', label: t('behavior.always') },
          { id: 'off', label: t('behavior.offEmbed') }
        ],
        value: embedMode,
        onChange: changeEmbedMode,
        stacked: stackedLayout,
        onEnter: () => hover('behavior.embedsDesc')
      }),
      jsx(BehaviorRow, {
        title: t('behavior.popout'),
        options: [
          { id: 'off', label: t('intro.off') },
          { id: 'on', label: t('intro.on') }
        ],
        value: popoutEnabled ? 'on' : 'off',
        onChange: (id) => changePopout(id === 'on'),
        stacked: stackedLayout,
        onEnter: () => hover('behavior.popoutDesc')
      }),
      jsx(BehaviorRow, {
        title: t('behavior.appActions'),
        options: [
          { id: 'left', label: t('behavior.left') },
          { id: 'right', label: t('behavior.right') }
        ],
        value: appActionsSide,
        onChange: changeAppActions,
        stacked: stackedLayout,
        onEnter: () => hover('behavior.appActionsDesc')
      }),

      // 底部说明带：左=悬停联动（空载显示占位 tip），右=界面缩放（悬停缩放条也联动）
      jsxs('div', {
        className: 'mt-1 flex items-center gap-2 border-t border-(--ui-stroke-secondary) px-2 pt-2',
        children: [
          jsx('div', {
            // 钉两行高：hover 换长/短文案时下方不跳；空载与联动同一容器
            style: { minHeight: '2.5rem', lineHeight: 1.25, display: 'flex', alignItems: 'center' },
            className: 'min-w-0 flex-1 text-[0.625rem] leading-tight text-(--ui-text-quaternary)',
            children: t(hovered || 'footer.tip')
          }),
          jsx('div', {
            // onMouseEnter 包外层 div——SDK 组件不保证透传未知 props 到 DOM
            style: { flexShrink: 0 },
            onMouseEnter: () => hover('zoom.desc'),
            children: jsx(SegmentedControl, {
              options: ZOOM_OPTIONS,
              value: zoom,
              onChange: setZoom,
              className: 'scale-90',
              'aria-label': t('zoom.title')
            })
          })
        ]
      })
    ]
  // 区块索引：0=标题 1=主题 2=字体 3=纸纹 4=标签栏 5=密度 6=消息气泡 7=聊天背景 8=窗口透明
  //          9=开场标识 10-14=行为五件套（工具/推理/内嵌/悬浮框/应用操作） 15=底部提示+缩放
  const [secTitle, secTheme, secFont, secPaper, secTabStrip, secDensity, secBubble, secBackdrop,
         secTranslucency, secIntro, secToolView, secReasoning, secEmbeds, secPopout,
         secAppActions, secFooter] = secChildren

  // 双栏（唯一布局）：标题通栏 + 左右两列 + 底部提示
  return jsxs('div', {
    className: 'flex flex-col p-3',
    style: { width: '42rem' },
    children: [
      secTitle,
      jsxs('div', {
        className: 'flex flex-row',
        children: [
          // 左列：主题 → 聊天背景 → 行为五件套 → 标签栏 → 密度（pr 内联——宿主未编译 .pr-3）
          jsxs('div', {
            className: 'flex min-w-0 flex-1 flex-col',
            style: { paddingRight: '12px' },
            children: [secTheme, secBackdrop,
                      secToolView, secReasoning, secEmbeds, secPopout, secAppActions,
                      secTabStrip, secDensity]
          }),
          // 右列：霞鹜文楷 → 纸纹模拟 → 开场标识 → 消息气泡 → 窗口透明（pl 内联，与左列对称）
          jsxs('div', {
            className: 'flex min-w-0 flex-1 flex-col border-l border-(--ui-stroke-secondary)',
            style: { paddingLeft: '12px' },
            children: [secFont, secPaper, secIntro, secBubble, secTranslucency]
          })
        ]
      }),
      secFooter
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

      // 插件级 i18n：注册 locale bundles，跟随 app 语言设置；卸载时随 disposer 摘除
      const disposeI18n = ctx.i18n.register(LOCALES)
      // 非响应式翻译器（register 时求值一次；语言切换后需重启更新状态栏文字）
      const ti18n = ctx.i18n.t

      // 按持久化状态初始化（默认开启，与原插件行为一致）
      if (ctx.storage.get(PAPER_KEY, true)) injectPaper()
      if (ctx.storage.get(FONT_KEY, true)) applyFont()
      // 消息气泡：兜插件重载场景，按官方键恢复 CSS 变量（官方 app 启动已自恢复，幂等）
      applyUserBubble((() => { try { return localStorage.getItem(USER_BUBBLE_KEY) || 0 } catch { return 0 } })())
      injectBinshaoTheme()
      // 开场标识：先与原生键对账，再按最终状态恢复注入；
      // 挂 setItem 钩子后，设置页开关改动即时推送过来（与缩放 onChanged 同款推送模型）
      try {
        const nativeVal = localStorage.getItem(INTRO_NATIVE_KEY)
        if (nativeVal != null) introNativeLastWritten = nativeVal
        // 'off' 不作为持久档位（开/关由原生键承载）：历史遗留的 off 存档还原为
        // native，native/custom 存档必须保留——否则 hub 关闭后重启，「开」无从恢复原档位
        if (ctx.storage.get(INTRO_MODE_KEY, 'native') === 'off') {
          ctx.storage.set(INTRO_MODE_KEY, 'native')
        }
      } catch {}
      applyIntroMode(
        (() => {
          try {
            if (localStorage.getItem(INTRO_NATIVE_KEY) === 'false') return 'off'
          } catch {}
          return ctx.storage.get(INTRO_MODE_KEY, 'native') === 'custom' ? 'custom' : 'native'
        })()
      )
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
        langObserver.disconnect()
        removePaper()
        removeFont()
        resetIntroOnDispose()
        if (typeof zoomUnsubscribeNative === 'function') zoomUnsubscribeNative()
        zoomUnsubscribeNative = null
        zoomSubscribers.clear()
        disposeI18n()
        ctxRef = null
      })

      if (!ctx.storage.get(WELCOME_KEY, false)) {
        ctx.storage.set(WELCOME_KEY, true)
        host.notify({ kind: 'info', message: ti18n('notify.ready') })
      }

      // 标准状态栏条目：variant:'menu' + menuContent = 核心 DropdownMenu 弹窗，
      // 与 gateway / 命令中心等核心工具同一渲染路径；toggleLabel 使其出现在
      // 状态栏右键菜单（可勾选显隐）。
      //
      // 冷启动 locale 竞态修复：register 在模块加载时同步执行，而 app 的
      // display.language 走异步 IPC（I18nProvider 初始恒为 en），此刻求值的
      // label/title/toggleLabel 会卡在英文。declarative data 不响应 locale 变化，
      // 故挂 MutationObserver 监听 <html lang>（I18nProvider 每次 setLocale 都会
      // 同步写它）：lang 变化即用同 id 重注册，registry 按 id 原子替换 + invalidate，
      // 按钮文字随之刷新。弹窗内容走 React hook 本就响应式，不受此影响。
      const statusbarData = () => ({
        id: 'hub',
        area: 'statusBar.right',
        order: 100,
        data: {
          id: 'hub',                                    // 必填：右键显隐按此 id 持久化，缺了会存成 null 被过滤
          variant: 'menu',                              // → 核心 DropdownMenu
          label: ti18n('statusbar.label'),
          icon: jsx(icons.Palette, { className: 'size-3.5' }),
          title: ti18n('statusbar.title'),
          menuAlign: 'end',
          menuContent: jsx(AppearancePanel, {}),
          menuClassName: 'w-auto border-(--ui-stroke-secondary) p-0',
          toggleLabel: ti18n('statusbar.toggleLabel')
        }
      })
      ctx.register(statusbarData())

      let lastStatusbarLang = document.documentElement.lang
      const langObserver = new MutationObserver(() => {
        const lang = document.documentElement.lang
        if (!lang || lang === lastStatusbarLang) return
        lastStatusbarLang = lang
        ctx.register(statusbarData())
      })
      langObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
    } catch (e) {
      host.notify({ kind: 'error', message: ti18n('notify.failed') + (e && e.message) })
    }
  }
}
