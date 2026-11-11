// MeetApp service worker: makes the app installable and repeat visits faster.
// Only same-origin GETs are touched. The API, calls (LiveKit) and recordings always go to the network.
const CACHE = "meetapp-v1";
const MAX_ASSETS = 80;
const OFFLINE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MeetApp - offline</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#08090c;color:#f4f4f5;font:16px system-ui,sans-serif;text-align:center;padding:24px}button{margin-top:16px;height:44px;padding:0 20px;border:0;border-radius:14px;background:#c1f354;color:#08090c;font-weight:600;font-size:15px;cursor:pointer}p{color:#a1a1aa}</style>
<div><h1 style="font-size:22px">You're offline</h1><p>MeetApp needs the internet for calls and notes.<br>Check your connection and try again.</p><button onclick="location.reload()">Try again</button></div>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;

  // pages: always fresh from the network (so a new deploy shows at once); a friendly page when offline
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => new Response(OFFLINE, { headers: { "Content-Type": "text/html; charset=utf-8" } })));
    return;
  }

  // build files have a hash in the name, so a cached copy never goes stale
  if (url.pathname.startsWith("/assets/")) {
    e.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) {
          await cache.put(req, res.clone());
          const keys = await cache.keys(); // oldest first; drop old deploys' files
          await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_ASSETS)).map((k) => cache.delete(k)));
        }
        return res;
      }),
    );
  }
});
