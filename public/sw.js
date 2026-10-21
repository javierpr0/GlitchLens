const VERSION = "v1";
const SHELL_CACHE = `glitchlens-shell-${VERSION}`;
const RUNTIME_CACHE = `glitchlens-runtime-${VERSION}`;

const SHELL_ASSETS = [
  "/manifest.webmanifest",
  "/icon-192.svg",
  "/icon-512.svg",
  "/apple-touch-icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never cache auth or notifications polling
  if (
    url.pathname.startsWith("/api/auth") ||
    url.pathname.startsWith("/api/notifications") ||
    url.pathname.startsWith("/_next/data") ||
    url.pathname.startsWith("/login")
  ) {
    return;
  }

  // Static assets: cache-first
  if (
    url.pathname.startsWith("/_next/static") ||
    url.pathname.startsWith("/icon-") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/apple-touch-icon.svg" ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".woff2")
  ) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Everything else (HTML pages, BFF reads): always go to network.
  // Never cache authenticated HTML — it is user/org-specific and would leak the
  // previous context after logout or org switch when served offline.
  event.respondWith(networkOnly(req));
});

async function cacheFirst(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return cached || Response.error();
  }
}

async function networkOnly(req) {
  try {
    return await fetch(req);
  } catch {
    // Offline: serve a generic shell with NO user data instead of stale cached HTML.
    if (req.headers.get("accept")?.includes("text/html")) {
      return new Response(OFFLINE_HTML, {
        status: 503,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    return Response.error();
  }
}

const OFFLINE_HTML = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title></head><body style="font-family:system-ui,sans-serif;background:#09090b;color:#e4e4e7;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center;padding:1.5rem"><h1 style="font-size:1.1rem;margin:0 0 .5rem">You're offline</h1><p style="color:#a1a1aa;font-size:.9rem;margin:0">Reconnect to load your GlitchTip data.</p></div></body></html>`;

self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") self.skipWaiting();
});
