import { expect, mock, test } from "bun:test"
import { data } from "./dom"

mock.module("../src/views/router", () => ({ router: { currentRoute: { value: { query: {} } }, replace: () => undefined } }))
const { webHost } = await import("../src/views/shared/web-host")

test("switching sync on stores the secret apart from prefs and the status never shows it", async () => {
  const host = webHost()
  host.send.save({ ...(await host.ask.prefs()), every: 45 })
  host.send.syncOn({ on: true })
  await new Promise((r) => setTimeout(r, 100))
  const status = await host.ask.status()
  expect(status.sync.on).toBe(true)
  const { secret } = JSON.parse(data.get("outtosea:sync")!) as { secret: string }
  expect(JSON.stringify(status)).not.toContain(secret)
  expect(data.get("outtosea:prefs")).not.toContain(secret)
})
