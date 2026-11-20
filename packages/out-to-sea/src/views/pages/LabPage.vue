<script setup lang="ts">
import { useFps } from "@vueuse/core"
import { useRouteQuery } from "@vueuse/router"
import { computed } from "vue"
import { FIXTURES, type Fixture } from "../../shared/fixtures"
import { sceneOf } from "../../shared/sky"
import SeaCanvas from "../shared/SeaCanvas.vue"

const t = useRouteQuery("t", "12", { transform: Number })
const live = useRouteQuery<string | null>("live", null)
const fps = useFps()
const skies = computed(() => (Object.keys(FIXTURES) as Fixture[]).map((name) => ({ name, scene: sceneOf(FIXTURES[name]) })))
</script>

<template>
  <main class="lab">
    <RouterLink v-for="sky in skies" :key="sky.name" class="tile" :to="{ name: 'home', query: { scene: sky.name } }">
      <SeaCanvas :scene="sky.scene" :seed="23" :at="live === null ? t : undefined" />
      <span>{{ sky.name }}</span>
    </RouterLink>
    <p class="fps">{{ live === null ? `t ${t}` : `${fps} fps` }}</p>
  </main>
</template>

<style scoped>
.lab { min-height: 100%; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 380px), 1fr)); gap: 6px; padding: 6px; background: var(--night); color: var(--ivory); font: 500 13px / 1 var(--sans); }
.tile { position: relative; aspect-ratio: 16 / 10; overflow: hidden; color: inherit; text-decoration: none; }
.tile span { position: absolute; top: 8px; left: 10px; text-shadow: 0 1px 3px #0009; }
.fps { position: fixed; right: 12px; bottom: 10px; font-variant-numeric: tabular-nums; text-shadow: 0 1px 3px #0009; }
</style>
