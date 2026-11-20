import { join } from "node:path"
import { prepareShader } from "@vgpu/wgsl/prepare"
import { resolveShader } from "@vgpu/wgsl/runtime"
import * as vgpu from "vgpu/node"
import type { seaParams } from "../src/shared/sea-params"
import { createSeaRenderer } from "../src/shared/sea-renderer"

const load = async (name: string) => prepareShader((await resolveShader({ entry: join(import.meta.dir, `../src/views/shared/${name}.wgsl`) })).wgsl)

export const headlessSea = async (width: number, height: number) => {
  const gpu = await vgpu.init()
  const view = vgpu.target(gpu, { size: [width, height], format: "rgba8unorm" })
  const renderer = createSeaRenderer(vgpu, gpu, { noise: await load("noise"), clouds: await load("clouds"), fall: await load("fall"), sea: await load("sea") })
  return {
    draw: (p: ReturnType<typeof seaParams>) => renderer.draw(view, p),
    read: async () => new Uint8Array(await view.color.read({ mipLevel: 0, region: "all" })),
    dispose: () => gpu.dispose(),
  }
}
