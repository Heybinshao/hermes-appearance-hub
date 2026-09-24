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
import { haptic, host, icons, SegmentedControl, Input, Textarea, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, usePluginI18n, useI18n, useTheme, THEMES_AREA } from '@hermes/plugin-sdk'
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
    font: { title: 'LXGW Fonts', desc: 'UI font · latest action wins vs official chat font', yieldNote: 'LXGW takes over; edit the chat font in Settings to hand control back.' },
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
    notify: { ready: 'Appearance Hub ready — use the Appearance toggle in the status bar', failed: 'Appearance Hub injection failed: ' },
    gateNote: { unavailable: 'Requires a newer Hermes Desktop with the settings gateway — nothing is broken' }
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
    font: { title: '霞鹜文楷', desc: '界面字体 · 与官方聊天字体按最后操作优先', yieldNote: '霞鹜文楷已接管界面字体；在官方设置页改聊天字体即可切回。' },
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
    notify: { ready: '外观 Hub 已就绪 — 状态栏「外观」开关', failed: '外观 Hub 注入失败: ' },
    gateNote: { unavailable: '需搭载设置网关的新版桌面端 — 非故障' }
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
    font: { title: '霞鶩文楷', desc: '介面字型 · 與官方聊天字型按最後操作優先', yieldNote: '霞鶩文楷已接管介面字型；在官方設定頁改聊天字型即可切回。' },
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
    notify: { ready: '外觀 Hub 已就緒 — 狀態列「外觀」開關', failed: '外觀 Hub 注入失敗: ' },
    gateNote: { unavailable: '需搭載設置閘道的新版桌面端 — 非故障' }
  }
}

const ID = 'hermes-appearance-hub'
const PAPER_KEY = 'paper.enabled'
const FONT_KEY = 'font.enabled'
// 字体归属仲裁（最后动作胜）：'hub'=文楷接管（注入 sans），'official'=官方聊天字体在场。
// 仅在文楷开关开着时有意义；关=无注入，天然官方接管，不需要记。默认 hub=v3.0.0 前行为，老用户零打扰。
const FONT_WINNER_KEY = 'font.winner'
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

function clampBubble(value) {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0
}

