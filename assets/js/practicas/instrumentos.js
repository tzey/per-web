/* ============================================================
   Instrumentos virtuales sobre la carta: compás de puntas,
   transportador con regla y lápiz. Las funciones puras van
   primero y no tocan el DOM; las que crean instrumentos sí.
   Todas las coordenadas son unidades del viewBox de la carta,
   dentro del grupo `mundo`, así que el zoom no altera medidas.
   ============================================================ */

import { normalizar, diferenciaAngular, reciproco as recip, formatearAngulo, formatearMillas, rumboDistancia } from './geo.js';

/* ---------- Puras ---------- */

/** Rumbo de pantalla de a → b, con el norte hacia arriba. */
export function anguloEntrePx(a, b) {
  return normalizar(Math.atan2(b.x - a.x, -(b.y - a.y)) * 180 / Math.PI);
}

/**
 * Lectura del compás de puntas llevado a las escalas del marco.
 * @returns { millas|null, motivo: 'ok'|'no-en-escala'|'en-longitudes'|'latitud-alejada', minutosLon? }
 */
export function evaluarLecturaCompas(p1, p2, proy, { latMedida = null } = {}) {
  const lat1 = proy.enEscalaLateral(p1), lat2 = proy.enEscalaLateral(p2);
  if (lat1 && lat2) {
    const g1 = proy.aGeo(p1.x, p1.y), g2 = proy.aGeo(p2.x, p2.y);
    const millas = Math.abs(g1[0] - g2[0]) * 60;
    const latEscala = (g1[0] + g2[0]) / 2;
    if (latMedida !== null && Math.abs(latEscala - latMedida) * 60 > 8) return { millas, motivo: 'latitud-alejada', latEscala };
    return { millas, motivo: 'ok', latEscala };
  }
  const lon1 = proy.enEscalaLongitud(p1), lon2 = proy.enEscalaLongitud(p2);
  if (lon1 && lon2) {
    const g1 = proy.aGeo(p1.x, p1.y), g2 = proy.aGeo(p2.x, p2.y);
    return { millas: null, motivo: 'en-longitudes', minutosLon: Math.abs(g1[1] - g2[1]) * 60 };
  }
  return { millas: null, motivo: 'no-en-escala' };
}

export function evaluarTransportador(anguloLeido, rumboEsperado, tolerancia = 1) {
  const error = Math.abs(diferenciaAngular(rumboEsperado, anguloLeido));
  const ok = error <= tolerancia + 1e-9;
  const reciproco = !ok && Math.abs(diferenciaAngular(recip(rumboEsperado), anguloLeido)) <= tolerancia + 1e-9;
  return { ok, reciproco, error };
}

/* ---------- Utilidades DOM ---------- */

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, hijos = []) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) n.setAttribute(k, v);
  for (const h of hijos) n.append(h);
  return n;
};
const texto = (x, y, txt, attrs = {}) => { const t = el('text', { x, y, ...attrs }); t.textContent = txt; return t; };

/** Coordenadas del evento en el sistema local de la capa (unidades viewBox, con el zoom deshecho). */
export function puntoSvg(capa, ev) {
  const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(capa.getScreenCTM().inverse());
  return { x: p.x, y: p.y };
}

/** Arrastre con pointer capture. `mover(p, inicio)` recibe el punto local actual y el de inicio. */
function arrastrable(nodo, capa, { empezar, mover, soltar } = {}) {
  let inicio = null;
  nodo.addEventListener('pointerdown', ev => {
    if (ev.button !== 0 && ev.pointerType === 'mouse') return;
    ev.stopPropagation();
    nodo.setPointerCapture(ev.pointerId);
    inicio = puntoSvg(capa, ev);
    empezar?.(inicio, ev);
  });
  nodo.addEventListener('pointermove', ev => { if (inicio) mover?.(puntoSvg(capa, ev), inicio, ev); });
  const fin = ev => { if (inicio) { soltar?.(puntoSvg(capa, ev)); inicio = null; } };
  nodo.addEventListener('pointerup', fin);
  nodo.addEventListener('pointercancel', fin);
}

const pasoTeclado = ev => (ev.shiftKey ? 10 : 1);
const flecha = ev => ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] })[ev.key];

/* ---------- Compás de puntas ---------- */

/**
 * Dos puntas arrastrables unidas por un brazo. Al abrirlo sobre la carta
 * recuerda la latitud medida; al llevarlo a la escala lateral, lee millas.
 */
