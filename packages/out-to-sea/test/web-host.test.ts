import { expect, mock, test } from "bun:test"
import { data } from "./dom"

mock.module("../src/views/router", () => ({ router: { currentRoute: { value: { query: {} } }, replace: () => undefined } }))
const { webHost, browserName } = await import("../src/views/shared/web-host")

test("a browser is named from its user agent", () => {
  expect(browserName("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36")).toBe("Chrome on Android")
  expect(browserName("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1")).toBe("Safari on iPhone")
  expect(browserName("Mozilla/5.0 (Macintosh; Intel Mac OS X 14.0; rv:120.0) Gecko/20100101 Firefox/120.0")).toBe("Firefox on Mac")
})

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
