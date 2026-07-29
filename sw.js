const CACHE_NAME = "saddah-pwa-v29";
const OFFLINE_URL = "offline.html";

// تخزين الملف المُشارَك (Web Share Target) في IndexedDB ليقرأه صفحة التوثيق
function saveSharedFile(file) {
  return new Promise((resolve) => {
    const req = indexedDB.open("SaddahShareStore", 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("sharedFiles")) db.createObjectStore("sharedFiles");
    };
    req.onsuccess = (e) => {
      const db = e.target.result;
      try {
        const tx = db.transaction("sharedFiles", "readwrite");
        tx.objectStore("sharedFiles").put(file, "latestShare");
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (err) { resolve(false); }
    };
    req.onerror = () => resolve(false);
  });
}

// نُبقي قائمة مسبقة صغيرة وآمنة فقط (الباقي يُخزَّن وقت التشغيل)
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/offline.html",
  "/manifest.json"
];

self.addEventListener("install", (event) => {
  // تثبيت متسامح: لا يفشل التثبيت لو تعذّر تخزين ملف
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(ASSETS_TO_CACHE.map((u) => cache.add(u)))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.map((n) => (n !== CACHE_NAME ? caches.delete(n) : null)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // ── هدف المشاركة (PWA Share Target): استقبال ملف مُشارَك من الجوال ──
  // المتصفح يرسل POST إلى /share-handler؛ نخزّن الملف ثم نحوّل لصفحة التوثيق.
  const url = new URL(req.url);
  if (req.method === "POST" && url.pathname.endsWith("/share-handler")) {
    event.respondWith(
      (async () => {
        try {
          const form = await req.formData();
          const file = form.get("shared_file");
          if (file && file.size) await saveSharedFile(file);
        } catch (e) {}
        return Response.redirect("/share_attach.html?src=share", 303);
      })()
    );
    return;
  }

  if (req.method !== "GET") return;

  // نتعامل فقط مع http/https (نتجاهل chrome-extension و data و blob …)
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  // لا نتدخّل في الـAPI ولا اتصالات السوكِت/الخارجية
  if (req.url.includes("/api/") || req.url.includes("/socket.io/")) return;

  const sameOrigin = url.origin === self.location.origin;

  // Network-first مع تجاوز كاش المتصفح للملفات الفرعية (يمنع خدمة كود قديم)،
  // والرجوع للكاش فقط عند انقطاع الشبكة.
  const fetchReq = (sameOrigin && req.mode !== "navigate") ? new Request(req, { cache: "no-cache" }) : req;
  event.respondWith(
    fetch(fetchReq)
      .then((res) => {
        // نخزّن نسخ نفس الأصل فقط (تجنّب فشل put مع schemes غير مدعومة)
        if (res && res.status === 200 && res.type === "basic" && sameOrigin) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, clone)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((cached) => {
          if (cached) return cached;
          if (req.mode === "navigate") return caches.match(OFFLINE_URL);
          return undefined;
        })
      )
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});
