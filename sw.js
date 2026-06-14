// build: 2026-06-14T16:50:33.740Z
const CACHE_NAME = "toilet-pwa-v15";

self.addEventListener("install", () => {
  // 不在 install 直接 skipWaiting，讓新版本先進入 waiting 狀態
  // 由 App 送出 SKIP_WAITING 訊息才接管，確保版本更新提示能正常顯示
});

self.addEventListener("activate", (e) =>
  e.waitUntil(self.clients.claim())
);

self.addEventListener("message", (e) => {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});

// pass-through，不做離線快取（Overpass API 即時資料不適合快取）
// 例外：.mobileconfig 強制帶入正確 MIME type，讓 iOS Safari 觸發安裝描述檔
self.addEventListener("fetch", (e) => {
  if (e.request.url.endsWith(".mobileconfig")) {
    e.respondWith(
      fetch(e.request).then((res) =>
        new Response(res.body, {
          status: res.status,
          statusText: res.statusText,
          headers: { "Content-Type": "application/x-apple-aspen-config" },
        })
      )
    );
    return;
  }
  e.respondWith(fetch(e.request));
});
