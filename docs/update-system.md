# 升级更新系统 v7

升级系统负责发现版本、验证发布身份、下载并校验安装包，以及把已验证文件提交给浏览器。扩展受浏览器安全边界限制，不能静默安装 CRX，因此系统会明确区分“检测完成”“已提交下载”和“用户已手动安装”。

## 用户状态矩阵

| 阶段 | 机器状态 | 用户反馈 | 恢复路径 |
| --- | --- | --- | --- |
| 未检测 | `idle` | 只显示本地版本和“检查更新” | 用户发起实时检测 |
| 检测中 | `checking` | 显示正在读取并验证多源签名清单 | 等待、超时后重试 |
| 缓存命中 | `cached` | 显示上次成功结果和缓存年龄 | 手动检测强制绕过缓存 |
| 已是最新 | `success/latest` | 显示本地、远程版本与构建 | 可重新检查或重新下载同版本 |
| 有新版本 | `success/available` | 显示版本差异、日志和下载入口 | 可稍后处理或明确忽略此版本 |
| 检测失败 | `error` | 显示签名、网络或清单错误 | 重试；不提供未经校验的主下载动作 |
| 完整校验中 | `validating` | 逐镜像下载完整 CRX3，并校验大小、哈希、身份和包签名 | 失败自动切换下一个固定镜像 |
| 已提交下载 | `submitted` | 显示浏览器下载编号，并明确仍需手动安装 | 到下载记录或扩展管理页完成安装 |
| 下载失败 | `failed` | 显示每个镜像的验证或提交错误 | 修复网络后重试 |

## 信任链

1. `update.json` 使用 schema 3。除 `signature` 本身外，版本、构建、更新日志、扩展 ID、安装包大小、SHA-256 和全部候选地址都会被规范化后签名。
2. 后台内置正式 RSA 公钥，只接受 `RSASSA-PKCS1-v1_5-SHA-256` 和固定公钥指纹。任意镜像可以缓存或转发清单，但无法伪造更高版本。
3. 清单和 CRX 地址都按完整的 owner、repo、branch、path 白名单匹配，不再仅凭“域名后缀看起来可信”放行。
4. 多个已通过签名的清单按 `version → build → 来源优先级` 选择最新结果，并保存已验证最高版本，拒绝后续签名清单回退。
5. 下载前重新取得实时签名清单。每个候选镜像只发起一次完整请求，同一份内存字节依次验证：

   - 文件长度与签名清单的 `packageSize` 完全一致；
   - SHA-256 与 `packageSha256` 完全一致；
   - CRX 魔数、CRX3 版本、签名头长度和头后的 ZIP 魔数正确；
   - CRX3 内嵌公钥、`crx_id` 与正式扩展 ID `ddefadnhgebdclpkabeobjidjllkdkhm` 一致；
   - CRX3 自身 RSA 签名有效。

6. 校验成功后，从这份已验证内存字节生成本地 `data:` 下载源，再调用 `chrome.downloads.download`。浏览器不会重新访问远程镜像，因此没有“探测时是安全文件、实际下载时被替换”的竞态窗口。
7. 没有通过签名的清单时拒绝下载；远程版本低于本地版本或构建时拒绝降级。

## 并发与持久化

- 自动缓存检测、用户实时检测和下载前“必须取得签名清单”使用不同任务契约，互不错误复用。
- 相同契约在 Service Worker 内去重，多个标签页不会同时制造重复请求。
- 升级状态统一通过串行写队列读改写，检测完成不会覆盖刚写入的 `dismissedId` 或下载状态。
- 忽略操作必须由用户明确触发，并按远程更新 ID 持久化；写入失败会反馈失败，不能伪装成功。
- 浏览器返回下载 ID 后，即使状态持久化失败，也立即返回该成功结果，绝不切换镜像重复创建下载任务。
- 自动检测仅缓存成功结果 15 分钟；失败结果不缓存，手动检测永远实时绕过。

## 签名清单关键字段

| 字段 | 含义 |
| --- | --- |
| `schema` | 固定为 `3` |
| `version` / `build` | 语义版本与精确构建号 |
| `extensionId` | 固定正式扩展 ID |
| `packageFormat` | 固定为 `crx` |
| `packageSize` | 完整 CRX 字节数 |
| `packageSha256` | 完整 CRX 的小写 SHA-256 |
| `downloadUrl` / `downloadCandidates` | 固定正式仓库路径的镜像列表 |
| `signature.algorithm` | `RSASSA-PKCS1-v1_5-SHA-256` |
| `signature.keyId` | 固定公钥 SHA-256 标识 |
| `signature.value` | 规范化清单正文的 Base64 RSA 签名 |

