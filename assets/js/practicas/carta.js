/* ============================================================
   Carta didáctica: dibujo SVG desde JSON y utilidades puras
   de simbología. Las funciones puras no tocan el DOM; las de
   dibujo solo lo hacen dentro de la llamada.
   ============================================================ */

import { crearProyeccion } from './mercator.js';
import { formatearGrados, formatearAngulo, declinacionActualizada, rumboDistancia, puntoDesde, reciproco, dentroDePoligono } from './geo.js';

/* ---------- Puras ---------- */

export const RE_CARACTERISTICA =
  /^(F|Fl|LFl|Q|VQ|Iso|Oc|Mo\([A-Z]\))(\((\d+)(\+\d+)?\))?(\+LFl)?(?: (W|R|G|Y|Bu))?(?: (\d+(?:,\d)?)s)?(?: (\d+)M)?$/;

/** 'Fl(2) W 10s 22M' → { ritmo:'Fl', grupo:2, color:'W', periodo:10, alcance:22 } */
export function descomponerCaracteristica(texto) {
  const m = RE_CARACTERISTICA.exec(String(texto).trim());
  if (!m) return null;
  const [, base, grupoTxt, grupoN, , masLFl, color, periodo, alcance] = m;
  return {
    ritmo: masLFl ? `${base}${grupoTxt ?? ''}+LFl` : base,
    grupo: grupoN ? +grupoN : 1,
    color: color ?? 'W',
    periodo: periodo ? +periodo.replace(',', '.') : null,
    alcance: alcance ? +alcance : null
  };
}

const BOYAS = {
  'lateral-babor':    { franjas: ['R'], tope: 'cilindro' },
  'lateral-estribor': { franjas: ['G'], tope: 'cono' },
  'cardinal-N':       { franjas: ['B', 'Y'], tope: 'conos-arriba' },
  'cardinal-S':       { franjas: ['Y', 'B'], tope: 'conos-abajo' },
  'cardinal-E':       { franjas: ['B', 'Y', 'B'], tope: 'conos-base' },
  'cardinal-W':       { franjas: ['Y', 'B', 'Y'], tope: 'conos-punta' },
  'peligro-aislado':  { franjas: ['B', 'R', 'B'], tope: 'esferas' },
  'aguas-navegables': { franjas: ['R', 'W'], tope: 'esfera' },
  'especial':         { franjas: ['Y'], tope: 'aspa' }
};

/** Colores y tope de una boya según el tipo, región A. */
export function estiloBoya(tipo) {
  const e = BOYAS[tipo];
  return e ? { franjas: [...e.franjas], tope: e.tope } : null;
}

const gradosMinutos = dec => {
  const abs = Math.abs(dec);
  let g = Math.floor(abs), m = Math.round((abs - g) * 60);
  if (m === 60) { g++; m = 0; }
  return `${g}° ${String(m).padStart(2, '0')}'`;
};

/** «Dm 2° 22' W (2026) · 7' E anual» */
export function textoRosa(rosa, anyo) {
  const dm = declinacionActualizada(rosa.dm, rosa.anyo, rosa.variacionAnual, anyo);
  const letra = dm < 0 ? 'W' : 'E';
  const var_ = rosa.variacionAnual;
  return `Dm ${gradosMinutos(dm)} ${letra} (${anyo}) · ${Math.abs(var_)}' ${var_ < 0 ? 'W' : 'E'} anual`;
}

/** 12.4 → { entero:'12', decimal:'4' }; 31 → { entero:'31', decimal:'' } */
export function simboloSonda(prof) {
  const entero = Math.floor(prof);
  const dec = Math.round((prof - entero) * 10);
  return { entero: String(entero), decimal: dec ? String(dec) : '' };
}

export function buscarObjeto(carta, id) {
  for (const col of ['faros', 'marcas', 'boyas', 'peligros', 'puertos', 'zonas', 'enfilaciones'])
    for (const o of carta[col]) if (o.id === id) return { ...o, coleccion: col };
  return null;
}

