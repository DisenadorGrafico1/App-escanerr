/*
 * sw.js — Service Worker: guarda la app dentro del celular para que abra y
 * funcione aunque no haya internet ni datos.
 *
 * Estrategia:
 *  - Archivos de la app (html, css, js): primero se intenta la red con un
 *    límite de 3 segundos y, si no hay señal, se usa la copia guardada. Así
 *    las mejoras llegan solas cuando hay internet, sin dejar de funcionar sin él.
 *  - Librerías e iconos (vendor/, icons/): primero la copia guardada, porque
 *    casi nunca cambian y así la app abre al instante.
 *
 * Los datos de la tienda NO viven aquí: están en IndexedDB y no se tocan
 * nunca al actualizar.
 */
const CACHE = 'tienda-abarrotes-v2';
const ESPERA_RED = 3000;

const ARCHIVOS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './js/db.js',
  './js/scanner.js',
  './js/reportes.js',
  './js/nucleo.js',
  './js/venta.js',
  './js/inventario.js',
  './js/gestion.js',
  './js/app.js',
  './vendor/zxing.min.js',
  './vendor/jspdf.umd.min.js',
  './vendor/jspdf.plugin.autotable.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ARCHIVOS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function esArchivoDeLaApp(url) {
  return url.origin === location.origin &&
    !url.pathname.includes('/vendor/') && !url.pathname.includes('/icons/');
}

async function guardar(req, resp) {
  if (resp && resp.ok && new URL(req.url).origin === location.origin) {
    const copia = resp.clone();
    const c = await caches.open(CACHE);
    await c.put(req, copia);
  }
  return resp;
}

/** Red con límite de tiempo; si tarda o falla, se usa lo guardado. */
async function redPrimero(req) {
  try {
    const resp = await Promise.race([
      fetch(req).then((r) => guardar(req, r)),
      new Promise((_, rechazar) => setTimeout(() => rechazar(new Error('lenta')), ESPERA_RED))
    ]);
    if (resp) return resp;
  } catch (e) { /* sin señal: seguimos con la copia guardada */ }
  const guardada = await caches.match(req);
  return guardada || caches.match('./index.html');
}

async function cachePrimero(req) {
  const guardada = await caches.match(req);
  if (guardada) return guardada;
  try {
    return await fetch(req).then((r) => guardar(req, r));
  } catch (e) {
    return caches.match('./index.html');
  }
}

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  ev.respondWith(esArchivoDeLaApp(url) ? redPrimero(req) : cachePrimero(req));
});
