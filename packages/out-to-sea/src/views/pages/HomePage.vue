<script setup lang="ts">
import { onKeyStroke, useIntervalFn, useNow, useResizeObserver, useWindowSize } from "@vueuse/core"
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
const now = useNow({ scheduler: (cb) => useIntervalFn(cb, 1000) })
const rise = useRise()

const scene = computed(() => status.value && sceneOf(status.value.sky))
const ink = computed(() => (scene.value ? inkOf(scene.value) : "light"))
const next = computed(() => (status.value ? nextLine(status.value, now.value.getTime()) : ""))
const timeFormat = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" })
const dateFormat = new Intl.DateTimeFormat([], { weekday: "short", day: "numeric", month: "short" })
const clock = computed(() => {
  const parts = timeFormat.formatToParts(now.value), at = parts.findIndex((p) => p.type === "hour")
  return { hour: parts[at]?.value ?? "", sep: parts[at + 1]?.type === "literal" ? parts[at + 1]!.value : ":", minute: parts.find((p) => p.type === "minute")?.value ?? "", date: dateFormat.format(now.value) }
})
// the clock takes the biggest open rectangle of sky: below the corner row, above the horizon, beside or over the words
const caption = useTemplateRef<HTMLElement>("caption")
const cue = useTemplateRef<HTMLElement>("cue")
const room = shallowRef<{ x: number; y: number; w: number; h: number; size: number }>()
const { width: vw, height: vh } = useWindowSize()
const place = () => {
  const c = caption.value, q = cue.value
  if (!c || !q) return
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize), gap = 28, dateH = 1.9 * rem
  const edge = Math.max(0.046 * vw.value, 28), x0 = edge, x1 = vw.value - edge
  const y0 = Math.max(0.055 * vh.value, 34) + 2.6 * rem, y1 = 0.545 * vh.value - 0.02 * vh.value
  const at = { x: q.offsetLeft + c.offsetLeft, y: q.offsetTop + c.offsetTop }, right = at.x + c.offsetWidth
  const rooms = [
    { x: x0, y: y0, w: at.x - gap - x0, h: y1 - y0 },
    { x: right + gap, y: y0, w: x1 - right - gap, h: y1 - y0 },
    { x: x0, y: y0, w: x1 - x0, h: at.y - gap - y0 },
  ].map((r) => ({ ...r, size: Math.min(r.w / 2.6, r.h - dateH, 340) }))
  const best = rooms.reduce((a, b) => (b.size > a.size ? b : a))
  room.value = best.size >= 56 ? best : undefined
}
useResizeObserver(caption, place)
watch([vw, vh], place)
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
    <time v-if="status.clock && room" class="clock" :class="{ bare }" :style="{ 'left': room.x + 'px', 'top': room.y + 'px', 'width': room.w + 'px', 'height': room.h + 'px', '--clock': room.size + 'px' }" :datetime="now.toISOString()">
      <span class="date">{{ clock.date }}</span>
      <span class="time">{{ clock.hour }}<i>{{ clock.sep }}</i>{{ clock.minute }}</span>
    </time>
    <Transition :css="false" appear @enter="rise.enter">
      <section ref="cue" class="cue wash" :class="{ bare }" :inert="bare">
        <div ref="caption" class="caption">
          <h1 class="swell">{{ next }}</h1>
          <WordChoices class="actions" :choices="mainChoices(send, !!status.every)" />
        </div>
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
.grip { position: absolute; inset: 0 0 auto; height: 28px; }
.corner { position: absolute; z-index: 1; top: calc(var(--edge-top) - 7px); right: calc(var(--foot-right) - 12px); margin: 0 -10px; }
.cue { position: absolute; left: 8.1vw; top: calc(var(--edge-top) + 3.2rem); bottom: 54vh; display: flex; flex-direction: column; justify-content: center; align-items: flex-start; gap: 0.6em; }
h1 { font: 400 clamp(30px, 2.9vw, 52px) / 1.12 var(--serif); letter-spacing: -0.012em; }
@font-face { font-family: "Sea Clock"; font-weight: 600; font-display: swap; src: url("../shared/fonts/quicksand-600.woff2") format("woff2"); }
/* a soft clock after the iPad lock screen: rounded figures in white glass, the date small above. Script finds the open sky and sizes it to that (see place) */
.caption { display: flex; flex-direction: column; align-items: flex-start; gap: 0.6em; }
.clock { position: absolute; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 0.3em; pointer-events: none; font-family: "Sea Clock", var(--sans); font-weight: 600; transition: opacity var(--dur-slow) var(--ease); }
.clock.bare { opacity: 0; }
/* a minute-old clock needs no tabular figures: proportional ones close the gap round a 1, and the colon is pulled in and lifted to the middle of the digits; positioning it would take it out of the glass fill, so it is raised with vertical-align */
.time i { font-style: normal; margin-inline: -0.05em; vertical-align: 0.06em; }
.date { font-size: max(16px, calc(var(--clock) * 0.1)); line-height: 1; letter-spacing: 0.02em; text-shadow: 0 1px 14px var(--wash); }
.time { font-size: var(--clock); line-height: 1; padding: 0.12em 0.06em; margin: -0.12em -0.06em; letter-spacing: -0.02em; font-variant-numeric: lining-nums proportional-nums; -webkit-text-fill-color: transparent; background: linear-gradient(180deg, color-mix(in srgb, currentColor 90%, transparent), color-mix(in srgb, currentColor 32%, transparent)); -webkit-background-clip: text; background-clip: text; filter: drop-shadow(0 2px 22px var(--wash)); }
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
