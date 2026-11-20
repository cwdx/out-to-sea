import type { ElectrobunConfig } from "electrobun"

export default {
  // the identifier stays from before the name, so an upgrade keeps the same app, login item and permissions
  app: { name: "OutToSea", identifier: "com.chriswijnia.bar", version: "0.2.0" },
  // the menu bar item is the app: closing every window must not quit it
  runtime: { exitOnLastWindowClosed: false },
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
