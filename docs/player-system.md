# 沉浸糖果影院播放系统 5.1

本文档描述扩展 5.1.0 的播放架构、Vlog 当前卡片锁定、状态边界、线路策略、播放模式、持久化规则和验收标准。页面只负责展示统一 ViewModel，不直接持有 ArtPlayer、Hls、计时器或购买流程。

## 端到端边界

1. `page_context_core.js` 交叉核对活动 DOM、播放器 ID、Vue `isActive` 与 Swiper 索引；`content.js` 只在上下文锁定后向后台发送 `createPlaybackSession`。
2. `background.js` 为每次请求生成 `requestId`，远程模式只调用 Worker `POST /v2/playback/session`；本地模式使用同等五态购买账本。
3. Worker 返回统一 `session`，其中包含影片、线路、推荐决策、账号摘要、获取方式、缓存时间和过期时间。
4. `screening` 状态保存当前会话、历史和请求步骤；旧 `fullDetails` 首次升级时只迁移一次。
5. React 页面把会话交给 `usePlaybackController`，媒体事件再通过单 reducer 生成界面状态。

## 模块边界

| 模块 | 职责 |
| --- | --- |
| `playback/types.ts` | v2 会话、线路、状态机和操作类型 |
| `page_context_core.js` | Vlog 活动卡片证据合并、稳定 ID 与换片代次 |
| `playback/sessionReducer.ts` | 唯一播放状态机与过期代次隔离 |
| `playback/sourcePolicy.ts` | 线路淘汰、评分、推荐和单次自动切线 |
| `playback/mediaKernel.ts` | ArtPlayer/hls.js 适配器；提供加载、播放、暂停、定位、清晰度和销毁 |
| `playback/usePlaybackController.ts` | 会话编排、8 秒起播保护、HLS 恢复、Wake Lock、Media Session 和续播写入 |
| `playback/useFullscreenController.ts` | 浏览器全屏、沉浸兜底、方向锁和退出清理 |
| `playback/preferences.ts` | 音量、倍速、亮度、填充、比例、方向和快进步长 |
| `playback/resumeStore.ts` | 30 天断点续播规则 |
| `playback/migration.ts` | 旧 `fullDetails` 到 `screening.history` 的一次性转换 |
| `components/screening/*` | 主舞台、影片侧栏和片源/下载/足迹抽屉 |

## 会话状态机

正常状态流为：

```text
idle → resolving → ready → loading → paused → playing
                                  ↘ buffering ↔ playing
                                  ↘ switching → paused/playing
                                  ↘ ended
                                  ↘ error
```

- 每次会话创建新的 `generation`。`RESET` 先建立代次边界，同代次的 `SESSION_READY` 和媒体事件才可更新状态。
- MediaKernel 的事件回调捕获创建内核时的代次；旧 HLS、video、全屏和计时器回调不能借用新代次。每次装载最多发布一次 `ready`，装载异常统一进入 reducer。
- 任意时刻最多一个 ArtPlayer 和一个 Hls 实例。加载新会话前先销毁旧内核；切线在同一内核适配器内重建媒体实例。
- 控制器分别比较会话身份、媒体 URL 指纹和健康元数据修订：同会话新 URL 保留进度与暂停状态后重载，同 URL 只更新元数据。
- 资源 `ready` 后固定进入暂停态，只有用户点击「开映」、控制栏、空格/K 或 Media Session 播放动作才调用 `play()`。

## 线路策略

