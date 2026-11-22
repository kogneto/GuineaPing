// GuineaPing's service worker. It only shows Pushes and opens them: no fetch handler, no caching.
// Every push must show a notification, or Safari withdraws the subscription.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // Not ours or garbled: still show something rather than lose the subscription.
  }
  const title = typeof data.title === "string" && data.title ? data.title : "GuineaPing";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === "string" ? data.body : "Open GuineaPing to see what's new.",
      tag: typeof data.tag === "string" ? data.tag : undefined,
      icon: "/art/icons/app-icon-180.png",
      data: { url: typeof data.url === "string" ? data.url : "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Only ever open a page of this app.
  let url = new URL("/", self.location.origin);
  try {
    const wanted = new URL(event.notification.data?.url ?? "/", self.location.origin);
    if (wanted.origin === self.location.origin) url = wanted;
  } catch {}
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          await client.focus();
          return client.navigate(url.href);
        }
      }
      return self.clients.openWindow(url.href);
    })(),
  );
});
