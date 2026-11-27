<script setup lang="ts">
import { onKeyStroke, useLocalStorage, useMediaQuery, useResizeObserver, useTimeoutFn } from "@vueuse/core"
import { Slider, SliderControl, SliderIndicator, SliderThumb, SliderTrack } from "@ui-sdk/vue/slider"
import { Switch, SwitchThumb } from "@ui-sdk/vue/switch"
import { Tabs, TabsPanel } from "@ui-sdk/vue/tabs"
import { computed, defineAsyncComponent, ref, shallowRef, useTemplateRef, watch } from "vue"
import { RouterLink, useRoute } from "vue-router"
import type { Status } from "../../rpc"
import type { SyncOffer as Offer } from "../../shared/sync-service"
import { FIXTURES } from "../../shared/fixtures"
import { DEFAULTS, degrees, migrate, unitOf, type Prefs } from "../../shared/prefs"
import { inkOf, SEED } from "../../shared/sea"
import { sceneOf } from "../../shared/sky"
import BrandMark from "../shared/BrandMark.vue"
import FullscreenToggle from "../shared/FullscreenToggle.vue"
import { android, askToNotify, connect, inApp, syncHere, useDeviceLocation, useTheme } from "../shared/bridge"
import { invite, router } from "../router"
import PopupSelect from "../shared/PopupSelect.vue"
import SeaCanvas from "../shared/SeaCanvas.vue"
import SettingsTabs from "../shared/SettingsTabs.vue"
import SyncRows from "../shared/SyncRows.vue"
import { useSeaSound } from "../shared/ocean"
import WordChoices, { mainChoices } from "../shared/WordChoices.vue"
import BreathPattern from "./BreathPattern.vue"

const status = shallowRef<Status>()
const { send, ask } = connect({ status: (s) => (status.value = s), sample: useRoute().query })
const prefs = ref<Prefs>({ ...DEFAULTS })
useTheme(() => prefs.value.theme)
const loaded = ref(false)
void ask.prefs().then((p) => {
  prefs.value = p
  loaded.value = true
})
void ask.status().then((s) => (status.value = s))

watch(prefs, (p) => loaded.value && send.save(migrate(JSON.parse(JSON.stringify(p)))), { deep: true })

const SyncOffer = defineAsyncComponent(() => import("../shared/SyncOffer.vue"))
const SyncJoin = defineAsyncComponent(() => import("../shared/SyncJoin.vue"))
const offer = ref<Partial<Offer>>()
const joining = ref(syncHere && !!invite.link)
const link = invite.link
invite.link = ""
const problem = ref<"" | "wrong" | "slow">("")
const joinBusy = ref(false), adding = ref(false), turningOn = ref(false), linked = ref(false), turnOnFailed = ref(false)
const SLOW = Symbol()
function within<T>(p: Promise<T>) {
  return Promise.race([p, new Promise<typeof SLOW>((r) => setTimeout(r, 20_000, SLOW))])
}
const { start: turnOnFor, stop: turnOnStop } = useTimeoutFn(() => (turningOn.value = false, turnOnFailed.value = !status.value?.sync.on), 20_000, { immediate: false })
const { start: showLinked } = useTimeoutFn(() => (linked.value = false), 5000, { immediate: false })
watch(() => status.value?.sync.on, (on) => on && (turningOn.value = false, turnOnStop()))
const toggle = (on: boolean) => {
  turningOn.value = on
  turnOnFailed.value = false
  if (on) turnOnFor()
  send.syncOn({ on })
}
let opener: Element | null = null
const remember = () => (opener = document.activeElement)
const dialogClose = (joined = false) => {
  offer.value = undefined
  joining.value = false
  problem.value = ""
  const back = joined || !opener?.isConnected ? sheet.value?.querySelector("[data-sync-switch]") : opener
  if (back instanceof HTMLElement) back.focus()
}
const join = async (text: string) => {
  joinBusy.value = true
  const done = await within(ask.syncJoin({ text })).catch(() => false)
  joinBusy.value = false
  if (done === true) {
    dialogClose(true)
    linked.value = true
    showLinked()
  } else problem.value = done === SLOW ? "slow" : "wrong"
}
const add = async () => {
  remember()
  adding.value = true
  const made = await within(ask.syncOffer().catch(() => undefined))
  adding.value = false
  offer.value = (made === SLOW ? undefined : made) ?? {}
}
// a sync changes prefs in the host; the copy here follows, or the next save would undo it
watch(() => status.value?.sync.at, async () => {
  const p = await ask.prefs()
  if (JSON.stringify(p) !== JSON.stringify(prefs.value)) prefs.value = p
})

