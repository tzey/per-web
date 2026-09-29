import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearSesion, leerHistorial, registrarResultado, CLAVE_PRACTICAS, resumenHistorial } from '../assets/js/practicas/sesion.js';

function almacenFalso() {
  const m = new Map();
  return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m };
}

test('percibido aplica los errores de instrumento configurados solo en aprendizaje', () => {
  const s = crearSesion({ modo: 'aprendizaje', cartaId: 'c', ejercicios: [], errores: { desvioExtra: 2 } });
  assert.equal(s.percibido('rumbo', 100), 98);
  const ex = crearSesion({ modo: 'examen', cartaId: 'c', ejercicios: [], errores: { desvioExtra: 2 } });
  assert.equal(ex.percibido('rumbo', 100), 100);
});

test('la sesión registra trazos y respuestas ordenados en el tiempo y se guarda como JSON', () => {
  const alm = almacenFalso();
  const s = crearSesion({ modo: 'aprendizaje', cartaId: 'estrecho-didactico', versionCarta: 1, ejercicios: [{ tipo: 'estima', semilla: 7 }], almacen: alm, ahora: () => 1000 });
  s.registrarTrazo({ tipo: 'segmento', desde: [36, -12.6], hasta: [36.1, -12.5] });
  s.registrarRespuesta('estima:estrecho-didactico:7', { lat: '36° 05,0\' N' }, { correcto: false });
  s.guardar();
  const guardado = JSON.parse(alm.getItem(CLAVE_PRACTICAS));
  assert.equal(guardado.sesiones.length, 1);
  const g = guardado.sesiones[0];
  assert.equal(g.cartaId, 'estrecho-didactico');
  assert.deepEqual(g.ejercicios, [{ tipo: 'estima', semilla: 7 }]);
  assert.equal(g.eventos.length, 2);
  assert.equal(g.eventos[0].clase, 'trazo');
  assert.equal(g.eventos[1].clase, 'respuesta');
  assert.ok(g.eventos.every(e => e.t === 1000));
  assert.equal(typeof g.versionGeneradores, 'number');
});

test('leerHistorial tolera almacén vacío o corrupto y recupera sesiones', () => {
  const alm = almacenFalso();
  assert.deepEqual(leerHistorial(alm), { sesiones: [], resultados: [] });
  alm.setItem(CLAVE_PRACTICAS, '{no es json');
  assert.deepEqual(leerHistorial(alm), { sesiones: [], resultados: [] });
  const s = crearSesion({ modo: 'aprendizaje', cartaId: 'c', ejercicios: [], almacen: alm });
  s.guardar();
  assert.equal(leerHistorial(alm).sesiones.length, 1);
  assert.equal(leerHistorial(alm).sesiones[0].id, s.id);
});

test('guardar dos veces actualiza la misma sesión y el historial se limita a 30', () => {
  const alm = almacenFalso();
  const s = crearSesion({ modo: 'aprendizaje', cartaId: 'c', ejercicios: [], almacen: alm });
  s.guardar(); s.registrarTrazo({ tipo: 'punto', pos: [36, -12] }); s.guardar();
  assert.equal(leerHistorial(alm).sesiones.length, 1);
  assert.equal(leerHistorial(alm).sesiones[0].eventos.length, 1);
  for (let i = 0; i < 40; i++) crearSesion({ modo: 'aprendizaje', cartaId: 'c', ejercicios: [], almacen: alm }).guardar();
  assert.equal(leerHistorial(alm).sesiones.length, 30);
});

test('registrarResultado guarda el resultado y notifica al progreso general con la forma acordada', () => {
  const alm = almacenFalso();
  const llamadas = [];
  registrarResultado({ modo: 'examen', tipo: 'simulacro', semilla: 5, aciertos: 3, total: 4, apto: true, detalle: [true, true, true, false] }, { almacen: alm, progreso: { registrarIntento: i => llamadas.push(i) } });
  assert.equal(llamadas.length, 1);
  assert.deepEqual(llamadas[0], { modelo: 'Carta', modo: 'examen', aciertos: 3, total: 4, apto: true });
  const h = leerHistorial(alm);
  assert.equal(h.resultados.length, 1);
  assert.equal(h.resultados[0].tipo, 'simulacro');
  assert.ok(h.resultados[0].fecha > 0);
  registrarResultado({ modo: 'aprendizaje', tipo: 'estima', semilla: 9, aciertos: 1, total: 1, apto: true }, { almacen: alm, progreso: { registrarIntento: i => llamadas.push(i) } });
  assert.equal(llamadas.length, 1, 'el aprendizaje no cuenta como intento de examen');
  assert.equal(leerHistorial(alm).resultados.length, 2);
});

test('resumenHistorial agrupa por tipo con intentos y aciertos', () => {
  const alm = almacenFalso();
  const p = { registrarIntento() {} };
  registrarResultado({ modo: 'aprendizaje', tipo: 'estima', semilla: 1, aciertos: 1, total: 1, apto: true }, { almacen: alm, progreso: p });
  registrarResultado({ modo: 'aprendizaje', tipo: 'estima', semilla: 2, aciertos: 0, total: 1, apto: false }, { almacen: alm, progreso: p });
  registrarResultado({ modo: 'examen', tipo: 'simulacro', semilla: 3, aciertos: 2, total: 4, apto: true }, { almacen: alm, progreso: p });
  const r = resumenHistorial(leerHistorial(alm));
  assert.deepEqual(r.porTipo.estima, { intentos: 2, aciertos: 1 });
  assert.deepEqual(r.simulacros, { intentos: 1, aptos: 1 });
});
