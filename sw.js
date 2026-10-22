/* 오프라인 동작용 서비스 워커.
 *
 * 한 버전의 파일은 한 캐시에 '통째로' 담고, 그 캐시에서만 꺼내 준다.
 * (파일마다 따로 갱신하면 새 HTML + 옛 CSS처럼 버전이 섞여 화면이 깨질 수 있다)
 *
 * 배포할 때: VERSION을 올리고, index.html의 ?v= 값도 같은 값으로 맞춘다.
 * 새 버전은 설치 단계에서 서버에서 직접(HTTP 캐시 무시) 전부 받아 둔다.
 * 열려 있는 앱을 여기서 강제로 새로 고치지 않는다 (입력 중인 내용이 날아가므로) —
 * 앱이 화면에서 내려갔을 때 앱 쪽(main.js)에서 새로 고친다. */
const VERSION = '21';
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
  `./js/care.js?v=${VERSION}`,
  `./js/workout.js?v=${VERSION}`,
  `./js/study.js?v=${VERSION}`,
  `./js/health.js?v=${VERSION}`,
  `./js/diary.js?v=${VERSION}`,
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
      .then(async (c) => {
        await c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })));
        // 서버(CDN)가 아직 옛 index.html을 주면 이 버전은 설치하지 않고 다음에 다시 시도한다
        const html = await (await c.match('./index.html')).text();
        if (!html.includes(`?v=${VERSION}`)) {
          await caches.delete(CACHE);
          throw new Error('index.html이 아직 새 버전이 아니에요');
        }
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const old = (await caches.keys()).filter((k) => k !== CACHE);
    await Promise.all(old.map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
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
