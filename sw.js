// Atrium Casa — Service Worker
// Estratégia: Network First para o HTML principal, Cache First para assets estáticos
// Isso garante que o app sempre carrega a versão mais recente do servidor no reload.

const CACHE_NAME = 'atrium-v1';

// Assets que podem ser cacheados (fontes, ícones)
const CACHE_STATIC = [
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&display=swap',
];

// Install — pré-cacheia assets estáticos
self.addEventListener('install', function(e) {
  self.skipWaiting(); // ativa imediatamente sem esperar aba fechar
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(CACHE_STATIC).catch(function(){});
    })
  );
});

// Activate — remove caches antigos
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k){ return k !== CACHE_NAME; })
            .map(function(k){ return caches.delete(k); })
      );
    }).then(function(){ return self.clients.claim(); }) // assume controle imediato
  );
});

// Fetch — estratégia por tipo de recurso
self.addEventListener('fetch', function(e) {
  var url = e.request.url;

  // Supabase API — nunca cachear, sempre rede
  if (url.includes('supabase.co')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // HTML principal (atrium-casa-supabase.html ou /) — Network First
  // Sempre tenta buscar do servidor; só usa cache se offline
  if (
    e.request.mode === 'navigate' ||
    url.endsWith('.html') ||
    url.endsWith('/')
  ) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .then(function(response) {
          // Atualiza o cache com a versão mais recente
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(e.request, clone);
          });
          return response;
        })
        .catch(function() {
          // Offline: serve do cache
          return caches.match(e.request);
        })
    );
    return;
  }

  // Google Fonts e outros assets estáticos — Cache First
  if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
    e.respondWith(
      caches.match(e.request).then(function(cached) {
        return cached || fetch(e.request).then(function(response) {
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(e.request, response.clone());
          });
          return response;
        });
      })
    );
    return;
  }

  // Default — Network First para todo o resto
  e.respondWith(
    fetch(e.request, { cache: 'no-store' }).catch(function() {
      return caches.match(e.request);
    })
  );
});
