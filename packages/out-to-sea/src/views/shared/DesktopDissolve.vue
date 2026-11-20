<script setup lang="ts">
import { onMounted, ref, useTemplateRef } from "vue"

const props = defineProps<{ src: string }>()
const canvas = useTemplateRef<HTMLCanvasElement>("canvas")
const done = ref(false)
const HOLD = 0.7

onMounted(() => {
  const img = new Image()
  img.onload = () => {
    const c = canvas.value!.getContext("2d")!, w = innerWidth, h = innerHeight, d = Math.min(devicePixelRatio, 2)
    canvas.value!.width = w * d
    canvas.value!.height = h * d
    c.scale(d, d)
    const off = document.createElement("canvas")
    off.width = img.width
    off.height = img.height
    const o = off.getContext("2d")!
    o.drawImage(img, 0, 0)
    const px = o.getImageData(0, 0, img.width, img.height).data, bw = w / img.width, bh = h / img.height
    const blocks = Array.from({ length: img.width * img.height }, (_, i) => ({
      x: (i % img.width) * bw, y: Math.floor(i / img.width) * bh, ink: `rgb(${px[i * 4]},${px[i * 4 + 1]},${px[i * 4 + 2]})`,
      vx: (Math.random() - 0.5) * 160, vy: -40 - Math.random() * 120, delay: HOLD + 0.6 * (1 - (i % img.width) / img.width) + 0.4 * Math.random(),
    }))
    const born = performance.now()
    const tick = () => {
      const t = (performance.now() - born) / 1000
      c.clearRect(0, 0, w, h)
      for (const b of blocks) {
        const u = Math.min(1, Math.max(0, (t - b.delay) / 1.6)), e = u * u
        c.globalAlpha = 1 - u
        c.fillStyle = b.ink
        c.fillRect(b.x + b.vx * e, b.y + b.vy * e, bw * (1 - 0.6 * u) + 0.5, bh * (1 - 0.6 * u) + 0.5)
      }
      if (t < HOLD + 2.4) requestAnimationFrame(tick)
      else done.value = true
    }
    tick()
  }
  img.onerror = () => (done.value = true)
  img.src = props.src
})
</script>

<template>
  <canvas v-if="!done" ref="canvas" class="dissolve" aria-hidden="true" />
</template>

<style scoped>
.dissolve { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
</style>
