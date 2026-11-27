import type { BarcodeDetector } from "barcode-detector/ponyfill"
import { onScopeDispose, ref, type ShallowRef } from "vue"
import { native } from "./bridge"

let zxing: Promise<typeof BarcodeDetector> | undefined

/** zxing's WebAssembly is served from this app: barcode-detector would fetch it from jsDelivr. */
async function loadZxing() {
  const [{ BarcodeDetector, prepareZXingModule }, { default: wasm }] = await Promise.all([import("barcode-detector/ponyfill"), import("zxing-wasm/reader/zxing_reader.wasm?url")])
  prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? wasm : prefix + path) } })
  return BarcodeDetector
}

async function qrDetector() {
  const builtin = (globalThis as { BarcodeDetector?: typeof BarcodeDetector }).BarcodeDetector
  const Detector = builtin && (await builtin.getSupportedFormats()).includes("qr_code") ? builtin : await (zxing ??= loadZxing())
  return new Detector({ formats: ["qr_code"] })
}

function cameraError(e: unknown) {
  const name = (e as { name?: string }).name
  if (name === "NotAllowedError" || name === "SecurityError") return `Camera access is blocked. Allow it for ${native ? "the app in the phone's settings" : "this site in the browser's settings"}, then try again.`
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera found."
  if (name === "NotReadableError" || name === "AbortError") return "Another app is using the camera."
  return "The camera failed to start."
}

/** Shows the rear camera in `video` until `scan()` reads one QR code and resolves with its text, or null when cancelled or the camera fails. */
export function useQrScan(video: Readonly<ShallowRef<HTMLVideoElement | null>>) {
  const error = ref("")
  let run = 0
  let stream: MediaStream | undefined

  function cancel() {
    run++
    stream?.getTracks().forEach((t) => t.stop())
    stream = undefined
  }
  onScopeDispose(cancel)

  async function scan() {
    cancel()
    const mine = run
    error.value = ""
    if (!window.isSecureContext) {
      error.value = "The camera needs a secure connection."
      return null
    }
    try {
      const [detector, media] = await Promise.all([qrDetector(), navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" } } })])
      if (mine !== run) {
        media.getTracks().forEach((t) => t.stop())
        return null
      }
      stream = media
      while (mine === run) {
        const v = video.value
        if (v && v.srcObject !== media) {
          v.srcObject = media
          v.play().catch(() => {})
        }
        const [code] = v && !v.paused && v.readyState >= v.HAVE_CURRENT_DATA ? await detector.detect(v) : []
        if (code?.rawValue && mine === run) {
          cancel()
          return code.rawValue
        }
        await new Promise(requestAnimationFrame)
      }
    } catch (e) {
      if (mine === run) {
        cancel()
        error.value = cameraError(e)
      }
    }
    return null
  }

  return { scan, cancel, error }
}