const NOMBRES_BOYA = {
  'lateral-babor': 'Lateral de babor', 'lateral-estribor': 'Lateral de estribor',
  'cardinal-N': 'Cardinal norte', 'cardinal-S': 'Cardinal sur', 'cardinal-E': 'Cardinal este', 'cardinal-W': 'Cardinal oeste',
  'peligro-aislado': 'Peligro aislado', 'aguas-navegables': 'Aguas navegables', 'especial': 'Marca especial'
};

/** Ficha ENC didáctica de un objeto: título y filas [etiqueta, valor]. */
export function fichaObjeto(carta, id) {
  const o = buscarObjeto(carta, id);
  if (!o) return null;
  const filas = [];
  const pos = o.pos ? `${formatearGrados(o.pos[0], 'lat')} · ${formatearGrados(o.pos[1], 'lon')}` : null;
  if (pos) filas.push(['Posición', pos]);
  if (o.coleccion === 'faros') {
    const c = descomponerCaracteristica(o.caracteristica);
    filas.push(['Característica', o.caracteristica]);
    if (c) filas.push(['Luz', `${c.grupo > 1 ? c.grupo + ' destellos' : 'destello'} ${({ W: 'blanco', R: 'rojo', G: 'verde', Y: 'amarillo', Bu: 'azul' })[c.color]}${c.periodo ? `, periodo ${c.periodo} s` : ''}`]);
    if (o.alturaFoco) filas.push(['Altura del foco', `${o.alturaFoco} m`]);
    if (o.alcance) filas.push(['Alcance nominal', `${o.alcance} M`]);
  }
  if (o.coleccion === 'boyas') {
    filas.push(['Tipo', NOMBRES_BOYA[o.tipo] ?? o.tipo]);
    if (o.luz) filas.push(['Luz', o.luz]);
  }
  if (o.coleccion === 'peligros') {
    filas.push(['Tipo', ({ bajo: 'Bajo', naufragio: 'Naufragio', roca: 'Roca' })[o.tipo] ?? o.tipo]);
    if (o.prof !== undefined) filas.push(['Sonda mínima', `${String(o.prof).replace('.', ',')} m`]);
  }
  if (o.coleccion === 'marcas') filas.push(['Tipo', o.tipo]);
  if (o.coleccion === 'enfilaciones') {
    const [ant, post] = o.objetos.map(i => buscarObjeto(carta, i));
    const r = rumboDistancia(ant.pos, post.pos).rumbo;
    filas.push(['Objetos', `${ant.nombre} por ${post.nombre}`]);
    filas.push(['Demora verdadera desde la mar', formatearAngulo(r)]);
  }
  if (o.coleccion === 'puertos' && o.puertoMareas) filas.push(['Puerto de mareas', o.puertoMareas]);
  filas.push(['Carta', `${carta.meta.nombre}, ${carta.meta.edicion}`]);
  return { titulo: o.nombre ?? o.etiqueta ?? o.descripcion ?? id, filas };
}

/* ---------- Dibujo ---------- */

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, hijos = []) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) n.setAttribute(k, v);
  for (const h of hijos) n.append(h);
  return n;
};
const texto = (x, y, txt, attrs = {}) => { const t = el('text', { x, y, ...attrs }); t.textContent = txt; return t; };
const puntos = (proy, poligono) => poligono.map(p => { const { x, y } = proy.aPx(p); return `${x.toFixed(1)},${y.toFixed(1)}`; }).join(' ');
const COLOR = { R: '#c0392b', G: '#1b7f5a', B: '#10202b', Y: '#e4a11b', W: '#ffffff' };

/**
 * Dibuja la carta en el <svg>. Devuelve la proyección y las capas
 * (mundo, trazos, solucion, instrumentos) para el resto de módulos.
 */
