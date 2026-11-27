addEventListener("fetch", (e) => {
  const { request } = e
  if (request.method !== "GET" || new URL(request.url).origin !== location.origin) return
  e.respondWith(
    caches.open("sea").then(async (cache) => {
      const hit = await cache.match(request)
      const net = fetch(request).then((res) => {
        if (res.ok) cache.put(request, res.clone())
        return res
      })
      if (request.mode === "navigate") return net.catch(() => hit ?? Response.error())
      net.catch(() => undefined)
      return hit ?? net
    }),
  )
})
