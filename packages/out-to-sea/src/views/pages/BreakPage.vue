<script setup lang="ts">
import { onKeyStroke, useIntervalFn } from "@vueuse/core"
import { useRoute } from "vue-router"
import { computed, getCurrentScope, ref, shallowRef, useTemplateRef } from "vue"
import type { Session } from "../../rpc"
import { phaseAt, type Phase } from "../../shared/clock"
import { inkOf } from "../../shared/sea"
import { sceneOf } from "../../shared/sky"
import BrandMark from "../shared/BrandMark.vue"
import { connect } from "../shared/bridge"
import DesktopDissolve from "../shared/DesktopDissolve.vue"
import SeaCanvas from "../shared/SeaCanvas.vue"
import { useOcean } from "../shared/ocean"
import { thunderFor } from "../shared/thunder"
import WindowControls from "../shared/WindowControls.vue"
import SettingsIcon from "../shared/SettingsIcon.vue"
import SavePicture from "../shared/SavePicture.vue"
import SoundToggle from "../shared/SoundToggle.vue"
import { useRise } from "../shared/motion"
import WordChoices from "../shared/WordChoices.vue"
import WaterLine from "../shared/WaterLine.vue"

type Stage = "gaze" | "choice" | "breathing" | "leaving"
const CUE = 4.5, CHOICE = 15, LEAVE = 0.7
const rise = useRise()
// the sea's sound plays on the display with the words; it is made in setup's scope, once the session says where
const scope = getCurrentScope()!
const useOceanFor = (initial: boolean, volume: number) => scope.run(() => useOcean(initial, (on) => send.sound({ on }), volume))
const ocean = shallowRef<ReturnType<typeof useOcean>>()

const route = useRoute()
const sea = useTemplateRef("sea")
const { send, ask } = connect({ sample: route.query })
const session = shallowRef<Session>()
const windowed = ref(false)
const scene = computed(() => session.value && sceneOf(session.value.sky))
const ink = computed(() => (scene.value ? inkOf(scene.value) : "light"))

// one monotonic clock per stage; `at` in the address freezes it for screenshots
const frozen = route.query.at ? Number(route.query.at) : undefined
const stage = ref<Stage>("gaze")
const since = ref(performance.now())
const length = ref(60)
const now = ref(performance.now())
const elapsed = computed(() => frozen ?? Math.max(0, (now.value - since.value) / 1000))
const phase = computed<Phase | undefined>(() => (stage.value === "breathing" && session.value ? phaseAt(elapsed.value, session.value.pattern) : undefined))
const left = computed(() => Math.max(0, Math.ceil(length.value - elapsed.value)))
const opened = performance.now()

const enter = (next: Stage, seconds = 60) => {
  stage.value = next
  since.value = performance.now()
  length.value = seconds
}
const finish = () => {
  if (stage.value === "leaving") return
  ocean.value?.chime("end")
  ocean.value?.fade()
  enter("leaving", LEAVE)
}
const settings = () => {
  ocean.value?.fade()
  send.finish({})
  send.settings({})
}
const breathe = (minutes: number) => enter("breathing", minutes * 60)
const extend = () => (length.value += 60)

useIntervalFn(() => {
  now.value = performance.now()
  if (frozen !== undefined || !session.value) return
  const t = elapsed.value
  if (stage.value === "gaze" && t >= session.value.look) {
    ocean.value?.chime("turn")
    enter("choice", CHOICE)
  } else if (stage.value === "breathing" && t >= length.value) {
    ocean.value?.chime("turn")
    enter("choice", CHOICE)
  } else if (stage.value === "choice" && t >= length.value) finish()
  else if (stage.value === "leaving" && t >= LEAVE) {
    send.finish({})
  }
}, 100)

onKeyStroke("Escape", (e) => {
  e.preventDefault()
  finish()
})

