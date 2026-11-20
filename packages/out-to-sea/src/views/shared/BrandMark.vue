<script setup lang="ts">
import { useElementHover, usePreferredReducedMotion, useTimeoutFn } from "@vueuse/core"
import gsap from "gsap"
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from "vue"

const props = withDefaults(defineProps<{ size?: number; settle?: number }>(), { size: 26, settle: 6 })
const NAME = "Out to Sea"
const root = useTemplateRef<HTMLElement>("root")
const hovered = useElementHover(root)
const motion = usePreferredReducedMotion()
let fold: gsap.core.Timeline | undefined

onMounted(() => {
  const letters = root.value!.querySelectorAll(".letter")
  fold = gsap.timeline({ paused: true }).to(Array.from(letters).reverse(), {
    rotateY: motion.value === "reduce" ? 0 : -90,
    opacity: 0,
    maxWidth: 0,
    duration: motion.value === "reduce" ? 0.3 : 0.55,
    ease: "power2.inOut",
    stagger: motion.value === "reduce" ? 0 : 0.045,
  })
})
const { start } = useTimeoutFn(() => !hovered.value && fold?.play(), () => props.settle * 1000)
watch(hovered, (over) => {
  if (over) fold?.reverse()
  else start()
})
onBeforeUnmount(() => fold?.kill())
</script>

<template>
  <span ref="root" class="brand" :style="{ fontSize: `${size}px` }" :aria-label="NAME">
    <svg viewBox="0 0 50 30" aria-hidden="true">
      <circle cx="25" cy="10" r="7" />
      <path d="M2 19.5Q13 15.5 25 19T48 18.5Q37 23.5 25 21T2 19.5ZM9 25Q18 22.6 26 25T42 24.4Q33 28.8 25 27T9 25Z" />
    </svg>
    <span class="name" aria-hidden="true"><span v-for="(c, i) in NAME" :key="i" class="letter">{{ c === " " ? " " : c }}</span></span>
  </span>
</template>

<style scoped>
.brand { display: inline-flex; align-items: center; gap: 0.55em; font-family: var(--serif); font-weight: 400; letter-spacing: 0.005em; line-height: 1; perspective: 400px; }
svg { flex: none; width: 1.9em; height: 1.15em; fill: currentColor; }
.name { display: inline-flex; white-space: pre; }
.letter { display: inline-block; max-width: 1em; transform-origin: left center; }
</style>
