import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dentroDePoligono } from '../assets/js/practicas/geo.js';
import { RE_CARACTERISTICA, descomponerCaracteristica } from '../assets/js/practicas/carta.js';

const DIR = new URL('../data/cartas/', import.meta.url);
const cartas = readdirSync(DIR).filter(f => f.endsWith('.json'))
  .map(f => ({ fichero: f, carta: JSON.parse(readFileSync(new URL(f, DIR), 'utf8')) }));

const SELLO = 'CARTA DIDÁCTICA · GEOGRAFÍA FICTICIA';
const TOPONIMOS_REALES = /tarifa|gibraltar|ceuta|algeciras|trafalgar|camarinal|europa|carnero|barbate|t[aá]nger|espartel|malabata|cires|paloma|sancti|cádiz|cadiz|estepona|marbella|m[aá]laga|tetu[aá]n|alborán|alboran/i;

const colecciones = ['costa', 'veriles', 'sondas', 'faros', 'marcas', 'boyas', 'peligros', 'enfilaciones', 'zonas', 'puertos', 'toponimos'];
const enLimites = (p, l) => p[0] >= l.latMin - 1e-9 && p[0] <= l.latMax + 1e-9 && p[1] >= l.lonMin - 1e-9 && p[1] <= l.lonMax + 1e-9;

test('hay al menos la carta costera', () => {
  assert.ok(cartas.some(c => c.carta.meta.tipo === 'costera'), 'falta estrecho-didactico.json');
});

for (const { fichero, carta } of cartas) {
  test(`${fichero}: metadatos, sello y colecciones`, () => {
    assert.equal(carta.meta.sello, SELLO);
    assert.ok(carta.id && carta.version >= 1);
    assert.ok(['costera', 'portulano'].includes(carta.meta.tipo));
    assert.ok(carta.meta.escala > 0 && carta.meta.limites && carta.meta.viewBox.ancho > 0);
    assert.ok(carta.rosa && typeof carta.rosa.dm === 'number' && carta.rosa.anyo > 2000);
    for (const c of colecciones) assert.ok(Array.isArray(carta[c]), `falta ${c}`);
  });

  test(`${fichero}: polígonos cerrados y dentro de límites`, () => {
    const l = carta.meta.limites;
    const poligonos = [...carta.costa, ...carta.veriles, ...carta.zonas.filter(z => z.poligono)];
    for (const o of poligonos) {
      assert.ok(o.poligono.length >= 4, `polígono corto en ${o.id ?? o.prof}`);
      assert.deepEqual(o.poligono[0], o.poligono[o.poligono.length - 1], `polígono abierto en ${o.id ?? o.prof}`);
      for (const p of o.poligono) assert.ok(enLimites(p, l), `vértice fuera de límites en ${o.id ?? o.prof}: ${p}`);
    }
    const puntuales = [...carta.sondas, ...carta.faros, ...carta.marcas, ...carta.boyas, ...carta.peligros, ...carta.puertos, ...carta.toponimos];
    for (const o of puntuales) assert.ok(enLimites(o.pos, l), `objeto fuera de límites: ${o.id ?? o.texto}`);
    for (const z of carta.zonas.filter(z => z.linea)) for (const p of z.linea) assert.ok(enLimites(p, l));
  });

  test(`${fichero}: ids únicos y referencias válidas`, () => {
    const ids = [...carta.costa, ...carta.faros, ...carta.marcas, ...carta.boyas, ...carta.peligros, ...carta.enfilaciones, ...carta.zonas, ...carta.puertos].map(o => o.id);
    assert.equal(new Set(ids).size, ids.length, 'ids duplicados');
    const objetos = new Set([...carta.faros, ...carta.marcas, ...carta.boyas].map(o => o.id));
    for (const e of carta.enfilaciones) {
      assert.equal(e.objetos.length, 2);
      for (const id of e.objetos) assert.ok(objetos.has(id), `enfilación ${e.id} referencia ${id}`);
    }
    for (const p of carta.puertos) if (p.bocana) for (const id of Object.values(p.bocana)) assert.ok(objetos.has(id));
  });

  test(`${fichero}: veriles ordenados de profundo a somero`, () => {
    for (let i = 1; i < carta.veriles.length; i++) assert.ok(carta.veriles[i].prof <= carta.veriles[i - 1].prof);
  });

  test(`${fichero}: características luminosas válidas`, () => {
    for (const f of carta.faros) assert.match(f.caracteristica, RE_CARACTERISTICA, f.id);
    for (const b of carta.boyas.filter(b => b.luz)) assert.match(b.luz, RE_CARACTERISTICA, b.id);
  });

  test(`${fichero}: faros y marcas en tierra; sondas, boyas y peligros en el agua`, () => {
    const enTierra = p => carta.costa.some(c => dentroDePoligono(p, c.poligono));
    for (const f of [...carta.faros, ...carta.marcas]) assert.ok(enTierra(f.pos), `${f.id} no está en tierra`);
    for (const o of [...carta.sondas, ...carta.boyas, ...carta.peligros]) assert.ok(!enTierra(o.pos), `${o.id ?? 'sonda ' + o.pos} está en tierra`);
  });

  test(`${fichero}: ningún topónimo real`, () => {
    const textos = [carta.meta.nombre, carta.meta.subtitulo, ...[...carta.costa, ...carta.faros, ...carta.marcas, ...carta.boyas, ...carta.peligros, ...carta.puertos].map(o => o.nombre ?? ''), ...carta.toponimos.map(t => t.texto)];
    for (const t of textos) assert.doesNotMatch(t, TOPONIMOS_REALES, t);
  });

  test(`${fichero}: tamaño razonable y sondas suficientes`, () => {
    assert.ok(JSON.stringify(carta).length < 120000);
    assert.ok(carta.sondas.length >= 40, `solo ${carta.sondas.length} sondas`);
  });
}