export function pintarCarta(svg, carta, { anyo = new Date().getFullYear() } = {}) {
  const proy = crearProyeccion(carta.meta);
  const { ancho, alto } = proy.viewBox;
  const { x0, y0, x1, y1 } = proy.marco;
  svg.setAttribute('viewBox', `0 0 ${ancho} ${alto}`);
  svg.replaceChildren();

  const title = el('title'); title.textContent = `${carta.meta.nombre}. ${carta.meta.sello}.`;
  svg.append(title);
  svg.append(el('defs', {}, [el('clipPath', { id: 'clip-marco' }, [el('rect', { x: x0, y: y0, width: x1 - x0, height: y1 - y0 })])]));

  const mundo = el('g', { class: 'mundo' });
  svg.append(el('rect', { class: 'carta-papel', x: 0, y: 0, width: ancho, height: alto }));
  svg.append(mundo);

  const contenido = el('g', { 'clip-path': 'url(#clip-marco)' });
  mundo.append(contenido);
  contenido.append(el('rect', { class: 'agua', x: x0, y: y0, width: x1 - x0, height: y1 - y0 }));

  // veriles, de profundo a somero
  const capaVeriles = el('g', { class: 'capa-veriles' });
  for (const v of carta.veriles) capaVeriles.append(el('polygon', { class: `veril v${v.prof}`, points: puntos(proy, v.poligono) }));
  contenido.append(capaVeriles);

  // tierra
  const capaTierra = el('g', { class: 'capa-tierra' });
  for (const c of carta.costa) capaTierra.append(el('polygon', { class: 'tierra', points: puntos(proy, c.poligono), 'data-id': c.id }));
  contenido.append(capaTierra);

  // zonas
  const capaZonas = el('g', { class: 'capa-zonas' });
  for (const z of carta.zonas) {
    if (z.poligono) {
      capaZonas.append(el('polygon', { class: `zona ${z.tipo}`, points: puntos(proy, z.poligono), 'data-id': z.id }));
      const c = centroide(proy, z.poligono);
      if (z.etiqueta) capaZonas.append(texto(c.x, c.y, z.etiqueta, { class: 'zona-etiqueta', 'text-anchor': 'middle' }));
      if (z.tipo === 'fondeadero') capaZonas.append(texto(c.x, c.y - 14, '⚓', { class: 'zona-etiqueta', 'text-anchor': 'middle' }));
    } else if (z.linea) {
      capaZonas.append(el('polyline', { class: `zona ${z.tipo}`, points: puntos(proy, z.linea), 'data-id': z.id }));
      const m = proy.aPx(z.linea[Math.floor(z.linea.length / 2)]);
      capaZonas.append(texto(m.x + 6, m.y, z.etiqueta ?? '', { class: 'zona-etiqueta' }));
    }
  }
  contenido.append(capaZonas);

  // sondas
  const capaSondas = el('g', { class: 'capa-sondas' });
  for (const s of carta.sondas) {
    const { x, y } = proy.aPx(s.pos);
    const { entero, decimal } = simboloSonda(s.prof);
    const t = el('text', { class: 'sonda', x, y, 'text-anchor': 'middle', 'data-prof': s.prof, 'data-fondo': s.fondo ?? '' });
    const a = el('tspan'); a.textContent = entero; t.append(a);
    if (decimal) { const b = el('tspan', { class: 'dec', dy: 3 }); b.textContent = decimal; t.append(b); }
    if (s.fondo) { const f = el('tspan', { class: 'fondo', dx: 3, dy: decimal ? -3 : 0 }); f.textContent = s.fondo; t.append(f); }
    capaSondas.append(t);
  }
  contenido.append(capaSondas);

  // objetos
  const capaObjetos = el('g', { class: 'capa-objetos' });
  const idx = Object.fromEntries([...carta.faros, ...carta.marcas, ...carta.boyas].map(o => [o.id, o]));

  for (const e of carta.enfilaciones) {
    const ant = idx[e.objetos[0]], post = idx[e.objetos[1]];
    const r = rumboDistancia(post.pos, ant.pos).rumbo;
    const fin = puntoDesde(ant.pos, r, 14);
    const a = proy.aPx(post.pos), b = proy.aPx(fin);
    capaObjetos.append(el('line', { class: 'enfilacion', x1: a.x, y1: a.y, x2: b.x, y2: b.y, 'data-id': e.id }));
    const m = proy.aPx(puntoDesde(ant.pos, r, 6));
    capaObjetos.append(texto(m.x + 6, m.y - 4, `Enf. ${formatearAngulo(reciproco(r))}`, { class: 'etiqueta enf', 'data-id': e.id }));
  }

  for (const p of carta.peligros) {
    const { x, y } = proy.aPx(p.pos);
    const g = el('g', { class: `peligro ${p.tipo} objeto`, 'data-id': p.id, tabindex: 0, role: 'button' });
    if (p.tipo === 'bajo') {
      const r = Math.max(6, (p.radioM ?? 0.2) * proy.pxPorMinutoLat(p.pos[0]));
      g.append(el('circle', { cx: x, cy: y, r }), texto(x, y + 4, String(p.prof).replace('.', ','), { class: 'sonda peligro-prof', 'text-anchor': 'middle' }));
    } else if (p.tipo === 'naufragio') {
      g.append(el('path', { d: `M${x - 7},${y + 3} L${x + 7},${y + 3} L${x + 4},${y - 2} L${x - 4},${y - 2} Z M${x - 3},${y - 2} V${y - 8} M${x},${y - 2} V${y - 10} M${x + 3},${y - 2} V${y - 8}` }));
      g.append(texto(x + 10, y + 4, `Wk ${String(p.prof).replace('.', ',')}`, { class: 'etiqueta' }));
    } else {
      g.append(el('path', { d: `M${x - 5},${y} H${x + 5} M${x},${y - 5} V${y + 5}` }), el('circle', { cx: x - 4, cy: y - 4, r: .8 }), el('circle', { cx: x + 4, cy: y + 4, r: .8 }), el('circle', { cx: x - 4, cy: y + 4, r: .8 }), el('circle', { cx: x + 4, cy: y - 4, r: .8 }));
      g.append(texto(x + 9, y + 4, String(p.prof).replace('.', ','), { class: 'etiqueta' }));
    }
    const tt = el('title'); tt.textContent = p.nombre ?? p.tipo; g.append(tt);
    capaObjetos.append(g);
  }

  for (const b of carta.boyas) {
    const { x, y } = proy.aPx(b.pos);
    const est = estiloBoya(b.tipo) ?? { franjas: ['Y'], tope: null };
    const g = el('g', { class: 'boya objeto', 'data-id': b.id, tabindex: 0, role: 'button' });
    const h = 14, w = 7, n = est.franjas.length;
    est.franjas.forEach((c, i) => g.append(el('rect', { x: x - w / 2, y: y - h + i * h / n, width: w, height: h / n, fill: COLOR[c], stroke: '#10202b', 'stroke-width': .6 })));
    g.append(el('line', { x1: x - 6, y1: y, x2: x + 6, y2: y, stroke: '#10202b', 'stroke-width': 1 }));
    g.append(tope(est.tope, x, y - h - 1));
    if (b.luz) g.append(el('path', { class: 'destello', d: `M${x + 5},${y - h - 3} q6,-3 6,3` }));
    if (b.luz) g.append(texto(x + 9, y - 2, b.luz, { class: 'etiqueta luz' }));
    const tt = el('title'); tt.textContent = b.nombre ?? NOMBRES_BOYA[b.tipo] ?? b.tipo; g.append(tt);
    capaObjetos.append(g);
  }

  for (const m of carta.marcas) {
    const { x, y } = proy.aPx(m.pos);
    const g = el('g', { class: `marca ${m.tipo} objeto`, 'data-id': m.id, tabindex: 0, role: 'button' });
    if (m.tipo === 'torre') g.append(el('path', { d: `M${x - 4},${y + 3} h8 v-9 h-8 z M${x - 5},${y - 6} h10` }));
    else if (m.tipo === 'chimenea') g.append(el('path', { d: `M${x - 2},${y + 3} h4 v-14 h-4 z` }));
    else g.append(el('path', { d: `M${x},${y + 3} v-12 M${x - 4},${y - 5} h8` }));
    g.append(el('circle', { cx: x, cy: y + 3, r: 1.6 }));
    g.append(texto(x + 8, y + 2, m.nombre, { class: 'etiqueta' }));
    capaObjetos.append(g);
  }

  for (const f of carta.faros) {
    const { x, y } = proy.aPx(f.pos);
    const g = el('g', { class: `faro objeto${f.conspicuo ? ' conspicuo' : ''}`, 'data-id': f.id, tabindex: 0, role: 'button' });
    g.append(el('path', { class: 'destello', d: `M${x},${y} m3,-3 q10,-6 12,2 q-6,6 -12,-2 z` }));
    g.append(el('circle', { cx: x, cy: y, r: 2.6 }));
    g.append(texto(x + 16, y - 6, f.nombre.replace(/^Faro de /, ''), { class: 'etiqueta faro-nombre' }));
    g.append(texto(x + 16, y + 6, f.caracteristica, { class: 'etiqueta caracteristica' }));
    const tt = el('title'); tt.textContent = f.nombre; g.append(tt);
    capaObjetos.append(g);
  }

  for (const p of carta.puertos) {
    const { x, y } = proy.aPx(p.pos);
    capaObjetos.append(texto(x, y + 18, p.nombre, { class: 'etiqueta puerto', 'text-anchor': 'middle', 'data-id': p.id }));
  }
  for (const t of carta.toponimos) {
    const { x, y } = proy.aPx(t.pos);
    capaObjetos.append(texto(x, y, t.texto, { class: `toponimo ${t.estilo ?? ''}`, 'text-anchor': 'middle' }));
  }
  // área de pulsación generosa para cada objeto
  for (const g of capaObjetos.querySelectorAll('.objeto')) {
    const b = g.querySelector('circle, rect, path');
    const bb = b?.getBBox?.();
    if (bb) g.prepend(el('circle', { class: 'hit', cx: bb.x + bb.width / 2, cy: bb.y + bb.height / 2, r: Math.max(10, bb.width) }));
  }
  contenido.append(capaObjetos);

  // rosa de declinación
  contenido.append(pintarRosa(proy, carta.rosa, anyo));

  // cartucho de metadatos
  contenido.append(pintarCartucho(proy, carta));

  // capas para los otros módulos (dentro de mundo, fuera del clip)
  const capaSolucion = el('g', { class: 'capa-solucion' });
  const capaTrazos = el('g', { class: 'capa-trazos' });
  const capaInstrumentos = el('g', { class: 'capa-instrumentos' });
  mundo.append(pintarMarco(proy, carta.meta), capaSolucion, capaTrazos, capaInstrumentos);

  // sello en el margen superior
  const sello = texto(ancho / 2, y0 - 20, carta.meta.sello, { class: 'sello', 'text-anchor': 'middle' });
  mundo.append(sello);

  return { proyeccion: proy, mundo, capas: { solucion: capaSolucion, trazos: capaTrazos, instrumentos: capaInstrumentos, objetos: capaObjetos } };
}

