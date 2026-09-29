import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as geo from '../assets/js/practicas/geo.js';

const cerca = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} esperado ${b} ±${tol}, obtenido ${a}`);

test('normalizar lleva los ángulos a [0,360)', () => {
  assert.equal(geo.normalizar(-10), 350);
  assert.equal(geo.normalizar(360), 0);
  assert.equal(geo.normalizar(725), 5);
});

test('diferenciaAngular devuelve b − a en (−180,180]', () => {
  assert.equal(geo.diferenciaAngular(350, 10), 20);
  assert.equal(geo.diferenciaAngular(10, 350), -20);
  assert.equal(geo.diferenciaAngular(0, 180), 180);
});

test('reciproco suma 180', () => {
  assert.equal(geo.reciproco(46), 226);
  assert.equal(geo.reciproco(226), 46);
});

test('parsearGrados acepta grados-minutos con hemisferio y decimales con coma', () => {
  cerca(geo.parsearGrados("36° 12,5' N"), 36.208333, 1e-5);
  cerca(geo.parsearGrados('36 12.5 N'), 36.208333, 1e-5);
  cerca(geo.parsearGrados("012° 36,7' W"), -12.611667, 1e-5);
  cerca(geo.parsearGrados("5° 30' O"), -5.5, 1e-9);
  cerca(geo.parsearGrados('-12,3'), -12.3, 1e-9);
  cerca(geo.parsearGrados('36,5 S'), -36.5, 1e-9);
  assert.ok(Number.isNaN(geo.parsearGrados('hola')));
  assert.ok(Number.isNaN(geo.parsearGrados('')));
  cerca(geo.parsearGrados('+3,5'), 3.5, 1e-9, 'signo más explícito');
  cerca(geo.parsearGrados('−2,4'), -2.4, 1e-9, 'menos tipográfico U+2212');
  cerca(geo.parsearGrados('–2,4'), -2.4, 1e-9, 'guion corto');
  assert.ok(Number.isNaN(geo.parsearGrados("36° 65' N")), 'minutos fuera de rango');
});

test('formatearGrados produce el formato de carta y recorre ida y vuelta', () => {
  assert.equal(geo.formatearGrados(36.208333, 'lat'), "36° 12,5' N");
  assert.equal(geo.formatearGrados(-12.611667, 'lon'), "012° 36,7' W");
  assert.equal(geo.formatearGrados(-36.0, 'lat'), "36° 00,0' S");
  cerca(geo.parsearGrados(geo.formatearGrados(-12.611667, 'lon')), -12.611667, 0.001);
});

test('formatearAngulo rellena a tres cifras con signo de grado', () => {
  assert.equal(geo.formatearAngulo(47), '047°');
  assert.equal(geo.formatearAngulo(359.6), '000°');
});

test('parsearHora y formatearHora', () => {
  assert.equal(geo.parsearHora('10:20'), 620);
  assert.equal(geo.formatearHora(620), '10:20');
  assert.equal(geo.formatearHora(1500), '01:00');
  assert.ok(Number.isNaN(geo.parsearHora('25h')));
});

test('rumboDistancia reproduce el ejercicio c9/c10 del taller (20,1 M, 053°)', () => {
  const A = [36.0, -5.333333], B = [36.2, -5.0];
  const r = geo.rumboDistancia(A, B);
  cerca(r.distancia, 20.1, 0.1, 'distancia');
  cerca(r.rumbo, 53, 0.6, 'rumbo');
});

test('puntoDesde es la inversa de rumboDistancia', () => {
  const A = [36.05, -12.7];
  const B = geo.puntoDesde(A, 123, 9.7);
  const r = geo.rumboDistancia(A, B);
  cerca(r.rumbo, 123, 0.05);
  cerca(r.distancia, 9.7, 0.01);
});

test('corrección total: c1 y c2 del taller', () => {
  assert.equal(geo.correccionTotal(-2, 3), 1);
  assert.equal(geo.rumboVerdadero(127, geo.correccionTotal(-2, 3)), 128);
  assert.equal(geo.rumboAguja(310, geo.correccionTotal(4, -1)), 307);
  assert.equal(geo.demoraVerdadera(358, 5), 3);
});

test('marcaciones: estribor suma, babor resta (c4 y c5)', () => {
  assert.equal(geo.marcacionADemora(65, -40), 25);
  assert.equal(geo.demoraAMarcacion(200, 245), 45);
  assert.equal(geo.demoraAMarcacion(10, 350), -20);
});

test('declinacionActualizada: c3 del taller (3° 20\' W en 2018, 7\' E anual → 2,4° W en 2026)', () => {
  cerca(geo.declinacionActualizada(-3.333333, 2018, 7, 2026), -2.4, 1e-6);
});

test('desvioPorTablilla interpola linealmente y cierra el círculo', () => {
  const tablilla = { paso: 90, filas: [{ ra: 0, desvio: 2 }, { ra: 90, desvio: 0 }, { ra: 180, desvio: -2 }, { ra: 270, desvio: 0 }] };
  assert.equal(geo.desvioPorTablilla(0, tablilla), 2);
  assert.equal(geo.desvioPorTablilla(45, tablilla), 1);
  assert.equal(geo.desvioPorTablilla(315, tablilla), 1);
});

test('estima: c7/c8 del taller (Rv 045, 10 nudos, 90 min)', () => {
  const p = geo.estima([36.0, -5.5], 45, 10, 90);
  cerca((p[0] - 36) * 60, 10.6, 0.1, 'Δlat');
  cerca((p[1] + 5.5) * 60, 13.1, 0.15, 'Δlon');
});

test('tiempoParaDistancia y eta: c6 del taller', () => {
  cerca(geo.tiempoParaDistancia(22, 8.5), 155.3, 0.1);
  assert.equal(geo.eta('10:20', 155), '12:55');
  assert.equal(geo.eta('23:30', 60), '00:30');
});

test('cortarRectas: paralelas → null; corte → punto y ángulo', () => {
  assert.equal(geo.cortarRectas([36, -12.6], 45, [36.1, -12.6], 45), null);
  const faro = [36.1, -12.7], torre = [36.0, -12.5];
  // el barco está en P; demoras verdaderas desde P a cada objeto
  const P = [36.05, -12.6];
  const d1 = geo.rumboDistancia(P, faro).rumbo, d2 = geo.rumboDistancia(P, torre).rumbo;
  const c = geo.cortarRectas(faro, geo.reciproco(d1), torre, geo.reciproco(d2));
  cerca(c.punto[0], P[0], 1e-4, 'lat');
  cerca(c.punto[1], P[1], 1e-4, 'lon');
  cerca(c.anguloCorte, Math.abs(geo.diferenciaAngular(d1, d2)) > 90 ? 180 - Math.abs(geo.diferenciaAngular(d1, d2)) : Math.abs(geo.diferenciaAngular(d1, d2)), 0.5);
});

test('calidadCorte por umbrales 60/30', () => {
  assert.equal(geo.calidadCorte(71), 'buena');
  assert.equal(geo.calidadCorte(45), 'aceptable');
  assert.equal(geo.calidadCorte(20), 'baja');
});

test('situacionDemoraDistancia sitúa al observador desde el objeto por la recíproca', () => {
  const faro = [36.1, -12.7];
  const P = geo.situacionDemoraDistancia(faro, 30, 5);
  const r = geo.rumboDistancia(P, faro);
  cerca(r.rumbo, 30, 0.05);
  cerca(r.distancia, 5, 0.01);
});

test('eventosAlrededor devuelve el evento anterior y el posterior', () => {
  const dia = [['BM', '03:12', 0.6], ['PM', '09:25', 3.4], ['BM', '15:41', 0.7], ['PM', '21:52', 3.3]];
  assert.deepEqual(geo.eventosAlrededor('10:00', dia), [dia[1], dia[2]]);
  assert.deepEqual(geo.eventosAlrededor('02:00', dia), [null, dia[0]]);
});

test('alturaMarea: c11 del taller (09:00 entre BM 06:00 0,5 y PM 12:00 3,5 → 2,0)', () => {
  const bm = ['BM', '06:00', 0.5], pm = ['PM', '12:00', 3.5];
  cerca(geo.alturaMarea('09:00', bm, pm), 2.0, 0.01);
  cerca(geo.alturaMarea('09:00', bm, pm, 'lineal'), 2.0, 0.01);
  cerca(geo.alturaMarea('07:00', bm, pm), 0.75, 0.01, 'primer doceavo');
  cerca(geo.alturaMarea('06:00', bm, pm), 0.5, 1e-9);
  cerca(geo.alturaMarea('12:00', bm, pm), 3.5, 1e-9);
});

test('alturaMarea y eventosAlrededor cruzan la medianoche', () => {
  const bm = ['BM', '22:00', 0.5], pm = ['PM', '04:12', 3.5];
  cerca(geo.alturaMarea('01:06', bm, pm), 2.0, 0.02, 'mitad del tramo nocturno');
  cerca(geo.alturaMarea('23:00', bm, pm), 0.5 + 3 / 12, 0.02);
  const h = geo.horaParaAltura(2.0, bm, pm);
  cerca(h, geo.parsearHora('01:06'), 3);
});

test('horaParaAltura: c12 (1,9 m) cae antes de las 09:00 y es inversa de alturaMarea', () => {
  const bm = ['BM', '06:00', 0.5], pm = ['PM', '12:00', 3.5];
  const h = geo.horaParaAltura(1.9, bm, pm);
  assert.ok(h >= geo.parsearHora('08:40') && h <= geo.parsearHora('09:00'), `hora ${geo.formatearHora(h)}`);
  cerca(geo.alturaMarea(h, bm, pm), 1.9, 0.02);
});

test('sondaReal y resguardo', () => {
  cerca(geo.sondaReal(2.2, 2.0), 4.2, 1e-9);
  cerca(geo.resguardo(4.2, 2.4), 1.8, 1e-9);
});

test('radioBorneo: eslora 10, cadena 30, profundidad 8 → 38,9 m', () => {
  cerca(geo.radioBorneo(10, 30, 8), 38.9, 0.05);
});

test('hayGarreo con deriva de 4° sobre tolerancia 3°', () => {
  assert.equal(geo.hayGarreo([45, 130], [46, 134]), true);
  assert.equal(geo.hayGarreo([45, 130], [46, 132]), false);
  assert.equal(geo.hayGarreo([358], [2]), true);
});

test('dentroDePoligono por trazado de rayos', () => {
  const cuadrado = [[36, -13], [36, -12], [37, -12], [37, -13], [36, -13]];
  assert.equal(geo.dentroDePoligono([36.5, -12.5], cuadrado), true);
  assert.equal(geo.dentroDePoligono([35.5, -12.5], cuadrado), false);
  assert.equal(geo.dentroDePoligono([36.5, -11.5], cuadrado), false);
});
