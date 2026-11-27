const parts = (tag: string) => /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag)?.slice(1).map(Number)

export const isNewer = (tag: string, current: string) => {
  const a = parts(tag)
  const b = parts(current)
  const i = a && b ? a.findIndex((n, k) => n !== b[k]) : -1
  return i >= 0 && a![i]! > b![i]!
}
