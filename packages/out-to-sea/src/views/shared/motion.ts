import { usePreferredReducedMotion } from "@vueuse/core"
import gsap from "gsap"

export const useRise = () => {
  const motion = usePreferredReducedMotion()
  const still = () => motion.value === "reduce"
  return {
    enter: (el: Element, done: () => void) => {
      const parts = el.children.length ? Array.from(el.children) : [el]
      gsap.fromTo(parts, { opacity: 0, y: still() ? 0 : 18 }, { opacity: 1, y: 0, duration: still() ? 0.3 : 1.2, ease: "power2.out", stagger: still() ? 0 : 0.14, onComplete: done })
    },
    leave: (el: Element, done: () => void) => {
      gsap.to(el, { opacity: 0, y: still() ? 0 : -10, duration: still() ? 0.2 : 0.55, ease: "power1.in", onComplete: done })
    },
  }
}
