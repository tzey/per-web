import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crearPrng, TIPOS, TOLERANCIAS, generar, generarSimulacro, esDegenerado, puntuar, VERSION_GENERADORES } from '../assets/js/practicas/ejercicios.js';
import { demoraVerdadera, rumboDistancia, reciproco, diferenciaAngular, normalizar } from '../assets/js/practicas/geo.js';
import { enTierra, buscarObjeto } from '../assets/js/practicas/carta.js';

const leer = f => JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8'));
const carta = leer('../data/cartas/estrecho-didactico.json');
const tablilla = leer('../data/tablilla-desvios.json');
const ctx = semilla => ({ carta, tablilla, anyo: 2026, semilla });
const FASE1 = ['coordenadas-objeto', 'distancia-tiempo-eta', 'rumbo-verdadero-aguja', 'declinacion-ct-enfilacion', 'estima',
  'situacion-dos-demoras', 'situacion-enfilacion-demora', 'situacion-demora-distancia', 'derrota-resguardo-peligro'];
const serializable = ej => JSON.parse(JSON.stringify(ej));
const dentro = (p, l) => p[0] >= l.latMin && p[0] <= l.latMax && p[1] >= l.lonMin && p[1] <= l.lonMax;

test('crearPrng es determinista y da valores en [0,1)', () => {
  const a = crearPrng(42), b = crearPrng(42);
  const xs = Array.from({ length: 5 }, () => a());
  assert.deepEqual(xs, Array.from({ length: 5 }, () => b()));
  assert.ok(xs.every(x => x >= 0 && x < 1));
  assert.notEqual(crearPrng(1)(), crearPrng(2)());
});

test('TIPOS declara los nueve tipos de la fase 1 con bloque carta', () => {
  for (const t of FASE1) {
    const d = TIPOS.find(x => x.id === t);
    assert.ok(d, `falta ${t}`);
    assert.equal(d.bloque, 'carta');
    assert.ok(d.titulo && d.cartas.includes('costera'));
  }
  assert.ok(TOLERANCIAS[100000].minutosLat > TOLERANCIAS[10000].minutosLat);
  assert.equal(typeof VERSION_GENERADORES, 'number');
});

test('la misma semilla produce el mismo ejercicio y semillas distintas, enunciados distintos', () => {
  for (const t of FASE1) {
    assert.deepEqual(serializable(generar(t, ctx(7))), serializable(generar(t, ctx(7))), t);
    assert.notEqual(generar(t, ctx(7)).enunciado, generar(t, ctx(8)).enunciado, t);
  }
});

test('el objeto ejercicio tiene la forma acordada', () => {
  const ej = generar('situacion-dos-demoras', ctx(3));
  for (const k of ['id', 'tipo', 'bloque', 'titulo', 'semilla', 'cartaId', 'versionCarta', 'enunciado', 'visibles', 'real', 'solucion', 'campos', 'tolerancia', 'opciones']) assert.ok(k in ej, k);
  assert.equal(typeof ej.validar, 'function');
  assert.ok(ej.solucion.length >= 2 && ej.solucion.every(s => typeof s.texto === 'string'));
  assert.ok(ej.solucion.some(s => s.trazo), 'la solución lleva trazos');
  assert.ok(ej.campos.every(c => c.id && c.etiqueta && c.tipo));
  assert.deepEqual(ej.opciones, { viento: null, corriente: null });
  assert.equal(ej.cartaId, carta.id);
});

test('1000 semillas por tipo: nunca degenerado, situación en el agua y dentro de la carta', () => {
  for (const t of FASE1) {
    for (let s = 1; s <= 1000; s++) {
      const ej = generar(t, ctx(s));
      assert.equal(esDegenerado(ej, carta), null, `${t} semilla ${s}`);
      for (const p of [ej.real.situacion, ej.real.desde, ej.real.llegada].filter(Boolean)) {
        assert.ok(dentro(p, carta.meta.limites), `${t} ${s}: fuera de la carta`);
        assert.ok(!enTierra(carta, p), `${t} ${s}: en tierra`);
      }
    }
  }
});

test('validar acepta la respuesta real y rechaza un error de dos tolerancias', () => {
  for (const t of FASE1) for (let s = 1; s <= 25; s++) {
    const ej = generar(t, ctx(s));
    const ok = ej.validar(ej.real.respuesta);
    assert.equal(ok.correcto, true, `${t} ${s}: ${JSON.stringify(ok.detalle)}`);
    const mal = {};
    for (const c of ej.campos) {
      const v = ej.real.respuesta[c.id];
      const tol = ej.tolerancia;
      const paso = c.tipo === 'coordenada' ? 2 * (c.eje === 'lat' ? tol.minutosLat : tol.minutosLon) / 60
        : c.tipo === 'angulo' || c.tipo === 'angulo-signo' ? 2 * tol.grados
        : c.tipo === 'millas' ? 2 * tol.millas : c.tipo === 'hora' || c.tipo === 'minutos' ? 2 * tol.minutosTiempo : 2 * tol.metros;
      mal[c.id] = c.tipo === 'hora' ? (v + paso) : v + paso;
    }
    assert.equal(ej.validar(mal).correcto, false, `${t} ${s}`);
  }
});

test('validar entiende texto con coma decimal y grados-minutos', () => {
  const ej = generar('coordenadas-objeto', ctx(5));
  const { lat, lon } = ej.real.respuesta;
  const txt = { lat: `${Math.floor(lat)}° ${((lat % 1) * 60).toFixed(1).replace('.', ',')}' N`, lon: `${Math.floor(-lon)}° ${(((-lon) % 1) * 60).toFixed(1).replace('.', ',')}' W` };
  assert.equal(ej.validar(txt).correcto, true, JSON.stringify(ej.validar(txt).detalle));
  const r = ej.validar({ lat: 'hola', lon: '' });
  assert.equal(r.correcto, false);
  assert.ok(r.detalle.every(d => d.dentro === false));
});

