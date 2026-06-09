// Atrium Casa — Service Worker v2
// Estratégia: Network First para HTML, Cache First para fontes
// Garante reload limpo no Edge/Safari iOS

const CACHE = 'atrium-v2';
const HTML_URL = '/atrium-casa-supabase.html';

// ── Install ──────────────────────────────────────────────────
self.addEventListener('install', function(e) {
  self.skipWaiting(); // ativa imediatamente, sem esperar fechar abas
});

// ── Activate ─────────────────────────────────────────────────
self.addEventListener('activate', function(e) {
  e.waitUntil(
    // Remove versões antigas de cache
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim(); // assume controle de todas as abas imediatamente
    })
  );
});

// ── Fetch ─────────────────────────────────────────────────────
self.addEventListener('fetch', function(e) {
  var req = e.request;
  var url = req.url;

  // 1. Supabase API — nunca cachear
  if (url.includes('supabase.co') || url.includes('supabase.io')) {
    return; // deixa o browser fazer normalmente
  }

  // 2. Navegação (HTML) — Network First, sem cache
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req, { cache: 'no-store' })
        .then(function(res) {
          // Guarda cópia para offline
          var copy = res.clone();
          caches.open(CACHE).then(function(c) { c.put(req, copy); });
          return res;
        })
        .catch(function() {
          // Offline: serve o que tiver em cache
          return caches.match(req).then(function(cached) {
            return cached || new Response('Sem conexão. Tente novamente.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            });
          });
        })
    );
    return;
  }

  // 3. Fontes Google — Cache First (não mudam)
  if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
    e.respondWith(
      caches.match(req).then(function(cached) {
        if (cached) return cached;
        return fetch(req).then(function(res) {
          caches.open(CACHE).then(function(c) { c.put(req, res.clone()); });
          return res;
        });
      })
    );
    return;
  }

  // 4. Todo o resto — Network First
  e.respondWith(
    fetch(req, { cache: 'no-store' }).catch(function() {
      return caches.match(req);
    })
  );
});
