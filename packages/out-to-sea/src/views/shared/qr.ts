export async function drawQr(canvas: HTMLCanvasElement, text: string, size: number) {
  const { encode } = await import("uqr")
  const qr = encode(text, { ecc: "M", border: 2 })
  const cell = Math.floor((size * (window.devicePixelRatio || 1)) / qr.size)
  canvas.width = canvas.height = cell * qr.size
  const ctx = canvas.getContext("2d")!
  ctx.fillStyle = "#fff"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = "#000"
  qr.data.forEach((row, y) => row.forEach((on, x) => on && ctx.fillRect(x * cell, y * cell, cell, cell)))
}
