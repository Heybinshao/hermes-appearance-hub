# 维护者须知

这个仓库同时服务两种读者：**照 README 装插件的用户**，和**改这个插件的人（目前就是我本人）**。下面是改这个仓库时必须守的结构约束——它们不是风格偏好，是「违反了就真的会坏」的硬线。

## 仓库结构（不要改形状）

```
plugin.yaml          # Hermes 官方插件目录的准入清单（name / version / description 必填）
desktop/plugin.js    # 插件入口——唯一入口
README.md  LICENSE  assets/
```

- **入口只在 `desktop/plugin.js`，根目录不要再出现 `plugin.js`。**
  桌面端安装器（`findDesktopEntry`）**先认根目录**，而官方插件目录的准入校验（`hermes plugins validate` 的 loadable 检查）**只认 `desktop/plugin.js`**。两个文件并存 = 从 Git 安装的用户拿到根那份、目录用户拿到 `desktop/` 那份，两群用户跑不同代码，而且本地测试很可能看不出来。
- 插件是**零构建的单文件 ESM**：不引入构建步骤、不加运行时依赖、不拆多文件。

## 硬红线

1. **禁止 force-push、rebase 重写历史、删除已发布的 tag。**
   官方插件目录的条目钉的是**具体 commit**，且上线后仍会被校验该 commit 在仓库里可达。历史一旦被重写，不只是下一次条目更新会失败——**已经装了目录版的用户重装也会失败**（clone 之后 checkout 找不到那个 sha）。
2. **仓库必须保持 public。** 目录条目指向外部仓库，转私有或删除等于把它变成死链。
3. **插件不得自更新**（应用内「检查更新」、下载并替换自身文件、远程加载 `plugin.js`）。目录的信任模型就是死锁 SHA——更新只能由用户执行 `hermes plugins update <name>`。想要更新器就留在独立发行版里，别进这个仓库。
4. **测试/脚本里引用入口一律写 `desktop/plugin.js`**，不要写 `../plugin.js`。

## 改完怎么发版

1. 运行现场（`~/.hermes/desktop-plugins/<id>/plugin.js`）改好，热重载验证通过
2. **现场文件与仓库 `desktop/plugin.js` 必须逐字节一致**（用 `git hash-object` 对一下最稳，比看 size/mtime 硬）
3. 四处版本号对齐：**git tag** · **仓库 About** · **README 版本徽章** · **`plugin.yaml` 的 `version`**
4. tag → release（正文写清「新增 / 修复 / 变更」）→ push

> 官方插件目录里的版本**不会**自动跟上这个仓库。目录条目钉的是某个已评审的 commit——不提交 pin 更新 PR，目录用户就停在那一版。这是设计如此，不是故障。

## 提 issue / PR

欢迎提 issue 报 bug 或说需求：附上 `~/.hermes/logs/desktop.log` 里 `[appearance-hub]` 开头的行即可，不用截图也不用复现步骤。PR 请先开 issue 说清动机；改动请严格遵守上面的结构约束。
