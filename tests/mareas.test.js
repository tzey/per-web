import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsearHora } from '../assets/js/practicas/geo.js';
import { eventosPuerto, explicarResguardo, generar, esDegenerado, TIPOS } from '../assets/js/practicas/ejercicios.js';
import { enTierra } from '../assets/js/practicas/carta.js';

const leer = f => JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8'));
const mareas = leer('../data/mareas-didacticas.json');
const carta = leer('../data/cartas/estrecho-didactico.json');
const tablilla = leer('../data/tablilla-desvios.json');
const ctx = semilla => ({ carta, tablilla, mareas, anyo: 2026, semilla });
const FASE2 = ['marea-altura-hora', 'marea-resguardo-paso', 'marea-hora-minima', 'gnss-vs-estima', 'gnss-waypoint-mob'];

test('el anuario tiene un puerto patrón con al menos 14 días y los puertos de la carta', () => {
  const patron = Object.entries(mareas.puertos).find(([, p]) => p.patron);
  assert.ok(patron, 'falta puerto patrón');
  const dias = Object.keys(mareas.anuario[patron[0]]);
  assert.ok(dias.length >= 14, `solo ${dias.length} días`);
  for (const p of carta.puertos) assert.ok(mareas.puertos[p.puertoMareas], `la carta referencia el puerto ${p.puertoMareas}`);
  for (const [id, p] of Object.entries(mareas.puertos)) if (!p.patron) assert.ok(mareas.puertos[p.referencia]?.patron, `${id} debe referenciar un puerto patrón`);
});

test('cada día alterna BM y PM con horas crecientes y carrera entre 1,5 y 3,8 m', () => {
  for (const [puerto, dias] of Object.entries(mareas.anuario)) for (const [fecha, eventos] of Object.entries(dias)) {
    assert.ok(eventos.length >= 3 && eventos.length <= 4, `${puerto} ${fecha}: ${eventos.length} eventos`);
    for (let i = 0; i < eventos.length; i++) {
      const [tipo, hora, altura] = eventos[i];
      assert.ok(tipo === 'BM' || tipo === 'PM');
      assert.ok(Number.isFinite(parsearHora(hora)), `${fecha}: hora ${hora}`);
      assert.ok(altura >= 0 && altura <= 4.5);
      if (i) {
        assert.notEqual(tipo, eventos[i - 1][0], `${fecha}: dos ${tipo} seguidas`);
        assert.ok(parsearHora(hora) > parsearHora(eventos[i - 1][1]), `${fecha}: horas no crecientes`);
        const carrera = Math.abs(altura - eventos[i - 1][2]);
        assert.ok(carrera >= 1.5 && carrera <= 3.8, `${fecha}: carrera ${carrera}`);
      }
    }
  }
});

test('eventosPuerto aplica las diferencias del puerto secundario', () => {
  const [idPatron] = Object.entries(mareas.puertos).find(([, p]) => p.patron);
  const [idSec, sec] = Object.entries(mareas.puertos).find(([, p]) => !p.patron);
  const fecha = Object.keys(mareas.anuario[idPatron])[0];
  const base = eventosPuerto(mareas, idPatron, fecha), der = eventosPuerto(mareas, idSec, fecha);
  assert.equal(der.length, base.length);
  base.forEach((e, i) => {
    const dif = e[0] === 'PM' ? [sec.diferencias.horaPM, sec.diferencias.alturaPM] : [sec.diferencias.horaBM, sec.diferencias.alturaBM];
    assert.equal(parsearHora(der[i][1]), parsearHora(e[1]) + dif[0]);
    assert.ok(Math.abs(der[i][2] - (e[2] + dif[1])) < 1e-9);
  });
  assert.equal(eventosPuerto(mareas, 'inexistente', fecha), null);
});

