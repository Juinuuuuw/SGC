// sw.js — Service Worker do SGC
// Estratégia:  Shell (HTML/CSS/JS/imagens) → Cache First
//              API calls                   → Network First (com fallback)
//              POSTs offline               → Delegado ao sync.js via IndexedDB

const CACHE_NAME   = 'sgc-shell-v1.2';
const OFFLINE_PAGE = './index.html';

// ── Assets estáticos que sempre devem estar disponíveis ───────
const SHELL_ASSETS = [
  './index.html',
  './script.js',
  // CSS
  './css/base.css',
  './css/components.css',
  './css/pdv.css',
  './css/cadastro.css',
  './css/importacao.css',
  './css/estoque.css',
  './css/financeiro.css',
  './css/etiquetas.css',
  './css/chatbot.css',
  './css/mobile.css',
  './css/dashboard.css',
  './css/mesas.css',
  './css/offline.css',
  // JS modules
  './js/mobile.js',
  './js/sgc_dashboard.js',
  './js/sgc_financeiro.js',
  './js/sgc_empresa.js',
  './js/sgc_relatorios.js',
  './js/sgc_mesas.js',
  './js/db.js',
  './js/sync.js',
  // Imagens
  './sgc_icon.png',
  './sgc_white_icon.png',
  './sgc_logo_banner.png',
  './sgc_notebook.png',
  // Login / Landing
  './login.html',
  './landing.html',
  './login-style.css',
  './landing-style.css',
];

// ════════════════════════════════════════════════════════════
//  INSTALL — pré-cacheia o shell
// ════════════════════════════════════════════════════════════
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // addAll falha se qualquer asset não existir; usamos um loop
        // tolerante a erros para não bloquear a instalação
        return Promise.allSettled(
          SHELL_ASSETS.map(url =>
            cache.add(url).catch(() => {
              console.warn(`[SW] Falha ao cachear: ${url}`);
            })
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// ════════════════════════════════════════════════════════════
//  ACTIVATE — limpa caches antigos
// ════════════════════════════════════════════════════════════
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== CACHE_NAME)
            .map(key => {
              console.log(`[SW] Removendo cache antigo: ${key}`);
              return caches.delete(key);
            })
        )
      )
      .then(() => self.clients.claim())
  );
});

// ════════════════════════════════════════════════════════════
//  FETCH — intercepta todas as requisições
// ════════════════════════════════════════════════════════════
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignora extensões do browser e chrome-extension
  if (!url.protocol.startsWith('http')) return;

  // ── POST para a API: deixa passar — o sync.js trata offline ──
  if (request.method !== 'GET') return;

  // ── Chamadas de API (GET): Network First ─────────────────────
  if (url.pathname.includes('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // ── Assets estáticos: Cache First ────────────────────────────
  event.respondWith(cacheFirst(request));
});

// ── Cache First ───────────────────────────────────────────────
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const network = await fetch(request);
    // Cacheia dinamicamente arquivos novos
    if (network.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, network.clone());
    }
    return network;
  } catch {
    // Fallback para index.html se for navegação
    if (request.mode === 'navigate') {
      return caches.match(OFFLINE_PAGE);
    }
    return new Response('Recurso não disponível offline.', { status: 503 });
  }
}

// ── Network First ─────────────────────────────────────────────
async function networkFirst(request) {
  try {
    const network = await fetch(request);
    // Cacheia a resposta da API para uso offline futuro
    if (network.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, network.clone());
    }
    return network;
  } catch {
    // Sem rede: tenta o cache
    const cached = await caches.match(request);
    if (cached) return cached;
    // Nada disponível
    return new Response(
      JSON.stringify({ success: false, offline: true, message: 'Sem conexão com o servidor.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ════════════════════════════════════════════════════════════
//  BACKGROUND SYNC (API experimental — suporte parcial)
//  Fallback: o sync.js usa navigator.onLine + evento 'online'
// ════════════════════════════════════════════════════════════
self.addEventListener('sync', (event) => {
  if (event.tag === 'sgc-sync-pendentes') {
    event.waitUntil(notificarClientes('SYNC_NOW'));
  }
});

// ── Mensagens para os clientes (abas abertas) ─────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

async function notificarClientes(tipo) {
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach(client => client.postMessage({ type: tipo }));
}
