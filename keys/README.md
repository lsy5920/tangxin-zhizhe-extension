# 扩展签名密钥

- `txzz-extension.pem`：CRX 签名私钥，**严禁公开上传到公开仓库**。
- 丢失后重新生成会导致扩展 ID 变化，用户无法平滑覆盖更新。
- 请备份到安全位置（U 盘 / 密码管理器附件）。
- 打包命令：`npm run pack` 或 `npm run release`。
