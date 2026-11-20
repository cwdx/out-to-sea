<script setup lang="ts">
import { onKeyStroke, useEventListener, useIntervalFn, useNow, useResizeObserver } from "@vueuse/core"
import { Switch, SwitchThumb } from "@ui-sdk/vue/switch"
import { computed, ref, shallowRef, useTemplateRef } from "vue"
import { useRoute } from "vue-router"
import type { Status } from "../../rpc"
import { degrees, type Prefs } from "../../shared/prefs"
import { inkOf, SEED } from "../../shared/sea"
import { nextLine, PAUSES } from "../../shared/reminder"
import { sceneOf } from "../../shared/sky"
import BrandMark from "../shared/BrandMark.vue"
import { connect, useTheme } from "../shared/bridge"
import FullscreenToggle from "../shared/FullscreenToggle.vue"
import SeaCanvas from "../shared/SeaCanvas.vue"
import { useSeaSound } from "../shared/ocean"
import SettingsIcon from "../shared/SettingsIcon.vue"
import SkyPicker from "../shared/SkyPicker.vue"
import WordChoices, { mainChoices } from "../shared/WordChoices.vue"
import WeatherIcon from "../shared/WeatherIcon.vue"

const status = shallowRef<Status>()
const prefs = shallowRef<Prefs>()
const route = useRoute()
const { send, ask } = connect({ status: (s) => (status.value = s), sample: route.query })
void ask.status().then((s) => (status.value = s))
void ask.prefs().then((p) => (prefs.value = p))
useTheme(() => status.value?.theme)
const now = useNow({ scheduler: (cb) => useIntervalFn(cb, 15_000) })

// the window hands its focus to the first control as it opens, which would ring it: only a key may place the focus
let keyed = false
useEventListener("keydown", () => (keyed = true))
useEventListener("blur", () => (keyed = false))
useEventListener("focusin", (e) => !keyed && !(e.target as HTMLElement).matches(":hover") && (e.target as HTMLElement).blur())

const scene = computed(() => status.value && sceneOf(status.value.sky))
useSeaSound(() => status.value?.sound ?? false, () => status.value?.volume ?? 0.4, () => scene.value)
const ink = computed(() => (scene.value ? inkOf(scene.value) : "light"))
const next = computed(() => (status.value ? nextLine(status.value, now.value.getTime()) : ""))
const sound = computed({
  get: () => status.value?.sound ?? true,
  set: (on: boolean) => {
    if (status.value) status.value = { ...status.value, sound: on }
    send.sound({ on })
  },
})
const picking = ref(false)
const pausing = ref(false)
const pauseFor = (ms: number) => {
  pausing.value = false
  send.pause({ for: ms })
}
const choose = (choice: Pick<Prefs, "hour" | "sky" | "temp">) => {
  if (!prefs.value) return
  prefs.value = { ...prefs.value, ...choice }
  send.save(prefs.value)
}

const panel = useTemplateRef<HTMLElement>("panel")
useResizeObserver(panel, () => panel.value && send.fit({ height: panel.value.offsetHeight }))
onKeyStroke("Escape", () => send.close({}))
</script>