function applyUserBubble(value) {
  const v = clampBubble(value)
  // v4：持久化走 settings 门（GK.bubble 在扩名单请求中，未入名单时静默=本会话生效）；
  // CSS 变量注入是裁决 (a) 许可的样式面，保留
  settingSet(GK.bubble, String(v))
  try {
    if (v === 0) {
      document.documentElement.style.removeProperty('--user-bubble-keep')
    } else {
      document.documentElement.style.setProperty('--user-bubble-keep', (100 - v) + '%')
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
const BehaviorRow = ({ title, options, value, onChange, stacked, onEnter, disabled }) =>
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
        disabled,
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

// ── v4 设置门桥接层 ──────────────────────────────────────────────
// 六键走官方 settings gateway（#116338：host.settings.get/set/subscribe，
// 白名单内、写即走官方 setter，persist 归官方）。host.settings 缺失=旧桌面端
// 或网关未合，行由 disabled 禁用（不再 localStorage 直写——目录审查裁决 (b)
// 判直写违规，兜底即回归线）。#116338 合并后 SDK 构建即解锁。
function settingsGateway() {
  const s = host && host.settings
  return s && typeof s.get === 'function' && typeof s.set === 'function' ? s : null
}

function settingGet(key, fallback) {
  const sg = settingsGateway()
  if (!sg) return fallback
  try {
    const v = sg.get(key)
    return v === undefined || v === null ? fallback : v
  } catch { return fallback }
}

function settingSet(key, value) {
  const sg = settingsGateway()
  if (!sg) return false
  try {
    sg.set(key, value)
    return true
  } catch { return false }
}

// 订阅官方值变化（面板高亮跟随）；网关缺席返回 noop disposer
function settingSubscribe(key, cb) {
  const sg = settingsGateway()
  if (!sg || typeof sg.subscribe !== 'function') return () => {}
  try { return sg.subscribe(key, cb) } catch { return () => {} }
}

// 网关对非白名单键同步抛 Unsupported desktop setting → 探测式判支持面：
// 门扩了名单，面板对应行自动解禁，无需再改插件代码
// v4 修：结果按 key 记忆——官方 bindingFor 对未入名单键是 throw（自带栈采集），
// 面板一次渲染 9 处探测会制造 4 次异常风暴（sample 栈 prepare_stack_trace 热点
// 实证）。名单是构建期静态表，会话内不会变，缓存安全。
const _hasGate = new Map()
function settingHas(key) {
  if (_hasGate.has(key)) return _hasGate.get(key)
  const sg = settingsGateway()
  let ok = false
  if (sg) {
    try { sg.get(key); ok = true } catch { ok = false }
  }
  _hasGate.set(key, ok)
  return ok
}

// 网关键名 ≠ localStorage 键名（#116338 白名单用短名），集中映射一份
const GK = {
  density: 'sessionListDensity',
  tabStrip: 'tabStripDefault',
  backdrop: 'backdrop.v1',
  intro: 'intro-splash.v1',
  reasoning: 'reasoning.collapsedByDefault',
  popout: 'composerPopout.gesturesEnabled',
  // 以下 4 键在 #116338 扩名单请求中（短名约定同上）；未入名单前
  // settingHas=false → 对应行为禁用态，名单一扩即自解锁
  toolView: 'toolView.technical',
  embedMode: 'embed-mode',
  appActions: 'titlebarAppActions',
  bubble: 'user-bubble-transparency.v1'
}

// ── 纸纹 ────────────────────────────────────────────────────────
// v4：纯 CSS 通道——占 html::before 伪元素（官方样式表核实无保留，z-index 顶格 +
// pointer-events:none 维持原覆盖语义）。配方进 CSS 自定义属性（--hub-paper-*），
// 切换明暗/改配方只 setProperty 三个变量，无 DOM 挂载、无 MutationObserver。
// ⚠ 待 T7 实测：官方窗口设了 backgroundStyle:fullscreen 毛玻璃材质（Electron NS
//   VisualEffectView 在 Web 内容背后），若纹理透出则成立；不透明则加 backdrop-filter 兜底。
const PAPER_STYLE_ID = ID + '-paper-style'

function paperStyleEl() {
  let style = document.getElementById(PAPER_STYLE_ID)
  if (!style) {
    style = document.createElement('style')
    style.id = PAPER_STYLE_ID
    document.head.appendChild(style)
  }
  return style
}

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
  // 明暗两套配方各写各的槽（CSS 选择器负责在模式翻转时选用，无需判断当前模式）
  if (!ctxRef) return
  const root = document.documentElement.style
  for (const [slot, recipes, storageKey] of [
    ['light', LIGHT_RECIPES, LIGHT_RECIPE_KEY],
    ['dark', DARK_RECIPES, DARK_RECIPE_KEY]
  ]) {
    const r = recipes[ctxRef.storage.get(storageKey, 'light')] || recipes.light
    root.setProperty('--hub-paper-' + slot + '-image', makeTexture(r.baseFreq, r.octaves, r.gain, r.offset, r.blur))
    root.setProperty('--hub-paper-' + slot + '-opacity', String(r.opacity))
  }
}

function injectPaper() {
  // 清理 nous-theme-kit 时代的历史残留（原纸纹插件同样处理）
  const oldLayer = document.getElementById('nous-paper-texture')
  if (oldLayer) oldLayer.remove()
  const oldStyle = document.getElementById('nous-paper-style')
  if (oldStyle) oldStyle.remove()

  const style = paperStyleEl()
  if (!style.textContent) {
    // 明暗双槽：官方翻转 html.dark / data-hermes-mode 时，伪元素按选择器自动换
    // 配方变量——无需任何 observer/重算（v4test 实测：单槽版切明暗要点一次才跟）
    style.textContent =
      'html::before{content:"";position:fixed;inset:0;' +
      'z-index:2147483647;pointer-events:none;' +
      'background-size:205px 205px;' +
      'background-image:var(--hub-paper-light-image,none);' +
      'opacity:var(--hub-paper-light-opacity,0);' +
      'mix-blend-mode:multiply;}' +
      'html.dark::before,html[data-hermes-mode=\"dark\"]::before{' +
      'background-image:var(--hub-paper-dark-image,none);' +
      'opacity:var(--hub-paper-dark-opacity,0);' +
      'mix-blend-mode:screen;}'
  }
  applyPaperMode()
}

function removePaper() {
  const style = document.getElementById(PAPER_STYLE_ID)
  if (style) style.remove()
  const root = document.documentElement.style
  for (const slot of ['light', 'dark']) {
    root.removeProperty('--hub-paper-' + slot + '-image')
    root.removeProperty('--hub-paper-' + slot + '-opacity')
  }
}

// ── 字体 ────────────────────────────────────────────────────────
const FONT_SANS =
  '"LXGW WenKai", -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", emoji'
const FONT_MONO =
  '"LXGW WenKai Mono", Menlo, Monaco, "SF Mono", monospace, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", emoji'
// 只用本机已装的 LXGW WenKai；未安装则 CSS 回退到后面的系统字体栈。不走 CDN。

// 官方聊天字体的「用户字体段」提取：applyTheme 把 config desktop.font_family 经
// quoteSingleFamily 写成 `'UserFont', <主题栈>` 注入 root.style inline（单引号开头）；
// 未设置时 inline=主题栈（双引号 `"Segoe WPC"…` 起头，无单引号段）。
// 只取单引号内那一段作为比对基准——主题切换会让主题栈部分变，但用户字体段不变，
// 据此区分「用户编辑聊天字体」与「applyTheme 重绘」，避免误夺 hub 所有权。
// 已知盲区：用户手填双引号完整 CSS stack 会读成空段（漏判为未设置）——power user
// 行为且方向是 hub 赢，符合其装插件意图，接受。
function officialUserFont() {
  try {
    const v = document.documentElement.style.getPropertyValue('--dt-font-sans')
    const m = /^\s*'((?:[^'\\]|\\.)*)'/.exec(v)
    return m ? m[1] : ''
  } catch { return '' }
}

