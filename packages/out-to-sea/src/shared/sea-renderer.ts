import type * as vgpu from "vgpu"
import type { Target } from "vgpu"
import type { seaParams } from "./sea-params"

type Api = Pick<typeof vgpu, "compute" | "effect" | "frame" | "sampler" | "target" | "texture">
type Gpu = Awaited<ReturnType<typeof vgpu.init>>
type Shader = Parameters<typeof vgpu.effect>[1]

const NOISE = 96
type Effect = ReturnType<Api["effect"]>
const baked = new WeakMap<Gpu, { noise: ReturnType<Api["texture"]>; wrap: GPUSampler; smooth: GPUSampler; march?: Effect; pour?: Effect; paint?: Effect }>()

export const createSeaRenderer = (api: Api, gpu: Gpu, shaders: { noise: Shader; clouds: Shader; fall: Shader; sea: Shader }) => {
  let shared = baked.get(gpu)
  if (!shared) {
    const noise = api.texture(gpu, { kind: "3d", size: [NOISE, NOISE, NOISE], format: "rgba8unorm", usage: ["storage_binding", "texture_binding"] })
    api.compute(gpu, shaders.noise, { set: { shapeNoise: noise } }).dispatch(NOISE / 4, NOISE / 4, NOISE / 4)
    shared = {
      noise,
      wrap: api.sampler(gpu, { minFilter: "linear", magFilter: "linear", addressModeU: "repeat", addressModeV: "repeat", addressModeW: "repeat" }),
      smooth: api.sampler(gpu, { minFilter: "linear", magFilter: "linear" }),
    }
    baked.set(gpu, shared)
  }
  const { noise, wrap, smooth } = shared, passes = shared
  let sky: ReturnType<Api["target"]> | undefined
  let air: ReturnType<Api["target"]> | undefined
  return {
    draw(view: Target, p: ReturnType<typeof seaParams>) {
      const size = [Math.max(1, Math.round(p.view[0] / 2)), Math.max(1, Math.round(p.view[1] / 2))] as const
      if (!sky || !air) {
        sky = api.target(gpu, { size, format: "rgba16float" })
        air = api.target(gpu, { size, format: "rgba16float" })
      } else if (sky.size[0] !== size[0] || sky.size[1] !== size[1]) {
        sky.resize(size)
        air.resize(size)
      }
      const clouds = (passes.march ??= api.effect(gpu, shaders.clouds, { set: { p, shapeNoise: noise, noiseSampler: wrap } }))
      const falling = (passes.pour ??= api.effect(gpu, shaders.fall, { set: { p, shapeNoise: noise, noiseSampler: wrap } }))
      const sea = (passes.paint ??= api.effect(gpu, shaders.sea, { set: { p, clouds: sky, fall: air, cloudSampler: smooth } }))
      // shared by every sea on the device, so each frame says whose it is
      clouds.set({ p })
      falling.set({ p })
      sea.set({ p, clouds: sky, fall: air })
      const [cloudTarget, airTarget] = [sky, air]
      // a canvas surface is only drawn to inside a frame, which also presents it
      api.frame(gpu, (f) => {
        f.pass(cloudTarget, clouds)
        f.pass(airTarget, falling)
        f.pass(view, sea)
      })
    },
    dispose() {
      sky?.color.destroy()
      air?.color.destroy()
    },
  }
}
