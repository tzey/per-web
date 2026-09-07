/* ============================================================
   Núcleo compartido: temario, baremo oficial y progreso local.
   Baremo verificado contra RD 875/2014 (Anexo II) y criterios
   de corrección publicados por las administraciones convocantes.
   ============================================================ */

export const UNIDADES = [
  { id: 'ut01', n: 1,  titulo: 'Nomenclatura náutica',      preguntas: 4,  minimo: null, bloque: 'PNB' },
  { id: 'ut02', n: 2,  titulo: 'Amarre y fondeo',           preguntas: 2,  minimo: null, bloque: 'PNB' },
  { id: 'ut03', n: 3,  titulo: 'Seguridad',                 preguntas: 4,  minimo: null, bloque: 'PNB' },
  { id: 'ut04', n: 4,  titulo: 'Legislación',               preguntas: 2,  minimo: null, bloque: 'PNB' },
  { id: 'ut05', n: 5,  titulo: 'Balizamiento',              preguntas: 5,  minimo: 3,    bloque: 'PNB' },
  { id: 'ut06', n: 6,  titulo: 'RIPA',                      preguntas: 10, minimo: 5,    bloque: 'PNB' },
  { id: 'ut07', n: 7,  titulo: 'Maniobra',                  preguntas: 2,  minimo: null, bloque: 'PER' },
  { id: 'ut08', n: 8,  titulo: 'Emergencias en la mar',     preguntas: 3,  minimo: null, bloque: 'PER' },
  { id: 'ut09', n: 9,  titulo: 'Meteorología',              preguntas: 4,  minimo: null, bloque: 'PER' },
  { id: 'ut10', n: 10, titulo: 'Teoría de navegación',      preguntas: 5,  minimo: null, bloque: 'PER' },
  { id: 'ut11', n: 11, titulo: 'Carta de navegación',       preguntas: 4,  minimo: 2,    bloque: 'PER' }
];

export const EXTRAS = [
  { id: 'vela', titulo: 'Navegación a vela', nota: 'Atribución complementaria' }
];

export const BAREMO = {
  total: 45,
  aciertosMinimos: 32,
  erroresMaximos: 13,
  minutos: 90
};

/* ---------- Corrección ---------- */

/**
 * @param {Array} preguntas  banco en orden de presentación
 * @param {Object} respuestas  {idPregunta: indiceElegido}
 * @returns desglose por unidad y veredicto conforme al baremo oficial
 */
export function corregir(preguntas, respuestas) {
  const porUnidad = {};
  UNIDADES.forEach(u => porUnidad[u.id] = { ...u, aciertos: 0, fallos: 0, blancos: 0 });

  let aciertos = 0;
  preguntas.forEach(p => {
    const r = respuestas[p.id];
    const casilla = porUnidad[p.ut];
    if (!casilla) return;
    if (r === undefined || r === null) { casilla.blancos++; casilla.fallos++; }
    else if (r === p.correcta) { casilla.aciertos++; aciertos++; }
    else casilla.fallos++;
  });

  const desglose = Object.values(porUnidad);
  const errores = preguntas.length - aciertos;
  const fallaMinimo = desglose.filter(u => u.minimo !== null && u.aciertos < u.minimo);
  const superaTotal = aciertos >= BAREMO.aciertosMinimos;

  return {
    aciertos, errores, desglose,
    superaTotal,
    fallaMinimo,
    apto: superaTotal && fallaMinimo.length === 0,
    motivo: !superaTotal
      ? `Faltan aciertos: ${aciertos} de ${BAREMO.aciertosMinimos} exigidos.`
      : fallaMinimo.length
        ? `Mínimo por materia no alcanzado en ${fallaMinimo.map(u => u.titulo).join(', ')}.`
        : null
  };
}

/* ---------- Progreso en el navegador ---------- */

const CLAVE = 'per.progreso.v1';

export const progreso = {
  leer() {
    try { return JSON.parse(localStorage.getItem(CLAVE)) || { intentos: [], vistas: {} }; }
    catch { return { intentos: [], vistas: {} }; }
  },
  escribir(d) {
    try { localStorage.setItem(CLAVE, JSON.stringify(d)); } catch { /* modo privado */ }
  },
  registrarIntento(intento) {
    const d = this.leer();
    d.intentos.unshift({ fecha: Date.now(), ...intento });
    d.intentos = d.intentos.slice(0, 40);
    this.escribir(d);
  },
  marcarLeida(utId) {
    const d = this.leer();
    d.vistas[utId] = Date.now();
    this.escribir(d);
  },
  borrar() { try { localStorage.removeItem(CLAVE); } catch {} }
};

/* ---------- Navegación lateral ---------- */

export function pintarRail(actual) {
  const el = document.querySelector('[data-rail]');
  if (!el) return;
  const enlace = (href, n, txt, tope) =>
    `<li><a href="${href}" ${actual === href ? 'aria-current="page"' : ''}>
       <span class="n">${n}</span><span>${txt}${tope ? ` <span class="tope" title="Mínimo de aciertos exigido">min ${tope}</span>` : ''}</span>
     </a></li>`;

  el.innerHTML = `
    <a class="marca" href="index.html"><b>PER</b><span>Patrón de Embarcaciones de Recreo</span></a>

    <div class="rail-grupo">
      <p>Estudio</p>
      <ol>
        ${enlace('index.html', '·', 'Inicio')}
        ${enlace('carta.html', '·', 'Taller de carta')}
        ${enlace('test.html', '·', 'Simulador')}
      </ol>
    </div>

    <div class="rail-grupo">
      <p>Bloque PNB · 27 preguntas</p>
      <ol>
        ${UNIDADES.filter(u => u.bloque === 'PNB').map(u =>
          enlace(`temario.html#${u.id}`, u.n, u.titulo, u.minimo)).join('')}
      </ol>
    </div>

    <div class="rail-grupo">
      <p>Bloque PER · 18 preguntas</p>
      <ol>
        ${UNIDADES.filter(u => u.bloque === 'PER').map(u =>
          enlace(`temario.html#${u.id}`, u.n, u.titulo, u.minimo)).join('')}
      </ol>
    </div>

    <div class="rail-grupo">
      <p>Ampliación</p>
      <ol>${enlace('temario.html#vela', '·', 'Navegación a vela')}</ol>
    </div>`;
}

export function hhmmss(seg) {
  const m = Math.floor(seg / 60), s = seg % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
