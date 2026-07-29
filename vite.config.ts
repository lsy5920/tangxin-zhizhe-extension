import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const shakaTransmuxWorkerPath = fileURLToPath(new URL(
  "./node_modules/shaka-player/dist/shaka-player.transmuxer-worker.js",
  import.meta.url
));

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "txzz-shaka-transmux-worker",
      generateBundle() {
        // Library mode 会把 ?url 资源强制内联为 data: URL，而 MV3 CSP 禁止 data: Worker。
        // 显式发布为扩展自身文件，既满足 CSP，也让主界面包少携带一份 Base64 副本。
        this.emitFile({
          type: "asset",
          fileName: "shaka-player.transmuxer-worker.js",
          source: readFileSync(shakaTransmuxWorkerPath)
        });
      }
    }
  ],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production")
  },
  build: {
    outDir: "dist-ui",
    // 正式 CRX 会复制整个 dist-ui；每次先清空可避免旧插画或分块残留进入安装包。
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      // 用 import.meta.url 定位入口，避免配置加载方式切换时依赖 CommonJS __dirname。
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
