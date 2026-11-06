const VERSION = 'abbasi-v2.1.0';
const SHELL_CACHE = VERSION + '-shell';
const RUNTIME_CACHE = VERSION + '-runtime';
const SHELL_ASSETS = ['./', './index.html', './manifest.json', './icon-180.png', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];
// مكتبات خارجية تُخزَّن مسبقاً ليعمل التطبيق دون إنترنت (يجب أن تطابق الروابط في index.html)
const CDN_PRECACHE = [
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js'
];
// مضيفات ثابتة (مكتبات وخطوط) يجوز تخزينها؛ أي مضيف آخر (قاعدة البيانات، واجهات القرآن، الصوت) يمر مباشرة للشبكة
const STATIC_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const NAV_TIMEOUT = 4000; // مهلة الشبكة قبل الرجوع للنسخة المخزنة (اتصال ضعيف)

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SHELL_CACHE)
      .then(c => Promise.allSettled([
        ...SHELL_ASSETS.map(a => c.add(new Request(a, { cache: 'reload' }))),
        ...CDN_PRECACHE.map(u => c.add(new Request(u, { mode: 'cors', credentials: 'omit' })))
      ]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

// أي استجابة صالحة تُخزَّن؛ الاستجابات المبهمة (opaque) تُقبل فقط من المضيفات الثابتة
function putSafe(req, res, allowOpaque) {
  if (!res) return;
  const ok = (res.status === 200 && (res.type === 'basic' || res.type === 'cors')) ||
             (allowOpaque && res.type === 'opaque');
  if (!ok) return;
  const copy = res.clone();
  caches.open(RUNTIME_CACHE).then(c => c.put(req, copy)).catch(() => {});
}

function networkWithTimeout(req, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(req).then(r => { clearTimeout(t); resolve(r); }, e => { clearTimeout(t); reject(e); });
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (req.headers.has('range')) return; // الصوت والملفات الكبيرة
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // مضيفات خارجية ثابتة: من الذاكرة أولاً ثم تحديث في الخلفية
  if (url.origin !== self.location.origin) {
    if (!STATIC_HOSTS.includes(url.hostname)) return; // لا نتدخل في طلبات البيانات
    e.respondWith(
      caches.match(req).then(hit => {
        const net = fetch(req)
          .then(res => { putSafe(req, res, true); return res; })
          .catch(() => hit || Response.error());
        return hit || net;
      })
    );
    return;
  }

  // صفحة التطبيق: الشبكة أولاً (بمهلة) ثم النسخة المخزنة عند الانقطاع أو ضعف الاتصال
  if (req.mode === 'navigate') {
    e.respondWith(
      networkWithTimeout(req, NAV_TIMEOUT)
        .then(res => { putSafe(req, res); return res; })
        .catch(() =>
          caches.match(req, { ignoreSearch: true })
            .then(r => r || caches.match('./index.html'))
            .then(r => r || caches.match('./'))
            .then(r => r || Response.error())
        )
    );
    return;
  }

  // بقية ملفات التطبيق (manifest وأيقونات...): الشبكة أولاً ثم الذاكرة
  e.respondWith(
    fetch(req)
      .then(res => { putSafe(req, res); return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || Response.error()))
  );
});
