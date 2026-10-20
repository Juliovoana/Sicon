// ============================================================
// ROL DE ROUPAS (Lavanderia) — Service Worker
// Só cuida do "shell" da página lavanderia-booking.html (HTML, ícones e as
// bibliotecas/fontes externas) pra ela ABRIR sem internet.
// NUNCA intercepta chamadas ao Supabase (itens, preços, envio do rol): essas
// vão sempre direto pra rede — a lista de itens fica guardada pela própria
// página (localStorage) e o envio sem internet vira fila de pendentes.
//
// O escopo é só a página do rol (/lavanderia-booking...), não o resto do site.
// Suba a versão do CACHE_NAME sempre que mudar a lista de CORE_ASSETS ou quiser
// forçar todo mundo a buscar o shell novo.
// ============================================================

const CACHE_NAME = 'lavanderia-shell-v1';
const SUPABASE_LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
const PAGINA = new URL('./lavanderia-booking.html', self.location).href;

const CORE_ASSETS = [
  PAGINA,
  new URL('./lavanderia-manifest.json', self.location).href,
  new URL('./lavanderia-icons/icon-192.png', self.location).href,
  new URL('./lavanderia-icons/icon-512.png', self.location).href,
  new URL('./lavanderia-icons/icon-maskable-512.png', self.location).href,
  new URL('./lavanderia-icons/icon-180.png', self.location).href,
  SUPABASE_LIB
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // a página precisa entrar; o resto não derruba a instalação se um CDN estiver fora do ar
      await cache.add(PAGINA);
      await Promise.all(CORE_ASSETS.filter((u) => u !== PAGINA).map((u) => cache.add(u).catch(() => {})));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n.startsWith('lavanderia-shell-') && n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// rede primeiro (pega sempre a versão nova quando há internet), cache se a rede falhar ou demorar
function redePrimeiro(req, chaveCache, ms) {
  return new Promise((resolve) => {
    let respondeu = false;
    const usarCache = () => caches.match(chaveCache, { ignoreSearch: true });
    const timer = setTimeout(() => {
      usarCache().then((c) => { if (c && !respondeu) { respondeu = true; resolve(c); } });
    }, ms);
    fetch(req).then((res) => {
      clearTimeout(timer);
      if (res && res.ok) { const copia = res.clone(); caches.open(CACHE_NAME).then((c) => c.put(chaveCache, copia)); }
      if (!respondeu) { respondeu = true; resolve(res); }
    }).catch(() => {
      clearTimeout(timer);
      usarCache().then((c) => { if (!respondeu) { respondeu = true; resolve(c || Response.error()); } });
    });
  });
}

// cache primeiro, atualiza em segundo plano
function cachePrimeiro(req) {
  return caches.match(req, { ignoreSearch: true }).then((cached) => {
    const rede = fetch(req).then((res) => {
      if (res && (res.ok || res.type === 'opaque')) { const copia = res.clone(); caches.open(CACHE_NAME).then((c) => c.put(req, copia)); }
      return res;
    }).catch(() => cached);
    return cached || rede;
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;           // envio do rol (POST do Supabase) nunca passa por aqui
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    // a própria página (com ou sem ?cliente=...): rede primeiro, cai no cache offline
    if (req.mode === 'navigate' && url.pathname.indexOf('/lavanderia-booking') === 0) {
      event.respondWith(redePrimeiro(req, PAGINA, 4000));
      return;
    }
    // manifesto e ícones do app
    if (CORE_ASSETS.indexOf(url.origin + url.pathname) !== -1) { event.respondWith(cachePrimeiro(req)); }
    return;
  }

  // externos: só a biblioteca do Supabase e as fontes do Google (pra funcionar offline). Todo o resto — inclusive *.supabase.co — passa direto.
  if (req.url === SUPABASE_LIB || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cachePrimeiro(req));
  }
});
