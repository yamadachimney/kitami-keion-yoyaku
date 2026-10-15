/* 北見工大 軽音予約：アプリ化用（オフラインでも画面だけは開けるようにする） */
const VERSION = 'v4';
const CORE = ['./', 'index.html', 'firebase-config.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // 予約データ（Firebase）には触らない
  if (/firebaseio\.com|firebasedatabase\.app|googleapis\.com/.test(url.hostname)) return;
  const sameOrigin = url.origin === self.location.origin;
  const isPage = req.mode === 'navigate' || (sameOrigin && /(\/|index\.html|firebase-config\.js)$/.test(url.pathname));
  if (isPage) {
    // ページ本体は「最新を優先」。電波がないときだけ保存しておいたものを出す
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(VERSION).then(x => x.put(req, c)); return r; })
      .catch(() => caches.match(req).then(r => r || caches.match('index.html'))));
    return;
  }
  if (sameOrigin || url.hostname === 'www.gstatic.com' || url.hostname === 'fonts.gstatic.com' || url.hostname === 'fonts.googleapis.com') {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
      if (r.ok || r.type === 'opaque') { const c = r.clone(); caches.open(VERSION).then(x => x.put(req, c)); }
      return r;
    })));
  }
});
