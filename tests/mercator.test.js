import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearProyeccion, latitudCreciente, latitudDesdeCreciente } from '../assets/js/practicas/mercator.js';
import { rumboDistancia } from '../assets/js/practicas/geo.js';

const META = {
  limites: { latMin: 35.75, latMax: 36.25, lonMin: -13.0, lonMax: -12.25 },
  viewBox: { ancho: 1400, margen: 56 }
};
const cerca = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} esperado ${b} ±${tol}, obtenido ${a}`);

test('latitudCreciente y su inversa', () => {
  cerca(latitudCreciente(0), 0, 1e-12);
  cerca(latitudDesdeCreciente(latitudCreciente(36.1)), 36.1, 1e-9);
});

test('aGeo es la inversa de aPx en 200 puntos aleatorios', () => {
  const p = crearProyeccion(META);
  let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 200; i++) {
    const g = [35.75 + rnd() * 0.5, -13 + rnd() * 0.75];
    const { x, y } = p.aPx(g);
    const back = p.aGeo(x, y);
    cerca(back[0], g[0], 1e-7); cerca(back[1], g[1], 1e-7);
  }
});

test('las esquinas de los límites caen en las esquinas del marco', () => {
  const p = crearProyeccion(META);
  const ii = p.aPx([35.75, -13.0]);
  cerca(ii.x, p.marco.x0, 1e-6); cerca(ii.y, p.marco.y1, 1e-6);
  const sd = p.aPx([36.25, -12.25]);
  cerca(sd.x, p.marco.x1, 1e-6); cerca(sd.y, p.marco.y0, 1e-6);
  assert.equal(p.marco.x0, 56);
  assert.equal(p.marco.x1, 1400 - 56);
});

test('la proyección es conforme: el alto se deriva del ancho y la escala de latitudes crece con la latitud', () => {
  const p = crearProyeccion(META);
  assert.ok(p.viewBox.alto > 1000 && p.viewBox.alto < 1300, `alto ${p.viewBox.alto}`);
  assert.ok(p.pxPorMinutoLat(36.25) > p.pxPorMinutoLat(35.75));
  cerca(p.pxPorMinutoLat(36.0) * Math.cos(36.0 * Math.PI / 180), p.pxPorMinutoLon(), 1e-6, 'conformidad');
});

test('millasEntrePx coincide con geo.rumboDistancia', () => {
  const p = crearProyeccion(META);
  const A = [36.0, -12.9], B = [36.2, -12.4];
  const a = p.aPx(A), b = p.aPx(B);
  cerca(p.millasEntrePx(a, b), rumboDistancia(A, B).distancia, 0.05);
});

test('enEscalaLateral y enEscalaLongitud distinguen los márgenes', () => {
  const p = crearProyeccion(META);
  const ymed = (p.marco.y0 + p.marco.y1) / 2, xmed = (p.marco.x0 + p.marco.x1) / 2;
  assert.equal(p.enEscalaLateral({ x: 20, y: ymed }), 'izq');
  assert.equal(p.enEscalaLateral({ x: p.marco.x1 + 20, y: ymed }), 'der');
  assert.equal(p.enEscalaLateral({ x: xmed, y: ymed }), null);
  assert.equal(p.enEscalaLongitud({ x: xmed, y: 20 }), 'sup');
  assert.equal(p.enEscalaLongitud({ x: xmed, y: p.marco.y1 + 20 }), 'inf');
  assert.equal(p.enEscalaLongitud({ x: xmed, y: ymed }), null);
});

test('graduacion devuelve minutos y décimas con su tipo', () => {
  const p = crearProyeccion(META);
  const min = p.graduacion('lat', 1);
  assert.equal(min.length, 31);
  assert.equal(min.filter(t => t.tipo === 'grado').length, 1);
  assert.equal(min[0].valor, 35.75);
  assert.ok(min[0].px > min[30].px, 'la latitud crece hacia arriba');
  const dec = p.graduacion('lon', 0.1);
  assert.equal(dec.length, 451);
  assert.equal(dec.filter(t => t.tipo === 'grado').length, 1);   // 13° W
  assert.equal(dec.filter(t => t.tipo === 'minuto').length, 45);
});