公开公钥元数据位于 `releases/signing-public-key.json`。私钥只允许存在于本机被 Git 忽略的 `keys/txzz-extension.pem`；私钥缺失时打包命令会直接失败，不会自动生成另一个扩展身份。

## 源码版本与已签名发布

开发源码允许先提升 `manifest.json`、`package.json`、前端常量和后台本地构建号，而 `update.json` 与 `releases/` 继续保留上一个已签名版本。`npm run check` 的源码门禁会分别校验两组数据：源码内部必须一致，现有签名清单自身也必须完整；它不会把未签名源码伪装成已经发布。

只有 `npm run release` 会要求源码版本、`update.json`、`latest.json` 和 CRX 完全一致，并使用固定私钥重新签名。当前源码与签名发布均为 `5.0.2 / 2026-07-27-1015`，继续使用 4.0.0 启用的固定私钥，扩展 ID 保持为 `ddefadnhgebdclpkabeobjidjllkdkhm`。

## 4.0.0 签名身份轮换

原 3.7.1 私钥已永久丢失，无法重新获得旧扩展 ID 的签名能力。经明确确认，4.0.0 生成并启用了新的 RSA 私钥；旧 ID `ghbbddahmhhmjknofkmdkcflbmplcace` 与新 ID `ddefadnhgebdclpkabeobjidjllkdkhm` 是两个不同的 Chrome 扩展身份，因此旧版不能验证新清单，也不能原位覆盖安装。迁移时应先记录服务地址等仅保存在旧扩展本地存储中的设置，再移除旧版并手动安装 4.0.0。云端 Supabase 账号数据不依赖浏览器扩展 ID，但本地偏好需要重新配置。

## 模块边界

- `background.js`：签名清单验证、多源比较、防回退、完整 CRX3 验证、状态串行写入和下载提交。
- `content.js`：发布真实检测/下载阶段，设置消息超时，转发明确的忽略与下载动作。
- `ui-src/app/update/helpers.ts`：把后台阶段归一为用户状态，不使用固定计时器伪造进度。
- `ui-src/app/update/UpdateProgress.tsx`：升级中心和更新弹层共用的阶段组件。
- `ui-src/app/update/UpdateCenter.tsx`：完整版本、缓存、镜像、验证结果、逐源错误和安装边界。
- `ui-src/app/update/UpdateModal.tsx`：新版本提醒与关键动作；关闭、稍后处理和忽略此版本语义分离。
- `scripts/release-config.mjs`：打包和发布门禁共用的正式身份、公开公钥与运行时文件清单。
- `scripts/pack-crx.mjs`：使用固定私钥打包 CRX3，计算大小/哈希并签署外置 `update.json`。
- `scripts/check-release.mjs`：源码模式分别校验开发版本与现有签名发布的一致性；完整模式验证两者已对齐，再验证清单签名、CRX3 包签名、ZIP 中央目录/CRC32，并逐字节核对 CRX 内全部运行时文件。

## 防止哈希自引用

`update.json` 包含 CRX 的哈希，因此不能再打进该 CRX，否则会形成“修改清单改变 CRX、改变 CRX 又必须修改清单”的自引用。当前发布清单和 Manifest 的 `web_accessible_resources` 都已移除 `update.json`；它只作为仓库根目录的外置签名发布元数据。

## 发布与验收

1. 完成源码、界面和文档修改。
2. 执行 `npm run release`；命令会先做类型检查和生产构建，再用固定私钥打包并签署清单。
3. 完整门禁解析 CRX2/CRX3（正式产物强制 CRX3），校验 CRX 签名与扩展 ID，解压 ZIP 并逐文件比对当前工作区。
4. 推送源码、`update.json`、`releases/latest.json`、公开公钥元数据和两个 CRX 文件。
5. 使用全新 Playwright Chromium 持久化上下文真实加载扩展，确认服务线程、正式 ID、内容脚本、更新检测、完整包下载和关键界面。

## 浏览器安装边界

- Kiwi 等支持 CRX 的浏览器可直接打开下载文件安装。
- 桌面 Chromium 可能拦截非商店 CRX；可在开发者模式加载解压目录。
- `submitted` 只表示已把验证后的文件交给浏览器下载，不代表浏览器已下载完成，更不代表新版本已经安装。
