import { afterEach, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadPrefs, savePrefs } from "../src/bun/store"
import { breathingOf, DEFAULTS, migrate } from "../src/shared/prefs"

let dir = ""
afterEach(() => rm(dir, { recursive: true, force: true }))

test("an empty or broken file gives the defaults", () => {
  expect(migrate(undefined)).toMatchObject(DEFAULTS)
  expect(migrate("nonsense")).toMatchObject(DEFAULTS)
})

test("the old app's file keeps its sound and menu plugin, and the dissolve stays off until chosen", () => {
  const old = migrate({ sound: false, menuPlugin: " /x/menu.ts " })
  expect(old.sound).toBe(false)
  expect(old.menuPlugin).toBe("/x/menu.ts")
  expect(old.dissolve).toBe(false)
  expect(old.breathing).toEqual([5, 4, 8, 4])
})

test("fields this version doesn't know are kept for whoever wrote them", () => {
  expect(migrate({ colour: "teal" }).colour).toBe("teal")
})

test("out-of-range values are brought into range", () => {
  const p = migrate({ every: 999, look: 2, breathing: { mode: "custom", custom: [0, -4, 6, 0] } })
  expect(p.every).toBe(120)
  expect(p.look).toBe(10)
  expect(breathingOf(p)).toEqual([1, 0, 6, 0])
})

test("a pattern kept under the old modes becomes the one pattern", () => {
  expect(breathingOf(migrate({ breathing: { mode: "box", box: 5 } }))).toEqual([5, 5, 5, 5])
  expect(breathingOf(migrate({}))).toEqual([5, 4, 8, 4])
})

test("settings move from the old file to the new one on first launch, and are written whole", async () => {
  dir = await mkdtemp(join(tmpdir(), "outtosea-prefs-"))
  const legacy = join(dir, "bar.json"), path = join(dir, "OutToSea", "settings.json")
  await writeFile(legacy, JSON.stringify({ sound: true, menuPlugin: "/x/menu.ts", extra: 1 }))
  const first = await loadPrefs(path, legacy)
  expect(first.migrated).toBe(true)
  await savePrefs(path, { ...first.prefs, every: 30 })
  const second = await loadPrefs(path, legacy)
  expect(second.migrated).toBe(false)
  expect(second.prefs.every).toBe(30)
  expect(second.prefs.extra).toBe(1)
  expect(JSON.parse(await readFile(path, "utf8")).menuPlugin).toBe("/x/menu.ts")
})
