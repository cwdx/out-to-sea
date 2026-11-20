import { expect, test } from "bun:test"
import { anchorBelow } from "../src/bun/anchor"

test("the popover sits under its icon and stays on a display left of and above the main one", () => {
  const size = { width: 330, height: 430 }
  expect(anchorBelow({ x: 900, y: 0, width: 22, height: 24 }, { x: 0, y: 25, width: 1440, height: 875 }, size)).toEqual({ x: 592, y: 25, width: 330, height: 430 })
  expect(anchorBelow({ x: -30, y: -900, width: 22, height: 24 }, { x: -1920, y: -1055, width: 1920, height: 1055 }, size).x).toBe(-338)
  // macOS measures the icon from the bottom of the screen; the panel still hangs from the top
  expect(anchorBelow({ x: 522, y: 870, width: 38, height: 22 }, { x: 47, y: 30, width: 1393, height: 870 }, size).y).toBe(30)
  expect(anchorBelow({ x: 1430, y: 0, width: 22, height: 24 }, { x: 0, y: 25, width: 1440, height: 875 }, size).x).toBe(1110)
})
