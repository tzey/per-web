import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const raiz = new URL('../', import.meta.url);
const sw = readFileSync(new URL('sw.js', raiz), 'utf8');

test('sw.js ha subido de versión para invalidar la caché anterior', () => {
  const m = sw.match(/const VERSION = '([^']+)'/);
  assert.ok(m, 'no se encuentra VERSION');
  assert.notEqual(m[1], 'per-v1');
});

const recursos = [...sw.matchAll(/'([^']+)'/g)].map(m => m[1]).filter(r => /\.(html|js|css|json|png|webmanifest)$/.test(r));

test('todos los recursos de RECURSOS existen (cache.addAll es atómico)', () => {
  assert.ok(recursos.length > 20);
  for (const r of recursos) assert.ok(existsSync(new URL(r, raiz)), `falta ${r}`);
});

test('RECURSOS incluye las páginas, módulos y datos de prácticas y excluye tests y tools', () => {
  for (const r of ['practicas.html', 'mesa.html', 'assets/css/practicas.css', 'data/tablilla-desvios.json', 'data/cartas/estrecho-didactico.json',
    ...['geo', 'mercator', 'carta', 'instrumentos', 'ejercicios', 'sesion', 'mesa'].map(m => `assets/js/practicas/${m}.js`)]) {
    assert.ok(recursos.includes(r), `falta ${r} en RECURSOS`);
  }
  assert.ok(!recursos.some(r => r.startsWith('tests/') || r.startsWith('tools/')));
});

test('el rail, el índice y el README enlazan las prácticas', () => {
  assert.match(readFileSync(new URL('assets/js/comun.js', raiz), 'utf8'), /practicas\.html/);
  assert.match(readFileSync(new URL('index.html', raiz), 'utf8'), /practicas\.html/);
  assert.match(readFileSync(new URL('README.md', raiz), 'utf8'), /node --test tests\//);
  assert.match(readFileSync(new URL('carta.html', raiz), 'utf8'), /mesa\.html/);
});
