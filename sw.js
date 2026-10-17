const C = 'cc-v1'; const FILES = ['./', 'index.html', 'app.js', 'shared.js', 'style.css', 'manifest.webmanifest', 'icon-180.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k))))));
self.addEventListener('fetch', e => { const u = new URL(e.request.url); if (u.origin !== location.origin) return; // never cache OpenAI calls
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request))); });
