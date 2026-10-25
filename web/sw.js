// Keeps a copy of Myra in the browser so it opens without internet (the website version).
// The desktop app loads these files from disk, so it doesn't need this.
// Network first, so a new version shows up when you're online; the saved copy is the fallback when you're not.
const CACHE = 'myra-v1';
const FILES = [
  './', 'index.html', 'style.css', 'fonts.css', 'app.js', 'bridge.js', 'goo.js', 'vendor/editor.js', 'vendor/docx.js', 'icons/names.js', 'icons/MaterialIconsOutlined-Regular.otf',
  'fonts/Figtree-400-latin.woff2', 'fonts/Figtree-400-latin-ext.woff2', 'fonts/Figtree-500-latin.woff2', 'fonts/Figtree-500-latin-ext.woff2', 'fonts/Figtree-600-latin.woff2', 'fonts/Figtree-600-latin-ext.woff2', 'fonts/Figtree-700-latin.woff2', 'fonts/Figtree-700-latin-ext.woff2', 'fonts/Figtree-800-latin.woff2', 'fonts/Figtree-800-latin-ext.woff2',
  'fonts/ShantellSans-500-latin.woff2', 'fonts/ShantellSans-500-latin-ext.woff2', 'fonts/ShantellSans-700-latin.woff2', 'fonts/ShantellSans-700-latin-ext.woff2', 'fonts/MyraMark.woff2',
  'stamps/myra.png', 'stamps/myra-shook.png', 'stamps/myra-wave.png', 'stamps/myra-happy.png', 'stamps/myra-party.png', 'stamps/myra-love.png',
  'stamps/myra-sigh.gif', 'stamps/myra-sleepy.png', 'stamps/myra-cry.png', 'stamps/myra-sigh.png', 'stamps/myra-bounce.gif',
];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;   // only Myra's own files
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
