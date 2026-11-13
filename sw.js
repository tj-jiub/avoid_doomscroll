/* SocialLite 서비스 워커 — 대시보드를 오프라인에서도 열 수 있게 한다.
 * 인스타그램 페이지에는 관여하지 않는다(그쪽은 유저스크립트가 담당).
 */
const VERSION = "sl-v1.0.0";
const SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./reels-blocker.js",
  "./manifest.json",
  "./install-bookmarklet.html",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon-180.png",
  "./tests/index.html",
  "./tests/iframe.html",
  "./tests/fixtures.js",
  "./test_blocker.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) =>
      Promise.all(
        SHELL.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => null)
        )
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 페이지 이동: 네트워크 우선, 실패하면 캐시된 대시보드
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("./index.html")))
    );
    return;
  }

  // 설치 파일은 항상 최신을 우선 (설정이 바뀌면 내용도 바뀐다)
  if (/(socialite\.user\.js|bookmarklet\.js)$/.test(url.pathname)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // 정적 자원: 캐시 우선 + 백그라운드 갱신
  event.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => hit);
      return hit || network;
    })
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});
