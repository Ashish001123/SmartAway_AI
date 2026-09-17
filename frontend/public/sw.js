// Service worker for SmartWay AI web push alerts
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data?.text() };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "SmartWay AI", {
      body: data.body || "",
      icon: "/ai.png",
      badge: "/ai.png",
      tag: data.tag,
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const appWindow = windows.find((w) => w.url.startsWith(self.location.origin));
      if (appWindow) {
        return appWindow.navigate(url).then((w) => (w || appWindow).focus());
      }
      return self.clients.openWindow(url);
    })
  );
});