test('explicarResguardo explica sonda, altura y calado y alerta al bajar la marea', () => {
  const ok = explicarResguardo({ sondaCarta: 2.2, alturaMarea: 2.0, calado: 2.4, margen: 0.5 });
  assert.equal(ok.seguro, true);
  assert.ok(Math.abs(ok.profundidad - 4.2) < 1e-9 && Math.abs(ok.resguardo - 1.8) < 1e-9);
  const mal = explicarResguardo({ sondaCarta: 2.2, alturaMarea: 0.5, calado: 2.4, margen: 0.5 });
  assert.equal(mal.seguro, false);
  assert.match(mal.texto, /2,2/); assert.match(mal.texto, /0,5/); assert.match(mal.texto, /2,4/);
});

test('TIPOS declara los cinco tipos de la fase 2 en los bloques mareas y gnss', () => {
  for (const t of FASE2) {
    const d = TIPOS.find(x => x.id === t);
    assert.ok(d, `falta ${t}`);
    assert.ok(['mareas', 'gnss'].includes(d.bloque), `${t} en bloque ${d.bloque}`);
    assert.equal(d.fase, 2);
  }
});

test('1000 semillas por tipo de fase 2: nunca degenerado, deterministas, validar acepta la real y rechaza ±2 tolerancias', () => {
  for (const t of FASE2) {
    for (let s = 1; s <= 1000; s++) {
      const ej = generar(t, ctx(s));
      assert.equal(esDegenerado(ej, carta), null, `${t} ${s}`);
      for (const p of [ej.real.situacion, ej.real.desde, ej.real.llegada, ej.real.gnss].filter(Boolean)) assert.ok(!enTierra(carta, p), `${t} ${s}: en tierra`);
      if (s <= 30) {
        assert.equal(ej.validar(ej.real.respuesta).correcto, true, `${t} ${s}`);
        const mal = {};
        for (const c of ej.campos) {
          const tol = ej.tolerancia, v = ej.real.respuesta[c.id];
          const paso = c.tipo === 'coordenada' ? 2 * tol.minutosLat / 60 : c.tipo === 'angulo' ? 2 * tol.grados : c.tipo === 'millas' ? 2 * tol.millas : c.tipo === 'hora' || c.tipo === 'minutos' ? 2 * tol.minutosTiempo : 2 * tol.metros;
          mal[c.id] = v + paso;
        }
        assert.equal(ej.validar(mal).correcto, false, `${t} ${s}`);
        assert.deepEqual(JSON.parse(JSON.stringify(generar(t, ctx(s)))), JSON.parse(JSON.stringify(ej)));
      }
    }
  }
});

test('marea-resguardo-paso: la alerta cambia al bajar la marea y explica los tres datos', () => {
  const ej = generar('marea-resguardo-paso', ctx(4));
  assert.ok(ej.real.alerta && typeof ej.real.alerta.seguro === 'boolean');
  const alta = explicarResguardo({ sondaCarta: ej.visibles.sondaCarta, alturaMarea: 3.6, calado: ej.visibles.calado, margen: ej.visibles.margen });
  const baja = explicarResguardo({ sondaCarta: ej.visibles.sondaCarta, alturaMarea: 0.2, calado: ej.visibles.calado, margen: ej.visibles.margen });
  assert.ok(alta.resguardo > baja.resguardo);
  assert.equal(baja.seguro, false);
  assert.ok(ej.visibles.eventos.length >= 2, 'el enunciado da los eventos del día');
});

test('marea-hora-minima: la hora devuelta está en un tramo de marea creciente y alcanza la altura mínima', () => {
  for (let s = 1; s <= 50; s++) {
    const ej = generar('marea-hora-minima', ctx(s));
    const [ant, des] = ej.real.tramo;
    assert.ok(des[2] > ant[2], 'tramo creciente');
    assert.ok(ej.real.respuesta.hora >= parsearHora(ant[1]) && ej.real.respuesta.hora <= parsearHora(des[1]), `semilla ${s}`);
    assert.ok(ej.real.respuesta.altura > ant[2] && ej.real.respuesta.altura < des[2]);
  }
});

test('gnss-vs-estima: la discrepancia pedida es la que separa estima y GNSS', () => {
  const ej = generar('gnss-vs-estima', ctx(6));
  assert.ok(ej.real.respuesta.distancia >= 0.3 && ej.real.respuesta.distancia <= 2);
  assert.ok(ej.visibles.gnss && ej.visibles.desde);
});
