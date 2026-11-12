import { defineConfig } from "vitest/config";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json";

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // modulepreload の polyfill は fetch で自分のモジュールを読む。Chrome は modulepreload に対応しており不要で、
    // CSP の connect-src 'none' とも衝突するため出力しない
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: { app: "src/app/index.html" },
    },
  },
  test: {
    environment: "happy-dom",
    include: ["tests/**/*.test.ts"],
  },
});
