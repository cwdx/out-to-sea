<script setup lang="ts">
import { useClipboard } from "@vueuse/core"
import { onMounted, useTemplateRef } from "vue"
import { drawQr } from "./qr"
import "./sync-dialog.css"

const { words, link } = defineProps<{ words?: string; link?: string }>()
const emit = defineEmits<{ done: [] }>()
const dialog = useTemplateRef("dialog")
const canvas = useTemplateRef("canvas")
const lines = words ? [words.split(" ").slice(0, 3), words.split(" ").slice(3)] : []
const { copy, copied } = useClipboard({ legacy: false, copiedDuring: 1500 })
const secret = words ?? link
let didCopy = false
async function copyIt() {
  if (!secret) return
  await copy(secret)
  didCopy = true
}
function done() {
  if (didCopy) void navigator.clipboard.writeText("").catch(() => undefined)
  emit("done")
}
onMounted(() => {
  dialog.value?.showModal()
  if (canvas.value && link) void drawQr(canvas.value, link, 200)
})
</script>

<template>
  <dialog ref="dialog" class="sync" aria-labelledby="offer-title" @cancel.prevent="done">
    <h2 id="offer-title">Add a device</h2>
    <p v-if="!link" role="alert" class="muted">That did not work. Try again.</p>
    <template v-else>
      <p>On the new device, open Sync and enter:</p>
      <p v-if="words" class="words"><template v-for="(line, i) in lines" :key="i">{{ line.join(" ") }}<br></template></p>
      <button type="button" class="copy" :aria-label="words ? 'Copy the six words' : 'Copy the link'" aria-live="polite" @click="copyIt">{{ copied ? "Copied" : "Copy" }}</button>
      <canvas ref="canvas" class="qr" role="img" aria-label="QR code" />
      <p v-if="words" class="muted">Valid for 10 minutes</p>
      <p v-else class="link-text">{{ link }}</p>
    </template>
    <button type="button" class="primary" @click="done">Done</button>
  </dialog>
</template>

<style scoped>
.sync { text-align: center; }
.sync[open] { display: grid; gap: 14px; justify-items: center; }
.copy { color: var(--teal); font-weight: 500; margin-top: -10px; }
.link-text { max-width: 100%; overflow-wrap: anywhere; font-size: 13px; user-select: all; }
.words { font: 500 clamp(20px, 6vw, 24px) / 1.4 var(--serif); color: var(--heading); text-wrap: balance; }
.qr { width: min(200px, 56vw); height: auto; aspect-ratio: 1; border-radius: 6px; image-rendering: pixelated; }
@media (max-height: 480px) and (orientation: landscape) {
  .sync { width: min(36rem, calc(100vw - 2rem)); text-align: left; }
  .sync[open] { grid-template-columns: auto 1fr; justify-items: start; align-items: center; column-gap: 24px; }
  .qr { grid-row: 1 / 7; width: min(200px, 56dvh); }
}
</style>