- URL 为空或服务端明确标记失败的线路直接淘汰；健康线路优先，同分时主线路优先。
- Worker 在返回会话前并行探测主备 HLS；主清单没有 `EXTINF` 时继续解析最多四个变体清单。两条可用线路覆盖时长的差值同时超过 90 秒和短线路的 8% 时，优先选择较长线路，避免短预览线凭低延迟或主线身份覆盖完整版；阈值是相对规则，不依赖某个视频的固定时长。
- 扩展本地账号模式复用相同探测与相对时长规则；旧缓存若已记录主备时长，会在加载时自动纠正推荐线路。无扩展名地址使用有限 Range 探测，明确的大型 MP4 不会被完整下载。
- 用户首次播放后启动 8 秒起播保护；超过 8 秒仍未进入 `playing` 时尝试下一条未自动尝试的线路。
- HLS 30 秒内累计 3 次致命错误时切线。网络恢复与媒体恢复按线路分别各尝试一次；恢复后 4 秒仍未播放则切线。
- 稳定播放 10 秒会清空致命错误和恢复使用标记。
- 每条线路每个会话只允许自动尝试一次，`attemptedSourceIds` 阻止主备反复跳转；没有候选时进入明确错误态。
- 切线保留当前时间、暂停/播放状态、音量、静音、倍速和画面填充模式。用户暂停时发生自动切线，备用线仍保持暂停。

## Vlog 当前卡片锁定

- 活动 DOM、播放器绑定 ID、Vue `isActive` 与 Swiper 当前索引共同投票；`playerInfo` 只有在与高置信证据一致时才可补充标题等信息。
- 旧 ID → 空值 → 新 ID 的空窗只进入 `transitioning`，保留最后一个稳定非空 ID，但不会把空值当成旧请求的通配符。
- 每次稳定换片递增页面代次；旧代次的 Worker 响应、原生播放器回填、下载和复制动作都不得写入当前卡片。
- 网站播放器、插件播放器、复制链接和下载统一消费 `session.decision.recommendedSourceId`。电影票 HUD 显示编号、标题、推荐线路、探测时长和锁定状态，并提供“重新同步当前卡片”。

## 省流 / 均衡 / 高清模式

- `balanced` 为默认：启用 ABR，并按播放器尺寸限制不必要的超高分辨率。
- `data-saver`：限制到 720P 与约 2.5 Mbps；用户主动选择始终优先于 Network Information API。
- `quality`：允许设备支持的最高档，但缓冲不足 5 秒时仍可自动降档，质量面板会展示线路、码率、缓冲量和降档原因。
- 模式按设备持久化，切线、全屏、同会话 URL 更新和断点续播不会重置。

## 续播与偏好

- 续播记录按 `movieId` 存储，每 5 秒以及暂停、页面隐藏时写入。
- 当前时间小于 15 秒、距结尾不足 30 秒、总时长无效或记录超过 30 天时不恢复。
- 音量、静音、倍速、亮度、填充、比例、方向和快进步长独立持久化；偏好变化不销毁当前媒体内核。
- Wake Lock 的异步取得结果会复核会话代次；若播放器已暂停、结束或销毁，迟到的锁会立即释放。

## 功能矩阵

| 领域 | 能力 | 失败或降级 |
| --- | --- | --- |
| 播放 | 播放/暂停、进度拖动、快进退、倍速、音量 | 无 URL 禁用；播放异常进入恢复/切线状态 |
| 画面 | 亮度、清晰度、比例、方向、原比例/裁满/铺满 | 亮度使用独立遮罩，不向 video 添加 filter |
| 工具 | 截图、画中画、复制、打开、下载、诊断 | 浏览器拒绝工具能力时不误报为媒体错误 |
| 输入 | 键盘、触摸横滑/竖滑、三区双击、长按、桌面右键 | 锁屏后停止画面手势，只保留解锁入口 |
| 系统 | Wake Lock、Media Session、三档播放模式 | 平台不支持或拒绝时静默降级；用户模式优先 |
| 全屏 | 浏览器全屏、CSS 沉浸兜底、方向锁、安全区 | 真实全屏失败时主舞台铺满视口；退出清除宿主类和强制样式 |
| 可访问性 | 播放器可聚焦、ARIA 进度条、菜单焦点循环、Esc、减少动态效果 | 隐藏控件不进入 Tab；右键菜单 Esc 可关闭 |

## 本地购买防重复语义