function tope(tipo, x, y) {
  const g = el('g', { class: 'tope' });
  const cono = (cx, cy, arriba = true) => el('path', { d: arriba ? `M${cx - 3},${cy} h6 l-3,-5 z` : `M${cx - 3},${cy - 5} h6 l-3,5 z` });
  switch (tipo) {
    case 'cilindro': g.append(el('rect', { x: x - 3, y: y - 6, width: 6, height: 6 })); break;
    case 'cono': g.append(cono(x, y)); break;
    case 'conos-arriba': g.append(cono(x, y), cono(x, y - 6)); break;
    case 'conos-abajo': g.append(cono(x, y, false), cono(x, y - 6, false)); break;
    case 'conos-base': g.append(cono(x, y - 6), cono(x, y, false)); break;
    case 'conos-punta': g.append(cono(x, y, true), cono(x, y - 6, false)); break;
    case 'esferas': g.append(el('circle', { cx: x, cy: y - 2.5, r: 2.5 }), el('circle', { cx: x, cy: y - 8, r: 2.5 })); break;
    case 'esfera': g.append(el('circle', { cx: x, cy: y - 3, r: 3 })); break;
    case 'aspa': g.append(el('path', { d: `M${x - 3},${y} l6,-6 M${x - 3},${y - 6} l6,6`, stroke: '#10202b', 'stroke-width': 1.2 })); break;
  }
  return g;
}