// 上一次观测到的官方用户字体段（模块级真相，冷启动播种当前值）
let officialUserFontLast = null

function applyFont() {
  let style = document.getElementById(FONT_STYLE_ID)
  if (!style) {
    style = document.createElement('style')
    style.id = FONT_STYLE_ID
    document.head.appendChild(style)
  }
  // 字体归属=最后动作胜（font.winner）：
  //   hub      → 注入 sans（哪怕官方有值；用户最后点的是这里）
  //   official → 省略 sans，官方 inline 上屏；官方清空时 observer 会把 winner 拨回 hub
  // 默认 hub：等价 v3.0.0 前行为，老用户零打扰。mono/tooltip 恒随开关（官方链不碰）。
  const winner = ctxRef ? ctxRef.storage.get(FONT_WINNER_KEY, 'hub') : 'hub'
  const sansDecl = winner === 'hub' ? '--dt-font-sans:' + FONT_SANS + ' !important;' : ''
  style.textContent =
    ':root{' + sansDecl +
    '--dt-font-mono:' + FONT_MONO + ' !important;' +
    '--hub-ui-font:' + FONT_SANS + '}' +
    '[data-slot="tooltip-content"] > span{font-family:var(--hub-ui-font) !important}'
}

// 官方聊天字体编辑监听（常驻，register 挂、dispose 摘）：只认「用户字体段」变化——
// 非空出现/改值 = 官方被编辑 → winner=official 让位；
// 由非空变空 = 官方被清空 → winner=hub 恢复文楷；
// 段不变（仅主题栈随切主题重绘）→ 不动 winner，hub 的接管不被误夺。
// 冷启动：register 可能早于官方首绘，首次观测只播种基线不裁决（否则首绘被当成
// 编辑，误夺默认 hub 的所有权）；关态也持续维护基线，保证开关联动判定有参照。
let fontObserver = null
let officialFontSeeded = false
function watchOfficialChatFont() {
  if (fontObserver) return
  officialFontSeeded = false
  officialUserFontLast = null
  fontObserver = new MutationObserver(() => {
    const cur = officialUserFont()
    if (!officialFontSeeded) { officialUserFontLast = cur; officialFontSeeded = true; return }
    if (cur === officialUserFontLast) return
    const wasSet = officialUserFontLast !== ''
    officialUserFontLast = cur
    if (!ctxRef || !ctxRef.storage.get(FONT_KEY, false)) return
    if (cur !== '') {
      ctxRef.storage.set(FONT_WINNER_KEY, 'official')
      applyFont()
    } else if (wasSet) {
      // 官方清空 → 交还文楷（仅在开关开着时；否则本就没有注入）
      ctxRef.storage.set(FONT_WINNER_KEY, 'hub')
      applyFont()
    }
  })
  fontObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] })
}
function unwatchOfficialChatFont() {
  if (fontObserver) { fontObserver.disconnect(); fontObserver = null }
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
let introModeSubscribers = new Set()   // 面板订阅者（v3.3.0 起仅 register 初始化时推送一次对齐）

function writeIntroNative(value) {
  // v4 迁正门：intro-splash.v1 在官方网关白名单（src/sdk/settings.ts 核实），
  // setIntroSplash 直改 atom——设置页 useStore($introSplash) 实时跟平、
  // subscribe 自动落盘，无需再直写键/模拟点击开关（点击同步层已退役）。
  // 网关缺席（旧桌面端）回落直写原生键保功能。
  if (settingSet(GK.intro, value === 'true')) return
  try {
    localStorage.setItem(INTRO_NATIVE_KEY, value)
  } catch {
    // storage 不可用时静默跳过，注入层不受影响
  }
}

// ── 与原生设置页双向同步 ──────────────────────────────────────────
// v4 退役：原 findIntroSettingSwitch / readIntroSettingState / syncIntroSettingSwitch
// 三件套靠 DOM 查询官方设置页开关 + 程序化 click 对齐状态。intro-splash.v1 入
// 官方网关白名单后（src/sdk/settings.ts），writeIntroNative 走 setIntroSplash
// 直改 atom，设置页 useStore 实时跟平——点击模拟层整体移除（rule 8 也少一处
// DOM 触达）。

function unsubscribeIntroMode(cb) {
  introModeSubscribers.delete(cb)
}

// 面板实例订阅（弹窗开时加入）：v3.3.0 合规改造后无实时推送源，保留接口
// （register 初始化时可推送一次对齐；官方设置页的改动降级为重启后跟平）
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
  // v3.3.0：官方 atom 通道与 setItem 钩子已移除（规则 8 合规），唯一路径 =
  // CSS 注入即时显隐 + 原生键落盘（重启后一致）+ 程序化点击同步官方设置页。
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

  // 原生键落盘：原生/自定义 = 开；关闭 = 关（v4：走网关 setIntroSplash，
  // 官方设置页 atom 订阅实时跟平，原程序化点击对齐层已退役）
  writeIntroNative(mode === 'off' ? 'false' : 'true')
}

