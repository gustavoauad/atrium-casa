// Atrium Casa — Service Worker v3 (auto-unregister)
// Remove-se automaticamente para não bloquear o carregamento do app
self.addEventListener('install', function() { self.skipWaiting(); });
self.addEventListener('activate', function(e) {
  e.waitUntil(
    self.registration.unregister().then(function() {
      return self.clients.matchAll({ type: 'window' });
    }).then(function(clients) {
      clients.forEach(function(c) { c.navigate(c.url); });
    })
  );
});