function centroide(proy, poligono) {
  const ps = poligono.slice(0, -1).map(p => proy.aPx(p));
  return { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length };
}

function pintarMarco(proy, meta) {
  const { x0, y0, x1, y1 } = proy.marco;
  const { ancho, alto } = proy.viewBox;
  const g = el('g', { class: 'capa-marco' });
  // franjas del margen (papel) por encima de lo que se salga del clip
  g.append(el('rect', { class: 'marco-borde', x: x0, y: y0, width: x1 - x0, height: y1 - y0 }));
  const largo = { decima: 3, minuto: 7, cinco: 12, grado: 14 };
  const etiqueta = (valor, eje) => {
    const abs = Math.abs(valor);
    let gr = Math.floor(abs + 1e-9), mn = Math.round((abs - gr) * 60);
    if (mn === 60) { gr++; mn = 0; }
    const letra = eje === 'lat' ? (valor < 0 ? 'S' : 'N') : (valor < 0 ? 'W' : 'E');
    return mn === 0 ? `${gr}° ${letra}` : `${gr}°${String(mn).padStart(2, '0')}'`;
  };
  for (const eje of ['lat', 'lon']) {
    for (const t of proy.graduacion(eje, 0.1)) {
      const minutos = Math.round(t.valor * 600) / 10;
      const cinco = t.tipo === 'minuto' && Math.abs(minutos % 5) < 1e-6;
      const L = largo[t.tipo === 'minuto' && cinco ? 'cinco' : t.tipo];
      if (eje === 'lat') {
        g.append(el('line', { class: `tick ${t.tipo}`, x1: x0, y1: t.px, x2: x0 - L, y2: t.px }));
        g.append(el('line', { class: `tick ${t.tipo}`, x1: x1, y1: t.px, x2: x1 + L, y2: t.px }));
        if (cinco || t.tipo === 'grado') {
          g.append(texto(x0 - L - 4, t.px + 4, etiqueta(t.valor, 'lat'), { class: `grad ${t.tipo}`, 'text-anchor': 'end' }));
          g.append(texto(x1 + L + 4, t.px + 4, etiqueta(t.valor, 'lat'), { class: `grad ${t.tipo}` }));
        }
      } else {
        g.append(el('line', { class: `tick ${t.tipo}`, x1: t.px, y1: y0, x2: t.px, y2: y0 - L }));
        g.append(el('line', { class: `tick ${t.tipo}`, x1: t.px, y1: y1, x2: t.px, y2: y1 + L }));
        if (cinco || t.tipo === 'grado') {
          g.append(texto(t.px, y0 - L - 5, etiqueta(t.valor, 'lon'), { class: `grad ${t.tipo}`, 'text-anchor': 'middle' }));
          g.append(texto(t.px, y1 + L + 13, etiqueta(t.valor, 'lon'), { class: `grad ${t.tipo}`, 'text-anchor': 'middle' }));
        }
      }
    }
  }
  // bandas alternas de 1' en el marco (como en la carta papel)
  const bandas = el('g', { class: 'bandas' });
  const lat = proy.graduacion('lat', 1), lon = proy.graduacion('lon', 1);
  for (let i = 1; i < lat.length; i += 2) {
    bandas.append(el('rect', { x: x0 - 3, y: lat[i].px, width: 3, height: lat[i - 1].px - lat[i].px }));
    bandas.append(el('rect', { x: x1, y: lat[i].px, width: 3, height: lat[i - 1].px - lat[i].px }));
  }
  for (let i = 1; i < lon.length; i += 2) {
    bandas.append(el('rect', { x: lon[i - 1].px, y: y0 - 3, width: lon[i].px - lon[i - 1].px, height: 3 }));
    bandas.append(el('rect', { x: lon[i - 1].px, y: y1, width: lon[i].px - lon[i - 1].px, height: 3 }));
  }
  g.append(bandas);
  g.append(el('rect', { class: 'marco-exterior', x: 0.5, y: 0.5, width: ancho - 1, height: alto - 1 }));
  return g;
}