const thunder = thunderFor((near) => ocean.value?.thunder(near))
let released: number[] = []
let lastPhase = -1
const frame = (t: number) => {
  const level = phase.value?.level
  const index = phase.value?.index ?? -1
  if (session.value) thunder(t, scene.value, session.value.seed)
  if (index === 0 && lastPhase !== 0) released = [t, ...released].slice(0, 4)
  lastPhase = index
  const leaving = stage.value === "leaving" ? Math.min(1, elapsed.value / LEAVE) : 0
  ocean.value?.follow(level ?? 0.35 + 0.25 * Math.sin(t * 0.6), scene.value)
  ocean.value?.breath(phase.value)
  // the fade runs on real time, so a frozen scene is still fully faded in; under the dissolve the sea is whole from the start
  return { level, ripples: released.map((at) => t - at), pulse: level ?? 0.5 + 0.5 * Math.sin(t * 0.9), fade: (session.value?.shot ? 1 : Math.min(1, (performance.now() - opened) / 1200)) * (1 - leaving) }
}

const time = computed(() => `${Math.floor(left.value / 60)}:${String(left.value % 60).padStart(2, "0")} left`)
const breathed = computed(() => (phase.value ? [phase.value.progress, 1, 1 - phase.value.progress, 0][phase.value.index]! : 0))
const drained = computed(() => Math.min(1, elapsed.value / length.value))
const holdName = computed(() => (phase.value?.index === 1 ? "hold-full" : phase.value?.index === 3 ? "hold-empty" : phase.value?.index === 0 ? "in" : "out"))

void ask.session().then((s) => {
  session.value = s
  windowed.value = s.windowed
  length.value = s.look
  if (s.start === "breathe") breathe(1)
  if (route.query.stage === "choice") enter("choice", CHOICE)
  if (s.lead) ocean.value = useOceanFor(s.sound, s.volume)
})
</script>

<template>
  <main v-if="session && scene" class="break" :class="{ windowed }" :data-ink="ink" :data-side="scene.orb.x < 0.5 ? 'right' : 'left'" :data-stage="stage" :data-phase="phase ? holdName : undefined">
    <SeaCanvas ref="sea" :scene="scene" :seed="session.seed" :frame="frame" :at="frozen" :backdrop="false" @water="ocean?.plop()" />
    <DesktopDissolve v-if="session.shot" :src="session.shot" />
    <template v-if="session.lead">
      <header><BrandMark /></header>
      <WindowControls class="corner" :full="!windowed" @full="(on) => send.full({ on: !(windowed = !on) })" @close="finish" />

      <Transition mode="out-in" :css="false" appear @enter="rise.enter" @leave="rise.leave">
        <section v-if="stage === 'gaze'" key="gaze" class="cue wash gaze" :class="{ settled: elapsed > CUE }">
          <h1 class="swell">Look into the distance.</h1>
          <WordChoices class="durations" quiet :choices="[{ label: 'Skip', act: finish }]" />
        </section>

        <section v-else-if="stage === 'choice'" key="choice" class="cue wash choice">
          <h1 class="swell">Stay a little longer?</h1>
          <WordChoices class="durations" :choices="[{ label: 'Breathe for 1 minute', act: () => breathe(1) }, { label: '5 minutes', aria: 'Breathe for 5 minutes', act: () => breathe(5) }, { label: 'Skip', act: finish }]" />
        </section>

        <section v-else-if="stage === 'breathing' && phase" key="breathing" class="cue wash breath">
          <div class="phase" aria-live="polite" :style="{ '--level': phase.level }">
            <span class="lungs"><Transition name="word" mode="out-in"><h1 :key="phase.index">{{ phase.label }}</h1></Transition></span>
            <WaterLine class="breathline" :style="{ '--draw': 1 - breathed }" />
          </div>
        </section>
      </Transition>

      <footer>
        <div v-if="stage === 'gaze' || stage === 'breathing'" class="time">
          <span>{{ time }}</span>
          <span class="drain" aria-hidden="true"><WaterLine :style="{ '--draw': drained }" /></span>
          <button v-if="stage === 'breathing'" type="button" class="word" aria-label="Add one minute" @click="extend">+1 min<WaterLine /></button>
        </div>
        <div class="end">
          <button v-if="stage !== 'leaving'" type="button" class="word" @click="finish">Done<WaterLine /></button>
          <SoundToggle v-if="ocean" :on="ocean.on.value" @toggle="ocean.toggle" />
          <SavePicture :picture="() => sea?.picture()" />
          <button type="button" class="tool" aria-label="Settings" @click="settings"><SettingsIcon /></button>
        </div>
      </footer>
    </template>
  </main>
