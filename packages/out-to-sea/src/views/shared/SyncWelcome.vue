<script setup lang="ts">
const emit = defineEmits<{ link: []; start: [] }>()
</script>

<template>
  <main class="welcome">
    <h1>Welcome to Out to Sea</h1>
    <p>Already use it on another device? <button type="button" class="link" @click="emit('link')">Link</button></p>
    <button type="button" class="start" @click="emit('start')">Start</button>
  </main>
</template>

<style scoped>
.welcome { display: grid; align-content: center; justify-items: center; gap: 16px; min-height: 100dvh; padding: max(24px, env(safe-area-inset-top)) max(24px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(24px, env(safe-area-inset-left)); background: var(--paper); color: var(--sheet-ink); font: 400 15px/1.4 var(--sans); text-align: center; }
h1 { font: 500 28px/1.3 var(--serif); color: var(--heading); }
button { min-height: 44px; padding: 0 12px; color: var(--teal); font-weight: 500; }
button:focus-visible { outline: 2px solid var(--teal); outline-offset: 2px; border-radius: 3px; }
</style>