function resetIntroOnDispose() {
  introModeSubscribers.clear()
  stopIntroObserver()
  introRestore()
  const style = document.getElementById(INTRO_STYLE_ID)
  if (style) style.remove()
  // 禁用插件后恢复原生显示（v4：走网关，缺席时 writeIntroNative 内部回落直写）
  writeIntroNative('true')
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
// v4：模式/皮肤的读写统一走官方门（useTheme 的 mode/setMode、themeName/setTheme，
// per-profile 持久化由官方 ThemeProvider 负责）。此处只留面板选项的展示元数据。
const THEME_MODES = [
  { id: 'light', labelKey: 'theme.modeLight' },
  { id: 'dark', labelKey: 'theme.modeDark' },
  { id: 'system', labelKey: 'theme.modeSystem' }
]

function resolvedDark() {
  return document.documentElement.classList.contains('dark') ||
    document.documentElement.dataset.hermesMode === 'dark'
}

// v4：设置项六键迁 host.settings 网关（见顶部桥接层）；气泡/工具视图/嵌入/
// 标题栏按钮四键在扩名单请求中。translucency 账本与 intro 原生键仍直写，
// 属"无门功能收口刀"（等 typed bridge / intro hook 裁决），上架前统一处理。

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
const BINSHAO_PATCH_ID = 'hub-binshao-patch'
// v4：Binshao 主题不再写官方 user-themes 存储键（hijack 官方安装位），改走
// THEMES_AREA 注册贡献——贡献主题与已安装主题同级参与解析（官方
// contributedThemes() 做 isValidTheme 校验；内置名不可遮蔽、同名用户安装优先）。
// 面板主题网格随之改读 useTheme().availableThemes，不再维护硬编码清单。
const BINSHAO_THEME = {
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
};
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

function injectBinshaoPatchCss() {
  document.getElementById(BINSHAO_PATCH_ID)?.remove()
  const style = document.createElement('style')
  style.id = BINSHAO_PATCH_ID
  style.textContent = BINSHAO_PATCH_CSS
  document.head.appendChild(style)
}

// v4：皮肤清单/读写全部交给官方门（useTheme().availableThemes + setTheme），
// 硬编码清单与 theme-v2/profile-themes 键直写一并退役——官方安装的用户主题与
// THEMES_AREA 贡献主题（含 Binshao）自动出现在网格里。官方 availableThemes 的
// 内置序（nous-alt 第 6、slate/cyberpunk 互换）与 hub 旧网格序不同，用户拍板
// 保留旧序：已知 12 项按老序排前，其余（用户新装/其他贡献）维持官方序缀后。
const THEME_ORDER = ['nous', 'nous-alt', 'github', 'catppuccin', 'everforest',
  'solarized', 'midnight', 'ember', 'mono', 'cyberpunk', 'slate', 'binshao']
const themeRank = (n) => { const i = THEME_ORDER.indexOf(n); return i < 0 ? Infinity : i }
const sortedThemes = (list) => [...(list || [])].sort((a, b) => themeRank(a.name) - themeRank(b.name))



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
  // v4：主题模式/皮肤状态直读官方 ThemeProvider（useTheme 即官方 context，跨窗口/
  // 设置页改动由它自己的 storage 订阅驱动重渲染），不再自维 useState+storage 监听
  const { mode: themeMode, setMode: setNativeMode, themeName: theme, setTheme: setNativeTheme, availableThemes } = useTheme()
  const [paper, setPaper] = useState(() => ctxRef.storage.get(PAPER_KEY, true))
  const [darkRecipe, setDarkRecipeState] = useState(() => {
    const v = ctxRef.storage.get(DARK_RECIPE_KEY, 'light')
    return DARK_RECIPES[v] ? v : 'light'
  })
  const [lightRecipe, setLightRecipeState] = useState(() => {
    const v = ctxRef.storage.get(LIGHT_RECIPE_KEY, 'light')
    return LIGHT_RECIPES[v] ? v : 'light'
  })
  // v4：网关在场=六键全活；缺席（旧桌面端/网关未合）→ 设置行禁用
  const gateOk = settingsGateway() !== null
  const [density, setDensityState] = useState(() =>
    settingGet(GK.density, 'compact'))
  const [bubble, setBubbleState] = useState(() => clampBubble(settingGet(GK.bubble, 0)))
  const changeBubble = (v) => {
    setBubbleState(v)
    applyUserBubble(v)   // 持久化走门；未入名单时仅本会话生效
  }
  const [tabStrip, setTabStripState] = useState(() => settingGet(GK.tabStrip, 'auto'))
  const [backdrop, setBackdropState] = useState(() => settingGet(GK.backdrop, false))
  // ── 对话行为五件套：六键走网关；四键等扩名单（gateOk 时禁用，门落地即解禁）──
  const [toolViewMode, setToolViewModeState] = useState(() =>
    settingGet(GK.toolView, false) ? 'technical' : 'product')
  const [reasoningCollapsed, setReasoningState] = useState(() => settingGet(GK.reasoning, false))
  const [embedMode, setEmbedModeState] = useState(() => settingGet(GK.embedMode, 'ask'))
  const [popoutEnabled, setPopoutState] = useState(() => settingGet(GK.popout, true))
  const [appActionsSide, setAppActionsState] = useState(() => settingGet(GK.appActions, 'right'))

  // 网关订阅：官方设置页/其他窗口改动 → 面板高亮实时跟平
  useEffect(() => {
    if (!gateOk) return undefined
    const offs = [
      settingSubscribe(GK.density, setDensityState),
      settingSubscribe(GK.tabStrip, setTabStripState),
      settingSubscribe(GK.backdrop, setBackdropState),
      settingSubscribe(GK.reasoning, setReasoningState),
      settingSubscribe(GK.popout, setPopoutState)
    ]
    return () => offs.forEach((off) => { try { off && off() } catch {} })
  }, [gateOk])

  const changeToolViewMode = (id) => {
    if (!settingSet(GK.toolView, id === 'technical')) return
    setToolViewModeState(id)
    haptic('tap')
  }
  const changeReasoning = (on) => {
    if (!settingSet(GK.reasoning, on)) return
    setReasoningState(on)
    haptic('tap')
  }
  const changeEmbedMode = (id) => {
    if (!settingSet(GK.embedMode, id)) return
    setEmbedModeState(id)
    haptic('tap')
  }
  const changePopout = (on) => {
    if (!settingSet(GK.popout, on)) return
    setPopoutState(on)
    haptic('tap')
  }
  const changeAppActions = (id) => {
    if (!settingSet(GK.appActions, id)) return
    setAppActionsState(id)
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
  const [font, setFont] = useState(() => ctxRef.storage.get(FONT_KEY, false))
  const [zoom, setZoomState] = useState(() => '90')
  const [introOn, setIntroOn] = useState(() => {
    // v4：优先读网关 atom 真值（跨窗口/设置页实时一致），缺席回落直读键
    if (settingHas(GK.intro)) return settingGet(GK.intro, true) !== false
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
  // 禁用行悬停语义：门不可用 → 说明带显示「需新版桌面端·非故障」；可用 → 正常简介
  const gateHover = (key, descKey) => () => hover(settingHas(key) ? descKey : 'gateNote.unavailable')
  // 气泡滑杆行（非 BehaviorRow）的悬停也接门提示：不可用时显示 gateNote
  const bubbleHover = () => hover(settingHas(GK.bubble) ? 'bubble.desc' : 'gateNote.unavailable')

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

  const togglePaper = (next) => {
    setPaper(next)
    ctxRef.storage.set(PAPER_KEY, next)
    if (next) injectPaper()
    else removePaper()
    haptic('tap')
  }

  const setThemeMode = (mode) => {
    setNativeMode(mode)
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

  const setTheme = (id) => {
    setNativeTheme(id)
    haptic('tap')
  }

  const setDensity = (id) => {
    if (!settingSet(GK.density, id)) return
    setDensityState(id)
    haptic('tap')
  }

  const setTabStrip = (id) => {
    if (!settingSet(GK.tabStrip, id)) return
    setTabStripState(id)
    haptic('tap')
  }

  const toggleBackdrop = (on) => {
    if (!settingSet(GK.backdrop, on)) return
    setBackdropState(on)
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
    // 最后动作胜：点「开」= 无条件接管（哪怕官方聊天字体有值），通知一次说明
    // 让位关系；官方值从未被插件改写，点「关」或官方页再编辑都即时复位。
    setFont(next)
    ctxRef.storage.set(FONT_KEY, next)
    if (next) {
      ctxRef.storage.set(FONT_WINNER_KEY, 'hub')
      if (officialUserFont() !== '') {
        host.notify({ kind: 'info', message: ctxRef.i18n.t('font.yieldNote') })
      }
      applyFont()
    } else {
      removeFont()
    }
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
      // 主题（官方 availableThemes：内置 + 用户安装 + THEMES_AREA 贡献，平铺网格）
      jsxs('div', {
        onMouseEnter: () => hover('theme.gridDesc'),
        className: 'flex flex-col gap-1.5 rounded-md px-2 py-2 hover:bg-(--chrome-action-hover)',
        children: [
          jsx('div', { className: 'min-w-0 text-[0.75rem] leading-tight', children: t('theme.gridTitle') }),
          jsx(
            'div',
            {
              style: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '4px', padding: '0' },
              children: sortedThemes(availableThemes).map((th) =>
                jsx(
                  'button',
                  {
                    type: 'button',
                    onClick: () => setTheme(th.name),
                    className:
                      'rounded-md border px-1.5 py-1 text-[0.625rem] transition-colors ' +
                      (th.name === theme
                        ? 'border-(--ui-accent) bg-(--ui-control-active-background) font-medium text-(--ui-text-primary)'
                        : 'border-(--ui-stroke-secondary) text-(--ui-text-secondary) hover:bg-(--chrome-action-hover)'),
                    children: th.label
                  },
                  th.name
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
        disabled: !settingHas(GK.tabStrip),
        stacked: stackedLayout,
        onEnter: gateHover(GK.tabStrip, 'tabstrip.desc')
      }),

      // 会话列表密度（en 例外：官方全词控件约 209px，横排放不下 → 该行单独纵向换行）
      jsx(BehaviorRow, {
        title: t('density.title'),
        options: DENSITY_OPTIONS.map((o) => ({ ...o, label: label(o) })),
        value: density,
        onChange: setDensity,
        disabled: !settingHas(GK.density),
        stacked: locale === 'en',
        onEnter: gateHover(GK.density, 'density.desc')
      }),

      // 消息气泡（滑杆行无对应 BehaviorRow 形态，仅去图标+挂 hover）
      jsxs('div', {
        onMouseEnter: bubbleHover,
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
        disabled: !settingHas(GK.backdrop),
        stacked: false,
        onEnter: gateHover(GK.backdrop, 'backdrop.desc')
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
        disabled: !settingHas(GK.toolView),
        stacked: stackedLayout,
        onEnter: gateHover(GK.toolView, 'behavior.toolViewDesc')
      }),
      jsx(BehaviorRow, {
        title: t('behavior.reasoning'),
        options: [
          { id: 'off', label: t('intro.off') },
          { id: 'on', label: t('intro.on') }
        ],
        value: reasoningCollapsed ? 'on' : 'off',
        onChange: (id) => changeReasoning(id === 'on'),
        disabled: !settingHas(GK.reasoning),
        stacked: stackedLayout,
        onEnter: gateHover(GK.reasoning, 'behavior.reasoningDesc')
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
        disabled: !settingHas(GK.embedMode),
        stacked: stackedLayout,
        onEnter: gateHover(GK.embedMode, 'behavior.embedsDesc')
      }),
      jsx(BehaviorRow, {
        title: t('behavior.popout'),
        options: [
          { id: 'off', label: t('intro.off') },
          { id: 'on', label: t('intro.on') }
        ],
        value: popoutEnabled ? 'on' : 'off',
        onChange: (id) => changePopout(id === 'on'),
        disabled: !settingHas(GK.popout),
        stacked: stackedLayout,
        onEnter: gateHover(GK.popout, 'behavior.popoutDesc')
      }),
      jsx(BehaviorRow, {
        title: t('behavior.appActions'),
        options: [
          { id: 'left', label: t('behavior.left') },
          { id: 'right', label: t('behavior.right') }
        ],
        value: appActionsSide,
        onChange: changeAppActions,
        disabled: !settingHas(GK.appActions),
        stacked: stackedLayout,
        onEnter: gateHover(GK.appActions, 'behavior.appActionsDesc')
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
          // 左列：主题 → 聊天背景 → 悬浮输入框 → 折叠推理 → 应用操作 → 工具调用 → 内嵌预览 → 标签栏 → 密度
          jsxs('div', {
            className: 'flex min-w-0 flex-1 flex-col',
            style: { paddingRight: '12px' },
            children: [secTheme, secBackdrop, secPopout, secReasoning, secAppActions,
                      secToolView, secEmbeds, secTabStrip, secDensity]
          }),
          // 右列：消息气泡 → 窗口透明 → 霞鹜文楷 → 纸纹模拟 → 开场标识（pl 内联，与左列对称）
          jsxs('div', {
            className: 'flex min-w-0 flex-1 flex-col border-l border-(--ui-stroke-secondary)',
            style: { paddingLeft: '12px' },
            children: [secBubble, secTranslucency, secFont, secPaper, secIntro]
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
  description: '外观整合浮窗：双栏面板 · 悬停即见简介 · 12 主题/纸纹模拟/霞鹜文楷/窗口透明/开场标识/对话行为，状态栏一键设置。',
  register(ctx) {
    // v4 修：ti18n 声明在 try 外——catch 的 notify 也要能取词（原声明在 try 内，
    // register 早期抛错时错误通知自己 ReferenceError，测试首跑暴露）
    let ti18n = (k) => k
    try {
      ctxRef = ctx

      // 插件级 i18n：注册 locale bundles，跟随 app 语言设置；卸载时随 disposer 摘除
      const disposeI18n = ctx.i18n.register(LOCALES)
      // 非响应式翻译器（register 时求值一次；语言切换后需重启更新状态栏文字）
      // v4 修：声明提到 try 外——原声明在 try 内，catch 里的 notify 会 ReferenceError
      //（register 早期抛错时错误通知自己先崩，测试首跑暴露）
      ti18n = ctx.i18n.t

      // 按持久化状态初始化。纸纹默认开（原插件继承），字体默认关（v3.1：官方已有
      // 聊天字体自定义，一键策展不默认劫持；老用户存档不受影响，仅新装机默认翻转）
      if (ctx.storage.get(PAPER_KEY, true)) injectPaper()
      if (ctx.storage.get(FONT_KEY, false)) applyFont()
      // 官方聊天字体编辑监听常驻：开关开着时官方 inline 变化 → applyFont 让位/恢复
      watchOfficialChatFont()
      // 消息气泡：兜插件重载场景，按官方键恢复 CSS 变量（官方 app 启动已自恢复，幂等）
      applyUserBubble((() => { try { return localStorage.getItem(USER_BUBBLE_KEY) || 0 } catch { return 0 } })())
      // v4：Binshao 主题走 THEMES_AREA 注册贡献（官方 contributedThemes() 参与
      // resolveTheme 解析链，data 即 DesktopTheme 本体；卸载时贡献随插件 retire），
      // 取代 v3.x 直写官方 hermes-desktop-user-themes-v1 安装位。层2补丁仍走
      // style 注入（目录审查裁决 (a) 明文许可）。
      ctx.register({ id: 'theme-binshao', area: THEMES_AREA, data: BINSHAO_THEME })
      injectBinshaoPatchCss()
      // 开场标识：先与原生键对账，再按最终状态恢复注入
      // （v3.3.0：setItem 实时推送钩子已移除——官方设置页的改动重启后跟平）
      try {
        // 'off' 不作为持久档位（开/关由原生键承载）：历史遗留的 off 存档还原为
        // native，native/custom 存档必须保留——否则 hub 关闭后重启，「开」无从恢复原档位
        if (ctx.storage.get(INTRO_MODE_KEY, 'native') === 'off') {
          ctx.storage.set(INTRO_MODE_KEY, 'native')
        }
      } catch {}
      applyIntroMode(
        (() => {
          // v4：优先读网关 atom 真值，缺席回落直读键
          if (settingHas(GK.intro)) return settingGet(GK.intro, true) === false ? 'off' : (ctx.storage.get(INTRO_MODE_KEY, 'native') === 'custom' ? 'custom' : 'native')
          try {
            if (localStorage.getItem(INTRO_NATIVE_KEY) === 'false') return 'off'
          } catch {}
          return ctx.storage.get(INTRO_MODE_KEY, 'native') === 'custom' ? 'custom' : 'native'
        })()
      )
      // 界面缩放走原生机制（window.hermesDesktop.zoom）。
      // 挂模块级常驻监听：与弹窗开关无关，保证 Settings / View 菜单 / Cmd± 改缩放时
      // 反向同步（哪怕 hub 弹窗此刻没开，下次打开也已是最新值）。
      startNativeZoomWatch()

      // 卸载/重载时清理注入，不留残留
      ctx.onDispose(() => {
        langObserver.disconnect()
        removePaper()
        removeFont()
        unwatchOfficialChatFont()
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
