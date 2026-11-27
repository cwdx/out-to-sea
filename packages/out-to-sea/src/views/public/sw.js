addEventListener("fetch", (e) => {
  const { request } = e
  const url = new URL(request.url)
  if (request.method !== "GET" || url.origin !== location.origin) return
  const hashed = url.pathname.includes("/assets/")
  e.respondWith(
    caches.open("sea").then(async (cache) => {
      const hit = await cache.match(request)
      if (hashed && hit) return hit
      try {
        const res = await fetch(request)
        if (res.status === 200) await cache.put(request, res.clone()).catch(() => undefined)
        return res
      } catch {
        return hit ?? Response.error()
      }
    }),
  )
})