test('rumbo-verdadero-aguja: cambiar el año cambia Ra y no Rv; el recíproco se avisa', () => {
  const a = generar('rumbo-verdadero-aguja', ctx(11));
  const b = generar('rumbo-verdadero-aguja', { ...ctx(11), anyo: 2046 });
  assert.equal(a.real.rv, b.real.rv);
  assert.notEqual(a.real.ra, b.real.ra);
  assert.ok(Math.abs(diferenciaAngular(a.real.ra, normalizar(a.real.rv - a.real.ct))) < 1e-6);
  const r = a.validar({ rv: reciproco(a.real.rv), ra: a.real.ra });
  assert.equal(r.correcto, false);
  assert.ok(r.avisos.includes('reciproco'), JSON.stringify(r));
  const r2 = a.validar({ rv: a.real.rv, ra: normalizar(a.real.rv + a.real.ct) });
  assert.ok(r2.avisos.includes('signo-ct'), JSON.stringify(r2));
});

test('declinacion-ct-enfilacion: la enfilación conserva su demora verdadera geométrica', () => {
  for (let s = 1; s <= 50; s++) {
    const ej = generar('declinacion-ct-enfilacion', ctx(s));
    const enf = buscarObjeto(carta, ej.visibles.enfilacion);
    const [ant, post] = enf.objetos.map(id => buscarObjeto(carta, id).pos);
    const geometrica = reciproco(rumboDistancia(post, ant).rumbo);
    assert.ok(Math.abs(diferenciaAngular(demoraVerdadera(ej.visibles.da, ej.real.ct), geometrica)) < 0.01, `semilla ${s}`);
    assert.ok(Math.abs(ej.real.dm - (ej.real.ct - ej.real.desvio)) < 1e-9);
  }
});

test('situacion-dos-demoras: corte siempre ≥ 30° y calidad informada; el corte forzado < 30° es degenerado', () => {
  for (let s = 1; s <= 200; s++) {
    const ej = generar('situacion-dos-demoras', ctx(s));
    assert.ok(ej.real.anguloCorte >= 30, `semilla ${s}: ${ej.real.anguloCorte}`);
    assert.ok(['buena', 'aceptable'].includes(ej.real.calidadFix));
  }
  const ej = generar('situacion-dos-demoras', ctx(1));
  assert.equal(esDegenerado({ ...ej, real: { ...ej.real, anguloCorte: 20 } }, carta), 'corte-estrecho');
  assert.equal(esDegenerado({ ...ej, real: { ...ej.real, situacion: carta.faros[0].pos } }, carta), 'en-tierra');
});

test('estima con corriente en aprendizaje desplaza la llegada; sin opciones coincide con la estima pura', () => {
  const sin = generar('estima', ctx(9));
  const con = generar('estima', { ...ctx(9), opciones: { corriente: { rumbo: 90, intensidad: 2 }, viento: null } });
  assert.deepEqual(sin.real.desde, con.real.desde);
  assert.ok(rumboDistancia(sin.real.llegada, con.real.llegada).distancia > 0.5);
  assert.deepEqual(sin.opciones, { viento: null, corriente: null });
  assert.equal(con.opciones.corriente.intensidad, 2);
});

test('derrota-resguardo-peligro: la derrota pasa a la distancia pedida del peligro', () => {
  for (let s = 1; s <= 100; s++) {
    const ej = generar('derrota-resguardo-peligro', ctx(s));
    const pel = buscarObjeto(carta, ej.visibles.peligro);
    const { rumbo, distancia } = rumboDistancia(ej.real.desde, pel.pos);
    const ang = Math.abs(diferenciaAngular(rumbo, ej.real.rv)) * Math.PI / 180;
    const minima = distancia * Math.sin(ang);
    assert.ok(Math.abs(minima - ej.visibles.resguardo) < 0.05, `semilla ${s}: ${minima} vs ${ej.visibles.resguardo}`);
    assert.ok(ang < Math.PI / 2, 'el peligro queda por delante, no por la popa');
  }
});

test('generarSimulacro: cuatro ejercicios encadenados sin viento ni corriente', () => {
  const sim = generarSimulacro({ carta, tablilla, anyo: 2026, semilla: 2026 });
  assert.equal(sim.length, 4);
  for (const e of sim) { assert.equal(e.opciones.viento, null); assert.equal(e.opciones.corriente, null); assert.equal(esDegenerado(e, carta), null); }
  assert.deepEqual(sim[1].visibles.desde, sim[0].real.situacion, 'el 2.º parte de la situación del 1.º');
  assert.deepEqual(sim[2].visibles.desde, sim[0].real.situacion);
  assert.deepEqual(sim[3].visibles.desde, sim[2].real.llegada, 'el 4.º parte de la estima del 3.º');
  assert.deepEqual(serializable(sim), serializable(generarSimulacro({ carta, tablilla, anyo: 2026, semilla: 2026 })));
});

test('puntuar aplica el mínimo de 2 aciertos sobre 4', () => {
  const sim = generarSimulacro({ carta, tablilla, anyo: 2026, semilla: 5 });
  const bien = Object.fromEntries(sim.map(e => [e.id, e.real.respuesta]));
  assert.deepEqual(puntuar(sim, bien), { aciertos: 4, total: 4, apto: true, detalle: [true, true, true, true] });
  const dos = { ...bien, [sim[0].id]: {}, [sim[1].id]: {} };
  assert.equal(puntuar(sim, dos).apto, true);
  const uno = { ...dos, [sim[2].id]: {} };
  assert.equal(puntuar(sim, uno).apto, false);
});