const TABS = computed(() => [{ id: "breaks", label: "Breaks" }, { id: "breathing", label: "Breathing" }, { id: "sky", label: "Sky" }, ...(syncHere ? [{ id: "sync", label: "Sync" }] : []), { id: "about", label: "About" }])
const remembered = useLocalStorage("out-to-sea.settings", "breaks")
if (joining.value) remembered.value = "sync"
const tab = computed(() => (TABS.value.some((t) => t.id === remembered.value) ? remembered.value : "breaks"))
const wide = useMediaQuery("(min-width: 40.01rem)")

const preview = computed(() => sceneOf(status.value?.sky ?? FIXTURES.night))
useSeaSound(() => prefs.value.sound, () => prefs.value.volume / 100, () => preview.value)
const sky = computed(() => status.value?.sky)
const caption = computed(() => [sky.value?.place, sky.value?.condition, degrees(sky.value?.temp, prefs.value.unit)].filter(Boolean).join(" · "))
const THEME = [{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }] as const
const UNIT = [{ value: "auto", label: `Automatic (°${unitOf().toUpperCase()})` }, { value: "c", label: "Celsius" }, { value: "f", label: "Fahrenheit" }] as const

const EVERY = [0, 10, 15, 20, 30, 45, 60], LOOK = [10, 20, 30, 45, 60]
const START = [{ value: "look", label: "Looking away" }, { value: "breathe", label: "Breathing" }] as const
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({ value: h, label: new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: "numeric" }) }))
const options = (list: number[], current: number) => (list.includes(current) ? list : [...list, current].sort((a, b) => a - b))

// the host has already stored what these change; the copy here follows, or the next save would undo it
const locate = async (on: boolean) => {
  const city = await useDeviceLocation(on)
  prefs.value = { ...prefs.value, city, locate: on && !!city }
}
const place = ref("")
watch(() => prefs.value.city?.name, (name) => (place.value = name ?? ""), { immediate: true })
const move = async () => {
  const city = place.value && (await ask.place({ name: place.value }))
  if (city) prefs.value = { ...prefs.value, city, locate: false }
  else place.value = prefs.value.city?.name ?? ""
}
const notify = async (on: boolean) => {
  prefs.value.notify = on && (await askToNotify())
}

onKeyStroke("Escape", () => {
  if (document.querySelector("dialog[open]")) return
  return inApp ? send.close({}) : router.push({ name: "home" })
})

const sheet = useTemplateRef<HTMLElement>("sheet")
useResizeObserver(sheet, () => sheet.value && send.fit({ height: Math.max(sheet.value.scrollHeight, 420) }))
</script>

