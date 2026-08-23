# Hermes Appearance Hub

给 Hermes 桌面端用的**外观整合插件**：把「纸纹」和「全局字体」两个能力收进一个状态栏入口，一键开关，设置持久化。

- ✅ 无需构建、不改应用代码——单个 ESM 文件
- ✅ 状态栏「外观」按钮 → 浮窗开关，与核心状态栏工具同款交互
- ✅ 两个开关：**纸纹**（宣纸噪点层）+ **字体**（霞鹜文楷界面字体）
- ✅ **界面缩放**：直接驱动 Hermes 原生缩放（90–175% 六档），与 Settings → Appearance、View 菜单同一机制
- ✅ **开场标识**：新会话空态的字标与提示语三档切换（原生 / 自定义 / 关闭），自定义文字即时热更新，fit-text 自适应缩放照常工作
- ✅ 设置持久化（重启/热更新保留），插件卸载自动清理并还原原生文案，不留残留
- ✅ 状态栏右键菜单可勾选显隐入口

## 依赖字体

全局字体功能使用 **霞鹜文楷（LXGW WenKai）** 与 **霞鹜文楷 Mono（LXGW WenKai Mono）**：

- 字体仓库：[lxgw/LxgwWenKai](https://github.com/lxgw/LxgwWenKai)（MIT License，开源可商用）

> 字体需先在本机安装，未安装时自动回退系统字体。

## 安装

```bash
# 把插件目录复制到 Hermes 桌面插件目录
cp -r hermes-appearance-hub ~/.hermes/desktop-plugins/
```

然后 **Cmd+Q 完全退出 Hermes Desktop 再打开**（或 ⌘K → **Reload desktop plugins**）。

> 如果 Hermes 使用了非默认 profile，插件目录是 `~/.hermes/profiles/<name>/desktop-plugins/`。
> 不确定时在桌面端 Settings → Plugins 里查看插件目录路径。

## 界面预览

**状态栏右键菜单** —— 可勾选显示/隐藏「外观设置」入口：

![状态栏右键菜单显隐](assets/screenshot-context-menu.png)

**外观浮窗** —— 点击状态栏「外观」按钮弹出，所有开关即时生效：

![外观浮窗](assets/screenshot-panel.png)

**开场标识自定义示例** —— 新会话空态字标与提示语替换为自定义文案：

![开场标识自定义](assets/screenshot-intro-custom.png)

**浅色模式效果对比** —— 左：未启用（系统字体、无纸纹）；右：启用后（霞鹜文楷 + 宣纸纸纹）：

| 未启用 | 启用纸纹 + 字体 |
|---|---|
| ![浅色默认](assets/screenshot-light-before.png) | ![浅色启用](assets/screenshot-light-after.png) |

**暗色模式效果对比** —— 左：未启用（系统字体、无纸纹）；右：启用后（霞鹜文楷 + 宣纸纸纹）：

| 未启用 | 启用纸纹 + 字体 |
|---|---|
| ![暗色默认](assets/screenshot-dark-before.png) | ![暗色启用](assets/screenshot-dark-after.png) |

## 使用

1. 状态栏右侧出现「外观」按钮（调色盘图标）
2. 点击弹出浮窗，所有能力即时生效：
   - **纸纹**：宣纸噪点层，浅色=纸纤维暗纹，深色=柔和颗粒，随明暗主题自动切换
   - **字体**：界面字体统一为霞鹜文楷（`--dt-font-sans/mono` + `!important`，任何主题下生效）
   - **界面缩放**：六档按钮，直接驱动 Hermes 原生缩放，与设置/View 菜单同步
   - **开场标识**：三档切换——「原生」保持官方字标与随机提示语；「自定义」输入自己的字标与提示语（停手约半秒自动生效）；「关闭」隐藏新会话开场标识。切回原生或禁用插件会还原官方文案
3. 状态栏右键菜单 → 勾选「外观设置」可显示/隐藏入口

> **界面缩放** 四个档位（100/125/150/175%）直接调用 Hermes 原生缩放接口
> （`window.hermesDesktop.zoom`），与系统「设置 → 外观 → 界面缩放」、顶部 View 菜单、Cmd/Ctrl ±
> 共用同一套主进程缩放机制，最终值互相一致（都持久化到同一处）。
> **双向同步的成立条件**：Settings 页也处于打开状态时，任一处改动会实时回灌到对方。
> 若 Settings 处于关闭态时被改动（例如在 hub 里设了 175%），重开 Settings 不会自动刷新——
> 这是原生 Settings 页「挂载时挂监听、但不重拉当前值」的已知行为（View 菜单/Cmd± 在 Settings 关闭时触发同理），
> 在 Settings 内再点一次对应档位即可对齐。
> 注意：原生档位完整集为 90/100/110/125/150/175%，本插件只展示你常用的 100/125/150/175 四档；
> 若原生当前值不在四档内（如默认的 90%），四档按钮均不高亮，属正常表现。

## 卸载

删除插件目录 + 重启桌面端：

```bash
rm -rf ~/.hermes/desktop-plugins/hermes-appearance-hub
```

插件被禁用/删除时会自动移除注入的纸纹层与字体样式，不留残留。

## 原理简述

- **纸纹**：全屏 fixed 背景层（z-index 最大 + `pointer-events: none` 不挡点击），纹理 = SVG `feTurbulence` 噪点 data URI（无外部图片依赖）；浅色 `multiply`、深色 `screen`，`MutationObserver` 跟随明暗切换
- **字体**：注入 `:root { --dt-font-sans/--dt-font-mono: 'LXGW WenKai' !important }`，压过主题的 inline 字体设置
- **开场标识**：定位原生开关的 localStorage 键（`hermes.desktop.intro-splash.v1`）做落盘同步；自定义文字用 `MutationObserver` 直接替换 `[data-slot="aui_intro"]` 内 fit-text 叶子 span 的文本——不碰应用代码，React 重渲染写回也会被重新替换；禁用时移除注入并还原原文案

## License

MIT
