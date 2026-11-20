import * as vgpu from "vgpu"
import type { Frame } from "../../shared/sea"
import { seaParams } from "../../shared/sea-params"
import { createSeaRenderer } from "../../shared/sea-renderer"
import type { Scene } from "../../shared/sky"
import clouds from "./clouds.wgsl"
import fall from "./fall.wgsl"
import noise from "./noise.wgsl"
import sea from "./sea.wgsl"

type Moment = Pick<Frame, "t" | "level" | "pulse" | "fade" | "ripples" | "taps">
export type GpuSea = { draw: (scene: Scene, f: Moment) => void; picture: (scene: Scene, f: Moment) => Promise<Blob>; dispose: () => void }

const PICTURE = [3024, 1964] as const

let device: Promise<Awaited<ReturnType<typeof vgpu.init>> | undefined> | undefined

export const mountGpuSea = async (canvas: HTMLCanvasElement, seed: number): Promise<GpuSea | undefined> => {
  if (!("gpu" in navigator)) return undefined
  const gpu = await (device ??= vgpu.init().catch(() => undefined))
  if (!gpu) return undefined
  // a plain (not sRGB) format, as the headless captures use: the shader's colours are already sRGB and go out as written;
  // premultiplied alpha, so the fade at the start and end shows the desktop through; at most one and a half pixels a
  // point, where the painted edges are already crisp and a Retina screen costs half what its full density would
  const view = vgpu.surface(gpu, canvas, { dpr: [1, 1.5], format: "bgra8unorm", alphaMode: "premultiplied" })
  const renderer = createSeaRenderer(vgpu, gpu, { noise, clouds, fall, sea })
  return {
    draw(scene, f) {
      // the canvas's own size, which is right from the first frame; the surface catches up a frame later
      const width = canvas.clientWidth, height = canvas.clientHeight
      if (!width || !height) return
      renderer.draw(view, seaParams(scene, { width, height, seed, ...f }))
    },
    async picture(scene, f) {
      const [width, height] = PICTURE
      const shot = vgpu.target(gpu, { size: PICTURE, format: "rgba8unorm" })
      const painter = createSeaRenderer(vgpu, gpu, { noise, clouds, fall, sea })
      painter.draw(shot, seaParams(scene, { width: width / 2, height: height / 2, seed, ...f, fade: 1 }))
      const pixels = new Uint8ClampedArray(await shot.color.read({ mipLevel: 0, region: "all" }))
      painter.dispose()
      shot.color.destroy()
      const canvas = new OffscreenCanvas(width, height)
      canvas.getContext("2d")!.putImageData(new ImageData(pixels, width, height), 0, 0)
      return canvas.convertToBlob({ type: "image/png" })
    },
    dispose() {
      renderer.dispose()
      view.dispose()
    },
  }
}
