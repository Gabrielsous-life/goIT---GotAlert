// Service worker mínimo: permite instalar o app no celular e mostrar notificações.
// Não guarda cache, para que o protótipo sempre carregue a versão mais nova.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const win = windows[0];
      if (win) {
        win.navigate('/#/alertas');
        return win.focus();
      }
      return self.clients.openWindow('/#/alertas');
    }),
  );
});