function pintarRosa(proy, rosa, anyo) {
  const { x, y } = proy.aPx(rosa.centro);
  const R = rosa.radioPx;
  const g = el('g', { class: 'rosa', transform: `translate(${x} ${y})` });
  g.append(el('circle', { r: R, class: 'rosa-ext' }), el('circle', { r: R * .78, class: 'rosa-int' }));
  for (let a = 0; a < 360; a += 1) {
    const L = a % 10 === 0 ? 10 : a % 5 === 0 ? 6 : 3;
    const rad = (a - 90) * Math.PI / 180;
    g.append(el('line', { x1: R * Math.cos(rad), y1: R * Math.sin(rad), x2: (R - L) * Math.cos(rad), y2: (R - L) * Math.sin(rad), class: a % 10 === 0 ? 'tick minuto' : 'tick decima' }));
    if (a % 30 === 0) {
      const t = texto((R - 20) * Math.cos(rad), (R - 20) * Math.sin(rad) + 4, String(a).padStart(3, '0'), { class: 'rosa-num', 'text-anchor': 'middle' });
      g.append(t);
    }
  }
  const dm = declinacionActualizada(rosa.dm, rosa.anyo, rosa.variacionAnual, anyo);
  g.append(el('line', { x1: 0, y1: R * .1, x2: 0, y2: -R - 8, class: 'norte-v' }));
  g.append(el('path', { d: `M0,${-R - 8} l-5,10 h10 z`, class: 'norte-v' }));
  g.append(el('line', { x1: 0, y1: 0, x2: 0, y2: -R * .72, class: 'norte-m', transform: `rotate(${dm})` }));
  g.append(el('path', { d: `M0,${-R * .72} l-4,9 h8 z`, class: 'norte-m', transform: `rotate(${dm})` }));
  g.append(texto(0, R + 22, textoRosa(rosa, anyo), { class: 'rosa-texto', 'text-anchor': 'middle' }));
  g.append(texto(0, -R * .4, 'N', { class: 'rosa-num', 'text-anchor': 'middle' }));
  return g;
}

