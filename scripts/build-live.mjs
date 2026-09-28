#!/usr/bin/env node
// 仓库 → 运行现场：单向同步 desktop/plugin.js，并把现场独有的 LIVE-ONLY 段插回去。
//
// 为什么需要这个脚本（不要原地手改现场）
//   运行现场带着仓库里没有的段落（当前：composer 输入框字体覆盖，绕官方
//   :lang(zh) 语言分支把 --dt-font-sans 挤到 fallback 末尾的 bug）。直接 cp
//   仓库文件会把那段抹掉 → 输入框字体失效；而原地手改现场会让仓库与现场
//   双向分叉，越迭代越乱。正确姿势永远是：读仓库版 → 脚本化插入 LIVE-ONLY
//   段 → 写现场，三步各带 assert，锚点不匹配就中止、不写半个文件。
//
// 用法
//   node scripts/build-live.mjs                     # 用默认路径
//   node scripts/build-live.mjs <仓库plugin.js> <现场plugin.js>
//
// 依赖：仅 Node 内置模块（无 npm 依赖）。
//
// 硬门禁：写盘后必过 node --check。现场文件语法坏掉的后果不是局部降级，
// 是宿主整插件加载失败、状态栏入口直接消失（已踩过一次：LIVE-ONLY 段从
// 拼接中间搬到末尾后，多余的逗号让整个文件语法不通过）。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '..')

const REPO = process.argv[2] || path.join(REPO_ROOT, 'desktop', 'plugin.js')
const LIVE = process.argv[3] || path.join(
  process.env.HOME || os.homedir(), '.hermes', 'desktop-plugins', 'hermes-appearance-hub', 'plugin.js'
)

function must(cond, msg) {
  if (!cond) {
    console.error('✗ 中止（未写半个文件）: ' + msg)
    process.exit(1)
  }
}

must(fs.existsSync(REPO), '找不到仓库文件: ' + REPO)
must(fs.existsSync(LIVE), '找不到运行现场: ' + LIVE + '\n  现场目录由宿主创建；若路径变了请显式传第二个参数')

let src = fs.readFileSync(REPO, 'utf8')

// ── LIVE-ONLY 段 1：composer 输入框字体覆盖 ──────────────────────────
// 官方 dist CSS 带 [data-slot=composer-rich-input]:lang(zh){font-family:
// "PingFang SC",…,var(--dt-font-sans)} —— 系统字体先接住中文字形，用户变量
// 排最后兜底，改了也不上屏（输入框里字体开关不生效的根因）。给变量加
// !important 赢不了栈内 fallback 次序，只能补一条针对该 slot 的
// font-family 覆盖；官方那条特异性 (0,2,0) 高于 body，故覆盖自带
// !important。跟随 winner 让位：winner=official 时不注入，官方设置的自定义
// 聊天字体照常上屏。
// 退役条件：官方修好 :lang() 分支后删掉本段（现场与仓库同时删）。
const ANCHOR_1 = "  const sansDecl = winner === 'hub' ? '--dt-font-sans:' + FONT_SANS + ' !important;' : ''\n"
const LIVE_1 = `  // LIVE-ONLY（未进仓库；官方修好 :lang() 分支即退役）——composer 输入框字体覆盖
  const composerDecl = winner === 'hub'
    ? '[data-slot="composer-rich-input"]{font-family:var(--hub-ui-font) !important}'
    : ''
`
const ANCHOR_1B = `    '[data-slot="tooltip-content"] > span{font-family:var(--hub-ui-font) !important}'
}`
// 末尾不能带逗号：仓库原文里这行位于字符串拼接的【中间】，逗号合法；搬到最后
// 一行后它是赋值表达式的结尾，多余逗号 = 整个文件语法不通过（已踩）。
const LIVE_1B = `    '[data-slot="tooltip-content"] > span{font-family:var(--hub-ui-font) !important}' +
    composerDecl
}`

// 插入前的形状检查：锚点必须在位且唯一，且不能已经插过
must(src.split(ANCHOR_1).length === 2, 'sansDecl 锚点不唯一或缺失——仓库文件结构变了，先核对这个锚点')
must(src.includes(ANCHOR_1B), 'tooltip 锚点缺失——仓库文件结构变了，先核对这个锚点')
must(!src.includes('composerDecl'), '仓库文件里已有 composerDecl（重复插入保护触发，确认是不是 LIVE-ONLY 段该退役了）')

src = src.replace(ANCHOR_1, ANCHOR_1 + LIVE_1)
must(src.includes(ANCHOR_1B), 'tooltip 锚点缺失（插入声明后）')
src = src.replace(ANCHOR_1B, LIVE_1B)

fs.writeFileSync(LIVE, src)

// ── 写盘后对账 ──────────────────────────────────────────────────────
const check = fs.readFileSync(LIVE, 'utf8')
must(check.includes('composerDecl'), 'LIVE-ONLY 段未落盘')
must((check.match(/composerDecl/g) || []).length === 2, 'composerDecl 出现次数异常（期望 2：声明 + 拼接）')
// 语法门禁：现场语法坏 = 整插件加载失败，不可跳过
const tmp = path.join(os.tmpdir(), 'hub-live-check-' + process.pid + '.mjs')
fs.writeFileSync(tmp, check.split('\n').filter((l) => !/^import /.test(l)).join('\n'))
try {
  execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' })
} catch (e) {
  console.error('✗ 中止：生成结果语法不通过，现场已写入但不可用，请从备份恢复')
  console.error(String(e.stderr || e.message).split('\n').slice(0, 6).join('\n'))
  process.exit(1)
} finally {
  try { fs.unlinkSync(tmp) } catch {}
}

console.log('✓ 已生成运行现场')
console.log('  仓库源: ' + REPO)
console.log('  现场:   ' + LIVE)
console.log('  LIVE-ONLY 段计数: ' + (check.match(/LIVE-ONLY（未进仓库/g) || []).length)
console.log('  行数: ' + check.split('\n').length)
console.log('\n提示：磁盘插件 5s 热加载，重开浮窗即可生效（改桌面端自身才需要 ⌘Q）。')
