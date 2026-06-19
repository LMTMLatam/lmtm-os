// KILL-SWITCH SERVICE WORKER (v4).
//
// Older builds shipped a caching service worker. In some browsers it got
// "stuck": it kept serving stale HTML/JS from Cache Storage and bypassed the
// network entirely, so the user saw an old version of the app (e.g. Meta
// showing as "not connected") even though the server and the deployed bundle
// were correct. A cache-name bump (v3) was not enough to dislodge it.
//
// This version caches NOTHING. The browser re-fetches sw.js on every visit
// (the SW script itself bypasses the HTTP cache during update checks), so as
// soon as a stuck browser loads the app again it gets THIS worker, which:
//   1. deletes every Cache Storage entry this origin ever created,
//   2. unregisters itself (future loads have no service worker at all), and
//   3. reloads any open tabs so they pull fresh assets from the network.
//
// After this runs once, the app loads straight from the network using the
// already-correct cache headers (index.html: no-cache, assets: immutable+hashed).

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 1. Wipe all caches.
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      // 2. Remove this service worker entirely.
      await self.registration.unregister();
      // 3. Force every controlled tab to reload from the network.
      const windows = await self.clients.matchAll({ type: "window" });
      for (const client of windows) {
        try {
          client.navigate(client.url);
        } catch {
          // navigate() can throw if the client is not controllable; ignore.
        }
      }
    })()
  );
});

// Never intercept/serve from cache — let every request hit the network.
self.addEventListener("fetch", () => {});
