/* 오프라인 동작용 서비스 워커.
 *
 * 한 버전의 파일은 한 캐시에 '통째로' 담고, 그 캐시에서만 꺼내 준다.
 * (파일마다 따로 갱신하면 새 HTML + 옛 CSS처럼 버전이 섞여 화면이 깨질 수 있다)
 *
 * 배포할 때: VERSION을 올리고, index.html의 ?v= 값도 같은 값으로 맞춘다.
 * 새 버전은 설치 단계에서 서버에서 직접(HTTP 캐시 무시) 전부 받아 두고,
 * 준비가 끝나면 열려 있는 앱을 한 번 새로 고쳐 새 버전으로 바꾼다. */
const VERSION = '6';
const CACHE = `today-v${VERSION}`;
const ASSETS = [
  './',
  './index.html',
  `./style.css?v=${VERSION}`,
  `./js/core.js?v=${VERSION}`,
  `./js/events.js?v=${VERSION}`,
  `./js/today.js?v=${VERSION}`,
  `./js/calendar.js?v=${VERSION}`,
  `./js/stats.js?v=${VERSION}`,
  `./js/report.js?v=${VERSION}`,
  `./js/backup.js?v=${VERSION}`,
  `./js/main.js?v=${VERSION}`,
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  const ready = (async () => {
    const old = (await caches.keys()).filter((k) => k !== CACHE);
    await Promise.all(old.map((k) => caches.delete(k)));
    await self.clients.claim();
    return old.length > 0;
  })();
  e.waitUntil(ready);
  // 이전 버전에서 올라온 경우: 열려 있는 앱을 새 버전으로 다시 연다.
  // 주의: activate가 끝난 '뒤'에 해야 한다. activate 안에서 기다리면, 다시 여는 요청이
  // activate가 끝나기를 기다리고 activate는 그 요청을 기다려서 서로 멈춘다.
  ready.then(async (upgraded) => {
    if (!upgraded) return;
    for (const w of await self.clients.matchAll({ type: 'window' })) {
      if (w.navigate) w.navigate(w.url).catch(() => {});
    }
  });
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // 앱 화면(HTML)은 주소의 #·? 와 상관없이 이 버전의 index.html
    const hit = req.mode === 'navigate'
      ? await cache.match('./index.html')
      : await cache.match(req);
    if (hit) return hit;
    return fetch(req);
  })());
});
