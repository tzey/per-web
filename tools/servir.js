// Servidor estático mínimo para desarrollo: node tools/servir.js [puerto] [raíz]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const puerto = +(process.argv[2] ?? 8765);
const raiz = process.argv[3] ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.pdf': 'application/pdf' };

createServer(async (req, res) => {
  let ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (ruta.endsWith('/')) ruta += 'index.html';
  const fichero = join(raiz, normalize(ruta));
  if (!fichero.startsWith(raiz)) { res.writeHead(403); return res.end(); }
  try {
    const s = await stat(fichero);
    if (s.isDirectory()) { res.writeHead(301, { Location: ruta + '/' }); return res.end(); }
    res.writeHead(200, { 'Content-Type': TIPOS[extname(fichero)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await readFile(fichero));
  } catch { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('404 ' + ruta); }
}).listen(puerto, () => console.log(`Sirviendo ${raiz} en http://localhost:${puerto}`));
