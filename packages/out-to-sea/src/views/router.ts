import { createRouter, createWebHashHistory } from "vue-router"

// hash history: the app's views:// pages have no server to answer other paths
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", name: "home", component: () => import("./pages/HomePage.vue") },
    { path: "/break", name: "break", component: () => import("./pages/BreakPage.vue") },
    { path: "/settings", name: "settings", component: () => import("./pages/SettingsPage.vue") },
    { path: "/popover", name: "popover", component: () => import("./pages/PopoverPage.vue") },
    ...(import.meta.env.DEV ? [{ path: "/lab", name: "lab", component: () => import("./pages/LabPage.vue") }] : []),
  ],
})
