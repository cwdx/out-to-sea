<script setup lang="ts">
import { onKeyStroke, useIntervalFn, useNow } from "@vueuse/core"
import { computed, getCurrentScope, ref, shallowRef, useTemplateRef, watch } from "vue"
import { useRoute } from "vue-router"
import type { Status } from "../../rpc"
import { degrees, type Prefs } from "../../shared/prefs"
import { inkOf, SEED } from "../../shared/sea"
import { nextLine } from "../../shared/reminder"
import { sceneOf } from "../../shared/sky"
import BrandMark from "../shared/BrandMark.vue"
import { connect, inApp } from "../shared/bridge"
import MacAppOffer from "../shared/MacAppOffer.vue"
import SeaCanvas from "../shared/SeaCanvas.vue"
import { useRise } from "../shared/motion"
import WordChoices, { mainChoices } from "../shared/WordChoices.vue"
import WeatherIcon from "../shared/WeatherIcon.vue"
import { useOcean } from "../shared/ocean"
import { thunderFor } from "../shared/thunder"
import WindowControls from "../shared/WindowControls.vue"
import SettingsIcon from "../shared/SettingsIcon.vue"
import SavePicture from "../shared/SavePicture.vue"
import SkyPicker from "../shared/SkyPicker.vue"
import SoundToggle from "../shared/SoundToggle.vue"

const status = shallowRef<Status>()
const route = useRoute()
const { send, ask } = connect({ status: (s) => (status.value = s), sample: route.query })
const scope = getCurrentScope()!
const ocean = shallowRef<ReturnType<typeof useOcean>>()
void ask.status().then((s) => {
  status.value = s
  ocean.value = scope.run(() => useOcean(s.sound, (on) => send.sound({ on }), s.volume))
})
watch(() => status.value?.volume, (v) => v !== undefined && ocean.value?.level(v))
const thunder = thunderFor((near) => ocean.value?.thunder(near))
const frame = (t: number) => {
  thunder(t, scene.value, SEED)
  ocean.value?.follow(0.35 + 0.25 * Math.sin(t * 0.6), scene.value)
  return { pulse: 0.5 + 0.5 * Math.sin(t * 0.9) }
}
const now = useNow({ scheduler: (cb) => useIntervalFn(cb, 15_000) })
const rise = useRise()

const scene = computed(() => status.value && sceneOf(status.value.sky))
const ink = computed(() => (scene.value ? inkOf(scene.value) : "light"))
const next = computed(() => (status.value ? nextLine(status.value, now.value.getTime()) : ""))
const prefs = shallowRef<Prefs>()
void ask.prefs().then((p) => (prefs.value = p))
const picking = ref(false)
onKeyStroke("Escape", () => (picking.value ? (picking.value = false) : inApp && send.close({})))
const bare = ref(false)
const full = ref(true)
watch(() => status.value?.windowed, (w) => w !== undefined && (full.value = !w), { once: true })
const sea = useTemplateRef("sea")
const choose = (choice: Pick<Prefs, "hour" | "sky" | "temp">) => {
  if (!prefs.value) return
  prefs.value = { ...prefs.value, ...choice }
  send.save(prefs.value)
}
</script>

<template>
  <main v-if="status && scene" class="home" :class="{ windowed: inApp && !full }" :data-ink="ink" :data-side="scene.orb.x < 0.5 ? 'right' : 'left'">
    <SeaCanvas ref="sea" :scene="scene" :seed="SEED" :fps="30" :frame="frame" @sky="bare = !bare" @water="ocean?.plop()" />
    <header><BrandMark /></header>
    <div v-if="inApp && !full" class="grip electrobun-webkit-app-region-drag" />
    <WindowControls class="corner" :full="full" @full="(on) => send.full({ on: (full = on) })" @close="send.close({})" />
    <Transition :css="false" appear @enter="rise.enter">
      <section class="cue wash" :class="{ bare }" :inert="bare">
        <h1 class="swell">{{ next }}</h1>
        <WordChoices class="actions" :choices="mainChoices(send, !!status.every)" />
      </section>
    </Transition>
    <MacAppOffer v-if="!picking" />
    <footer>
      <Transition :css="false" @enter="rise.enter" @leave="rise.leave">
        <SkyPicker v-if="picking && prefs" class="skies" :hour="prefs.hour" :sky="prefs.sky" :temp="prefs.temp" :unit="prefs.unit" :live="status.live" @choose="choose" />
      </Transition>
      <button type="button" class="place" :aria-expanded="picking" aria-label="Choose a sky" @click="picking = !picking">
        <WeatherIcon :condition="status.sky.condition" :day="scene.sun" />
        {{ [status.sky.place, status.sky.condition, degrees(status.sky.temp, prefs?.unit)].filter(Boolean).join(" · ") || "Sky" }}
      </button>
      <span class="tools">
        <SoundToggle v-if="ocean" :on="ocean.on.value" @toggle="ocean.toggle" />
        <SavePicture :picture="() => sea?.picture()" />
        <button type="button" class="tool" aria-label="Settings" @click="send.settings({})"><SettingsIcon /></button>
      </span>
    </footer>
  </main>
</template>

<style scoped>
.home { position: fixed; inset: 0; overflow: hidden; user-select: none; -webkit-user-select: none; cursor: default; }
header { position: absolute; top: var(--edge-top); left: var(--edge-left); }
.home { transition: border-radius 0.26s cubic-bezier(0.2, 0.7, 0.3, 1); }
.home.windowed { border-radius: 26px; }
:global(html:has(.home.windowed)), :global(html:has(.home.windowed) body) { background: transparent; }
.grip { position: absolute; inset: 0 0 auto; height: 28px; z-index: 1; }
.corner { position: absolute; top: calc(var(--edge-top) - 7px); right: calc(var(--foot-right) - 12px); margin: 0 -10px; }
.cue { position: absolute; left: 8.1vw; top: calc(var(--edge-top) + 3.2rem); bottom: 54vh; display: flex; flex-direction: column; justify-content: center; align-items: flex-start; gap: 0.6em; }
h1 { font: 400 clamp(30px, 2.9vw, 52px) / 1.12 var(--serif); letter-spacing: -0.012em; }
p { font: 400 clamp(15px, 1.25vw, 21px) / 1.3 var(--sans); opacity: 0.88; }
.actions { display: flex; flex-wrap: wrap; gap: 0.5em 2.2em; margin-top: 0.5em; font: 400 clamp(20px, 1.75vw, 30px) / 1.2 var(--serif); }
.cue { transition: opacity var(--dur-slow) var(--ease); }
.cue.bare { opacity: 0; }
[data-side="right"] .cue { left: auto; right: 8.1vw; }
@media (max-width: 40rem) { [data-side] .cue { left: var(--edge-left); right: var(--foot-right); } }
footer { position: absolute; left: var(--foot-left); right: var(--foot-right); bottom: var(--foot-bottom); display: flex; flex-wrap: wrap; gap: 1.2em; align-items: center; justify-content: space-between; color: var(--ivory); font: 400 clamp(14px, 1.1vw, 17px) / 1 var(--sans); }
.place { display: inline-flex; align-items: center; gap: 0.6em; min-height: 44px; opacity: 0.85; transition: opacity 0.2s; }
.place:is(:hover, :focus-visible, [aria-expanded="true"]) { opacity: 1; }
.skies { position: absolute; left: 0; right: 0; bottom: calc(100% + 18px); }
.tools { display: flex; align-items: center; gap: 30px; margin-left: auto; }
</style>
