/* ============================================================
   Núcleo náutico puro: ángulos, coordenadas, rumbos, estima,
   rectas de posición, mareas y fondeo. Sin DOM, probado con node.
   Convenciones: latitud N+, longitud E+; declinación y desvío
   E+ / W−; distancias en millas; tiempos en minutos.
   ============================================================ */

export const MILLA_M = 1852;
const RAD = Math.PI / 180;

/* ---------- Ángulos ---------- */

export function normalizar(grados) {
  const n = ((grados % 360) + 360) % 360;
  return n === 0 ? 0 : n;               // evita −0
}

export function diferenciaAngular(a, b) {
  let d = normalizar(b - a);
  if (d > 180) d -= 360;
  return d;
}

export function reciproco(grados) { return normalizar(grados + 180); }

export function formatearAngulo(grados) {
  return String(Math.round(normalizar(grados)) % 360).padStart(3, '0') + '°';
}

/* ---------- Coordenadas ---------- */

/** Acepta «36° 12,5' N», «36 12.5 N», «012° 36,7' W», «5° 30' O», «-12,3». */
export function parsearGrados(texto) {
  if (texto === null || texto === undefined) return NaN;
  const t = String(texto).trim().toUpperCase().replace(/,/g, '.');
  if (!t) return NaN;
  const hemi = t.match(/[NSEWO]$/);
  const cuerpo = hemi ? t.slice(0, -1) : t;
  const negativo = cuerpo.trim().startsWith('-');
  const numeros = cuerpo.replace(/[°'"′″]/g, ' ').replace(/-/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!numeros.length || numeros.length > 3 || numeros.some(n => !/^\d+(\.\d+)?$/.test(n))) return NaN;
  const [g, m = 0, s = 0] = numeros.map(Number);
  let valor = g + m / 60 + s / 3600;
  if (negativo) valor = -valor;
  if (hemi && /[SWO]/.test(hemi[0])) valor = -Math.abs(valor);
  return valor;
}

export function formatearGrados(decimal, eje = 'lat', decimales = 1) {
  const negativo = decimal < 0;
  const abs = Math.abs(decimal);
  let g = Math.floor(abs);
  let m = (abs - g) * 60;
  if (Number(m.toFixed(decimales)) >= 60) { g += 1; m = 0; }
  const letra = eje === 'lat' ? (negativo ? 'S' : 'N') : (negativo ? 'W' : 'E');
  const anchoG = eje === 'lat' ? 2 : 3;
  const mTxt = m.toFixed(decimales).replace('.', ',').padStart(decimales + 3, '0');
  return `${String(g).padStart(anchoG, '0')}° ${mTxt}' ${letra}`;
}

export function formatearMillas(millas, decimales = 1) {
  return millas.toFixed(decimales).replace('.', ',') + ' M';
}

/* ---------- Horas ---------- */

export function parsearHora(hhmm) {
  const m = String(hhmm).trim().match(/^(\d{1,2})[:.h](\d{2})$/);
  if (!m) return NaN;
  const h = +m[1], min = +m[2];
  if (h > 23 || min > 59) return NaN;
  return h * 60 + min;
}

export function formatearHora(minutos) {
  const t = ((Math.round(minutos) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

const aMinutos = h => typeof h === 'number' ? h : parsearHora(h);

/* ---------- Rumbo y distancia (plano de latitud media) ---------- */

export function rumboDistancia(a, b) {
  const dLat = (b[0] - a[0]) * 60;
  const latMedia = (a[0] + b[0]) / 2;
  const apart = (b[1] - a[1]) * 60 * Math.cos(latMedia * RAD);
  return {
    rumbo: normalizar(Math.atan2(apart, dLat) / RAD),
    distancia: Math.hypot(dLat, apart)
  };
}

export function puntoDesde(origen, rumbo, distancia) {
  const dLat = distancia * Math.cos(rumbo * RAD) / 60;
  const apart = distancia * Math.sin(rumbo * RAD);
  const latMedia = origen[0] + dLat / 2;
  const dLon = apart / Math.cos(latMedia * RAD) / 60;
  return [origen[0] + dLat, origen[1] + dLon];
}

/* ---------- Corrección total ---------- */

export function correccionTotal(dm, desvio) { return dm + desvio; }
export function rumboVerdadero(ra, ct) { return normalizar(ra + ct); }
export function rumboAguja(rv, ct) { return normalizar(rv - ct); }
export function demoraVerdadera(da, ct) { return normalizar(da + ct); }

/** Marcación con signo: estribor +, babor −. */
export function marcacionADemora(rumbo, marcacion) { return normalizar(rumbo + marcacion); }
export function demoraAMarcacion(rumbo, demora) { return diferenciaAngular(rumbo, demora); }

export function declinacionActualizada(dm, anyo, variacionAnualMin, anyoActual) {
  return dm + (anyoActual - anyo) * variacionAnualMin / 60;
}

export function desvioPorTablilla(ra, tablilla) {
  const filas = [...tablilla.filas].sort((x, y) => x.ra - y.ra);
  const r = normalizar(ra);
  let ant = filas[filas.length - 1], sig = filas[0];
  for (let i = 0; i < filas.length; i++) {
    if (filas[i].ra <= r) { ant = filas[i]; sig = filas[(i + 1) % filas.length]; }
  }
  const tramo = normalizar(sig.ra - ant.ra) || 360;
  const f = normalizar(r - ant.ra) / tramo;
  return ant.desvio + (sig.desvio - ant.desvio) * f;
}

/* ---------- Estima ---------- */

export function estima(origen, rv, velocidad, minutos) {
  return puntoDesde(origen, rv, velocidad * minutos / 60);
}

export function tiempoParaDistancia(millas, velocidad) { return millas / velocidad * 60; }

export function eta(horaSalida, minutos) { return formatearHora(aMinutos(horaSalida) + minutos); }

/* ---------- Rectas de posición ---------- */

/** Rectas que parten de p1 con rumbo1 y de p2 con rumbo2. */
export function cortarRectas(p1, rumbo1, p2, rumbo2) {
  const latMedia = (p1[0] + p2[0]) / 2;
  const k = Math.cos(latMedia * RAD);
  // plano local en minutos: x = apartamiento, y = Δlat
  const x2 = (p2[1] - p1[1]) * 60 * k, y2 = (p2[0] - p1[0]) * 60;
  const u1 = [Math.sin(rumbo1 * RAD), Math.cos(rumbo1 * RAD)];
  const u2 = [Math.sin(rumbo2 * RAD), Math.cos(rumbo2 * RAD)];
  const det = u1[0] * u2[1] - u1[1] * u2[0];
  if (Math.abs(det) < 1e-9) return null;
  const t = (x2 * u2[1] - y2 * u2[0]) / det;
  const x = t * u1[0], y = t * u1[1];
  let ang = Math.abs(diferenciaAngular(rumbo1, rumbo2));
  if (ang > 90) ang = 180 - ang;
  return { punto: [p1[0] + y / 60, p1[1] + x / k / 60], anguloCorte: ang };
}

export function calidadCorte(anguloCorte) {
  return anguloCorte >= 60 ? 'buena' : anguloCorte >= 30 ? 'aceptable' : 'baja';
}

export function situacionDemoraDistancia(objeto, demoraVerdadera, distancia) {
  return puntoDesde(objeto, reciproco(demoraVerdadera), distancia);
}

/* ---------- Mareas ---------- */

export function eventosAlrededor(hora, eventosDia) {
  const h = aMinutos(hora);
  let antes = null, despues = null;
  for (const ev of eventosDia) {
    const t = parsearHora(ev[1]);
    if (t <= h) antes = ev;
    else if (!despues) despues = ev;
  }
  return [antes, despues];
}

const DOCEAVOS = [0, 1, 3, 6, 9, 11, 12];   // acumulado por sextos

function fraccionDoceavos(f) {
  const s = Math.min(5, Math.floor(f * 6));
  const dentro = f * 6 - s;
  return (DOCEAVOS[s] + (DOCEAVOS[s + 1] - DOCEAVOS[s]) * dentro) / 12;
}

/** Altura entre dos eventos consecutivos ['BM','06:00',0.5] → ['PM','12:00',3.5]. */
export function alturaMarea(hora, antes, despues, metodo = 'doceavos') {
  const h = aMinutos(hora), t0 = parsearHora(antes[1]), t1 = parsearHora(despues[1]);
  const dur = ((t1 - t0) + 1440) % 1440 || 1440;
  const f = Math.min(1, Math.max(0, (((h - t0) + 1440) % 1440) / dur));
  const g = metodo === 'lineal' ? f : fraccionDoceavos(f);
  return antes[2] + (despues[2] - antes[2]) * g;
}

/** Hora (minutos) en la que se alcanza la altura entre dos eventos, por bisección. */
export function horaParaAltura(altura, antes, despues, metodo = 'doceavos') {
  const t0 = parsearHora(antes[1]), t1 = parsearHora(despues[1]);
  const dur = ((t1 - t0) + 1440) % 1440 || 1440;
  const sube = despues[2] > antes[2];
  let lo = 0, hi = dur;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const a = alturaMarea(t0 + mid, antes, despues, metodo);
    if ((a < altura) === sube) lo = mid; else hi = mid;
  }
  return Math.round(t0 + (lo + hi) / 2) % 1440;
}

export function sondaReal(sondaCarta, alturaMarea) { return sondaCarta + alturaMarea; }
export function resguardo(sondaReal, calado) { return sondaReal - calado; }

/* ---------- Fondeo ---------- */

export function radioBorneo(eslora, cadena, profundidad) {
  return Math.sqrt(Math.max(0, cadena * cadena - profundidad * profundidad)) + eslora;
}

export function hayGarreo(demorasControl, demorasActuales, toleranciaGrados = 3) {
  return demorasControl.some((d, i) => Math.abs(diferenciaAngular(d, demorasActuales[i])) > toleranciaGrados);
}

/* ---------- Geometría de carta ---------- */

/** Punto [lat,lon] dentro de un polígono cerrado de [lat,lon], por trazado de rayos. */
export function dentroDePoligono(p, poligono) {
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [yi, xi] = poligono[i], [yj, xj] = poligono[j];
    if ((yi > p[0]) !== (yj > p[0]) && p[1] < (xj - xi) * (p[0] - yi) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}
