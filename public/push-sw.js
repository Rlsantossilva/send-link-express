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
  const MAX_AGE = 30 * 60 * 1000; // avisos com mais de 30 min não são exibidos
  const stale = payload.sentAt ? Date.now() - payload.sentAt > MAX_AGE : false;

  event.waitUntil(
    (async () => {
      // Fecha avisos que já passaram da validade (ficaram na bandeja).
      const existing = await self.registration.getNotifications();
      for (const notification of existing) {
        const sentAt = notification.data && notification.data.sentAt;
        if (!sentAt || Date.now() - sentAt > MAX_AGE) notification.close();
      }

      if (stale) return;

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
        data: {
          url: targetUrl,
          soundUrl: payload.soundUrl || null,
          sentAt: payload.sentAt || Date.now(),
        },
      });
    })(),
  );
});

/* Ao abrir/focar o app, limpa a bandeja de avisos pendentes. */
self.addEventListener("message", (event) => {
  if (!event.data || event.data.type !== "zaptri-clear-notifications") return;
  event.waitUntil(
    (async () => {
      const notifications = await self.registration.getNotifications();
      for (const notification of notifications) notification.close();
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
