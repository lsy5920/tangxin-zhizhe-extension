import { resolve } from "node:path";
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
      entry: resolve(__dirname, "ui-src/main.tsx"),
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