export function crearCompasPuntas(capa, proy, alCambiar = () => {}) {
  let p1 = { x: 300, y: 300 }, p2 = { x: 400, y: 300 }, latMedida = null, visible = false, lecturas = false;
  const g = el('g', { class: 'instrumento compas', tabindex: 0, role: 'group', 'aria-label': 'Compás de puntas' });
  const brazo = el('line', { class: 'brazo' });
  const c1 = el('circle', { class: 'punta', r: 6, tabindex: 0, 'aria-label': 'Punta 1' });
  const c2 = el('circle', { class: 'punta', r: 6, tabindex: 0, 'aria-label': 'Punta 2' });
  const medida = texto(0, 0, '', { class: 'medida', 'text-anchor': 'middle' });
  g.append(brazo, c1, c2, medida);
  g.style.display = 'none';
  capa.append(g);

  const dentroCarta = p => p.x > proy.marco.x0 && p.x < proy.marco.x1 && p.y > proy.marco.y0 && p.y < proy.marco.y1;

  function pintar() {
    brazo.setAttribute('x1', p1.x); brazo.setAttribute('y1', p1.y); brazo.setAttribute('x2', p2.x); brazo.setAttribute('y2', p2.y);
    c1.setAttribute('cx', p1.x); c1.setAttribute('cy', p1.y); c2.setAttribute('cx', p2.x); c2.setAttribute('cy', p2.y);
    const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
    medida.setAttribute('x', mx); medida.setAttribute('y', my - 10);
    const estado = leer();
    medida.textContent = lecturas && estado.millas !== null ? formatearMillas(estado.millas, 2) : '';
    alCambiar(estado);
  }

  /** Estado actual: si está sobre la carta, la distancia geográfica; si está en la escala, la lectura. */
  function leer() {
    if (dentroCarta(p1) && dentroCarta(p2)) {
      const g1 = proy.aGeo(p1.x, p1.y), g2 = proy.aGeo(p2.x, p2.y);
      latMedida = (g1[0] + g2[0]) / 2;
      return { p1, p2, dentro: true, millas: proy.millasEntrePx(p1, p2), motivo: 'sobre-carta', latMedida };
    }
    return { p1, p2, dentro: false, ...evaluarLecturaCompas(p1, p2, proy, { latMedida }), latMedida };
  }

  const moverPunta = (cual, p) => { if (cual === 1) p1 = p; else p2 = p; pintar(); };
  let base = null;
  arrastrable(c1, capa, { mover: p => moverPunta(1, p) });
  arrastrable(c2, capa, { mover: p => moverPunta(2, p) });
  arrastrable(brazo, capa, {
    empezar: () => { base = { p1: { ...p1 }, p2: { ...p2 } }; },
    mover: (p, inicio) => { const dx = p.x - inicio.x, dy = p.y - inicio.y; p1 = { x: base.p1.x + dx, y: base.p1.y + dy }; p2 = { x: base.p2.x + dx, y: base.p2.y + dy }; pintar(); }
  });
  g.addEventListener('keydown', ev => {
    const f = flecha(ev); if (!f) return;
    ev.preventDefault();
    const k = pasoTeclado(ev), d = { x: f[0] * k, y: f[1] * k };
    if (ev.target === c1) p1 = { x: p1.x + d.x, y: p1.y + d.y };
    else if (ev.target === c2) p2 = { x: p2.x + d.x, y: p2.y + d.y };
    else { p1 = { x: p1.x + d.x, y: p1.y + d.y }; p2 = { x: p2.x + d.x, y: p2.y + d.y }; }
    pintar();
  });

  pintar();
  return {
    fijar(a, b) { p1 = { ...a }; p2 = { ...b }; pintar(); },
    puntas: () => [p1, p2],
    leer,
    mostrar(v) { visible = v; g.style.display = v ? '' : 'none'; if (v) pintar(); },
    visible: () => visible,
    mostrarLectura(v) { lecturas = v; pintar(); },
    destruir() { g.remove(); }
  };
}

/* ---------- Transportador con regla ---------- */

/**
 * Limbo graduado fijo al norte de la carta y una regla que gira con un asa.
 * La lectura es el rumbo de la regla respecto al norte (meridianos verticales).
 */