<template>
  <Tabs class="window" :class="{ app: inApp }" :value="tab" :orientation="wide ? 'vertical' : 'horizontal'" @update:value="(v) => v && (remembered = v)">
    <aside class="preview" :data-ink="inkOf(preview)">
      <SeaCanvas :scene="preview" :seed="SEED" :fps="24" />
      <component :is="inApp ? 'button' : RouterLink" class="home-link" :type="inApp ? 'button' : undefined" :to="inApp ? undefined : { name: 'home' }" aria-label="Main screen" @click="inApp && send.home({})"><BrandMark :size="22" /></component>
      <FullscreenToggle v-if="inApp" class="open-home" :full="false" :act="() => send.home({})" />
      <SettingsTabs :tabs="TABS" :active="tab" />
      <WordChoices class="go" :choices="mainChoices(send, false)" />
    </aside>

    <form ref="sheet" class="sheet" @submit.prevent>
      <TabsPanel value="breaks">
        <div class="row"><span>Remind me every</span>
          <PopupSelect v-model="prefs.every" label="Remind me every" :options="options(EVERY, prefs.every).map((m) => ({ value: m, label: m ? `${m} min` : 'Never' }))" />
        </div>
        <div class="row"><span>Look away for</span>
          <PopupSelect v-model="prefs.look" label="Look away for" :options="options(LOOK, prefs.look).map((s) => ({ value: s, label: `${s} sec` }))" />
        </div>
        <div class="row"><span>Start with</span>
          <PopupSelect v-model="prefs.start" label="Start with" :options="START" />
        </div>
        <label class="row">Quiet hours
          <Switch v-model="prefs.quiet" class="switch"><SwitchThumb class="thumb" /></Switch>
        </label>
        <template v-if="prefs.quiet">
          <div class="row"><span>From</span>
            <PopupSelect v-model="prefs.quietFrom" label="Quiet from" :options="HOUR_OPTIONS" />
          </div>
          <div class="row"><span>Until</span>
            <PopupSelect v-model="prefs.quietTo" label="Quiet until" :options="HOUR_OPTIONS" />
          </div>
        </template>
      </TabsPanel>

      <TabsPanel value="breathing">
        <BreathPattern v-model="prefs.breathing" />
      </TabsPanel>

      <TabsPanel value="sky">
        <div class="row">Sound
          <span class="sound">
            <Slider :value="prefs.volume" :min="5" :max="100" :step="5" :disabled="!prefs.sound" class="slider" @value-change="(v: number | number[]) => (prefs.volume = Number(v))">
              <SliderControl class="control">
                <SliderTrack class="track"><SliderIndicator class="range" /><SliderThumb class="knob" aria-label="Volume" /></SliderTrack>
              </SliderControl>
            </Slider>
            <Switch v-model="prefs.sound" class="switch" aria-label="Sound"><SwitchThumb class="thumb" /></Switch>
          </span>
        </div>
        <label class="row">
          <span class="stack">Local weather<small v-if="prefs.weather && caption">{{ caption }}</small></span>
          <Switch v-model="prefs.weather" class="switch"><SwitchThumb class="thumb" /></Switch>
        </label>
        <label v-if="prefs.weather" class="row">Place
          <input v-model.lazy.trim="place" class="field" type="text" spellcheck="false" autocomplete="off" :disabled="!inApp && prefs.locate" @change="move">
        </label>
        <div v-if="prefs.weather" class="row"><span>Temperature in</span>
          <PopupSelect v-model="prefs.unit" label="Temperature in" :options="UNIT" />
        </div>
        <div class="row"><span>Appearance</span>
          <PopupSelect v-model="prefs.theme" label="Appearance" :options="THEME" />
        </div>
        <label class="row">Clock on the main screen
          <Switch v-model="prefs.clock" class="switch"><SwitchThumb class="thumb" /></Switch>
        </label>
        <template v-if="inApp">
          <label class="row">
            <span class="stack">Dissolve desktop<small>Needs screen recording. The picture stays on this Mac.</small></span>
            <Switch v-model="prefs.dissolve" class="switch"><SwitchThumb class="thumb" /></Switch>
          </label>
          <label class="row">Open at login
            <Switch v-model="prefs.login" class="switch"><SwitchThumb class="thumb" /></Switch>
          </label>
        </template>
        <template v-else>
          <label v-if="prefs.weather" class="row">Use my location
            <Switch :model-value="prefs.locate" class="switch" @update:model-value="locate"><SwitchThumb class="thumb" /></Switch>
          </label>
          <label class="row">Notify me when a break is due
            <Switch :model-value="prefs.notify" class="switch" @update:model-value="notify"><SwitchThumb class="thumb" /></Switch>
          </label>
        </template>
      </TabsPanel>

      <TabsPanel v-if="syncHere" value="sync">
        <SyncRows :on="!!status?.sync.on" :at="status?.sync.at" :devices="status?.sync.devices ?? []" :busy="turningOn" :adding="adding" :linked="linked" :failed="turnOnFailed" @toggle="toggle" @add="add" @link="remember(), (joining = true)" />
      </TabsPanel>

      <TabsPanel value="about">
        <div v-if="inApp" class="row">
          <span class="stack">Update automatically<small v-if="status?.update">{{ status.update }}</small></span>
          <span class="update">
            <button type="button" class="link" @click="send.update({})">Check now</button>
            <Switch v-model="prefs.autoUpdate" class="switch" aria-label="Update automatically"><SwitchThumb class="thumb" /></Switch>
          </span>
        </div>
        <div v-else-if="android && status?.update" class="row"><span>{{ status.update }}</span>
          <button type="button" class="link touch" @click="send.update({})">Download</button>
        </div>
        <footer class="credits">
          <p>By <a href="https://chriswijnia.com/lab/sea" target="_blank" rel="noreferrer">Chris Wijnia</a> · <a href="https://github.com/cwdx/out-to-sea" target="_blank" rel="noreferrer">Source</a>, MIT<template v-if="status?.version"> · Version {{ status.version }}</template></p>
          <p>Weather by <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>, <a href="https://open-meteo.com/en/licence" target="_blank" rel="noreferrer">CC BY 4.0</a></p>
        </footer>
      </TabsPanel>
    </form>
    <SyncOffer v-if="offer" v-bind="offer" @done="dialogClose()" />
    <SyncJoin v-if="joining" v-model:problem="problem" :busy="joinBusy" :link="link" @join="join" @cancel="dialogClose()" />
  </Tabs>
