/* Estudio sin conexión. Sube VERSION al publicar cambios de contenido. */
const VERSION = 'per-v2';

const RECURSOS = [
  './', 'index.html', 'temario.html', 'test.html', 'carta.html', 'practicas.html', 'mesa.html',
  'manifest.webmanifest',
  'assets/css/main.css', 'assets/css/practicas.css',
  'assets/js/comun.js',
  'assets/js/practicas/geo.js', 'assets/js/practicas/mercator.js', 'assets/js/practicas/carta.js', 'assets/js/practicas/instrumentos.js',
  'assets/js/practicas/ejercicios.js', 'assets/js/practicas/sesion.js', 'assets/js/practicas/mesa.js',
  'assets/img/icono-192.png', 'assets/img/icono-512.png',
  'data/modelo-a.json', 'data/modelo-b.json', 'data/ejercicios-carta.json',
  'data/tablilla-desvios.json', 'data/mareas-didacticas.json', 'data/cartas/estrecho-didactico.json',
  'content/ut01.html', 'content/ut02.html', 'content/ut03.html', 'content/ut04.html',
  'content/ut05.html', 'content/ut06.html', 'content/ut07.html', 'content/ut08.html',
  'content/ut09.html', 'content/ut10.html', 'content/ut11.html', 'content/vela.html'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(RECURSOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/* Red primero con reserva en caché: el contenido se actualiza al publicar
   y sigue disponible sin cobertura. */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copia = res.clone();
        caches.open(VERSION).then(c => c.put(e.request, copia)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});
