# 扩展签名密钥

- `txzz-extension.pem`：CRX 签名私钥，**严禁公开上传到公开仓库**。
- 丢失后重新生成会导致扩展 ID 变化，用户无法平滑覆盖更新。
- 当前 4.0.0 正式身份于 2026-07-26 轮换，扩展 ID 为 `ddefadnhgebdclpkabeobjidjllkdkhm`；生成后应立即制作至少两份离线加密备份。
- 请备份到安全位置（U 盘 / 密码管理器附件）。
- 打包程序在私钥缺失或身份不一致时会直接终止，绝不会静默生成替代密钥。
- 同一私钥还用于签署外置 `update.json`；公开验证信息位于 `releases/signing-public-key.json`。
- 打包命令：`npm run pack` 或 `npm run release`。