</template>

<style>
.window { display: grid; grid-template-columns: 35% 1fr; grid-template-rows: minmax(0, 1fr); height: 100dvh; overflow: hidden; background: var(--paper); color: var(--sheet-ink); font: 400 14px/1.35 var(--sans); }
.window {
  .preview { position: relative; overflow: hidden; height: 100%; }
  /* the mark and full screen share one top line, and the mark and the words one left edge, 24px in */
  .preview .home-link { position: absolute; top: max(24px, env(safe-area-inset-top)); left: max(24px, env(safe-area-inset-left)); height: 44px; display: flex; align-items: center; color: inherit; text-decoration: none; }
  .preview .open-home { position: absolute; top: 24px; right: 13px; margin: 0; }
  .go { position: absolute; left: max(24px, env(safe-area-inset-left)); right: 24px; bottom: max(30px, env(safe-area-inset-bottom)); color: var(--ivory); display: flex; flex-wrap: wrap; gap: 0.4em 1.6em; font: 400 20px var(--serif); }

  .sheet { padding: 20px calc(36px + env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) 44px; display: flex; flex-direction: column; gap: 6px; height: 100%; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: none; }
  .sheet::-webkit-scrollbar { display: none; }
  &.app .sheet { padding: 12px 24px 10px 28px; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 20px; min-height: 40px; font-size: 15px; }
  .row + .row { border-top: 1px solid color-mix(in srgb, var(--paper-line) 70%, transparent); }
  .stack { display: grid; gap: 1px; }
  small { color: var(--muted); font-size: 12px; }
  .field { font: inherit; width: 100%; padding: 6px 9px; border-radius: 7px; border: 1px solid var(--paper-line); background: var(--field); color: inherit; }
  .field { box-sizing: border-box; width: 220px; max-width: 55%; padding-left: 14px; text-align: left; }
  .field:focus-visible { outline: 2px solid var(--teal); outline-offset: 2px; }
  .field:disabled { opacity: 0.5; }

  .sound { display: flex; align-items: center; gap: 18px; flex: 1; justify-content: flex-end; }
  .slider { flex: none; width: min(200px, 55%); transition: opacity 0.2s; }
  .slider[data-disabled] { opacity: 0.35; }
  .slider .control { display: flex; align-items: center; height: 28px; touch-action: none; }
  .slider .track { position: relative; flex: 1; height: 4px; border-radius: 2px; background: var(--track); }
  .slider .range { height: 100%; border-radius: 2px; background: var(--teal); }
  .slider .knob { width: 18px; height: 18px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgb(0 0 0 / 0.25); }
  .slider .knob:focus-visible { outline: 2px solid var(--teal); outline-offset: 3px; }
  .credits { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 2px 18px; padding: 14px 0 2px; color: var(--muted); font-size: 12px; }
  .credits a { color: var(--teal); }
  .update { display: flex; align-items: center; gap: 18px; }
  .link { color: var(--teal); font-size: 13px; }
  .link:focus-visible { outline: 2px solid var(--teal); outline-offset: 2px; border-radius: 3px; }
}
@media (max-width: 40rem) {
  .window .go { bottom: calc(52px + env(safe-area-inset-bottom)); }
  .window { grid-template-columns: 1fr; grid-template-rows: 30dvh minmax(0, 1fr); }
  .window .preview, .window .sheet { height: auto; }
  .window .phases { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .window .phase { padding-inline: 2px; }
  .window .group { padding-left: 6px; }
  .window .sheet { padding: 18px max(20px, env(safe-area-inset-right)) max(22px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left)); }
}
@media (pointer: coarse) {
  .window .row { min-height: 48px; }
  .window :is(.field, .group input, .popup-trigger) { font-size: 16px; }
  .window :is(.field, .popup-trigger, .group) { min-height: 44px; }
  .window .step { padding-inline: 5px; }
  .window :is(.credits a, .link) { display: inline-flex; align-items: center; min-height: 44px; }
}
</style>
