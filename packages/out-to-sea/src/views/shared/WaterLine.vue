<template>
  <svg class="waterline" viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true">
    <path d="M2 6.5Q50 2.5 100 5.2T198 4.6" pathLength="1" />
    <path d="M40 9.2Q90 6.8 150 8.4" pathLength="1" opacity="0.55" />
  </svg>
</template>

<style scoped>
.waterline { position: absolute; left: 0; right: 0; bottom: 0; width: 100%; height: 0.5em; overflow: visible; pointer-events: none; }
path { fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; vector-effect: non-scaling-stroke; stroke-dasharray: 1; stroke-dashoffset: var(--draw, 0); transition: stroke-dashoffset var(--dur) var(--ease); }
path + path { transition-delay: 0.12s; }
@media (prefers-reduced-motion: reduce) { path { transition: none; } }
</style>
