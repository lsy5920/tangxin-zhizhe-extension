# 糖心志者 5.8.0 发布验证记录

- 工作区：`C:\Users\SHIYI\Documents\SHIYI项目\糖心志者\tangxin-zhizhe-extension`
- 基线提交：`ca66ea183bc12108ab4495352128de57cad70a18`
- 发布版本：`5.8.0`
- 构建号：`2026-07-31-1755`
- 正式扩展 ID：`ddefadnhgebdclpkabeobjidjllkdkhm`
- 签名输入：`keys\txzz-extension.pem`（只验证身份，不记录私钥内容）

## 基线行为

命令：

```powershell
git rev-parse HEAD
git show HEAD:manifest.json | Select-String '"version"'
```

输出（退出状态 `0`）：

```text
ca66ea183bc12108ab4495352128de57cad70a18
  "version": "5.7.1",
```

## 修改后行为

命令：

```powershell
npm run release
```

关键原样输出（退出状态 `0`）：

```text
Test Files  38 passed (38)
Tests       140 passed (140)
[check-release] 通过：v5.8.0 / 2026-07-31-1755（打包前源码与待签清单一致）
[pack-crx] 版本 5.8.0
[pack-crx] 扩展 ID ddefadnhgebdclpkabeobjidjllkdkhm
[check-release] 通过：v5.8.0 / 2026-07-31-1755（签名清单 + CRX3 + ZIP 全文件一致性）
[pack-crx] 完成：releases/tangxin-zhizhe-latest.crx（791.3 KB）
[pack-crx] 完成：releases/tangxin-zhizhe-5.8.0.crx
[check-release] 通过：v5.8.0 / 2026-07-31-1755（签名清单 + CRX3 + ZIP 全文件一致性）
```

命令：

```powershell
Get-FileHash releases\tangxin-zhizhe-latest.crx -Algorithm SHA256
Get-FileHash releases\tangxin-zhizhe-5.8.0.crx -Algorithm SHA256
```

输出（两个命令退出状态均为 `0`）：

```text
F4E338A6886C49BF3B28BF30CAC4CB07FC300BAA56D84BE8411F901839D0B358
F4E338A6886C49BF3B28BF30CAC4CB07FC300BAA56D84BE8411F901839D0B358
```

- 两个 CRX 均为 `810332` 字节。
- `releases/latest.json` 的 `version/build/size/sha256` 与上述结果一致。
- CRX3 内嵌公钥、包签名、ZIP CRC32 和所有运行时文件均由完整门禁重新打开后核验。

## 真实浏览器已确认行为

Chrome Dev `152.0.7967.2` 通过 `chrome-devtools-mcp@1.6.0` 的 pipe 连接安装未打包扩展并验证：

- 首页载入 `107` 部片单且无横向溢出。
- `844×390` 详情主操作在可见区域内，主按钮底边 `316.35px < 390px`。
- 播放器默认暂停并建立真实媒体元素。
- 设置菜单由旧版正文 `24px` 塌陷修正为桌面正文 `362px`；菜单高度 `498.39px` 且完整位于桌面视口。
- 移动路由现在在切换影片/播放时归零共享主滚动区，防止播放器及菜单继承详情页滚动位置。
- 下载规划器、队列暂停/取消/删除与 OPFS 存储审计已在真实扩展环境通过；未再出现读取 `mode` 的异常。

MCP 结果与截图位于：`C:\Users\SHIYI\AppData\Local\Temp\txzz-cinema-580-mcp-visible-3`。

## 回滚验证

命令：

```powershell
& .\release-evidence\5.8.0\rollback.ps1
```

输出（退出状态 `0`，只做预检，不改变工作区）：

```text
ROLLBACK_CHECK_OK baseline=ca66ea183bc12108ab4495352128de57cad70a18 version=5.8.0
Run again with -Execute to reverse the source patch and restore the prior latest CRX.
EXIT_STATUS=0
```

需要实际回滚时执行：

```powershell
& .\release-evidence\5.8.0\rollback.ps1 -Execute
```

## 可验证角色

1. 修改后安装包：`releases\tangxin-zhizhe-5.8.0.crx`
2. 源码补丁：`release-evidence\5.8.0\source.patch.gz`，SHA-256 `5BBFE0C57FD3607536E0A63D814ED0051D0B098C4AA3F61DFC19FBDF89A8D3E2`
3. 验证记录：`release-evidence\5.8.0\verification.md`
4. 回滚脚本：`release-evidence\5.8.0\rollback.ps1`
