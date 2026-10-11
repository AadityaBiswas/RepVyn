// RepVyn service worker: opens offline, keeps fonts, shows reminders (ADR-0006, ADR-0007).
// __BUILD__ is replaced at build time, so every deploy installs a fresh cache.
const VERSION = "__BUILD__";
const SHELL = `repvyn-shell-${VERSION}`;
const FONTS = "repvyn-fonts-v1";
const PRECACHE = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("repvyn-shell-") && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // The app page: network first so updates arrive, the cached copy when offline or slow.
  if (req.mode === "navigate" && url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL);
      try {
        const res = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error("slow")), 4000))]);
        if (res.ok && url.pathname === "/") await cache.put("/", res.clone());
        return res;
      } catch {
        return (await cache.match(url.pathname === "/" ? "/" : req)) ?? (await cache.match("/")) ?? Response.error();
      }
    })());
    return;
  }

  // Fonts: cache first, refreshed in the background.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith((async () => {
      const cache = await caches.open(FONTS);
      const hit = await cache.match(req);
      const net = fetch(req).then((res) => { if (res.ok || res.type === "opaque") void cache.put(req, res.clone()); return res; }).catch(() => hit);
      return hit ?? net;
    })());
    return;
  }

  // Our own static files: cache first.
  if (url.origin === self.location.origin && (url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest")) {
    event.respondWith(caches.match(req).then((hit) => hit ?? fetch(req)));
  }
  // Everything else (Supabase, Razorpay, analytics) goes straight to the network.
});

self.addEventListener("push", (event) => {
  let msg = { title: "RepVyn", body: "Today's workout is ready when you are.", url: "/", tag: "daily-reminder" };
  try { msg = { ...msg, ...event.data.json() }; } catch { /* keep the default text */ }
  event.waitUntil(self.registration.showNotification(msg.title, {
    body: msg.body, tag: msg.tag, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", data: { url: msg.url },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url ?? "/", self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = all.find((c) => new URL(c.url).origin === self.location.origin);
    if (open) return open.focus();
    return self.clients.openWindow(target);
  })());
});