export function crearTransportador(capa, proy, alCambiar = () => {}) {
  const R = 95, L = 260;
  let centro = { x: 500, y: 400 }, angulo = 0, visible = false, lecturas = false;
  const g = el('g', { class: 'instrumento transportador', tabindex: 0, role: 'slider', 'aria-label': 'Transportador', 'aria-valuemin': 0, 'aria-valuemax': 359, 'aria-valuenow': 0 });
  const fijo = el('g', { class: 'fijo' });
  fijo.append(el('circle', { class: 'cuerpo', r: R }), el('circle', { class: 'cuerpo', r: R * .55, 'stroke-dasharray': '2 2' }));
  for (let a = 0; a < 360; a++) {
    const rad = (a - 90) * Math.PI / 180, l = a % 10 === 0 ? 10 : a % 5 === 0 ? 6 : 3;
    fijo.append(el('line', { class: 'tick', x1: R * Math.cos(rad), y1: R * Math.sin(rad), x2: (R - l) * Math.cos(rad), y2: (R - l) * Math.sin(rad), 'stroke-width': a % 10 === 0 ? .9 : .5 }));
    if (a % 30 === 0) fijo.append(texto((R - 19) * Math.cos(rad), (R - 19) * Math.sin(rad) + 3, String(a).padStart(3, '0'), { class: 'num', 'text-anchor': 'middle' }));
  }
  fijo.append(el('line', { class: 'tick', x1: -R, y1: 0, x2: R, y2: 0, 'stroke-width': .4 }), el('line', { class: 'tick', x1: 0, y1: -R, x2: 0, y2: R, 'stroke-width': .4 }));
  const giro = el('g', { class: 'giro' });
  const regla = el('rect', { class: 'regla', x: -12, y: -L, width: 24, height: 2 * L, rx: 2 });
  const indice = el('line', { class: 'indice', x1: 0, y1: 0, x2: 0, y2: -L });
  const asa = el('circle', { class: 'asa', cx: 0, cy: -L + 14, r: 9 });
  giro.append(regla, indice, el('path', { class: 'indice', d: `M0,${-L + 2} l-5,10 h10 z`, fill: 'currentColor' }), asa);
  const lectura = texto(0, R + 18, '', { class: 'lectura', 'text-anchor': 'middle' });
  g.append(giro, fijo, lectura);
  g.style.display = 'none';
  capa.append(g);

  function pintar() {
    g.setAttribute('transform', `translate(${centro.x} ${centro.y})`);
    giro.setAttribute('transform', `rotate(${angulo})`);
    g.setAttribute('aria-valuenow', Math.round(angulo));
    lectura.textContent = lecturas ? formatearAngulo(angulo) : '';
    alCambiar({ centro, angulo });
  }

  let base = null;
  arrastrable(fijo, capa, {
    empezar: () => { base = { ...centro }; },
    mover: (p, inicio) => { centro = { x: base.x + p.x - inicio.x, y: base.y + p.y - inicio.y }; pintar(); }
  });
  arrastrable(regla, capa, {
    empezar: () => { base = { ...centro }; },
    mover: (p, inicio) => { centro = { x: base.x + p.x - inicio.x, y: base.y + p.y - inicio.y }; pintar(); }
  });
  arrastrable(asa, capa, { mover: p => { angulo = Math.round(anguloEntrePx(centro, p) * 2) / 2; pintar(); } });
  g.addEventListener('keydown', ev => {
    if (ev.key === 'Home') { angulo = 0; pintar(); ev.preventDefault(); return; }
    const f = flecha(ev); if (!f) return;
    ev.preventDefault();
    if (ev.altKey) { const k = pasoTeclado(ev); centro = { x: centro.x + f[0] * k, y: centro.y + f[1] * k }; }
    else if (f[0]) angulo = normalizar(angulo + f[0] * (ev.shiftKey ? 5 : 0.5));
    else centro = { x: centro.x, y: centro.y + f[1] * pasoTeclado(ev) };
    pintar();
  });

  pintar();
  return {
    centrar(p) { centro = { ...p }; pintar(); },
    girar(gr) { angulo = normalizar(gr); pintar(); },
    angulo: () => angulo,
    centro: () => centro,
    mostrar(v) { visible = v; g.style.display = v ? '' : 'none'; if (v) pintar(); },
    visible: () => visible,
    mostrarLectura(v) { lecturas = v; pintar(); },
    destruir() { g.remove(); }
  };
}

/* ---------- Lápiz ---------- */

