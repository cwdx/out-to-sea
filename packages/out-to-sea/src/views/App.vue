<template>
  <RouterView v-slot="{ Component, route }">
    <Transition name="screen">
      <component :is="Component" :key="route.fullPath" />
    </Transition>
  </RouterView>
</template>

<style>
.screen-enter-active, .screen-leave-active { transition: opacity 0.6s ease; }
.screen-leave-active { position: fixed; inset: 0; }
.screen-enter-from, .screen-leave-to { opacity: 0; }
</style>