本地账号模式在 `chrome.storage.local` 保存 `pending / charged / resolved / failed_before_charge / uncertain` 五态账本：

- 任意账号已经返回主线或备用线时立即返回直链，禁止购买。
- 只在全部可用账号均无直链时，从最低金币账号组随机选一个。
- `doBuy` 成功后先写 `charged`，再刷新详情；刷新失败写 `uncertain`，后续只能用原账号对账。
- `charged` 或 `uncertain` 不允许自动选择第二个账号购买；只有已确认的购买前失败才允许尝试下一账号。
- 设置页对账中心只允许原账号重新获取详情，不调用 `doBuy`，也不提供直接清除安全阻断；成功写 `resolved`，失败继续保持 `uncertain`。

## 预览与自动化

预览页支持以下确定性场景：

```text
?scenario=normal
?scenario=duration-mismatch
?scenario=buffering
?scenario=primary-failure
?scenario=double-failure
?scenario=coin-unlock
?scenario=history
?scenario=fullscreen-failure
```

除播放故障场景外，预览桥还会确定性驱动下载规划器、暂停/继续/取消和云端/本地购买对账，按钮点击后必须真实改变 ViewModel，不能只显示操作提示。

35 项 Vitest 覆盖 reducer 代次隔离、旧数据迁移、相对时长完整线路选择、线路评分、8 秒起播判定、HLS 恢复条件、单次自动切线、续播阈值、30 天过期、Byte Range、防旧尝试事件污染、持久任务恢复与离屏暂停/恢复/取消。发布前还必须通过 TypeScript、生产构建、CRX3 内容/签名门禁和浏览器控制台检查。

## 视觉与响应式验收

- 桌面 `1440×900`：主舞台与影片侧栏双栏，抽屉位于下方。
- 移动 `390×844`：单栏、底部安全区导航、播放器控制不横向溢出。
- 横屏 `844×390`：侧栏导航与内容独立滚动，播放器仍可进入铺满兜底。
- 宽度 `320 / 640 / 1024 / 1536`：页面、主滚动区和播放器均不得出现横向溢出。
- 播放时隐藏星光等干扰装饰；视频舞台保持纯黑高对比，奶油粉紫只用于外壳和状态。
- 全屏故障场景下，主舞台、媒体容器和 video 都必须覆盖整个视口；退出后不得残留 `txzz-player-fullscreen-mode` 或 `data-txzz-fs-forced`。

[2026-07-27 01:00] 播放系统 5.0 文档随扩展 5.0.0 发布。
[2026-07-27 08:51] 扩展 5.0.1 新增 HLS 主/变体清单完整度探测、相对时长选线、旧会话纠偏和 `duration-mismatch` 回归场景。
[2026-07-27 10:15] 扩展 5.0.2 新增 Vlog 点击项与 SPA 代次隔离，拒绝预加载详情覆盖当前视频；HLS 探测不再对清单发送 Range，遇到 206/截断会重取完整文本，并扫描嵌套线路后按每个视频实际时长选取完整版本。
[2026-07-27 12:51] 扩展 5.0.4 把完整检票结果回填固定 `/vlog/` Swiper 的活动 Vue 数据，并调用复用中的 ArtPlayer/Hls `changeSources` 切换网站原生播放器；同时修复首屏主动检票、活动 ID 代次隔离和当前视频解析器。
[2026-07-27 13:15] 扩展 5.0.5 的 Vlog 原生回填优先采用插件媒体探测后真正推荐的完整线路，而不是未经比较的原始 `play_link`；所有嵌套候选统一规范为网站原生播放器需要的 `line.link`，推荐线路缺失时插入首位，避免短主线再次覆盖较长备用线。
[2026-07-27 19:25] 扩展 5.1.0 增加 Vlog 多证据当前卡片锁定、稳定 ID/换片代次、电影票 HUD、同会话 URL 指纹重载、按线路恢复计数、单次 `ready`、Wake Lock 竞态保护和省流/均衡/高清三档模式。
