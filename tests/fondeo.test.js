import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { generar, esDegenerado, TIPOS, TOLERANCIAS } from '../assets/js/practicas/ejercicios.js';
import { radioBorneo, dentroDePoligono } from '../assets/js/practicas/geo.js';
import { enTierra } from '../assets/js/practicas/carta.js';

const leer = f => JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8'));
const ruta = new URL('../data/cartas/puerto-didactico.json', import.meta.url);

test('existe el portulano puerto-didactico.json', () => { assert.ok(existsSync(ruta)); });

const puerto = existsSync(ruta) ? leer('../data/cartas/puerto-didactico.json') : null;
const mareas = leer('../data/mareas-didacticas.json');
const tablilla = leer('../data/tablilla-desvios.json');
const ctx = semilla => ({ carta: puerto, tablilla, mareas, anyo: 2026, semilla });
const FONDEO = ['fondeo-borneo-bajamar', 'fondeo-garreo'];

test('el portulano es de gran escala y tiene fondeadero, cable, bañistas, bocana y sondas densas', { skip: !puerto }, () => {
  assert.equal(puerto.meta.tipo, 'portulano');
  assert.equal(puerto.meta.escala, 10000);
  const l = puerto.meta.limites;
  assert.ok((l.latMax - l.latMin) * 60 <= 4 && (l.lonMax - l.lonMin) * 60 <= 6, 'extensión de pocos minutos');
  for (const t of ['fondeadero', 'cable', 'banistas']) assert.ok(puerto.zonas.some(z => z.tipo === t), `falta zona ${t}`);
  assert.ok(puerto.puertos.length >= 1 && puerto.puertos[0].bocana);
  assert.ok(puerto.boyas.some(b => b.tipo === 'lateral-babor') && puerto.boyas.some(b => b.tipo === 'lateral-estribor'));
  assert.ok(puerto.sondas.length >= 50);
  assert.ok(puerto.sondas.some(s => s.prof < 3) && puerto.sondas.some(s => s.prof > 8), 'rango de sondas');
  const fondeadero = puerto.zonas.find(z => z.tipo === 'fondeadero');
  assert.ok(puerto.sondas.some(s => dentroDePoligono(s.pos, fondeadero.poligono)), 'hay sondas dentro del fondeadero');
  assert.ok(puerto.faros.length >= 2 && puerto.enfilaciones.length >= 1);
});

test('TIPOS declara los tipos de fondeo para el portulano', () => {
  for (const t of FONDEO) {
    const d = TIPOS.find(x => x.id === t);
    assert.ok(d, `falta ${t}`);
    assert.equal(d.bloque, 'fondeo'); assert.equal(d.fase, 2);
    assert.ok(d.cartas.includes('portulano'));
  }
  assert.ok(TOLERANCIAS[10000].metrosLargo && TOLERANCIAS[100000].metrosLargo);
});

test('1000 semillas de fondeo sobre el portulano: nunca degenerado, tolerancias de 1:10 000, validar', { skip: !puerto }, () => {
  for (const t of FONDEO) for (let s = 1; s <= 1000; s++) {
    const ej = generar(t, ctx(s));
    assert.equal(esDegenerado(ej, puerto), null, `${t} ${s}`);
    assert.equal(ej.tolerancia, TOLERANCIAS[10000]);
    assert.ok(!enTierra(puerto, ej.real.situacion), `${t} ${s}: fondeo en tierra`);
    if (s <= 30) {
      assert.equal(ej.validar(ej.real.respuesta).correcto, true, `${t} ${s}`);
      const mal = {};
      for (const c of ej.campos) {
        const tol = ej.tolerancia, v = ej.real.respuesta[c.id];
        mal[c.id] = v + 2 * (c.tipo === 'metrosLargo' ? tol.metrosLargo : c.tipo === 'metros' ? tol.metros : c.tipo === 'angulo' ? tol.grados : tol.millas);
      }
      assert.equal(ej.validar(mal).correcto, false, `${t} ${s}`);
    }
  }
});

test('fondeo-borneo-bajamar: el radio sale de eslora, cadena y profundidad en pleamar; la bajamar da el resguardo mínimo', { skip: !puerto }, () => {
  for (let s = 1; s <= 50; s++) {
    const ej = generar('fondeo-borneo-bajamar', ctx(s));
    const v = ej.visibles, r = ej.real;
    assert.ok(Math.abs(r.respuesta.radio - radioBorneo(v.eslora, v.cadena, r.profundidadPM)) < 1e-9);
    assert.ok(r.profundidadBM < r.profundidadPM);
    assert.ok(Math.abs(r.respuesta.resguardoBM - (r.profundidadBM - v.calado)) < 1e-9);
    assert.ok(Array.isArray(r.conflictos), 'informa de los conflictos del círculo de borneo');
    assert.ok(ej.solucion.some(p => p.trazo?.tipo === 'circulo'), 'la solución dibuja el círculo de borneo');
    const fondeadero = puerto.zonas.find(z => z.tipo === 'fondeadero');
    assert.ok(dentroDePoligono(r.situacion, fondeadero.poligono), `semilla ${s}: fondeo fuera del fondeadero`);
  }
});

test('fondeo-garreo: las demoras de control detectan el desplazamiento y la distancia garreada es la pedida', { skip: !puerto }, () => {
  let garrea = 0;
  for (let s = 1; s <= 100; s++) {
    const ej = generar('fondeo-garreo', ctx(s));
    const v = ej.visibles, r = ej.real;
    assert.equal(v.demorasControl.length, 2); assert.equal(v.demorasActuales.length, 2);
    assert.equal(typeof r.garrea, 'boolean');
    if (r.garrea) { garrea++; assert.ok(r.respuesta.desplazamiento > 15, `semilla ${s}: garreo de ${r.respuesta.desplazamiento} m`); }
    else assert.ok(r.respuesta.desplazamiento <= 15);
  }
  assert.ok(garrea > 20 && garrea < 80, `mezcla de casos: ${garrea}/100 garrean`);
});
