import { useDocumentVisibility } from "@vueuse/core"
import { computed, ref } from "vue"
import { inApp, native } from "./bridge"

const app = ref(true)
if (native) void import("@capacitor/app").then(({ App }) => App.addListener("appStateChange", ({ isActive }) => (app.value = isActive)))
const visibility = useDocumentVisibility()

export const appVisible = computed(() => inApp || (app.value && visibility.value === "visible"))