function pintarCartucho(proy, carta) {
  const m = carta.meta;
  const { x, y } = proy.aPx(m.cartucho.pos);
  const w = m.cartucho.anchoPx ?? 260;
  const lineas = [
    [m.nombre, 'cartucho-titulo'],
    [m.subtitulo, 'cartucho-sub'],
    [`Escala 1:${m.escala.toLocaleString('es-ES')} (lat. ${gradosMinutos((m.limites.latMin + m.limites.latMax) / 2)})`, ''],
    [`Proyección ${m.proyeccion} · ${m.datum}`, ''],
    [`Sondas en ${m.unidadSondas} referidas a ${m.ceroHidrografico.toLowerCase()}`, ''],
    [m.edicion, ''],
    [m.sello, 'cartucho-sello']
  ];
  const h = 26 + lineas.length * 16;
  const g = el('g', { class: 'cartucho', transform: `translate(${x} ${y - h})` });
  g.append(el('rect', { x: 0, y: 0, width: w, height: h }));
  lineas.forEach(([t, cls], i) => g.append(texto(12, 22 + i * 16, t, { class: cls })));
  return g;
}

/* ---------- Zoom y desplazamiento ---------- */

/**
 * Zoom con rueda y pinza, desplazamiento por arrastre del fondo y
 * doble clic para reiniciar. Todo se aplica al grupo `mundo`, de modo
 * que las capas hijas siguen en unidades del viewBox.
 */
