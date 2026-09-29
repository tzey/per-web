/* ============================================================
   Generadores de ejercicios parametrizados con semilla.
   Puros: reciben la carta y la tablilla, devuelven enunciado,
   datos visibles, estado real, solución por pasos, campos y
   un validador con tolerancias según la escala de la carta.
   ============================================================ */

import {
  normalizar, diferenciaAngular, reciproco, parsearGrados, formatearGrados, formatearAngulo,
  parsearHora, formatearHora, rumboDistancia, puntoDesde, correccionTotal, rumboAguja,
  declinacionActualizada, desvioPorTablilla, estima as estimar, tiempoParaDistancia,
  cortarRectas, calidadCorte, situacionDemoraDistancia,
  alturaMarea, horaParaAltura, eventosAlrededor, sondaReal, resguardo as calcResguardo
} from './geo.js';
import { enTierra, buscarObjeto } from './carta.js';

export const VERSION_GENERADORES = 1;

/* ---------- Aleatoriedad determinista ---------- */

export function crearPrng(semilla) {
  let s = (semilla >>> 0) || 0x9e3779b9;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(texto) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export const entero = (prng, min, max) => min + Math.floor(prng() * (max - min + 1));
export const decimal = (prng, min, max, paso) => Math.round((min + prng() * (max - min)) / paso) * paso;
export const elegir = (prng, lista) => lista[Math.floor(prng() * lista.length)];
const redondear = (v, paso) => Math.round(v / paso) * paso;

/* ---------- Tolerancias y catálogo ---------- */

export const TOLERANCIAS = {
  100000: { minutosLat: 0.5, minutosLon: 0.6, grados: 1, millas: 0.3, metros: 0.1, minutosTiempo: 3 },
  10000:  { minutosLat: 0.05, minutosLon: 0.06, grados: 1, millas: 0.03, metros: 0.1, minutosTiempo: 2 }
};

export const TIPOS = [
  { id: 'coordenadas-objeto', bloque: 'carta', fase: 1, titulo: 'Coordenadas de un objeto', cartas: ['costera', 'portulano'] },
  { id: 'distancia-tiempo-eta', bloque: 'carta', fase: 1, titulo: 'Distancia, tiempo y hora de llegada', cartas: ['costera'] },
  { id: 'rumbo-verdadero-aguja', bloque: 'carta', fase: 1, titulo: 'Rumbo verdadero y rumbo de aguja', cartas: ['costera'] },
  { id: 'declinacion-ct-enfilacion', bloque: 'carta', fase: 1, titulo: 'Corrección total por enfilación', cartas: ['costera'] },
  { id: 'estima', bloque: 'carta', fase: 1, titulo: 'Situación de estima', cartas: ['costera'] },
  { id: 'situacion-dos-demoras', bloque: 'carta', fase: 1, titulo: 'Situación por dos demoras simultáneas', cartas: ['costera'] },
  { id: 'situacion-enfilacion-demora', bloque: 'carta', fase: 1, titulo: 'Situación por enfilación y demora', cartas: ['costera'] },
  { id: 'situacion-demora-distancia', bloque: 'carta', fase: 1, titulo: 'Situación por demora y distancia', cartas: ['costera'] },
  { id: 'derrota-resguardo-peligro', bloque: 'carta', fase: 1, titulo: 'Derrota con resguardo a un peligro', cartas: ['costera'] },
  { id: 'marea-altura-hora', bloque: 'mareas', fase: 2, titulo: 'Altura de la marea a una hora', cartas: ['costera'] },
  { id: 'marea-resguardo-paso', bloque: 'mareas', fase: 2, titulo: 'Profundidad real y resguardo', cartas: ['costera'] },
  { id: 'marea-hora-minima', bloque: 'mareas', fase: 2, titulo: 'Hora mínima para pasar un bajo', cartas: ['costera'] },
  { id: 'gnss-vs-estima', bloque: 'gnss', fase: 2, titulo: 'GNSS frente a estima', cartas: ['costera'] },
  { id: 'gnss-waypoint-mob', bloque: 'gnss', fase: 2, titulo: 'Waypoint y hombre al agua', cartas: ['costera'] }
];

/* ---------- Formato ---------- */

const fLat = v => formatearGrados(v, 'lat');
const fLon = v => formatearGrados(v, 'lon');
const fPos = p => `${fLat(p[0])} · ${fLon(p[1])}`;
const fAng = formatearAngulo;
const fSigno = (v, dec = 1) => `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(dec).replace('.', ',')}°`;
const fM = (v, dec = 1) => `${v.toFixed(dec).replace('.', ',')} M`;
const fNum = (v, dec = 1) => v.toFixed(dec).replace('.', ',');
const fDm = v => `${gradosMin(Math.abs(v))} ${v < 0 ? 'W' : 'E'}`;
function gradosMin(dec) {
  let g = Math.floor(dec), m = Math.round((dec - g) * 60);
  if (m === 60) { g++; m = 0; }
  return `${g}° ${String(m).padStart(2, '0')}'`;
}

/* ---------- Contexto y utilidades geográficas ---------- */

function contexto(ctx) {
  const { carta, tablilla, mareas = null, anyo = new Date().getFullYear(), semilla = 1 } = ctx;
  if (!carta) throw new Error('generar: falta la carta');
  return {
    carta, tablilla, mareas, anyo, semilla,
    fijar: ctx.fijar ?? {},
    opciones: { viento: null, corriente: null, ...(ctx.opciones ?? {}) },
    tol: TOLERANCIAS[carta.meta.escala] ?? TOLERANCIAS[100000],
    dm: declinacionActualizada(carta.rosa.dm, carta.rosa.anyo, carta.rosa.variacionAnual, anyo)
  };
}

const dentroLimites = (p, l) => p[0] >= l.latMin && p[0] <= l.latMax && p[1] >= l.lonMin && p[1] <= l.lonMax;

function esAgua(carta, p, margenM = 0) {
  const l = carta.meta.limites;
  if (!dentroLimites(p, l) || enTierra(carta, p)) return false;
  if (!margenM) return true;
  for (let a = 0; a < 360; a += 45) {
    const q = puntoDesde(p, a, margenM);
    if (!dentroLimites(q, l) || enTierra(carta, q)) return false;
  }
  return true;
}

function puntoAgua(c, prng, margenM = 0.8) {
  const l = c.carta.meta.limites;
  for (let i = 0; i < 200; i++) {
    const p = [redondear(l.latMin + 0.04 + prng() * (l.latMax - l.latMin - 0.08), 1 / 600),
               redondear(l.lonMin + 0.04 + prng() * (l.lonMax - l.lonMin - 0.08), 1 / 600)];
    if (esAgua(c.carta, p, margenM)) return p;
  }
  return null;
}

const ALCANCE_DEFECTO = { faros: 20, marcas: 8, boyas: 5 };

function visible(carta, P, obj) {
  const { distancia } = rumboDistancia(P, obj.pos);
  if (distancia > (obj.alcance ?? ALCANCE_DEFECTO[obj.coleccion] ?? 8) || distancia < 0.3) return false;
  const propioEnTierra = enTierra(carta, obj.pos);
  for (let t = 0.03; t <= (propioEnTierra ? 0.9 : 0.98); t += 0.03) {
    const q = [P[0] + (obj.pos[0] - P[0]) * t, P[1] + (obj.pos[1] - P[1]) * t];
    if (enTierra(carta, q)) return false;
  }
  return true;
}

function objetosVisibles(c, P, colecciones = ['faros', 'marcas', 'boyas']) {
  const lista = [];
  for (const col of colecciones) for (const o of c.carta[col]) {
    const obj = { ...o, coleccion: col };
    if (visible(c.carta, P, obj)) lista.push(obj);
  }
  return lista;
}

const nombre = o => o.nombre ?? o.id;

/** Ra tal que Rv = Ra + dm + desvío(Ra), iterando sobre la tablilla. */
function ajustarAguja(rv, dm, tablilla) {
  let ra = normalizar(rv - dm), desvio = 0;
  for (let i = 0; i < 6; i++) {
    desvio = tablilla ? desvioPorTablilla(ra, tablilla) : 0;
    ra = rumboAguja(rv, correccionTotal(dm, desvio));
  }
  return { ra, desvio, ct: correccionTotal(dm, desvio) };
}

function pasoCt(c, dm, desvio, ct) {
  const r = c.carta.rosa;
  return [
    { texto: `Actualiza la declinación de la rosa: ${fDm(r.dm)} en ${r.anyo}, ${Math.abs(r.variacionAnual)}' ${r.variacionAnual < 0 ? 'W' : 'E'} anuales → en ${c.anyo}: ${fDm(dm)} = ${fSigno(dm, 2)}.`, valor: dm },
    { texto: `Desvío de la tablilla: ${fSigno(desvio)}. Ct = dm + Δ = ${fSigno(dm, 2)} ${fSigno(desvio)} = ${fSigno(ct, 2)}.`, valor: ct }
  ];
}

/* ---------- Mareas ---------- */

/** Eventos ['BM','03:12',0.6] de un puerto y fecha, aplicando diferencias si es secundario. */
export function eventosPuerto(mareas, puertoId, fecha) {
  const p = mareas?.puertos?.[puertoId];
  if (!p) return null;
  if (p.patron) { const e = mareas.anuario?.[puertoId]?.[fecha]; return e ? e.map(x => [...x]) : null; }
  const base = mareas.anuario?.[p.referencia]?.[fecha];
  if (!base) return null;
  const d = p.diferencias ?? {};
  return base.map(([tipo, hora, alt]) => {
    const t = parsearHora(hora) + (tipo === 'PM' ? d.horaPM ?? 0 : d.horaBM ?? 0);
    return [tipo, formatearHora(t), Math.round((alt + (tipo === 'PM' ? d.alturaPM ?? 0 : d.alturaBM ?? 0)) * 100) / 100, t];
  }).filter(e => e[3] < 1440).map(e => e.slice(0, 3));
}

const fM_ = v => `${Number(v).toFixed(1).replace('.', ',')} m`;

export function explicarResguardo({ sondaCarta, alturaMarea: altura, calado, margen = 0 }) {
  const profundidad = sondaReal(sondaCarta, altura);
  const resguardo = calcResguardo(profundidad, calado);
  const seguro = resguardo >= margen - 1e-9;
  const texto = `Profundidad = sonda de carta ${fM_(sondaCarta)} + altura de marea ${fM_(altura)} = ${fM_(profundidad)}. ` +
    `Resguardo = ${fM_(profundidad)} − calado ${fM_(calado)} = ${fM_(resguardo)}` +
    (margen ? `, frente a un margen exigido de ${fM_(margen)}: ${seguro ? 'suficiente' : 'insuficiente'}.` : '.');
  return { profundidad, resguardo, seguro, texto };
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fFecha = f => { const [a, m, d] = f.split('-').map(Number); return `${d} de ${MESES[m - 1]} de ${a}`; };

function diaDeMareas(c, prng) {
  if (!c.mareas) return null;
  const puertoId = elegir(prng, Object.keys(c.mareas.puertos));
  const patron = c.mareas.puertos[puertoId].patron ? puertoId : c.mareas.puertos[puertoId].referencia;
  const fecha = elegir(prng, Object.keys(c.mareas.anuario[patron] ?? {}));
  const eventos = eventosPuerto(c.mareas, puertoId, fecha);
  if (!eventos || eventos.length < 2) return null;
  return { puertoId, nombre: c.mareas.puertos[puertoId].nombre, fecha, eventos };
}

const pasosMarea = (d, ant, des, hora, altura) => {
  const t0 = parsearHora(ant[1]), t1 = parsearHora(des[1]), dur = t1 - t0;
  const f = (hora - t0) / dur;
  return [
    { texto: `Anuario de ${d.nombre}, ${fFecha(d.fecha)}: ${d.eventos.map(e => `${e[0]} ${e[1]} ${fM_(e[2])}`).join(' · ')}. La hora pedida cae entre ${ant[0]} ${ant[1]} (${fM_(ant[2])}) y ${des[0]} ${des[1]} (${fM_(des[2])}).` },
    { texto: `Duración del tramo: ${dur} min. Carrera: ${fM_(Math.abs(des[2] - ant[2]))}. Han pasado ${hora - t0} min, ${fNum(f * 6, 1)} sextos.` },
    { texto: `Regla de los doceavos (aproximación docente: 1, 2, 3, 3, 2, 1 doceavos por sexto): la altura a las ${formatearHora(hora)} es ${fM_(altura)}.`, valor: altura }
  ];
};

/** Punto somero para ejercicios de marea: sondas de la carta y peligros con sonda mínima. */
function sondaSomera(c, prng, min = 0.8, max = 8) {
  const candidatas = [
    ...c.carta.sondas.map(s => ({ pos: s.pos, prof: s.prof, nombre: null })),
    ...c.carta.peligros.filter(p => typeof p.prof === 'number').map(p => ({ pos: p.pos, prof: p.prof, nombre: p.nombre }))
  ].filter(s => s.prof >= min && s.prof <= max);
  return candidatas.length ? elegir(prng, candidatas) : null;
}
const nombreSonda = s => s.nombre ? `${s.nombre} (sonda ${fM_(s.prof)})` : `un punto de sonda ${fM_(s.prof)}`;

/* ---------- Generadores ---------- */

const GENERADORES = {

  'marea-altura-hora'(c, prng) {
    const d = diaDeMareas(c, prng);
    if (!d) return { real: { degenerado: 'sin-mareas' } };
    const i = entero(prng, 0, d.eventos.length - 2);
    const ant = d.eventos[i], des = d.eventos[i + 1];
    const t0 = parsearHora(ant[1]), t1 = parsearHora(des[1]);
    if (t1 - t0 < 60) return { real: { degenerado: 'tramo-corto' } };
    const hora = redondear(t0 + 15 + prng() * (t1 - t0 - 30), 5);
    const altura = alturaMarea(hora, ant, des);
    return {
      enunciado: `Anuario de ${d.nombre}, ${fFecha(d.fecha)}: ${d.eventos.map(e => `${e[0]} ${e[1]} ${fM_(e[2])}`).join(', ')}. ¿Qué altura de marea hay a las ${formatearHora(hora)}? Usa la regla de los doceavos.`,
      visibles: { puerto: d.puertoId, fecha: d.fecha, eventos: d.eventos, hora: formatearHora(hora) },
      real: { puerto: d.puertoId, fecha: d.fecha, hora, tramo: [ant, des], altura, respuesta: { altura } },
      solucion: pasosMarea(d, ant, des, hora, altura),
      campos: [{ id: 'altura', etiqueta: 'Altura de marea (m)', tipo: 'metros' }]
    };
  },

  'marea-resguardo-paso'(c, prng) {
    const d = diaDeMareas(c, prng);
    if (!d) return { real: { degenerado: 'sin-mareas' } };
    const sonda = sondaSomera(c, prng, 0.8, 8);
    if (!sonda) return { real: { degenerado: 'sin-sondas' } };
    const i = entero(prng, 0, d.eventos.length - 2);
    const ant = d.eventos[i], des = d.eventos[i + 1];
    const t0 = parsearHora(ant[1]), t1 = parsearHora(des[1]);
    if (t1 - t0 < 60) return { real: { degenerado: 'tramo-corto' } };
    const hora = redondear(t0 + 15 + prng() * (t1 - t0 - 30), 5);
    const altura = Math.round(alturaMarea(hora, ant, des) * 100) / 100;
    const bm = Math.min(...d.eventos.map(e => e[2])), pm = Math.max(...d.eventos.map(e => e[2]));
    const combinaciones = [];
    for (const calado of [1.2, 1.5, 1.8, 2.0, 2.4]) for (const margen of [0.5, 1.0]) {
      // inseguro en bajamar y seguro en pleamar: la marea decide
      if (sonda.prof + bm - calado < margen && sonda.prof + pm - calado >= margen) combinaciones.push([calado, margen]);
    }
    if (!combinaciones.length) return { real: { degenerado: 'sin-combinacion' } };
    const [calado, margen] = elegir(prng, combinaciones);
    const alerta = explicarResguardo({ sondaCarta: sonda.prof, alturaMarea: altura, calado, margen });
    return {
      enunciado: `Quieres pasar a las ${formatearHora(hora)} sobre ${nombreSonda(sonda)} en ${fPos(sonda.pos)}, con un calado de ${fM_(calado)} y un margen de seguridad de ${fM_(margen)}. Anuario de ${d.nombre}, ${fFecha(d.fecha)}: ${d.eventos.map(e => `${e[0]} ${e[1]} ${fM_(e[2])}`).join(', ')}. Halla la profundidad real y el resguardo bajo la quilla.`,
      visibles: { puerto: d.puertoId, fecha: d.fecha, eventos: d.eventos, hora: formatearHora(hora), sondaCarta: sonda.prof, sondaPos: sonda.pos, calado, margen },
      real: { puerto: d.puertoId, hora, tramo: [ant, des], altura, punto: sonda.pos, alerta, respuesta: { profundidad: alerta.profundidad, resguardo: alerta.resguardo } },
      solucion: [
        { texto: `Localiza la sonda ${fM_(sonda.prof)} en la carta.`, trazo: { tipo: 'punto', pos: sonda.pos, simbolo: 'marca', etiqueta: `sonda ${String(sonda.prof).replace('.', ',')}` } },
        ...pasosMarea(d, ant, des, hora, altura),
        { texto: alerta.texto, valor: alerta.resguardo }
      ],
      campos: [{ id: 'profundidad', etiqueta: 'Profundidad real (m)', tipo: 'metros' }, { id: 'resguardo', etiqueta: 'Resguardo (m)', tipo: 'metros' }]
    };
  },

  'marea-hora-minima'(c, prng) {
    const d = diaDeMareas(c, prng);
    if (!d) return { real: { degenerado: 'sin-mareas' } };
    const sonda = sondaSomera(c, prng, 0.5, 4);
    if (!sonda) return { real: { degenerado: 'sin-sondas' } };
    const calado = elegir(prng, [1.5, 1.8, 2.0, 2.4, 2.8]);
    const margen = elegir(prng, [0.5, 1.0]);
    const necesaria = Math.round((calado + margen - sonda.prof) * 10) / 10;
    const tramos = [];
    for (let i = 0; i < d.eventos.length - 1; i++) {
      const [ant, des] = [d.eventos[i], d.eventos[i + 1]];
      if (des[2] > ant[2] && necesaria > ant[2] + 0.1 && necesaria < des[2] - 0.1) tramos.push([ant, des]);
    }
    if (!tramos.length) return { real: { degenerado: 'sin-tramo' } };
    const [ant, des] = elegir(prng, tramos);
    const hora = horaParaAltura(necesaria, ant, des);
    return {
      enunciado: `Tienes que cruzar ${nombreSonda(sonda)} en ${fPos(sonda.pos)} con un calado de ${fM_(calado)}, dejando al menos ${fM_(margen)} bajo la quilla. Anuario de ${d.nombre}, ${fFecha(d.fecha)}: ${d.eventos.map(e => `${e[0]} ${e[1]} ${fM_(e[2])}`).join(', ')}. ¿Qué altura de marea necesitas y a partir de qué hora, con la marea subiendo entre ${ant[1]} y ${des[1]}, puedes pasar?`,
      visibles: { puerto: d.puertoId, fecha: d.fecha, eventos: d.eventos, sondaCarta: sonda.prof, sondaPos: sonda.pos, calado, margen, tramo: [ant[1], des[1]] },
      real: { puerto: d.puertoId, tramo: [ant, des], punto: sonda.pos, respuesta: { altura: necesaria, hora } },
      solucion: [
        { texto: `Altura necesaria = calado + margen − sonda = ${fM_(calado)} + ${fM_(margen)} − ${fM_(sonda.prof)} = ${fM_(necesaria)}.`, valor: necesaria, trazo: { tipo: 'punto', pos: sonda.pos, simbolo: 'marca', etiqueta: `bajo ${String(sonda.prof).replace('.', ',')}` } },
        { texto: `Tramo creciente ${ant[0]} ${ant[1]} (${fM_(ant[2])}) → ${des[0]} ${des[1]} (${fM_(des[2])}): carrera ${fM_(des[2] - ant[2])}, duración ${parsearHora(des[1]) - parsearHora(ant[1])} min. Hay que subir ${fM_(necesaria - ant[2])} desde la bajamar.` },
        { texto: `Con la regla de los doceavos, esa altura se alcanza hacia las ${formatearHora(hora)}. Antes de esa hora el resguardo es menor que el margen.`, valor: hora }
      ],
      campos: [{ id: 'altura', etiqueta: 'Altura necesaria (m)', tipo: 'metros' }, { id: 'hora', etiqueta: 'Hora mínima', tipo: 'hora' }]
    };
  },

  'gnss-vs-estima'(c, prng) {
    const P = puntoAgua(c, prng);
    if (!P) return { real: { degenerado: 'sin-agua' } };
    const hora = entero(prng, 6, 18) * 60 + elegir(prng, [0, 10, 15, 20, 30, 40, 45, 50]);
    const rv = entero(prng, 0, 359), velocidad = decimal(prng, 5, 12, 0.5), minutos = elegir(prng, [45, 60, 90, 120]);
    const E = estimar(P, rv, velocidad, minutos);
    if (!esAgua(c.carta, E, 0.5)) return { real: { degenerado: 'en-tierra' } };
    const dist = decimal(prng, 0.4, 1.8, 0.1), rumboError = entero(prng, 0, 359);
    const G = puntoDesde(E, rumboError, dist).map(v => redondear(v, 1 / 600));
    if (!esAgua(c.carta, G, 0.3)) return { real: { degenerado: 'en-tierra' } };
    const { rumbo, distancia } = rumboDistancia(E, G);
    return {
      enunciado: `A las ${formatearHora(hora)} estabas en ${fPos(P)} y has navegado al Rv ${fAng(rv)} a ${fNum(velocidad)} nudos durante ${minutos} min. El GNSS marca ahora ${fPos(G)}. Sitúa la estima y el punto GNSS y mide la discrepancia: rumbo y distancia desde la estima hasta la posición GNSS. Antes de aceptar el fix, comprueba que es coherente con la sonda y con lo que ves.`,
      visibles: { desde: P, hora: formatearHora(hora), rv, velocidad, minutos, gnss: G },
      real: { desde: P, llegada: E, gnss: G, rumbo, distancia, respuesta: { rumbo, distancia } },
      solucion: [
        { texto: `Estima: desde ${fPos(P)} traza Rv ${fAng(rv)} y lleva D = ${fNum(velocidad)} × ${fNum(minutos / 60, 2)} h = ${fM(velocidad * minutos / 60)}: ${fPos(E)}.`, trazo: { tipo: 'recta', desde: P, rumbo: rv, largoM: velocidad * minutos / 60 } },
        { texto: `Marca la posición GNSS ${fPos(G)} con el símbolo de observada.`, trazo: { tipo: 'punto', pos: G, simbolo: 'observada', etiqueta: 'GNSS' } },
        { texto: `Une estima y GNSS: la discrepancia es ${fM(distancia)} al ${fAng(rumbo)}. Puede deberse a corriente, abatimiento o error de corredera; si la carta o la sonda contradicen el GNSS, no lo aceptes sin más.`, trazo: { tipo: 'segmento', desde: E, hasta: G, etiqueta: `${fAng(rumbo)} · ${fM(distancia)}` }, valor: distancia }
      ],
      campos: [{ id: 'rumbo', etiqueta: 'Rumbo estima → GNSS', tipo: 'angulo' }, { id: 'distancia', etiqueta: 'Discrepancia (M)', tipo: 'millas' }]
    };
  },

  'gnss-waypoint-mob'(c, prng) {
    const P = puntoAgua(c, prng);
    if (!P) return { real: { degenerado: 'sin-agua' } };
    const hora = entero(prng, 6, 18) * 60 + elegir(prng, [0, 10, 15, 20, 30, 40, 45, 50]);
    if (prng() < 0.5) {
      // hombre al agua: seguimos navegando unos minutos antes de reaccionar
      const rv = entero(prng, 0, 359), velocidad = decimal(prng, 5, 12, 0.5), minutos = elegir(prng, [2, 3, 4, 5, 6]);
      const Q = estimar(P, rv, velocidad, minutos);
      if (!esAgua(c.carta, Q, 0.3)) return { real: { degenerado: 'en-tierra' } };
      const { rumbo, distancia } = rumboDistancia(Q, P);
      return {
        enunciado: `A las ${formatearHora(hora)} cae una persona al agua y pulsas MOB en el GNSS: registra ${fPos(P)}. Sigues al Rv ${fAng(rv)} a ${fNum(velocidad)} nudos y tardas ${minutos} min en tener el barco controlado. ¿Qué rumbo verdadero y qué distancia te separan de la posición MOB? Recuerda que la persona deriva: la posición MOB es el punto de partida de la búsqueda, no el final.`,
        visibles: { desde: P, hora: formatearHora(hora), rv, velocidad, minutos, mob: P, variante: 'mob' },
        real: { desde: P, llegada: Q, rumbo, distancia, respuesta: { rumbo, distancia } },
        solucion: [
          { texto: `Marca la posición MOB ${fPos(P)}.`, trazo: { tipo: 'punto', pos: P, simbolo: 'observada', etiqueta: 'MOB ' + formatearHora(hora) } },
          { texto: `Tu situación tras ${minutos} min: ${fM(velocidad * minutos / 60)} al ${fAng(rv)} desde el MOB, ${fPos(Q)}.`, trazo: { tipo: 'recta', desde: P, rumbo: rv, largoM: velocidad * minutos / 60 } },
          { texto: `Rumbo de vuelta: el recíproco corregido por la geometría, ${fAng(rumbo)}, a ${fM(distancia)}. Aproxímate despacio, a barlovento de la persona y con la hélice parada al llegar.`, valor: rumbo }
        ],
        campos: [{ id: 'rumbo', etiqueta: 'Rumbo verdadero al MOB', tipo: 'angulo' }, { id: 'distancia', etiqueta: 'Distancia (M)', tipo: 'millas' }]
      };
    }
    const puerto = elegir(prng, c.carta.puertos);
    const { rumbo, distancia } = rumboDistancia(P, puerto.pos);
    if (distancia < 2) return { real: { degenerado: 'distancia-corta' } };
    return {
      enunciado: `A las ${formatearHora(hora)} el GNSS te sitúa en ${fPos(P)}. Introduces como waypoint ${puerto.nombre}, en ${fPos(puerto.pos)}. Comprueba en la carta el rumbo verdadero y la distancia al waypoint que debería mostrar el receptor.`,
      visibles: { desde: P, hora: formatearHora(hora), waypoint: puerto.id, variante: 'waypoint' },
      real: { desde: P, rumbo, distancia, respuesta: { rumbo, distancia } },
      solucion: [
        { texto: `Sitúa ${fPos(P)} y el waypoint ${fPos(puerto.pos)}.`, trazo: { tipo: 'punto', pos: P, simbolo: 'observada', etiqueta: formatearHora(hora) } },
        { texto: `Une ambos puntos y mide con el transportador: Rv ${fAng(rumbo)}.`, trazo: { tipo: 'recta', desde: P, rumbo, largoM: distancia } },
        { texto: `Mide la distancia en la escala de latitudes: ${fM(distancia)}. Si el receptor muestra otra cosa, revisa el datum y el waypoint introducido antes de fiarte.`, valor: distancia }
      ],
      campos: [{ id: 'rumbo', etiqueta: 'Rumbo verdadero al waypoint', tipo: 'angulo' }, { id: 'distancia', etiqueta: 'Distancia (M)', tipo: 'millas' }]
    };
  },

  'coordenadas-objeto'(c, prng) {
    const candidatos = [...c.carta.faros, ...c.carta.marcas, ...c.carta.boyas].filter(o => o.nombre);
    const o = elegir(prng, candidatos);
    return {
      enunciado: `Lee en la carta las coordenadas de ${nombre(o)}. Da latitud y longitud en grados y minutos, con una décima de minuto.`,
      visibles: { objeto: o.id },
      real: { objeto: o.id, pos: o.pos, respuesta: { lat: o.pos[0], lon: o.pos[1] } },
      solucion: [
        { texto: `Localiza ${nombre(o)} y lleva una horizontal hasta la escala lateral: latitud ${fLat(o.pos[0])}.`, trazo: { tipo: 'punto', pos: o.pos, simbolo: 'marca', etiqueta: nombre(o) } },
        { texto: `Lleva una vertical hasta la escala superior o inferior: longitud ${fLon(o.pos[1])}.` },
        { texto: `Comprueba el hemisferio: N y W en esta carta. Un minuto de latitud son 35 píxeles a zoom 1; cada marca fina del marco es una décima.` }
      ],
      campos: [{ id: 'lat', etiqueta: 'Latitud', tipo: 'coordenada', eje: 'lat' }, { id: 'lon', etiqueta: 'Longitud', tipo: 'coordenada', eje: 'lon' }]
    };
  },

  'distancia-tiempo-eta'(c, prng) {
    const P = c.fijar.desde ?? puntoAgua(c, prng);
    if (!P) return { real: { degenerado: 'sin-agua' } };
    const vis = objetosVisibles(c, P, ['faros', 'boyas']).filter(o => rumboDistancia(P, o.pos).distancia >= 2);
    if (!vis.length) return { real: { degenerado: 'sin-objetos' } };
    const o = elegir(prng, vis);
    const { rumbo, distancia } = rumboDistancia(P, o.pos);
    const velocidad = decimal(prng, 5, 12, 0.5);
    const hora = c.fijar.hora ?? entero(prng, 6, 18) * 60 + elegir(prng, [0, 10, 15, 20, 30, 40, 45, 50]);
    const minutos = tiempoParaDistancia(distancia, velocidad);
    const eta = hora + minutos;
    return {
      enunciado: `A las ${formatearHora(hora)} estás en ${fPos(P)} y pones proa a ${nombre(o)} a ${fNum(velocidad)} nudos. Mide la distancia en la carta y calcula la hora de llegada.`,
      visibles: { desde: P, hora: formatearHora(hora), objeto: o.id, velocidad },
      real: { desde: P, objeto: o.id, rumbo, distancia, minutos, horaLlegada: Math.round(eta), respuesta: { distancia, eta } },
      solucion: [
        { texto: `Une ${fPos(P)} con ${nombre(o)}.`, trazo: { tipo: 'recta', desde: P, rumbo, largoM: distancia } },
        { texto: `Abre el compás de puntas entre ambos y llévalo a la escala lateral de latitudes, a la altura de la zona: ${fM(distancia)}.` },
        { texto: `t = D / V = ${fNum(distancia)} / ${fNum(velocidad)} = ${fNum(minutos / 60, 2)} h = ${Math.round(minutos)} min.`, valor: minutos },
        { texto: `Llegada: ${formatearHora(hora)} + ${Math.round(minutos)} min = ${formatearHora(eta)}.`, valor: eta }
      ],
      campos: [{ id: 'distancia', etiqueta: 'Distancia (M)', tipo: 'millas' }, { id: 'eta', etiqueta: 'Hora de llegada', tipo: 'hora' }]
    };
  },

  'rumbo-verdadero-aguja'(c, prng) {
    const P = c.fijar.desde ?? puntoAgua(c, prng);
    if (!P) return { real: { degenerado: 'sin-agua' } };
    const vis = objetosVisibles(c, P, ['faros', 'boyas', 'marcas']).filter(o => rumboDistancia(P, o.pos).distancia >= 2);
    if (!vis.length) return { real: { degenerado: 'sin-objetos' } };
    const o = elegir(prng, vis);
    const { rumbo: rv, distancia } = rumboDistancia(P, o.pos);
    const { ra, desvio, ct } = ajustarAguja(rv, c.dm, c.tablilla);
    return {
      enunciado: `Estás en ${fPos(P)} y quieres poner proa a ${nombre(o)}. Halla el rumbo verdadero a trazar y el rumbo de aguja que debes gobernar, con la declinación de la rosa actualizada a ${c.anyo} y el desvío de la tablilla.`,
      visibles: { desde: P, objeto: o.id, anyo: c.anyo, usaTablilla: true },
      real: { desde: P, objeto: o.id, rv, distancia, dm: c.dm, desvio, ct, ra,
        trampas: { ra: [{ valor: normalizar(rv + ct), aviso: 'signo-ct' }, { valor: normalizar(rv - c.dm), aviso: 'sin-desvio' }] },
        respuesta: { rv, ra } },
      solucion: [
        { texto: `Traza la recta de ${fPos(P)} a ${nombre(o)} y llévala con el transportador a un meridiano: Rv = ${fAng(rv)}.`, trazo: { tipo: 'recta', desde: P, rumbo: rv, largoM: distancia }, valor: rv },
        ...pasoCt(c, c.dm, desvio, ct),
        { texto: `Ra = Rv − Ct = ${fAng(rv)} − (${fSigno(ct, 2)}) = ${fAng(ra)}. El desvío se lee para el rumbo de aguja, así que se itera una vez si cambia de fila.`, valor: ra }
      ],
      campos: [{ id: 'rv', etiqueta: 'Rumbo verdadero', tipo: 'angulo' }, { id: 'ra', etiqueta: 'Rumbo de aguja', tipo: 'angulo' }]
    };
  },

  'declinacion-ct-enfilacion'(c, prng) {
    const enf = elegir(prng, c.carta.enfilaciones);
    const [ant, post] = enf.objetos.map(id => buscarObjeto(c.carta, id));
    const dv = reciproco(rumboDistancia(post.pos, ant.pos).rumbo);
    let desvio = decimal(prng, -4, 4, 0.5);
    if (desvio === 0) desvio = 1.5;
    const da = redondear(normalizar(dv - (c.dm + desvio)), 0.5);
    const ct = diferenciaAngular(da, dv);
    desvio = ct - c.dm;
    const r = c.carta.rosa;
    return {
      enunciado: `Navegas por la enfilación «${enf.descripcion}» y tu compás marca demora de aguja ${fAng(da)}. La rosa da ${fDm(r.dm)} en ${r.anyo} con variación anual de ${Math.abs(r.variacionAnual)}' ${r.variacionAnual < 0 ? 'W' : 'E'}. Halla la declinación actualizada a ${c.anyo}, la corrección total y el desvío de la aguja para ese rumbo.`,
      visibles: { enfilacion: enf.id, da, anyo: c.anyo },
      real: { enfilacion: enf.id, dv, dm: c.dm, ct, desvio,
        trampas: { dm: [{ valor: -c.dm, aviso: 'signo-invertido' }], ct: [{ valor: -ct, aviso: 'signo-invertido' }, { valor: diferenciaAngular(dv, da), aviso: 'signo-invertido' }] },
        respuesta: { dm: c.dm, ct, desvio } },
      solucion: [
        { texto: `Mide la demora verdadera de la enfilación en la carta, del objeto posterior al anterior y hacia la mar: Dv = ${fAng(dv)}.`, trazo: { tipo: 'recta', desde: post.pos, rumbo: reciproco(dv), largoM: 12 }, valor: dv },
        { texto: `Ct = Dv − Da = ${fAng(dv)} − ${fAng(da)} = ${fSigno(ct, 2)}. Una enfilación no tiene error de aguja: la diferencia es toda corrección total.`, valor: ct },
        pasoCt(c, c.dm, desvio, ct)[0],
        { texto: `Δ = Ct − dm = ${fSigno(ct, 2)} − (${fSigno(c.dm, 2)}) = ${fSigno(desvio, 2)}.`, valor: desvio }
      ],
      campos: [{ id: 'dm', etiqueta: 'Declinación (E+ / W−)', tipo: 'angulo-signo' }, { id: 'ct', etiqueta: 'Corrección total', tipo: 'angulo-signo' }, { id: 'desvio', etiqueta: 'Desvío', tipo: 'angulo-signo' }]
    };
  },

  'estima'(c, prng) {
    const P = c.fijar.desde ?? puntoAgua(c, prng);
    if (!P) return { real: { degenerado: 'sin-agua' } };
    const hora = c.fijar.hora ?? entero(prng, 6, 18) * 60 + elegir(prng, [0, 10, 15, 20, 30, 40, 45, 50]);
    const rv = c.fijar.rv ?? entero(prng, 0, 359);
    const velocidad = decimal(prng, 5, 12, 0.5);
    const minutos = elegir(prng, [30, 45, 60, 75, 90, 105, 120, 150, 180]);
    const distancia = velocidad * minutos / 60;
    const estimaPura = estimar(P, rv, velocidad, minutos);
    let llegada = estimaPura, rumboEfectivo = rv;
    const { viento, corriente } = c.opciones;
    if (viento?.abatimiento) { rumboEfectivo = normalizar(rv + (viento.banda === 'babor' ? -1 : 1) * viento.abatimiento); llegada = estimar(P, rumboEfectivo, velocidad, minutos); }
    if (corriente?.intensidad) llegada = puntoDesde(llegada, corriente.rumbo, corriente.intensidad * minutos / 60);
    const pasos = [
      { texto: `Desde ${fPos(P)} traza el rumbo verdadero ${fAng(rv)}.`, trazo: { tipo: 'recta', desde: P, rumbo: rv, largoM: distancia } },
      { texto: `D = V × t = ${fNum(velocidad)} × ${fNum(minutos / 60, 2)} h = ${fM(distancia)}. Tómala en la escala de latitudes y llévala sobre el rumbo.`, valor: distancia },
      { texto: `Situación de estima a las ${formatearHora(hora + minutos)}: ${fPos(estimaPura)}. Anótala con el símbolo de estima, no con el de observada.`, trazo: { tipo: 'punto', pos: estimaPura, simbolo: 'estima', etiqueta: formatearHora(hora + minutos) } }
    ];
    if (viento?.abatimiento) pasos.push({ texto: `Con abatimiento de ${viento.abatimiento}° por ${viento.banda}, el rumbo efectivo es ${fAng(rumboEfectivo)}.` });
    if (corriente?.intensidad) pasos.push({ texto: `La corriente de ${fNum(corriente.intensidad)} nudos al ${fAng(corriente.rumbo)} desplaza la estima ${fM(corriente.intensidad * minutos / 60)} en esa dirección: situación con deriva ${fPos(llegada)}. Esto no aparece en el examen de UT11.`, trazo: { tipo: 'recta', desde: estimaPura, rumbo: corriente.rumbo, largoM: corriente.intensidad * minutos / 60 } });
    return {
      enunciado: `A las ${formatearHora(hora)} estás en ${fPos(P)} y navegas al rumbo verdadero ${fAng(rv)} a ${fNum(velocidad)} nudos${corriente?.intensidad ? `, con corriente de ${fNum(corriente.intensidad)} nudos al ${fAng(corriente.rumbo)}` : ''}${viento?.abatimiento ? ` y abatimiento de ${viento.abatimiento}° por ${viento.banda}` : ''}. Halla la situación de estima a las ${formatearHora(hora + minutos)}.`,
      visibles: { desde: P, hora: formatearHora(hora), rv, velocidad, minutos, corriente: corriente ?? null, viento: viento ?? null },
      real: { desde: P, llegada, estimaPura, rv, distancia, horaLlegada: hora + minutos, respuesta: { lat: llegada[0], lon: llegada[1] } },
      solucion: pasos,
      campos: [{ id: 'lat', etiqueta: 'Latitud', tipo: 'coordenada', eje: 'lat' }, { id: 'lon', etiqueta: 'Longitud', tipo: 'coordenada', eje: 'lon' }]
    };
  },

  'situacion-dos-demoras'(c, prng) {
    const P = puntoAgua(c, prng);
    if (!P) return { real: { degenerado: 'sin-agua' } };
    const vis = objetosVisibles(c, P, ['faros', 'marcas']);
    const pares = [];
    for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
      const d1 = rumboDistancia(P, vis[i].pos).rumbo, d2 = rumboDistancia(P, vis[j].pos).rumbo;
      let ang = Math.abs(diferenciaAngular(d1, d2)); if (ang > 90) ang = 180 - ang;
      if (ang >= 35) pares.push([vis[i], vis[j]]);
    }
    if (!pares.length) return { real: { degenerado: 'sin-objetos' } };
    const [a, b] = elegir(prng, pares);
    const hora = c.fijar.hora ?? entero(prng, 6, 18) * 60 + elegir(prng, [0, 10, 15, 20, 30, 40, 45, 50]);
    const dv1 = redondear(rumboDistancia(P, a.pos).rumbo, 0.5), dv2 = redondear(rumboDistancia(P, b.pos).rumbo, 0.5);
    const enAguja = prng() < 0.5;
    const desvio = decimal(prng, -3, 3, 0.5);
    const ct = enAguja ? redondear(c.dm + desvio, 0.5) : 0;
    const da1 = normalizar(dv1 - ct), da2 = normalizar(dv2 - ct);
    const corte = cortarRectas(a.pos, reciproco(dv1), b.pos, reciproco(dv2));
    if (!corte) return { real: { degenerado: 'paralelas' } };
    const S = corte.punto;
    const pasos = [];
    if (enAguja) pasos.push({ texto: `Convierte las demoras de aguja en verdaderas: Dv = Da + Ct. ${fAng(da1)} ${fSigno(ct)} = ${fAng(dv1)}; ${fAng(da2)} ${fSigno(ct)} = ${fAng(dv2)}.` });
    pasos.push(
      { texto: `Traza desde ${nombre(a)} la recta de demora ${fAng(dv1)}: desde el objeto hacia la mar, con la recíproca ${fAng(reciproco(dv1))}.`, trazo: { tipo: 'recta', desde: a.pos, rumbo: reciproco(dv1), largoM: rumboDistancia(S, a.pos).distancia + 1 } },
      { texto: `Traza desde ${nombre(b)} la recta de demora ${fAng(dv2)} con la recíproca ${fAng(reciproco(dv2))}.`, trazo: { tipo: 'recta', desde: b.pos, rumbo: reciproco(dv2), largoM: rumboDistancia(S, b.pos).distancia + 1 } },
      { texto: `El corte, con ángulo de ${Math.round(corte.anguloCorte)}° (fix ${calidadCorte(corte.anguloCorte) === 'buena' ? 'de buena calidad' : 'aceptable'}), es la situación observada: ${fPos(S)}.`, trazo: { tipo: 'punto', pos: S, simbolo: 'observada', etiqueta: formatearHora(hora) } }
    );
    return {
      enunciado: `A las ${formatearHora(hora)} tomas simultáneamente ${enAguja ? 'demora de aguja' : 'demora verdadera'} ${fAng(enAguja ? da1 : dv1)} a ${nombre(a)} y ${fAng(enAguja ? da2 : dv2)} a ${nombre(b)}${enAguja ? `, con corrección total ${fSigno(ct)}` : ''}. Halla la situación observada.`,
      visibles: { hora: formatearHora(hora), demoras: [{ objeto: a.id, valor: enAguja ? da1 : dv1 }, { objeto: b.id, valor: enAguja ? da2 : dv2 }], tipoDemora: enAguja ? 'aguja' : 'verdadera', ct: enAguja ? ct : null },
      real: { situacion: S, hora, ct, demorasVerdaderas: [dv1, dv2], anguloCorte: corte.anguloCorte, calidadFix: calidadCorte(corte.anguloCorte), respuesta: { lat: S[0], lon: S[1] } },
      solucion: pasos,
      campos: [{ id: 'lat', etiqueta: 'Latitud', tipo: 'coordenada', eje: 'lat' }, { id: 'lon', etiqueta: 'Longitud', tipo: 'coordenada', eje: 'lon' }]
    };
  },

  'situacion-enfilacion-demora'(c, prng) {
    const enf = elegir(prng, c.carta.enfilaciones);
    const [ant, post] = enf.objetos.map(id => buscarObjeto(c.carta, id));
    const r = rumboDistancia(post.pos, ant.pos).rumbo;           // dirección de la línea hacia la mar
    const d = decimal(prng, 2, 9, 0.5);
    const P = puntoDesde(ant.pos, r, d);
    if (!esAgua(c.carta, P, 0.4)) return { real: { degenerado: 'en-tierra' } };
    const vis = objetosVisibles(c, P, ['faros', 'marcas', 'boyas']).filter(o => !enf.objetos.includes(o.id)).filter(o => {
      let ang = Math.abs(diferenciaAngular(r, rumboDistancia(P, o.pos).rumbo)); if (ang > 90) ang = 180 - ang; return ang >= 35;
    });
    if (!vis.length) return { real: { degenerado: 'sin-objetos' } };
    const o = elegir(prng, vis);
    const dv2 = redondear(rumboDistancia(P, o.pos).rumbo, 0.5);
    const corte = cortarRectas(ant.pos, r, o.pos, reciproco(dv2));
    if (!corte) return { real: { degenerado: 'paralelas' } };
    const S = corte.punto;
    const hora = entero(prng, 6, 18) * 60 + elegir(prng, [0, 10, 15, 20, 30, 40, 45, 50]);
    return {
      enunciado: `A las ${formatearHora(hora)} ves ${enf.descripcion.toLowerCase()} en enfilación y, al mismo tiempo, tomas demora verdadera ${fAng(dv2)} a ${nombre(o)}. Halla la situación observada.`,
      visibles: { hora: formatearHora(hora), enfilacion: enf.id, objeto: o.id, dv2 },
      real: { situacion: S, hora, dvEnfilacion: reciproco(r), anguloCorte: corte.anguloCorte, calidadFix: calidadCorte(corte.anguloCorte), respuesta: { lat: S[0], lon: S[1] } },
      solucion: [
        { texto: `Prolonga la enfilación hacia la mar: es una línea de posición sin error de compás, con demora verdadera ${fAng(reciproco(r))}.`, trazo: { tipo: 'recta', desde: post.pos, rumbo: r, largoM: d + 3 } },
        { texto: `Traza desde ${nombre(o)} la recta de demora ${fAng(dv2)} con la recíproca ${fAng(reciproco(dv2))}.`, trazo: { tipo: 'recta', desde: o.pos, rumbo: reciproco(dv2), largoM: rumboDistancia(S, o.pos).distancia + 1 } },
        { texto: `El corte, a ${Math.round(corte.anguloCorte)}°, es la situación: ${fPos(S)}.`, trazo: { tipo: 'punto', pos: S, simbolo: 'observada', etiqueta: formatearHora(hora) } }
      ],
      campos: [{ id: 'lat', etiqueta: 'Latitud', tipo: 'coordenada', eje: 'lat' }, { id: 'lon', etiqueta: 'Longitud', tipo: 'coordenada', eje: 'lon' }]
    };
  },

  'situacion-demora-distancia'(c, prng) {
    const P = puntoAgua(c, prng);
    if (!P) return { real: { degenerado: 'sin-agua' } };
    const vis = objetosVisibles(c, P, ['faros']).filter(o => rumboDistancia(P, o.pos).distancia >= 1.5);
    if (!vis.length) return { real: { degenerado: 'sin-objetos' } };
    const o = elegir(prng, vis);
    const { rumbo, distancia } = rumboDistancia(P, o.pos);
    const dv = redondear(rumbo, 0.5), dist = redondear(distancia, 0.1);
    const S = situacionDemoraDistancia(o.pos, dv, dist);
    const hora = entero(prng, 6, 18) * 60 + elegir(prng, [0, 10, 15, 20, 30, 40, 45, 50]);
    return {
      enunciado: `A las ${formatearHora(hora)} tomas demora verdadera ${fAng(dv)} a ${nombre(o)} y el radar te da ${fM(dist)} de distancia. Halla la situación observada.`,
      visibles: { hora: formatearHora(hora), objeto: o.id, dv, distancia: dist },
      real: { situacion: S, hora, respuesta: { lat: S[0], lon: S[1] } },
      solucion: [
        { texto: `Traza desde ${nombre(o)} la recíproca de la demora, ${fAng(reciproco(dv))}.`, trazo: { tipo: 'recta', desde: o.pos, rumbo: reciproco(dv), largoM: dist + 1 } },
        { texto: `Toma ${fM(dist)} en la escala de latitudes y márcalos sobre esa recta desde el faro: arco de distancia.`, trazo: { tipo: 'circulo', centro: o.pos, radioM: dist } },
        { texto: `El corte de la recta con el arco es la situación: ${fPos(S)}.`, trazo: { tipo: 'punto', pos: S, simbolo: 'observada', etiqueta: formatearHora(hora) } }
      ],
      campos: [{ id: 'lat', etiqueta: 'Latitud', tipo: 'coordenada', eje: 'lat' }, { id: 'lon', etiqueta: 'Longitud', tipo: 'coordenada', eje: 'lon' }]
    };
  },

  'derrota-resguardo-peligro'(c, prng) {
    const P = c.fijar.desde ?? puntoAgua(c, prng);
    if (!P) return { real: { degenerado: 'sin-agua' } };
    const candidatos = c.carta.peligros.filter(p => { const d = rumboDistancia(P, p.pos).distancia; return d >= 2.5 && d <= 15; });
    if (!candidatos.length) return { real: { degenerado: 'sin-objetos' } };
    const pel = elegir(prng, candidatos);
    const { rumbo, distancia } = rumboDistancia(P, pel.pos);
    const resguardo = elegir(prng, [0.5, 1, 1.5, 2].filter(d => d < distancia - 0.5));
    const lado = elegir(prng, ['babor', 'estribor']);
    const ang = Math.asin(resguardo / distancia) * 180 / Math.PI;
    const rv = normalizar(rumbo + (lado === 'estribor' ? -ang : ang));   // peligro por estribor → derrota a la izquierda
    const T = puntoDesde(P, rv, Math.sqrt(distancia ** 2 - resguardo ** 2));
    if (!esAgua(c.carta, T, 0.2)) return { real: { degenerado: 'en-tierra' } };
    return {
      enunciado: `Estás en ${fPos(P)}. Quieres pasar dejando ${nombre(pel)} a ${fM(resguardo)} por ${lado}. ¿Qué rumbo verdadero debes trazar?`,
      visibles: { desde: P, peligro: pel.id, resguardo, lado },
      real: { desde: P, peligro: pel.id, rv, distanciaPeligro: distancia, respuesta: { rv },
        trampas: { rv: [{ valor: normalizar(rumbo + (lado === 'estribor' ? ang : -ang)), aviso: 'lado-contrario' }, { valor: rumbo, aviso: 'sin-resguardo' }] } },
      solucion: [
        { texto: `Traza alrededor de ${nombre(pel)} un arco de ${fM(resguardo)} tomados en la escala de latitudes.`, trazo: { tipo: 'circulo', centro: pel.pos, radioM: resguardo } },
        { texto: `Desde ${fPos(P)} traza la tangente al arco que deja el peligro por ${lado}.`, trazo: { tipo: 'recta', desde: P, rumbo: rv, largoM: distancia + 2 } },
        { texto: `Mide el rumbo de la tangente con el transportador: Rv = ${fAng(rv)}. Comprobación: demora al peligro ${fAng(rumbo)} a ${fM(distancia)}, ángulo de resguardo asin(${fNum(resguardo)}/${fNum(distancia)}) = ${fNum(ang)}°.`, valor: rv }
      ],
      campos: [{ id: 'rv', etiqueta: 'Rumbo verdadero', tipo: 'angulo' }]
    };
  }
};

/* ---------- Validación ---------- */

function interpretar(campo, valor) {
  if (typeof valor === 'number') return valor;
  const t = String(valor ?? '').trim();
  if (!t) return NaN;
  if (campo.tipo === 'hora') return parsearHora(t);
  if (campo.tipo === 'coordenada' || campo.tipo === 'angulo-signo') return parsearGrados(t);
  const n = Number(t.replace(',', '.').replace(/[°'"M\s]/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

function errorDe(campo, dado, esperado) {
  switch (campo.tipo) {
    case 'coordenada': return Math.abs(dado - esperado) * 60;
    case 'angulo': return Math.abs(diferenciaAngular(esperado, dado));
    case 'hora': { const d = Math.abs(dado - esperado) % 1440; return Math.min(d, 1440 - d); }
    default: return Math.abs(dado - esperado);
  }
}

function toleranciaDe(campo, tol) {
  switch (campo.tipo) {
    case 'coordenada': return campo.eje === 'lat' ? tol.minutosLat : tol.minutosLon;
    case 'angulo': case 'angulo-signo': return tol.grados;
    case 'millas': return tol.millas;
    case 'hora': case 'minutos': return tol.minutosTiempo;
    default: return tol.metros;
  }
}

export function validar(ej, respuesta = {}) {
  const avisos = new Set();
  const detalle = ej.campos.map(campo => {
    const esperado = ej.real.respuesta[campo.id];
    const dado = interpretar(campo, respuesta[campo.id]);
    const tol = toleranciaDe(campo, ej.tolerancia);
    if (!Number.isFinite(dado)) return { campo: campo.id, dado: null, esperado, error: null, dentro: false, tolerancia: tol };
    const error = errorDe(campo, dado, esperado);
    const dentro = error <= tol + 1e-9;
    if (!dentro) {
      if (campo.tipo === 'angulo' && errorDe(campo, dado, reciproco(esperado)) <= tol) avisos.add('reciproco');
      if (campo.tipo === 'angulo-signo' && esperado !== 0 && Math.abs(dado + esperado) <= tol) avisos.add('signo-invertido');
      if (campo.tipo === 'coordenada' && campo.eje === 'lon' && Math.abs(-dado - esperado) * 60 <= tol) avisos.add('este-oeste');
      for (const t of ej.real.trampas?.[campo.id] ?? []) if (errorDe(campo, dado, t.valor) <= tol) avisos.add(t.aviso);
    }
    return { campo: campo.id, dado, esperado, error, dentro, tolerancia: tol };
  });
  return { correcto: detalle.every(d => d.dentro), detalle, avisos: [...avisos] };
}

/* ---------- Degeneración y construcción ---------- */

export function esDegenerado(ej, carta) {
  const r = ej.real ?? {};
  if (r.degenerado) return r.degenerado;
  if (r.anguloCorte !== undefined && r.anguloCorte < 30) return 'corte-estrecho';
  for (const p of [r.situacion, r.desde, r.llegada, r.estimaPura].filter(Boolean)) {
    if (!dentroLimites(p, carta.meta.limites)) return 'fuera-de-carta';
    if (enTierra(carta, p)) return 'en-tierra';
  }
  if (r.distancia !== undefined && r.distancia < 0.5) return 'distancia-corta';
  return null;
}

function construir(c, tipo, partes) {
  const def = TIPOS.find(t => t.id === tipo);
  const ej = {
    id: `${tipo}:${c.carta.id}:${c.semilla}`,
    tipo, bloque: def.bloque, titulo: def.titulo,
    semilla: c.semilla, cartaId: c.carta.id, versionCarta: c.carta.version, versionGeneradores: VERSION_GENERADORES,
    anyo: c.anyo,
    enunciado: partes.enunciado ?? '', visibles: partes.visibles ?? {}, real: partes.real ?? {},
    solucion: partes.solucion ?? [], campos: partes.campos ?? [],
    tolerancia: c.tol, opciones: c.opciones
  };
  ej.validar = respuesta => validar(ej, respuesta);
  return ej;
}

export function generar(tipo, ctx) {
  const gen = GENERADORES[tipo];
  if (!gen) throw new Error(`Tipo de ejercicio desconocido: ${tipo}`);
  const c = contexto(ctx);
  const base = hash(`${tipo}:${c.semilla}`);
  let ultimo = null;
  for (let intento = 0; intento < 80; intento++) {
    const prng = crearPrng((base + intento * 7919) >>> 0);
    const ej = construir(c, tipo, gen(c, prng));
    ultimo = esDegenerado(ej, c.carta);
    if (!ultimo) return ej;
  }
  throw new Error(`No se ha podido generar «${tipo}» con semilla ${c.semilla}: ${ultimo}`);
}

/** Cuatro ejercicios encadenados sobre la carta costera, sin viento ni corriente. */
export function generarSimulacro({ carta, tablilla, anyo, semilla }) {
  const base = { carta, tablilla, anyo, semilla, opciones: { viento: null, corriente: null } };
  const e1 = generar('situacion-dos-demoras', base);
  const P = e1.real.situacion, hora = e1.real.hora;
  const e2 = generar('rumbo-verdadero-aguja', { ...base, fijar: { desde: P } });
  const e3 = generar('estima', { ...base, fijar: { desde: P, hora, rv: e2.real.rv } });
  const e4 = generar('distancia-tiempo-eta', { ...base, fijar: { desde: e3.real.llegada, hora: e3.real.horaLlegada } });
  return [e1, e2, e3, e4].map((e, i) => ({ ...e, id: `simulacro:${semilla}:${i + 1}`, orden: i + 1, validar: r => validar(e, r) }));
}

export function puntuar(ejercicios, respuestas = {}) {
  const detalle = ejercicios.map(e => e.validar(respuestas[e.id] ?? {}).correcto);
  const aciertos = detalle.filter(Boolean).length;
  return { aciertos, total: ejercicios.length, apto: aciertos >= Math.ceil(ejercicios.length / 2), detalle };
}
