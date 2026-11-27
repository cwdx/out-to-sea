import { Capacitor } from "@capacitor/core"
import { createApp } from "vue"
import App from "./App.vue"
import { router } from "./router"
import "./shared/tokens.css"

createApp(App).use(router).mount("#app")

if (import.meta.env.PROD && !Capacitor.isNativePlatform() && /^https?:$/.test(location.protocol)) navigator.serviceWorker?.register("./sw.js")
