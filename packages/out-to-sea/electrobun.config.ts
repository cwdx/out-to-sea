import type { ElectrobunConfig } from "electrobun"
import pkg from "./package.json" with { type: "json" }

export default {
  // the identifier stays from before the name, so an upgrade keeps the same app, login item and permissions
  app: { name: "OutToSea", identifier: "com.chriswijnia.bar", version: pkg.version },
  // the menu bar item is the app: closing every window must not quit it
  runtime: { exitOnLastWindowClosed: false },
  // the latest GitHub release holds each Mac's update manifest and archive under a fixed name
  release: { baseUrl: "https://github.com/cwdx/out-to-sea/releases/latest/download", generatePatch: false },
  build: {
    mainProcess: "bun",
    bun: { entrypoint: "src/bun/index.ts" },
    copy: {
      "dist": "views/app",
      "assets/tray": "views/tray",
    },
    mac: { bundleCEF: false },
  },
} satisfies ElectrobunConfig
