const CACHE_NAME = 'papertrade-static-v1'
const STATIC_ASSETS = [
  '/offline.html',
  '/favicon.svg',
  '/icon.svg',
  '/og-image.svg',
  '/.well-known/metanet-app.json',
  '/manifest.json'
]

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)))
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    ))
  )
  self.clients.claim()
})

self.addEventListener('fetch', event => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => await caches.match('/offline.html')))
    return
  }

  event.respondWith(
    caches.match(request).then(async cached => {
      if (cached != null) return cached
      const response = await fetch(request)
      if (response.ok && ['style', 'script', 'image', 'font', 'manifest'].includes(request.destination)) {
        const cache = await caches.open(CACHE_NAME)
        await cache.put(request, response.clone())
      }
      return response
    })
  )
})
