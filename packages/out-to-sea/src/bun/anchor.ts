export type Rect = { x: number; y: number; width: number; height: number }

/** The icon's own `y` is unused: macOS measures it from the bottom of the screen, so the panel hangs from the top of the work area. */
export const anchorBelow = (icon: Rect, workArea: Rect, size: { width: number; height: number }): Rect => {
  const width = Math.min(size.width, workArea.width), height = Math.min(size.height, workArea.height)
  const x = Math.round(icon.x + icon.width - width), y = workArea.y
  return {
    x: Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - width)),
    y: Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - height)),
    width,
    height,
  }
}
