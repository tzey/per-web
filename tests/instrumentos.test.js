import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluarLecturaCompas, evaluarTransportador, anguloEntrePx } from '../assets/js/practicas/instrumentos.js';
import { crearProyeccion } from '../assets/js/practicas/mercator.js';

const META = { limites: { latMin: 35.75, latMax: 36.25, lonMin: -13.0, lonMax: -12.25 }, viewBox: { ancho: 1400, margen: 56 } };
const proy = crearProyeccion(META);
const cerca = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} esperado ${b} ±${tol}, obtenido ${a}`);

// una abertura de compás tomada entre dos puntos de la carta
const A = proy.aPx([36.0, -12.7]), B = proy.aPx([36.1, -12.7]);   // 6 M en el meridiano
const abertura = Math.hypot(B.x - A.x, B.y - A.y);

test('evaluarLecturaCompas lee millas cuando ambas puntas están sobre la escala lateral a la latitud medida', () => {
  const x = proy.marco.x0 - 8;
  const r = evaluarLecturaCompas({ x, y: A.y }, { x, y: A.y - abertura }, proy, { latMedida: 36.05 });
  assert.equal(r.motivo, 'ok');
  cerca(r.millas, 6, 0.05);
  const der = evaluarLecturaCompas({ x: proy.marco.x1 + 10, y: A.y }, { x: proy.marco.x1 + 10, y: A.y - abertura }, proy, { latMedida: 36.05 });
  assert.equal(der.motivo, 'ok');
});

test('evaluarLecturaCompas rechaza una punta fuera de la escala', () => {
  const r = evaluarLecturaCompas({ x: proy.marco.x0 - 8, y: A.y }, { x: proy.marco.x0 + 40, y: A.y - abertura }, proy, { latMedida: 36.05 });
  assert.equal(r.motivo, 'no-en-escala');
  assert.equal(r.millas, null);
});

test('evaluarLecturaCompas detecta la medida en la escala de longitudes', () => {
  const y = proy.marco.y0 - 8;
  const r = evaluarLecturaCompas({ x: 400, y }, { x: 400 + abertura, y }, proy, { latMedida: 36.05 });
  assert.equal(r.motivo, 'en-longitudes');
  assert.equal(r.millas, null);
  assert.ok(r.minutosLon > 6, 'informa de los minutos de longitud leídos para explicar el error');
});

test('evaluarLecturaCompas avisa cuando la escala se lee lejos de la latitud medida', () => {
  const x = proy.marco.x0 - 8;
  const lejos = proy.aPx([35.78, -13]).y;
  const r = evaluarLecturaCompas({ x, y: lejos }, { x, y: lejos - abertura }, proy, { latMedida: 36.2 });
  assert.equal(r.motivo, 'latitud-alejada');
  assert.ok(typeof r.millas === 'number', 'devuelve la lectura aunque avise');
  assert.ok(Math.abs(r.millas - 6) > 0.01, 'la lectura difiere de la medida correcta por la escala variable');
});

test('anguloEntrePx devuelve el rumbo de pantalla respecto al norte de la carta', () => {
  cerca(anguloEntrePx({ x: 0, y: 0 }, { x: 0, y: -10 }), 0, 1e-9);
  cerca(anguloEntrePx({ x: 0, y: 0 }, { x: 10, y: 0 }), 90, 1e-9);
  cerca(anguloEntrePx({ x: 0, y: 0 }, { x: 0, y: 10 }), 180, 1e-9);
  cerca(anguloEntrePx({ x: 0, y: 0 }, { x: -10, y: 0 }), 270, 1e-9);
});

test('evaluarTransportador detecta el recíproco y mide el error', () => {
  assert.deepEqual(evaluarTransportador(46, 46), { ok: true, reciproco: false, error: 0 });
  const r = evaluarTransportador(226, 46);
  assert.equal(r.ok, false); assert.equal(r.reciproco, true);
  const e = evaluarTransportador(48.5, 46, 1);
  assert.equal(e.ok, false); assert.equal(e.reciproco, false); cerca(e.error, 2.5, 1e-9);
  assert.equal(evaluarTransportador(359.5, 0.2, 1).ok, true);
});