export function crearZoomPan(svg, mundo, { min = 1, max = 8, esFondo = () => true } = {}) {
  let k = 1, tx = 0, ty = 0;
  const aplicar = () => mundo.setAttribute('transform', `translate(${tx} ${ty}) scale(${k})`);
  const aViewBox = ev => {
    const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(svg.getScreenCTM().inverse());
    return { x: p.x, y: p.y };
  };
  const zoomEn = (p, factor) => {
    const k2 = Math.min(max, Math.max(min, k * factor));
    tx = p.x - (p.x - tx) * k2 / k;
    ty = p.y - (p.y - ty) * k2 / k;
    k = k2;
    if (k === 1) { tx = 0; ty = 0; }
    aplicar();
  };
  svg.addEventListener('wheel', ev => {
    ev.preventDefault();
    zoomEn(aViewBox(ev), Math.exp(-ev.deltaY * 0.0015));
  }, { passive: false });
  svg.addEventListener('dblclick', ev => { if (esFondo(ev.target)) { k = 1; tx = ty = 0; aplicar(); } });

  const punteros = new Map();
  let arrastre = null, pinza = null;
  svg.addEventListener('pointerdown', ev => {
    if (!esFondo(ev.target)) return;
    punteros.set(ev.pointerId, aViewBox(ev));
    svg.setPointerCapture(ev.pointerId);
    if (punteros.size === 1) arrastre = { ...aViewBox(ev), tx, ty };
    else if (punteros.size === 2) { const [a, b] = [...punteros.values()]; pinza = { d: Math.hypot(a.x - b.x, a.y - b.y), k, c: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }; arrastre = null; }
  });
  svg.addEventListener('pointermove', ev => {
    if (!punteros.has(ev.pointerId)) return;
    punteros.set(ev.pointerId, aViewBox(ev));
    if (pinza && punteros.size === 2) {
      const [a, b] = [...punteros.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const objetivo = Math.min(max, Math.max(min, pinza.k * d / pinza.d));
      zoomEn(pinza.c, objetivo / k);
    } else if (arrastre) {
      const p = aViewBox(ev);
      tx = arrastre.tx + (p.x - arrastre.x); ty = arrastre.ty + (p.y - arrastre.y);
      aplicar();
    }
  });
  const soltar = ev => { punteros.delete(ev.pointerId); if (punteros.size < 2) pinza = null; if (!punteros.size) arrastre = null; };
  svg.addEventListener('pointerup', soltar); svg.addEventListener('pointercancel', soltar);

  return { escala: () => k, traslacion: () => ({ x: tx, y: ty }), reiniciar: () => { k = 1; tx = ty = 0; aplicar(); }, aViewBox, zoomEn };
}

/** ¿Está el punto geográfico en tierra según los polígonos de costa? */
export function enTierra(carta, p) {
  return carta.costa.some(c => dentroDePoligono(p, c.poligono));
}

/* ---------- Trazos (solución y lápiz) ---------- */

/**
 * Dibuja un trazo geográfico en una capa. Tipos:
 *  recta   { desde:[lat,lon], rumbo, largoM, etiqueta? }
 *  segmento{ desde, hasta, etiqueta? }
 *  punto   { pos, simbolo: 'observada'|'estima'|'marca', etiqueta? }
 *  circulo { centro, radioM }
 * Devuelve el elemento creado.
 */
export function dibujarTrazo(capa, proy, trazo, clase = '') {
  const g = el('g', { class: `trazo-g ${clase}`.trim() });
  const linea = (a, b, etiqueta) => {
    const A = proy.aPx(a), B = proy.aPx(b);
    g.append(el('line', { class: 'trazo', x1: A.x, y1: A.y, x2: B.x, y2: B.y }));
    if (etiqueta) {
      const ang = Math.atan2(B.y - A.y, B.x - A.x) * 180 / Math.PI;
      const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
      g.append(texto(0, -4, etiqueta, { class: 'trazo-etiqueta', 'text-anchor': 'middle', transform: `translate(${mx} ${my}) rotate(${ang > 90 || ang < -90 ? ang + 180 : ang})` }));
    }
  };
  switch (trazo.tipo) {
    case 'recta': linea(trazo.desde, puntoDesde(trazo.desde, trazo.rumbo, trazo.largoM), trazo.etiqueta ?? `${formatearAngulo(trazo.rumbo)}`); break;
    case 'segmento': linea(trazo.desde, trazo.hasta, trazo.etiqueta); break;
    case 'punto': {
      const { x, y } = proy.aPx(trazo.pos);
      if (trazo.simbolo === 'observada') g.append(el('circle', { class: 'trazo-punto observada', cx: x, cy: y, r: 3 }), el('circle', { class: 'trazo-punto', cx: x, cy: y, r: 7 }));
      else if (trazo.simbolo === 'estima') g.append(el('circle', { class: 'trazo-punto', cx: x, cy: y, r: 5 }), el('path', { class: 'trazo-punto', d: `M${x - 7},${y} H${x + 7} M${x},${y - 7} V${y + 7}` }));
      else g.append(el('path', { class: 'trazo-punto', d: `M${x - 5},${y - 5} L${x + 5},${y + 5} M${x - 5},${y + 5} L${x + 5},${y - 5}` }));
      if (trazo.etiqueta) g.append(texto(x + 9, y - 6, trazo.etiqueta, { class: 'trazo-etiqueta' }));
      break;
    }
    case 'circulo': {
      const { x, y } = proy.aPx(trazo.centro);
      g.append(el('circle', { class: 'trazo', cx: x, cy: y, r: trazo.radioM * proy.pxPorMinutoLat(trazo.centro[0]) }));
      break;
    }
  }
  capa.append(g);
  return g;
}
