<script setup lang="ts">
import { onMounted, ref, useTemplateRef } from "vue"
import "./sync-dialog.css"
import { useQrScan } from "./useQrScan"

const { link = "", busy = false } = defineProps<{ link?: string; busy?: boolean }>()
const emit = defineEmits<{ join: [text: string]; cancel: [] }>()
const problem = defineModel<"" | "wrong" | "slow">("problem")
const dialog = useTemplateRef("dialog")
const video = useTemplateRef("video")
const text = ref(link)
const scanning = ref(false)
const { scan, cancel, error } = useQrScan(video)
const camera = !!navigator.mediaDevices?.getUserMedia
onMounted(() => dialog.value?.showModal())

async function scanned() {
  scanning.value = true
  const found = await scan()
  scanning.value = false
  if (found) emit("join", found)
}
const close = () => {
  cancel()
  emit("cancel")
}
</script>

<template>
  <dialog ref="dialog" class="sync" aria-labelledby="join-title" @cancel.prevent="close">
    <form @submit.prevent="text.trim() && !busy && emit('join', text.trim())">
      <h2 id="join-title">Link</h2>
      <input v-model="text" class="entry" type="text" aria-label="Six words or link" spellcheck="false" autocomplete="off" autocapitalize="none" :disabled="busy" @input="problem = ''">
      <video v-show="scanning" ref="video" class="video" muted playsinline aria-label="Camera" />
      <p v-if="error" role="alert" class="muted">{{ error }}</p>
      <p v-if="problem" role="alert" class="muted">{{ problem === "slow" ? "That took too long. Check the words and try again." : "That did not work. Ask the other device for a new one." }}</p>
      <div class="actions">
        <button v-if="camera" type="button" :disabled="busy" @click="scanning ? (cancel(), (scanning = false)) : scanned()">{{ scanning ? "Stop" : "Scan" }}</button>
        <button type="button" :disabled="busy" @click="close">Cancel</button>
        <button type="submit" class="primary" :disabled="busy" :aria-busy="busy"><span v-if="busy" class="spin" aria-hidden="true" />{{ busy ? "Joining…" : "Join" }}</button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
form { display: grid; gap: 14px; }
.video { width: 100%; max-height: 40dvh; aspect-ratio: 1; object-fit: cover; border-radius: 8px; background: #000; }
.actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
</style>
