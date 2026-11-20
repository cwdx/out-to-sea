<script lang="ts">
// every sea on the page keeps the one clock, so the water is where it was when one screen gives way to the next
</script>

<script setup lang="ts">
import { useDocumentVisibility, useEventListener, usePreferredReducedMotion, useRafFn } from "@vueuse/core"
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef, watch } from "vue"
import { paletteOf, seaPoint, type Frame } from "../../shared/sea"
import { blendScenes, type Scene } from "../../shared/sky"
import { mountGpuSea, type GpuSea } from "./gpu-sea"

const EPOCH = performance.now()

const props = withDefaults(defineProps<{
  scene: Scene
  seed: number
  frame?: (t: number) => Partial<Frame>
  at?: number
  fps?: number
  backdrop?: boolean
}>(), { fps: 30, backdrop: true })

const canvas = useTemplateRef<HTMLCanvasElement>("canvas")
const motion = usePreferredReducedMotion()
const visible = useDocumentVisibility()
const sea = shallowRef<GpuSea>()
let last = -Infinity

let moment: Frame = { t: 0 }
const TURN = 2600
let from = props.scene, shown = props.scene, turned = -Infinity
let stones: (readonly [x: number, z: number, at: number])[] = []
const emit = defineEmits<{ sky: []; water: [] }>()
const tap = (e: PointerEvent) => {
  const box = canvas.value!.getBoundingClientRect()
  const point = seaPoint((e.clientX - box.left) / box.width, (e.clientY - box.top) / box.height, box.width / box.height)
  if (!point) return emit("sky")
  stones = [[...point, moment.t] as const, ...stones].slice(0, 4)
  emit("water")
}
const paint = (now: number) => {
  const t = props.at ?? (motion.value === "reduce" ? 0 : (now - EPOCH) / 1000)
  moment = { t, ...props.frame?.(t), taps: stones.map(([x, z, at]) => [x, z, t - at] as const) }
  const k = Math.min(1, (now - turned) / TURN)
  shown = k < 1 ? blendScenes(from, props.scene, k * k * (3 - 2 * k)) : props.scene
  sea.value?.draw(shown, moment)
  // a canvas whose surface has never been presented shows whatever the compositor holds; it shows once it has a frame
  if (sea.value && !drawn.value && canvas.value?.clientWidth) requestAnimationFrame(() => (drawn.value = true))
}
const drawn = ref(false)
const backdrop = computed(() => {
  const p = paletteOf(props.scene), c = (v: readonly number[]) => `rgb(${v.map(Math.round).join(" ")})`
  return `linear-gradient(${c(p.top)}, ${c(p.haze)} 54%, ${c(p.sea)} 54.5%, ${c(p.deep)})`
})

const { pause, resume } = useRafFn(({ timestamp }) => {
  if (timestamp - last < 1000 / props.fps - 2) return
  last = timestamp
  paint(timestamp)
}, { immediate: false })

const still = () => props.at !== undefined || motion.value === "reduce"
const settle = () => {
  if (visible.value === "visible" && !still()) resume()
  else {
    pause()
    paint(performance.now())
  }
}

onMounted(async () => {
  sea.value = await mountGpuSea(canvas.value!, props.seed).catch(() => undefined)
  settle()
})
let seen = -Infinity
watch(visible, (v) => v === "visible" && (seen = performance.now()))
watch(() => props.scene, () => {
  from = shown
  const now = performance.now()
  turned = still() || visible.value !== "visible" || now - seen < 400 ? -Infinity : now
})
watch([visible, motion, () => props.at, () => props.scene], settle)
useEventListener("resize", () => paint(performance.now()))
onBeforeUnmount(() => {
  pause()
  sea.value?.dispose()
})
defineExpose({ picture: () => sea.value?.picture(shown, moment) })
</script>

<template>
  <div v-if="backdrop && !drawn" class="sea" :style="{ background: backdrop }" aria-hidden="true" />
  <canvas ref="canvas" class="sea" :class="{ drawn }" aria-hidden="true" @pointerdown="tap" />
</template>

<style scoped>
.sea { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
canvas.sea { opacity: 0; transition: opacity 0.25s; }
canvas.sea.drawn { opacity: 1; }
</style>
