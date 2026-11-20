import { existsSync } from "node:fs"
import { resolve } from "node:path"
import vue from "@vitejs/plugin-vue"
import { wgslVitePlugin } from "vgpu/client"
import { defineConfig } from "vite"

const views = resolve(import.meta.dirname, "src/views")
// the Mac app's view API comes with Electrobun's devkit; a clone without it, as in CI, builds the web app, which never calls it
const devkit = resolve(import.meta.dirname, ".hutch/devkit/api/browser/index.ts")

export default defineConfig({
  root: views,
  base: "./",
  plugins: [vue(), wgslVitePlugin()],
  resolve: { alias: { "electrobun/view": existsSync(devkit) ? devkit : resolve(views, "shared/no-app.ts") } },
  server: { host: "127.0.0.1", port: 5179, strictPort: true },
  build: {
    outDir: resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
    target: "safari17",
  },
})
