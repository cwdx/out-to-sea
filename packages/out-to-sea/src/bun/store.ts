import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { migrate, type Prefs } from "../shared/prefs"

export type Stored = Prefs & Record<string, unknown>

export const loadPrefs = async (path: string, legacy?: string): Promise<{ prefs: Stored; migrated: boolean }> => {
  for (const [file, migrated] of [[path, false], ...(legacy ? [[legacy, true] as const] : [])] as const) {
    try {
      return { prefs: migrate(JSON.parse(await readFile(file, "utf8"))), migrated }
    } catch {
    }
  }
  return { prefs: migrate({}), migrated: false }
}

/** Written aside and renamed, so a crash mid-write never leaves half a file. */
export const savePrefs = async (path: string, prefs: Stored) => {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(prefs, null, 2)}\n`)
  await rename(temporary, path).catch(async (error: unknown) => {
    await rm(temporary, { force: true })
    throw error
  })
}