<template>
  <div v-if="status && scene && prefs" ref="panel" class="popover">
    <section class="scene" :data-ink="ink">
      <SeaCanvas :scene="scene" :seed="SEED" :fps="20" />
      <header>
        <button type="button" class="home" aria-label="Main screen" @click="send.home({})"><BrandMark :size="20" /></button>
        <span class="tools">
          <FullscreenToggle :act="() => send.home({})" />
          <button type="button" class="tool" aria-label="Settings" @click="send.settings({})"><SettingsIcon /></button>
        </span>
      </header>
      <div class="cue wash">
        <h1 class="swell">{{ next }}</h1>
        <WordChoices class="actions" :choices="mainChoices(send, !!status.every)" />
      </div>
    </section>
    <section class="sheet">
      <button type="button" class="line" :aria-expanded="picking" aria-label="Choose a sky" @click="picking = !picking">
        <span class="sky"><WeatherIcon :condition="status.sky.condition" :day="scene.sun" />{{ [status.sky.place, status.sky.condition, degrees(status.sky.temp, prefs.unit)].filter(Boolean).join(" · ") || "Sky" }}</span>
        <span class="chevron" aria-hidden="true">›</span>
      </button>
      <SkyPicker v-if="picking" class="skies" :hour="prefs.hour" :sky="prefs.sky" :temp="prefs.temp" :unit="prefs.unit" :live="status.live" @choose="choose" />
      <label class="line">Sound
        <Switch v-model="sound" class="switch"><SwitchThumb class="thumb" /></Switch>
      </label>
      <ul v-if="status.extra.length" class="extra">
        <li v-for="line in status.extra" :key="line">{{ line }}</li>
      </ul>
      <ul v-if="pausing" class="pauses">
        <li v-for="[label, ms] in PAUSES" :key="label"><button type="button" class="line" @click="pauseFor(ms)">{{ label }}</button></li>
      </ul>
      <footer>
        <button v-if="status.paused" type="button" @click="pauseFor(0)">Resume</button>
        <button v-else type="button" :aria-expanded="pausing" @click="pausing = !pausing">Pause<span class="chevron" aria-hidden="true">›</span></button>
        <button type="button" @click="send.quit({})">Quit</button>
      </footer>
    </section>
  </div>
</template>

<style>
html:has(.popover), html:has(.popover) body { background: transparent; }
.popover { border-radius: 0 0 14px 14px; overflow: hidden; background: var(--paper); color: var(--sheet-ink); font: 400 14px / 1.35 var(--sans); }
.popover {
  .scene { position: relative; height: 250px; }
  .scene header { position: absolute; inset: 14px 18px auto 18px; height: 30px; display: flex; align-items: center; justify-content: space-between; }
  .scene .tool { width: 36px; height: 36px; margin: -7px; }
  .scene .tools { display: flex; gap: 16px; }
  /* the words rest in the open sky, a little above the horizon, which lies 54.5% down */
  .cue { position: absolute; left: 18px; right: 18px; bottom: calc(45.5% + 6px); display: grid; gap: 6px; }
  h1 { font: 400 23px / 1.15 var(--serif); letter-spacing: -0.012em; }
  .actions { display: flex; justify-content: space-between; gap: 1.2em; font: 400 15px / 1.2 var(--serif); white-space: nowrap; }

  .sheet { display: grid; padding: 0 18px 4px; }
  .line { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; min-height: 44px; text-align: left; }
  .line + .line, .skies + .line { border-top: 1px solid var(--paper-line); }
  .sky { display: inline-flex; align-items: center; gap: 0.6em; }
  .chevron { font-size: 18px; opacity: 0.55; transition: rotate 0.2s; }
  [aria-expanded="true"] .chevron { rotate: 90deg; }
  .skies { padding: 4px 0 14px; }
  .extra { list-style: none; padding: 10px 0; border-top: 1px solid var(--paper-line); display: grid; gap: 3px; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  footer { display: flex; align-items: center; justify-content: space-between; min-height: 40px; border-top: 1px solid var(--paper-line); color: var(--muted); font-size: 12px; }
  footer button { min-height: 40px; display: inline-flex; align-items: center; gap: 6px; }
  footer .chevron { font-size: 14px; }
  /* how long to pause, opened above the footer as a messaging app offers how long to mute */
  .pauses { list-style: none; padding: 0; border-top: 1px solid var(--paper-line); }
  .pauses .line { min-height: 36px; font-size: 13px; }
  .pauses li + li .line { border-top: 1px solid var(--paper-line); }
  footer button:is(:hover, :focus-visible) { color: var(--sheet-ink); }
}
</style>
