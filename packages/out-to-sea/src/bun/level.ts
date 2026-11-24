import { dlopen, ptr, type Pointer } from "bun:ffi"

const { symbols: objc } = dlopen("libobjc.A.dylib", {
  objc_getClass: { args: ["cstring"], returns: "ptr" },
  sel_registerName: { args: ["cstring"], returns: "ptr" },
  objc_msgSend: { args: ["ptr", "ptr", "u64", "u64", "u64"], returns: "ptr" },
})
const text = (s: string) => Buffer.from(`${s}\0`)
// the declared return type allows a bigint; these calls always hand back a pointer
const cls = (name: string) => objc.objc_getClass(text(name)) as Pointer
const sel = (name: string) => objc.sel_registerName(text(name)) as Pointer
const send = (to: Pointer | null, selector: string, a: Pointer | number | null = 0, b: Pointer | number | null = 0, c = 0) =>
  objc.objc_msgSend(to, sel(selector), a ?? 0, b ?? 0, c) as Pointer
const SCREEN_SAVER = 1000

/** AppKit is only touched on its own thread, which takes one object from another, so the level goes as a key and its value. */
const setValue = (window: Pointer | null, name: string, value: number) => {
  const number = send(cls("NSNumber"), "numberWithLong:", value)
  const key = send(cls("NSString"), "stringWithUTF8String:", ptr(text(name)))
  const values = send(cls("NSDictionary"), "dictionaryWithObject:forKey:", number, key)
  send(window, "performSelectorOnMainThread:withObject:waitUntilDone:", sel("setValuesForKeysWithDictionary:"), values, 1)
}
/** 1000 is above everything but the menu bar's own tools; 3 floats above other apps' windows; 0 is an ordinary window. */
export const windowLevel = (window: Pointer | null, level: number) => setValue(window, "level", level)
/** On every Space, and over an app that has gone full screen: canJoinAllSpaces with fullScreenAuxiliary. */
export const overFullScreenApps = (window: Pointer | null) => setValue(window, "collectionBehavior", 1 | 256)
export const SCREEN = SCREEN_SAVER
export const FLOATING = 3
