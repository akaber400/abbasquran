const VERSION = 'abbasi-v2.0.0';
const SHELL_CACHE = VERSION + '-shell';
const RUNTIME_CACHE = VERSION + '-runtime';
const SHELL_ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];
// مضيفات ثابتة (مكتبات وخطوط) يجوز تخزينها؛ أي مضيف آخر (قاعدة البيانات، واجهات القرآن، الصوت) يمر مباشرة للشبكة
const STATIC_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];
 
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SHELL_CACHE)
      .then(c => Promise.allSettled(SHELL_ASSETS.map(a => c.add(a))))
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
 
function putSafe(req, res) {
  if (!res || res.status !== 200 || (res.type !== 'basic' && res.type !== 'cors')) return;
  const copy = res.clone();
  caches.open(RUNTIME_CACHE).then(c => c.put(req, copy)).catch(() => {});
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
        const net = fetch(req).then(res => { putSafe(req, res); return res; }).catch(() => hit);
        return hit || net;
      })
    );
    return;
  }
 
  // ملفات التطبيق: الشبكة أولاً ثم الذاكرة عند انقطاع الاتصال
  e.respondWith(
    fetch(req).then(res => { putSafe(req, res); return res; })
      .catch(() => caches.match(req).then(r => r || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});