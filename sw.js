// build: 2026-06-18T16:29:19.557Z
const CACHE_NAME = "toilet-pwa-v17";

// 離線 fallback 必備資產（相對 SW 位置解析，本機 `/` 與 Pages `/toilet-pwa-app/` 皆正確）。
// 逐一 add 並各自 catch：單一資產缺失不致 install 失敗（離線 fallback 永遠盡力 precache）。
const PRECACHE = ["offline.html", "icons/icon-512.png"];

// App Shell Cache：index.html + main JS/CSS bundle + splash image + manifest.json
// build 時由 vite 插件（swTimestampPlugin）從 .vite/manifest.json 讀取 hashed 路徑後注入。
// 開發模式為空陣列（不預快取 bundle）；禁止加入 public/data/** / overrides/** 等資料 JSON。
const APP_SHELL = ["./","manifest.json","icons/muxi-labs-splash.png","assets/index-87zS9I_Y.js","assets/index-SorpUbP0.css"];

// 最終純文字 HTML 後備（precache 萬一也缺時，仍不讓 respondWith reject、不出 Safari 錯誤頁）。
function offlineHtmlResponse() {
  return new Response(
    "<!doctype html><meta charset=utf-8><title>離線</title><body style=\"font-family:sans-serif;text-align:center;padding:40px;color:#e91e8c\"><h1>目前沒有網路連線</h1><p style=color:#7a5269>請重新連線後再試一次</p><button onclick=location.reload() style=\"font-size:15px;padding:10px 18px;border:none;border-radius:999px;color:#fff;background:#f687b3\">重新整理</button></body>",
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

self.addEventListener("install", (e) => {
  // 不在 install 直接 skipWaiting，讓新版本先進入 waiting 狀態，由 App 送 SKIP_WAITING 才接管
  // （版本更新 Toast 依賴此 waiting 狀態，見 version-check.md）。
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        [...PRECACHE, ...APP_SHELL].map((url) => cache.add(url).catch(() => undefined))
      )
    )
  );
});

self.addEventListener("activate", (e) =>
  e.waitUntil(
    (async () => {
      // 清掉舊版 cache，只留當前版本（CACHE_NAME 升版即自動清除 v16 及更舊版本）
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  )
);

self.addEventListener("message", (e) => {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});

// fetch 策略：
//   navigate → 有網路：network-first + 8s timeout，逾時 fallback 到 cached index.html（App Shell）
//              確定離線：直接回 offline.html（static 靜態頁，不需要 JS 執行）
//   其他資產 → cache-first（App Shell precache 的 JS/CSS/圖片立即從快取回傳），
//              cache miss → network，失敗回安全 504（不 throw）
//   資料 JSON（data/ / overrides/）永遠不在 precache → cache-first 對它們等同 network-first，
//              不影響資料新鮮度，不污染 App Shell cache。
self.addEventListener("fetch", (e) => {
  const req = e.request;

  // iOS 安裝描述檔：強制正確 MIME（離線也不可 reject）。
  if (req.url.endsWith(".mobileconfig")) {
    e.respondWith(
      fetch(req)
        .then((res) =>
          new Response(res.body, {
            status: res.status,
            statusText: res.statusText,
            headers: { "Content-Type": "application/x-apple-aspen-config" },
          })
        )
        .catch(() =>
          caches.match(req).then((r) => r || new Response("", { status: 504, statusText: "offline" }))
        )
    );
    return;
  }

  // 導航請求（開啟頁面 / 重新整理）
  if (req.mode === "navigate") {
    if (!navigator.onLine) {
      // 確定離線 → offline.html（App Shell 需要 JS 執行；純靜態離線頁體驗更一致）
      e.respondWith(
        caches.match("offline.html").then((r) => r || offlineHtmlResponse())
      );
      return;
    }
    // 有網路 → network-first with 8s timeout，逾時 fallback 到 cached index.html（App Shell）。
    // 已安裝 PWA 或回訪使用者即使在慢網路，也能在 8s 內看到 App Shell，主畫面資料慢慢補。
    // 首次訪問（SW 尚未 precache）：timeout fallback 到 undefined → 再 fallback offline.html。
    e.respondWith(
      Promise.race([
        fetch(req),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("navigate-timeout")), 8000)
        ),
      ]).catch(() =>
        caches
          .match("./")
          .then((r) => r || caches.match("offline.html").then((r2) => r2 || offlineHtmlResponse()))
      )
    );
    return;
  }

  // 非導航資產：cache-first（App Shell precache 的 JS/CSS/圖片立即從快取回傳）
  // 未在 precache 的資產（Overpass、Nominatim、資料 JSON 等）cache miss → 照常 network fetch。
  e.respondWith(
    caches
      .match(req)
      .then((r) =>
        r || fetch(req).catch(() => new Response("", { status: 504, statusText: "offline" }))
      )
  );
});
