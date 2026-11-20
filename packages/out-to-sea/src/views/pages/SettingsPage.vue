<script setup lang="ts">
import { onKeyStroke, useResizeObserver } from "@vueuse/core"
import { Slider, SliderControl, SliderIndicator, SliderThumb, SliderTrack } from "@ui-sdk/vue/slider"
import { Switch, SwitchThumb } from "@ui-sdk/vue/switch"
import { computed, ref, shallowRef, useTemplateRef, watch } from "vue"
import { RouterLink, useRoute, useRouter } from "vue-router"
import type { Status } from "../../rpc"
import { FIXTURES } from "../../shared/fixtures"
import { DEFAULTS, degrees, migrate, unitOf, type Prefs } from "../../shared/prefs"
import { inkOf, SEED } from "../../shared/sea"
import { sceneOf } from "../../shared/sky"
import BrandMark from "../shared/BrandMark.vue"
import FullscreenToggle from "../shared/FullscreenToggle.vue"
import { connect, inApp, useTheme } from "../shared/bridge"
import PopupSelect from "../shared/PopupSelect.vue"
import SeaCanvas from "../shared/SeaCanvas.vue"
import { useSeaSound } from "../shared/ocean"
import WordChoices, { mainChoices } from "../shared/WordChoices.vue"
import { askToNotify, useDeviceLocation } from "../shared/web-host"
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

const preview = computed(() => sceneOf(status.value?.sky ?? FIXTURES.night))
useSeaSound(() => prefs.value.sound, () => prefs.value.volume / 100, () => preview.value)
const sky = computed(() => status.value?.sky)
const caption = computed(() => [sky.value?.place, sky.value?.condition, degrees(sky.value?.temp, prefs.value.unit)].filter(Boolean).join(" · "))
const THEME = [{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }] as const
const UNIT = [{ value: "auto", label: `Automatic (°${unitOf().toUpperCase()})` }, { value: "c", label: "Celsius" }, { value: "f", label: "Fahrenheit" }] as const

const EVERY = [10, 15, 20, 30, 45, 60], LOOK = [10, 20, 30, 45, 60]
const START = [{ value: "look", label: "Looking away" }, { value: "breathe", label: "Breathing" }] as const
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

const router = useRouter()
onKeyStroke("Escape", () => (inApp ? send.close({}) : router.push({ name: "home" })))

const sheet = useTemplateRef<HTMLElement>("sheet")
useResizeObserver(sheet, () => sheet.value && send.fit({ height: sheet.value.scrollHeight }))
</script>

<template>
  <div class="window" :class="{ app: inApp }">
    <aside class="preview" :data-ink="inkOf(preview)">
      <SeaCanvas :scene="preview" :seed="SEED" :fps="24" />
      <component :is="inApp ? 'button' : RouterLink" class="home-link" :type="inApp ? 'button' : undefined" :to="inApp ? undefined : { name: 'home' }" aria-label="Main screen" @click="inApp && send.home({})"><BrandMark :size="22" /></component>
      <FullscreenToggle v-if="inApp" class="open-home" :full="false" :act="() => send.home({})" />
      <WordChoices class="go" :choices="mainChoices(send, false)" />
    </aside>

    <form ref="sheet" class="sheet" @submit.prevent>
      <section>
        <h2>Breaks</h2>
        <div class="row"><span>Remind me every</span>
          <PopupSelect v-model="prefs.every" label="Remind me every" :options="options(EVERY, prefs.every).map((m) => ({ value: m, label: `${m} min` }))" />
        </div>
        <div class="row"><span>Look away for</span>
          <PopupSelect v-model="prefs.look" label="Look away for" :options="options(LOOK, prefs.look).map((s) => ({ value: s, label: `${s} sec` }))" />
        </div>
        <div class="row"><span>Start with</span>
          <PopupSelect v-model="prefs.start" label="Start with" :options="START" />
        </div>
      </section>

      <section>
        <h2>Breathing</h2>
        <BreathPattern v-model="prefs.breathing" />
      </section>

      <section class="last">
        <h2>Atmosphere</h2>
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
        <p class="credit">Made by <a href="https://chriswijnia.com/lab/sea" target="_blank" rel="noreferrer">Chris Wijnia</a>, open source under the MIT licence: <a href="https://github.com/cwdx/out-to-sea" target="_blank" rel="noreferrer">source</a>.</p>
        <p class="credit">Weather from <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>, under <a href="https://open-meteo.com/en/licence" target="_blank" rel="noreferrer">CC BY 4.0</a>. Only rounded coordinates are sent, at most hourly.</p>
      </section>
    </form>
  </div>
</template>

<style>
.window { display: grid; grid-template-columns: 35% 1fr; height: 100dvh; overflow: hidden; background: var(--paper); color: var(--sheet-ink); font: 400 14px/1.35 var(--sans); }
.window {
  .preview { position: relative; overflow: hidden; height: 100vh; }
  /* the mark and full screen share one top line, and the mark and the words one left edge, 24px in */
  .preview .home-link { position: absolute; top: 24px; left: 24px; height: 44px; display: flex; align-items: center; color: inherit; text-decoration: none; }
  .preview .open-home { position: absolute; top: 24px; right: 13px; margin: 0; }
  .go { position: absolute; left: 24px; right: 24px; bottom: 30px; color: var(--ivory); display: flex; flex-wrap: wrap; gap: 0.4em 1.6em; font: 400 20px var(--serif); }

  .sheet { padding: 20px 36px 16px 44px; display: grid; align-content: start; gap: 6px; height: 100vh; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: none; }
  .sheet::-webkit-scrollbar { display: none; }
  &.app .sheet { padding: 12px 24px 10px 28px; }
  section { display: grid; padding-bottom: 8px; border-bottom: 1px solid var(--paper-line); }
  section.last { border-bottom: 0; }
  h2 { font: 500 22px/1.5 var(--serif); color: var(--heading); margin: 2px 0 0; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 20px; min-height: 40px; font-size: 15px; }
  .row + .row { border-top: 1px solid color-mix(in srgb, var(--paper-line) 70%, transparent); }
  .stack { display: grid; gap: 1px; }
  small { color: var(--muted); font-size: 12px; }
  .field { font: inherit; width: 100%; padding: 6px 9px; border-radius: 7px; border: 1px solid var(--paper-line); background: var(--field); color: inherit; }
  .field { width: min(220px, 55%); text-align: right; }
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
  .credit { color: var(--muted); font-size: 12px; padding: 12px 0 4px; }
  .credit a { color: var(--teal); }
}
@media (max-width: 40rem) {
  .window { grid-template-columns: 1fr; grid-template-rows: 30dvh 1fr; }
  .window .preview, .window .sheet { height: auto; }
  .window .sheet { padding: 18px 20px max(22px, env(safe-area-inset-bottom)); }
}
</style>
