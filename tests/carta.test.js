import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estiloBoya, textoRosa, simboloSonda } from '../assets/js/practicas/carta.js';

test('estiloBoya aplica el balizamiento de la región A', () => {
  assert.deepEqual(estiloBoya('lateral-babor'), { franjas: ['R'], tope: 'cilindro' });
  assert.deepEqual(estiloBoya('lateral-estribor'), { franjas: ['G'], tope: 'cono' });
  assert.deepEqual(estiloBoya('cardinal-N'), { franjas: ['B', 'Y'], tope: 'conos-arriba' });
  assert.deepEqual(estiloBoya('cardinal-S'), { franjas: ['Y', 'B'], tope: 'conos-abajo' });
  assert.deepEqual(estiloBoya('cardinal-E'), { franjas: ['B', 'Y', 'B'], tope: 'conos-base' });
  assert.deepEqual(estiloBoya('cardinal-W'), { franjas: ['Y', 'B', 'Y'], tope: 'conos-punta' });
  assert.deepEqual(estiloBoya('peligro-aislado'), { franjas: ['B', 'R', 'B'], tope: 'esferas' });
  assert.deepEqual(estiloBoya('aguas-navegables'), { franjas: ['R', 'W'], tope: 'esfera' });
  assert.deepEqual(estiloBoya('especial'), { franjas: ['Y'], tope: 'aspa' });
  assert.equal(estiloBoya('inventada'), null);
});

test('textoRosa actualiza la declinación al año pedido', () => {
  const rosa = { dm: -2.8333, anyo: 2022, variacionAnual: 7 };
  assert.equal(textoRosa(rosa, 2026), "Dm 2° 22' W (2026) · 7' E anual");
  assert.equal(textoRosa({ dm: 1.5, anyo: 2020, variacionAnual: -6 }, 2020), "Dm 1° 30' E (2020) · 6' W anual");
});

test('simboloSonda separa metros y decímetros como en la carta', () => {
  assert.deepEqual(simboloSonda(12.4), { entero: '12', decimal: '4' });
  assert.deepEqual(simboloSonda(31), { entero: '31', decimal: '' });
  assert.deepEqual(simboloSonda(0.6), { entero: '0', decimal: '6' });
});
