<script setup lang="ts">
defineProps<{ on: boolean }>()
defineEmits<{ toggle: [] }>()
</script>

<template>
  <button type="button" class="tool" :aria-pressed="on" :aria-label="on ? 'Sound on' : 'Sound off'" @click="$emit('toggle')">
    <svg viewBox="0 0 28 22" aria-hidden="true">
      <path d="M3 8h4l6-5v16l-6-5H3z" />
      <path v-if="on" d="M17 7.5q2.5 3.5 0 7M20.5 5q4.5 6 0 12M24 3q6 8 0 16" />
      <path v-else d="M18 7l7 8M25 7l-7 8" />
    </svg>
  </button>
</template>

<style scoped>
svg { width: 28px; height: 22px; }
</style>