/**
 * Trazos sobre la carta: rectas por arrastre, puntos y símbolos por clic,
 * goma, deshacer y rehacer. Guarda cada trazo en coordenadas geográficas
 * con marca de tiempo. `dibujar(capa, proy, trazo)` lo aporta carta.js.
 */
export function crearLapiz(svg, capa, proy, dibujar, alTrazar = () => {}) {
  let modo = null, trazos = [], rehacer = [], previo = null, inicio = null, lecturas = false;
  const geo = p => proy.aGeo(p.x, p.y);

  function repintar() {
    capa.replaceChildren();
    for (const t of trazos) {
      const n = dibujar(capa, proy, t.lecturas === false && !lecturas ? { ...t, etiqueta: t.etiquetaUsuario ?? '' } : t);
      n.dataset.ts = t.ts;
    }
    alTrazar({ trazos: [...trazos], modo });
  }

  function anadir(t) {
    trazos.push({ ...t, ts: Date.now() });
    rehacer = [];
    repintar();
  }

  function etiquetaSegmento(a, b) {
    if (!lecturas) return '';
    const { rumbo, distancia } = rumboDistancia(a, b);
    return `${formatearAngulo(rumbo)} · ${formatearMillas(distancia)}`;
  }

  svg.addEventListener('pointerdown', ev => {
    if (!modo) return;
    if (ev.target.closest('.capa-instrumentos')) return;
    ev.stopPropagation();
    const p = puntoSvg(capa, ev);
    if (modo === 'borrar') {
      const t = ev.target.closest('.trazo-g');
      if (t && t.parentNode === capa) { trazos = trazos.filter(x => String(x.ts) !== t.dataset.ts); repintar(); }
      return;
    }
    if (modo === 'recta') {
      inicio = p;
      svg.setPointerCapture(ev.pointerId);
      previo = dibujar(capa, proy, { tipo: 'segmento', desde: geo(p), hasta: geo(p) }, 'previo');
      return;
    }
    const simbolo = modo === 'punto' ? 'marca' : modo;
    const etiqueta = window.prompt('Etiqueta del punto (por ejemplo la hora):', '') ?? '';
    anadir({ tipo: 'punto', pos: geo(p), simbolo, etiqueta, etiquetaUsuario: etiqueta });
  }, true);
  svg.addEventListener('pointermove', ev => {
    if (!inicio || !previo) return;
    const p = puntoSvg(capa, ev);
    previo.remove();
    previo = dibujar(capa, proy, { tipo: 'segmento', desde: geo(inicio), hasta: geo(p), etiqueta: etiquetaSegmento(geo(inicio), geo(p)) }, 'previo');
  }, true);
  const fin = ev => {
    if (!inicio) return;
    const p = puntoSvg(capa, ev);
    previo?.remove(); previo = null;
    const a = geo(inicio), b = geo(p);
    inicio = null;
    if (Math.hypot(p.x - (proy.aPx(a).x), p.y - proy.aPx(a).y) < 4) return;
    anadir({ tipo: 'segmento', desde: a, hasta: b, etiqueta: etiquetaSegmento(a, b), lecturas: false });
  };
  svg.addEventListener('pointerup', fin, true);
  svg.addEventListener('pointercancel', fin, true);

  document.addEventListener('keydown', ev => {
    if (!(ev.ctrlKey || ev.metaKey) || ev.key.toLowerCase() !== 'z') return;
    if (ev.target.matches('input, textarea, select')) return;
    ev.preventDefault();
    if (ev.shiftKey) api.rehacer(); else api.deshacer();
  });

  const api = {
    modo(m) { if (m !== undefined) { modo = m; alTrazar({ trazos: [...trazos], modo }); } return modo; },
    deshacer() { const t = trazos.pop(); if (t) { rehacer.push(t); repintar(); } },
    rehacer() { const t = rehacer.pop(); if (t) { trazos.push(t); repintar(); } },
    borrarTodo() { trazos = []; rehacer = []; repintar(); },
    trazos: () => trazos.map(t => ({ ...t })),
    cargar(lista) { trazos = lista.map(t => ({ ...t })); rehacer = []; repintar(); },
    mostrarLectura(v) {
      lecturas = v;
      trazos = trazos.map(t => t.tipo === 'segmento' ? { ...t, etiqueta: etiquetaSegmento(t.desde, t.hasta) } : t);
      repintar();
    }
  };
  return api;
}