</template>

<style scoped>
.break { position: fixed; inset: 0; overflow: hidden; user-select: none; -webkit-user-select: none; cursor: default; animation: arrive var(--dur-slow) var(--ease) both; }
.break { transition: border-radius 0.26s cubic-bezier(0.2, 0.7, 0.3, 1); }
.break.windowed { border-radius: 26px; }
:global(html:has(.break.windowed)), :global(html:has(.break.windowed) body) { background: transparent; }
.break[data-stage="leaving"] { opacity: 0; transition: opacity var(--dur); }
@keyframes arrive { from { opacity: 0; } }

header { position: absolute; top: var(--edge-top); left: var(--edge-left); }
.corner { position: absolute; top: calc(var(--edge-top) - 7px); right: calc(var(--foot-right) - 12px); margin: 0 -10px; }

.cue { align-items: flex-start; position: absolute; left: 8.1vw; top: calc(var(--edge-top) + 3.2rem); bottom: 54vh; display: flex; flex-direction: column; justify-content: center; max-width: min(44rem, 80vw); }
h1 { font: 400 clamp(30px, 2.9vw, 52px) / 1.12 var(--serif); letter-spacing: -0.012em; text-wrap: balance; }
.gaze { transition: opacity var(--dur-slow) var(--ease); }
.gaze.settled { opacity: 0.7; }
.phase { position: relative; padding-bottom: 0.32em; font-size: clamp(36px, 3.6vw, 64px); }
.breathline { height: 0.22em; opacity: 0.5; }
.lungs { display: block; scale: calc(1 + 0.045 * var(--level, 0)); opacity: calc(0.78 + 0.22 * var(--level, 0)); transform-origin: left center; transition: scale 0.12s linear, opacity 0.12s linear; }
[data-side="right"] .lungs { transform-origin: right center; }
@media (prefers-reduced-motion: reduce) { .lungs { scale: 1; opacity: 1; } }
.breathline :deep(path) { transition: stroke-dashoffset 0.12s linear; }
.phase h1 { font-size: 1em; font-style: italic; }
.word-enter-active, .word-leave-active { transition: opacity var(--dur) var(--ease); }
.word-enter-from, .word-leave-to { opacity: 0; }

.durations { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.5em 2.2em; margin-top: 0.95em; font: 400 clamp(20px, 1.75vw, 30px) / 1.2 var(--serif); }

.gaze .word { opacity: 0.85; transition: opacity var(--dur-slow) var(--ease) 0.6s; animation: arrive var(--dur-slow) var(--ease) 0.9s backwards; }
.gaze.settled .word { opacity: 0.7; }
.gaze .word:is(:hover, :focus-visible) { opacity: 1; transition-delay: 0s; }

footer { color: var(--ivory); position: absolute; left: var(--foot-left); right: var(--foot-right); bottom: var(--foot-bottom); display: flex; flex-wrap: wrap; gap: 1em 1.6em; align-items: center; justify-content: flex-end; font: 400 clamp(17px, 1.5vw, 26px) / 1 var(--serif); }
.time { display: flex; align-items: center; gap: 1.2em; margin-right: auto; font-variant-numeric: tabular-nums; }
.drain { position: relative; flex: none; width: clamp(4rem, 12vw, 9rem); height: 0.5em; opacity: 0.55; }
.end { display: flex; align-items: center; gap: 1.6em; }
[data-side="right"] .cue { left: auto; right: 8.1vw; }
@media (max-width: 40rem) { [data-side] .cue { left: var(--edge-left); right: var(--foot-right); max-width: none; } }
</style>