test('la carta costera tiene los objetos que exigen los ejercicios', () => {
  const c = cartas.find(x => x.carta.meta.tipo === 'costera').carta;
  assert.ok(c.faros.length >= 6);
  assert.ok(c.enfilaciones.length >= 1);
  assert.ok(c.peligros.length >= 2);
  assert.ok(c.boyas.some(b => b.tipo.startsWith('cardinal')));
  assert.ok(c.boyas.some(b => b.tipo === 'lateral-babor') && c.boyas.some(b => b.tipo === 'lateral-estribor'));
  assert.ok(c.zonas.some(z => z.tipo === 'prohibida'));
  assert.ok(c.rosa.dm < 0 && c.rosa.variacionAnual > 0, 'declinación oeste con variación anual este');
  assert.ok(c.puertos.length >= 2 && c.puertos.every(p => p.puertoMareas));
});

test('descomponerCaracteristica interpreta ritmo, grupo, color, periodo y alcance', () => {
  assert.deepEqual(descomponerCaracteristica('Fl(2) W 10s 22M'), { ritmo: 'Fl', grupo: 2, color: 'W', periodo: 10, alcance: 22 });
  assert.deepEqual(descomponerCaracteristica('Q(6)+LFl W 15s'), { ritmo: 'Q(6)+LFl', grupo: 6, color: 'W', periodo: 15, alcance: null });
  assert.deepEqual(descomponerCaracteristica('Fl R 3s'), { ritmo: 'Fl', grupo: 1, color: 'R', periodo: 3, alcance: null });
  assert.equal(descomponerCaracteristica('rojo parpadeante'), null);
});

test('tablilla de desvíos: 24 filas cada 15° con desvío numérico', () => {
  const t = JSON.parse(readFileSync(new URL('../data/tablilla-desvios.json', import.meta.url), 'utf8'));
  assert.equal(t.paso, 15);
  assert.equal(t.filas.length, 24);
  t.filas.forEach((f, i) => { assert.equal(f.ra, i * 15); assert.equal(typeof f.desvio, 'number'); assert.ok(Math.abs(f.desvio) <= 6); });
});
