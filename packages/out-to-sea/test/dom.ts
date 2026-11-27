export const data = new Map<string, string>()
const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) }
const win = Object.assign(new EventTarget(), { top: undefined as unknown, self: undefined as unknown, localStorage: storage })
win.top = win.self = win
// vueuse reads window and document once, when it loads, so the stubs come first; Storage is a class the stub is not
Object.assign(globalThis, { Storage: Map, window: win, localStorage: storage, document: { createElement: () => ({}), hidden: false }, location: { origin: "https://sea.example", pathname: "/" } })
