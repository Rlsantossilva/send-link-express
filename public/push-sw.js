/* Zap Tri — service worker de notificações push (mensagens e reações). */
/* eslint-disable no-undef */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || "Zap Tri";
  const body = payload.body || "Você recebeu uma nova mensagem";
  const targetUrl = payload.url || "/conversas";

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const visible = clientList.find((client) => client.visibilityState === "visible");

      // App aberto e visível: só toca o som escolhido; a UI já mostra a mensagem.
      if (visible) {
        visible.postMessage({ type: "zaptri-push", payload });
        return;
      }

      for (const client of clientList) {
        client.postMessage({ type: "zaptri-push", payload });
      }

      await self.registration.showNotification(title, {
        body,
        tag: payload.tag || "zaptri",
        renotify: true,
        icon: "/favicon.ico",
        badge: "/favicon.ico",
        vibrate: payload.kind === "reaction" ? [40, 60, 40] : [80, 40, 80],
        silent: false,
        data: { url: targetUrl, soundUrl: payload.soundUrl || null },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/conversas";

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientList) {
        if ("focus" in client) {
          client.postMessage({ type: "zaptri-navigate", url: targetUrl });
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })(),
  );
});
