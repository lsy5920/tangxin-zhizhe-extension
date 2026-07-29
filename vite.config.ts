import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production")
  },
  build: {
    outDir: "dist-ui",
    // 正式 CRX 会复制整个 dist-ui；每次先清空可避免旧插画或分块残留进入安装包。
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      // 使用 import.meta.url 后，Vite 的 native/runner 配置加载器都可直接启动，
      // 不再依赖为 CommonJS 模拟的 __dirname，也减少本地预览的临时构建等待。
      entry: fileURLToPath(new URL("./ui-src/main.tsx", import.meta.url)),
      name: "TxzzCandyUi",
      formats: ["iife"],
      fileName: () => "txzz-ui.js"
    },
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith(".css")) return "txzz-ui.css";
          return "[name][extname]";
        }
      }
    }
  }
});
