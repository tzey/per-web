/* ============================================================
   Controlador de mesa.html: carga carta y ejercicio, panel de
   enunciado, pistas, solución, comprobación y lecturas.
   ============================================================ */

import { pintarRail, UNIDADES, hhmmss } from '../comun.js';
import { pintarCarta, crearZoomPan, fichaObjeto, buscarObjeto, dibujarTrazo } from './carta.js';
import { generar, generarSimulacro, puntuar, TIPOS } from './ejercicios.js';
import { formatearGrados, formatearAngulo, formatearMillas } from './geo.js';
import { crearCompasPuntas, crearTransportador, crearLapiz } from './instrumentos.js';
import { crearSesion, sesionPrevia, registrarResultado } from './sesion.js';

pintarRail('mesa.html');

const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);
const estado = {
  cartaId: params.get('carta') ?? 'estrecho-didactico',
  tipo: params.get('tipo') ?? 'situacion-dos-demoras',
  semilla: +(params.get('semilla') ?? Math.floor(Math.random() * 9000 + 1000)),
  modo: params.get('modo') ?? 'aprendizaje',
  anyo: +(params.get('anyo') ?? new Date().getFullYear()),
  carta: null, tablilla: null, vista: null, zoom: null, ej: null, pistas: 0, lecturas: false,
  compas: null, transportador: null, lapiz: null, sesion: null,
  opciones: { viento: null, corriente: null }, errores: { desvioExtra: 0 }
};

const AVISOS = {
  reciproco: 'Has leído el recíproco: el transportador estaba con el 0 hacia el sur, o has llevado la demora desde el objeto en lugar de hacia él.',
  'signo-ct': 'Corrección total con el signo cambiado: del verdadero al de aguja se resta, Ra = Rv − Ct.',
  'sin-desvio': 'Solo has aplicado la declinación; falta el desvío de la tablilla.',
  'signo-invertido': 'Signo invertido: este positivo, oeste negativo.',
  'este-oeste': 'Longitud con el hemisferio cambiado: en esta carta toda la longitud es W.',
  'lado-contrario': 'Has dejado el peligro por la banda contraria.',
  'sin-resguardo': 'Has puesto proa al peligro: falta el ángulo de resguardo.'
};

async function cargarJson(ruta) {
  const r = await fetch(ruta);
  if (!r.ok) throw new Error(`${ruta}: ${r.status}`);
  return r.json();
}

const fPos = p => `${formatearGrados(p[0], 'lat')} · ${formatearGrados(p[1], 'lon')}`;
const nombreDe = id => { const o = buscarObjeto(estado.carta, id); return o?.nombre ?? o?.descripcion ?? id; };

/** Datos del enunciado en forma de tabla, para no depender de leer bien el texto. */
function describirVisibles(ej) {
  const v = ej.visibles, filas = [];
  if (v.hora) filas.push(['Hora', v.hora]);
  if (v.desde) filas.push(['Situación de partida', fPos(v.desde)]);
  if (v.objeto) filas.push(['Objeto', nombreDe(v.objeto)]);
  if (v.enfilacion) filas.push(['Enfilación', nombreDe(v.enfilacion)]);
  if (v.peligro) filas.push(['Peligro', nombreDe(v.peligro)]);
  if (v.demoras) v.demoras.forEach((d, i) => filas.push([`Demora ${v.tipoDemora === 'aguja' ? 'de aguja' : 'verdadera'} ${i + 1}`, `${formatearAngulo(d.valor)} a ${nombreDe(d.objeto)}`]));
  if (v.ct !== undefined && v.ct !== null) filas.push(['Corrección total', `${v.ct < 0 ? '−' : '+'}${Math.abs(v.ct).toFixed(1).replace('.', ',')}°`]);
  if (v.da !== undefined) filas.push(['Demora de aguja', formatearAngulo(v.da)]);
  if (v.dv2 !== undefined) filas.push(['Demora verdadera', formatearAngulo(v.dv2)]);
  if (v.dv !== undefined) filas.push(['Demora verdadera', formatearAngulo(v.dv)]);
  if (v.distancia !== undefined) filas.push(['Distancia', `${String(v.distancia).replace('.', ',')} M`]);
  if (v.rv !== undefined) filas.push(['Rumbo verdadero', formatearAngulo(v.rv)]);
  if (v.velocidad !== undefined) filas.push(['Velocidad', `${String(v.velocidad).replace('.', ',')} nudos`]);
  if (v.minutos !== undefined) filas.push(['Tiempo navegado', `${v.minutos} min`]);
  if (v.resguardo !== undefined) filas.push(['Resguardo', `${String(v.resguardo).replace('.', ',')} M por ${v.lado}`]);
  if (v.anyo) filas.push(['Año', String(v.anyo)]);
  if (v.usaTablilla) filas.push(['Desvío', 'según tablilla']);
  if (v.corriente) filas.push(['Corriente', `${v.corriente.intensidad} nudos al ${formatearAngulo(v.corriente.rumbo)}`]);
  return filas;
}

function objetosDelEjercicio(ej) {
  const v = ej.visibles, ids = [];
  for (const k of ['objeto', 'peligro']) if (v[k]) ids.push(v[k]);
  if (v.demoras) ids.push(...v.demoras.map(d => d.objeto));
  if (v.enfilacion) { const e = buscarObjeto(estado.carta, v.enfilacion); if (e) ids.push(...e.objetos); }
  return ids;
}

function destacar(ids) {
  estado.vista.capas.objetos.querySelectorAll('.destacado').forEach(n => n.classList.remove('destacado'));
  for (const id of ids) estado.vista.capas.objetos.querySelector(`.objeto[data-id="${id}"]`)?.classList.add('destacado');
}

/* ---------- Ejercicio ---------- */

function cargarEjercicio() {
  estado.ej = generar(estado.tipo, { carta: estado.carta, tablilla: estado.tablilla, anyo: estado.anyo, semilla: estado.semilla, opciones: estado.opciones });
  estado.pistas = 0;
  estado.vista.capas.solucion.replaceChildren();
  estado.sesion = crearSesion({ modo: estado.modo, cartaId: estado.cartaId, versionCarta: estado.carta.version, errores: estado.errores,
    ejercicios: [{ id: estado.ej.id, tipo: estado.ej.tipo, semilla: estado.ej.semilla }] });
  const previa = sesionPrevia(estado.ej.id);
  estado.lapiz?.cargar(previa?.trazos ?? []);
  const u = new URL(location); u.searchParams.set('tipo', estado.tipo); u.searchParams.set('semilla', estado.semilla); u.searchParams.set('carta', estado.cartaId);
  history.replaceState(null, '', u);
  destacar(objetosDelEjercicio(estado.ej));
  pintarPanel();
}

function pintarPanel() {
  const ej = estado.ej;
  const ut = UNIDADES.find(u => u.id === 'ut11');
  $('#cabEyebrow').textContent = `Aprendizaje · UT ${ut.n} · ${ut.titulo} · semilla ${ej.semilla}`;
  $('#cabTitulo').textContent = ej.titulo;
  const datos = describirVisibles(ej);
  $('#panel').innerHTML = `
    <div class="panel ejercicio">
      <h3>${ej.titulo}</h3>
      <p class="enunciado">${ej.enunciado}</p>
      ${datos.length ? `<div class="datos"><dl>${datos.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl></div>` : ''}
      <div class="campos">
        ${ej.campos.map(c => `<label>${c.etiqueta}<input type="text" inputmode="${c.tipo === 'hora' ? 'numeric' : 'decimal'}" data-campo="${c.id}" placeholder="${marcador(c)}" autocomplete="off"></label>`).join('')}
      </div>
      <div class="acciones">
        <button class="btn acc" id="comprobar">Comprobar</button>
        <button class="btn sec" id="pista">Pista</button>
        <button class="btn sec" id="solucion">Solución</button>
        <button class="btn sec" id="otro">Otro ejercicio</button>
      </div>
      <div class="explica" id="veredicto" hidden></div>
      <div class="pistas" id="pistas" hidden><ol></ol></div>
    </div>
    <details class="panel" style="padding:.8rem 1.1rem">
      <summary>Condiciones de prácticas (no salen en el examen)</summary>
      <div class="campos" style="margin:.6rem 0 0">
        <label>Corriente: rumbo <input type="text" inputmode="numeric" id="corrRumbo" value="${estado.opciones.corriente?.rumbo ?? ''}" placeholder="090"></label>
        <label>Corriente: nudos <input type="text" inputmode="decimal" id="corrInt" value="${estado.opciones.corriente?.intensidad ?? ''}" placeholder="1,5"></label>
        <label>Abatimiento (°) <input type="text" inputmode="decimal" id="vientoAbat" value="${estado.opciones.viento?.abatimiento ?? ''}" placeholder="5"></label>
        <label>Abate hacia <select id="vientoBanda"><option value="estribor" ${estado.opciones.viento?.banda === 'estribor' ? 'selected' : ''}>estribor</option><option value="babor" ${estado.opciones.viento?.banda === 'babor' ? 'selected' : ''}>babor</option></select></label>
        <label>Error extra de aguja (°) <input type="text" inputmode="decimal" id="desvioExtra" value="${estado.errores.desvioExtra || ''}" placeholder="0"></label>
      </div>
      <p style="font-size:.85rem;color:var(--tinta-70);margin:.5rem 0 0">La corriente y el abatimiento solo afectan a la estima. El error de aguja se suma a lo que marca la regla del transportador con las lecturas activadas.</p>
      <p style="margin:.5rem 0 0"><button class="btn sec" id="aplicarCondiciones">Aplicar y regenerar</button></p>
    </details>
    <details class="panel" style="padding:.8rem 1.1rem">
      <summary>Cambiar de ejercicio</summary>
      <div class="barra" style="margin:.6rem 0 0">
        <select id="selTipo" aria-label="Tipo de ejercicio">
          ${TIPOS.filter(t => t.cartas.includes(estado.carta.meta.tipo)).map(t => `<option value="${t.id}" ${t.id === ej.tipo ? 'selected' : ''}>${t.titulo}</option>`).join('')}
        </select>
        <label class="mono" style="font-size:.85rem">Semilla <input type="number" id="inSemilla" value="${ej.semilla}" min="1" max="999999" style="width:7em"></label>
        <button class="btn sec" id="irEjercicio">Ir</button>
      </div>
    </details>
    <div class="nota aviso"><b>${estado.carta.meta.sello}</b><p>Costa, sondas y faros son inventados. Sirve para practicar el trazado; no para navegar.</p></div>`;

  $('#comprobar').onclick = comprobar;
  $('#pista').onclick = () => mostrarPistas(estado.pistas + 1);
  $('#solucion').onclick = () => mostrarPistas(ej.solucion.length);
  $('#otro').onclick = () => { estado.semilla = Math.floor(Math.random() * 9000 + 1000); cargarEjercicio(); };
  $('#irEjercicio').onclick = () => { estado.tipo = $('#selTipo').value; estado.semilla = +$('#inSemilla').value || 1; cargarEjercicio(); };
  $('#aplicarCondiciones').onclick = () => {
    const num = id => { const v = Number($(id).value.replace(',', '.')); return Number.isFinite(v) && $(id).value.trim() !== '' ? v : null; };
    const cr = num('#corrRumbo'), ci = num('#corrInt'), ab = num('#vientoAbat');
    estado.opciones = {
      corriente: cr !== null && ci ? { rumbo: cr, intensidad: ci } : null,
      viento: ab ? { abatimiento: ab, banda: $('#vientoBanda').value } : null
    };
    estado.errores = { desvioExtra: num('#desvioExtra') ?? 0 };
    cargarEjercicio();
  };
  $('#panel').addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.matches('[data-campo]')) comprobar(); });
}

function marcador(campo) {
  return ({ coordenada: campo.eje === 'lat' ? "36° 04,3' N" : "012° 36,7' W", angulo: '047', 'angulo-signo': '−2,4', millas: '12,3', hora: '10:20', minutos: '75', metros: '4,2' })[campo.tipo] ?? '';
}

function leerRespuesta() {
  const r = {};
  document.querySelectorAll('[data-campo]').forEach(i => r[i.dataset.campo] = i.value);
  return r;
}

function comprobar() {
  const ej = estado.ej;
  const r = ej.validar(leerRespuesta());
  const salida = $('#veredicto');
  salida.hidden = false;
  salida.style.borderLeftColor = r.correcto ? 'var(--estribor)' : 'var(--babor)';
  const filas = r.detalle.map(d => {
    const campo = ej.campos.find(c => c.id === d.campo);
    const esperado = formatearValor(campo, d.esperado);
    return `<li><b>${campo.etiqueta}</b>: ${d.dado === null ? 'sin respuesta o ilegible' : d.dentro ? 'bien' : `fuera de tolerancia (${formatearError(campo, d.error)})`}${!d.dentro ? ` · esperado <span class="mono">${esperado}</span>` : ''}</li>`;
  }).join('');
  salida.innerHTML = `${r.correcto ? '<b>Correcto.</b>' : '<b>No es correcto.</b>'}<ul style="margin:.4rem 0 0;padding-left:1.1rem">${filas}</ul>${r.avisos.map(a => `<p style="margin:.5rem 0 0"><b>Aviso:</b> ${AVISOS[a] ?? a}</p>`).join('')}`;
  if (!r.correcto && estado.pistas === 0) mostrarPistas(1);
  estado.sesion.registrarRespuesta(ej.id, leerRespuesta(), r);
  estado.sesion.guardar();
  registrarResultado({ modo: estado.modo, tipo: ej.tipo, semilla: ej.semilla, aciertos: r.correcto ? 1 : 0, total: 1, apto: r.correcto });
  document.dispatchEvent(new CustomEvent('mesa:comprobado', { detail: { ejercicio: ej, resultado: r } }));
}

function formatearValor(campo, v) {
  switch (campo.tipo) {
    case 'coordenada': return formatearGrados(v, campo.eje);
    case 'angulo': return formatearAngulo(v);
    case 'angulo-signo': return `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(1).replace('.', ',')}°`;
    case 'hora': { const t = ((Math.round(v) % 1440) + 1440) % 1440; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; }
    case 'millas': return `${v.toFixed(1).replace('.', ',')} M`;
    default: return String(Math.round(v * 10) / 10).replace('.', ',');
  }
}
function formatearError(campo, e) {
  return campo.tipo === 'coordenada' ? `${e.toFixed(1).replace('.', ',')}'` : campo.tipo === 'hora' || campo.tipo === 'minutos' ? `${Math.round(e)} min` : campo.tipo === 'millas' ? `${e.toFixed(1).replace('.', ',')} M` : `${e.toFixed(1).replace('.', ',')}°`;
}

function mostrarPistas(n) {
  const ej = estado.ej;
  n = Math.min(n, ej.solucion.length);
  const cont = $('#pistas');
  cont.hidden = false;
  const ol = cont.querySelector('ol');
  for (let i = estado.pistas; i < n; i++) {
    const li = document.createElement('li'); li.textContent = ej.solucion[i].texto; ol.append(li);
    if (ej.solucion[i].trazo) dibujarTrazo(estado.vista.capas.solucion, estado.vista.proyeccion, ej.solucion[i].trazo);
  }
  estado.pistas = n;
  if (n >= ej.solucion.length) { $('#pista').disabled = true; $('#solucion').disabled = true; }
}

/* ---------- Herramientas ---------- */

const AVISOS_COMPAS = {
  'en-longitudes': 'Estás midiendo en la escala de longitudes. Un minuto de longitud no es una milla: lleva el compás a la escala lateral.',
  'latitud-alejada': 'Has llevado el compás a una latitud lejana a la zona medida. En Mercator la escala cambia con la latitud: lee a la altura donde navegas.',
  'no-en-escala': 'Coloca las dos puntas sobre la escala lateral de latitudes para leer la distancia.'
};

function pintarHerramientas() {
  const h = $('#herramientas');
  h.innerHTML = `
    <button class="btn sec" data-instr="compas" aria-pressed="false" title="Compás de puntas: arrastra las puntas; llévalo a la escala lateral para leer millas">Compás</button>
    <button class="btn sec" data-instr="transportador" aria-pressed="false" title="Transportador: arrastra el cuerpo para moverlo y el asa para girar la regla">Transportador</button>
    <span class="sep"></span>
    <button class="btn sec" data-lapiz="recta" aria-pressed="false" title="Recta por arrastre">Recta</button>
    <button class="btn sec" data-lapiz="punto" aria-pressed="false" title="Marca con etiqueta">Punto</button>
    <button class="btn sec" data-lapiz="estima" aria-pressed="false" title="Símbolo de situación de estima">Estima</button>
    <button class="btn sec" data-lapiz="observada" aria-pressed="false" title="Símbolo de situación observada">Observada</button>
    <button class="btn sec" data-lapiz="borrar" aria-pressed="false" title="Goma: pulsa sobre un trazo">Goma</button>
    <button class="btn sec" id="btnDeshacer" title="Deshacer (Ctrl+Z)">↶</button>
    <button class="btn sec" id="btnRehacer" title="Rehacer (Ctrl+Mayús+Z)">↷</button>
    <span class="sep"></span>
    <button class="btn sec" id="btnLecturas" aria-pressed="false" title="Lecturas numéricas de instrumentos y trazos">Lecturas</button>
    <button class="btn sec" id="btnCartaCompleta">Carta completa</button>
    <span id="lecturaCursor" class="lectura" aria-live="off"></span>`;
  const aviso = document.createElement('div');
  aviso.id = 'avisoInstrumento'; aviso.className = 'nota aviso'; aviso.hidden = true; aviso.style.margin = '.6rem 0 0';
  h.after(aviso);

  const { proyeccion: proy, capas } = estado.vista;
  const svg = $('#carta');
  const centro = { x: (proy.marco.x0 + proy.marco.x1) / 2, y: (proy.marco.y0 + proy.marco.y1) / 2 };

  estado.compas = crearCompasPuntas(capas.instrumentos, proy, lectura => {
    if (!estado.compas?.visible()) return;
    if (lectura.dentro) { $('#lecturaCursor').textContent = estado.lecturas ? `abertura ${formatearMillas(lectura.millas, 2)}` : ''; mostrarAviso(null); }
    else if (lectura.motivo === 'ok') { $('#lecturaCursor').textContent = estado.lecturas ? `lectura ${formatearMillas(lectura.millas, 2)}` : 'lectura tomada'; mostrarAviso(null); }
    else mostrarAviso(estado.modo === 'aprendizaje' ? AVISOS_COMPAS[lectura.motivo] : null);
  });
  estado.compas.fijar({ x: centro.x - 60, y: centro.y }, { x: centro.x + 60, y: centro.y });
  estado.transportador = crearTransportador(capas.instrumentos, proy, ({ angulo }) => {
    if (estado.transportador?.visible() && estado.lecturas) {
      const mostrado = estado.sesion ? estado.sesion.percibido('rumbo', angulo) : angulo;
      $('#lecturaCursor').textContent = `regla ${formatearAngulo(mostrado)}${mostrado !== angulo ? ' (aguja con error)' : ''}`;
    }
  });
  estado.transportador.centrar({ x: centro.x, y: centro.y + 80 });
  let nTrazos = 0;
  estado.lapiz = crearLapiz(svg, capas.trazos, proy, dibujarTrazo, ({ trazos }) => {
    if (!estado.sesion) return;
    if (trazos.length > nTrazos) estado.sesion.registrarTrazo(trazos[trazos.length - 1]);
    nTrazos = trazos.length;
    estado.sesion.fijarTrazos(trazos);
    estado.sesion.guardar();
  });

  h.querySelectorAll('[data-instr]').forEach(b => b.onclick = () => {
    const inst = estado[b.dataset.instr];
    inst.mostrar(!inst.visible());
    b.setAttribute('aria-pressed', String(inst.visible()));
  });
  h.querySelectorAll('[data-lapiz]').forEach(b => b.onclick = () => {
    const nuevo = estado.lapiz.modo() === b.dataset.lapiz ? null : b.dataset.lapiz;
    estado.lapiz.modo(nuevo);
    h.querySelectorAll('[data-lapiz]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.lapiz === nuevo)));
    svg.style.cursor = nuevo ? 'crosshair' : '';
  });
  $('#btnDeshacer').onclick = () => estado.lapiz.deshacer();
  $('#btnRehacer').onclick = () => estado.lapiz.rehacer();
  $('#btnCartaCompleta').onclick = () => estado.zoom.reiniciar();
  $('#btnLecturas').onclick = ev => {
    estado.lecturas = !estado.lecturas;
    ev.currentTarget.setAttribute('aria-pressed', String(estado.lecturas));
    estado.compas.mostrarLectura(estado.lecturas);
    estado.transportador.mostrarLectura(estado.lecturas);
    estado.lapiz.mostrarLectura(estado.lecturas);
    if (!estado.lecturas) $('#lecturaCursor').textContent = '';
  };
  svg.addEventListener('pointermove', ev => {
    if (!estado.lecturas || ev.target.closest('.capa-instrumentos')) return;
    const p = estado.zoom.aViewBox(ev);
    const k = estado.zoom.escala(), t = estado.zoom.traslacion();
    const [lat, lon] = proy.aGeo((p.x - t.x) / k, (p.y - t.y) / k);
    $('#lecturaCursor').textContent = fPos([lat, lon]);
  });
}

function mostrarAviso(texto) {
  const a = $('#avisoInstrumento');
  if (!a) return;
  a.hidden = !texto;
  if (texto) a.innerHTML = `<b>Ojo con el compás</b><p>${texto}</p>`;
}

/* ---------- Fichas ---------- */

function activarFichas() {
  const marco = $('#cartaMarco');
  const abrir = id => {
    const f = fichaObjeto(estado.carta, id);
    if (!f) return;
    marco.querySelector('.ficha')?.remove();
    const div = document.createElement('div');
    div.className = 'ficha';
    div.innerHTML = `<button aria-label="Cerrar">×</button><h4>${f.titulo}</h4><dl>${f.filas.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
    div.querySelector('button').onclick = () => div.remove();
    marco.append(div);
  };
  estado.vista.capas.objetos.addEventListener('click', ev => { const o = ev.target.closest('.objeto'); if (o) abrir(o.dataset.id); });
  estado.vista.capas.objetos.addEventListener('keydown', ev => {
    const o = ev.target.closest('.objeto');
    if (o && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); abrir(o.dataset.id); }
  });
}

/* ---------- Arranque ---------- */

async function iniciar() {
  try {
    [estado.carta, estado.tablilla] = await Promise.all([cargarJson(`data/cartas/${estado.cartaId}.json`), cargarJson('data/tablilla-desvios.json')]);
  } catch {
    $('#estadoCarga').textContent = 'No se han podido cargar los datos. Arranca el sitio desde un servidor local: node tools/servir.js';
    return;
  }
  const svg = $('#carta');
  estado.vista = pintarCarta(svg, estado.carta, { anyo: estado.anyo });
  estado.zoom = crearZoomPan(svg, estado.vista.mundo, { esFondo: t => !estado.lapiz?.modo() && !t.closest('.capa-instrumentos, .capa-trazos, .objeto') });
  activarFichas();
  pintarHerramientas();
  if (estado.modo === 'examen') { iniciarExamen(); return; }
  if (!TIPOS.some(t => t.id === estado.tipo && t.cartas.includes(estado.carta.meta.tipo))) estado.tipo = TIPOS.find(t => t.cartas.includes(estado.carta.meta.tipo)).id;
  cargarEjercicio();
}

/* ---------- Modo examen ---------- */

const examen = { ejercicios: [], respuestas: {}, timer: null, restante: 0, entregado: false };

function iniciarExamen() {
  const minutos = Math.max(5, Math.min(90, +(params.get('minutos') ?? 20)));
  examen.ejercicios = generarSimulacro({ carta: estado.carta, tablilla: estado.tablilla, anyo: estado.anyo, semilla: estado.semilla });
  estado.sesion = crearSesion({ modo: 'examen', cartaId: estado.cartaId, versionCarta: estado.carta.version,
    ejercicios: examen.ejercicios.map(e => ({ id: e.id, tipo: e.tipo, semilla: e.semilla })) });
  // sin ayudas: lecturas, pistas y condiciones fuera
  estado.lecturas = false;
  $('#btnLecturas').disabled = true; $('#btnLecturas').title = 'Sin lecturas numéricas en el simulacro';
  estado.compas.mostrarLectura(false); estado.transportador.mostrarLectura(false); estado.lapiz.mostrarLectura(false);
  const ut = UNIDADES.find(u => u.id === 'ut11');
  $('#cabEyebrow').textContent = `Simulacro · UT ${ut.n} · ${ut.titulo} · semilla ${estado.semilla}`;
  $('#cabTitulo').textContent = 'Cuatro ejercicios encadenados';
  const reloj = $('#reloj'); reloj.hidden = false;
  examen.restante = minutos * 60;
  const pinta = () => { reloj.textContent = hhmmss(examen.restante); reloj.classList.toggle('urgente', examen.restante <= 120); };
  pinta();
  examen.timer = setInterval(() => { examen.restante--; pinta(); if (examen.restante <= 0) entregarExamen(true); }, 1000);
  destacar(examen.ejercicios.flatMap(objetosDelEjercicio));
  $('#panel').innerHTML = `
    <div class="nota examen"><b>Condiciones del simulacro</b><p>${minutos} minutos, sin pistas, sin lecturas numéricas ni calculadora. Cada ejercicio parte del resultado del anterior, pero puntúa por separado. Necesitas 2 de 4.</p></div>
    ${examen.ejercicios.map((ej, i) => `
      <div class="panel ejercicio" data-ej="${ej.id}">
        <h3><span class="mono" style="color:var(--tinta-45)">${i + 1}/4</span> ${ej.titulo}</h3>
        <p class="enunciado">${ej.enunciado}</p>
        <div class="datos"><dl>${describirVisibles(ej).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl></div>
        <div class="campos">
          ${ej.campos.map(c => `<label>${c.etiqueta}<input type="text" inputmode="${c.tipo === 'hora' ? 'numeric' : 'decimal'}" data-ej-campo="${ej.id}" data-campo="${c.id}" placeholder="${marcador(c)}" autocomplete="off"></label>`).join('')}
        </div>
      </div>`).join('')}
    <div class="barra"><button class="btn acc" id="entregar">Entregar</button><a class="btn sec" href="practicas.html">Salir sin entregar</a></div>
    <div id="resultadoExamen"></div>`;
  $('#entregar').onclick = () => entregarExamen(false);
  window.addEventListener('beforeunload', ev => {
    if (!examen.entregado && document.querySelectorAll('[data-ej-campo]').length && [...document.querySelectorAll('[data-ej-campo]')].some(i => i.value)) { ev.preventDefault(); ev.returnValue = ''; }
  });
}

function entregarExamen(porTiempo) {
  if (examen.entregado) return;
  const respuestas = {};
  document.querySelectorAll('[data-ej-campo]').forEach(i => { (respuestas[i.dataset.ejCampo] ??= {})[i.dataset.campo] = i.value; });
  const sinResponder = examen.ejercicios.filter(e => !e.campos.every(c => (respuestas[e.id]?.[c.id] ?? '').trim())).length;
  if (!porTiempo && sinResponder && !confirm(`Hay ${sinResponder} ejercicio${sinResponder > 1 ? 's' : ''} sin completar. ¿Entregar igualmente?`)) return;
  examen.entregado = true;
  clearInterval(examen.timer);
  document.querySelectorAll('[data-ej-campo]').forEach(i => i.disabled = true);
  $('#entregar').disabled = true;
  const r = puntuar(examen.ejercicios, respuestas);
  examen.ejercicios.forEach(e => estado.sesion.registrarRespuesta(e.id, respuestas[e.id] ?? {}, e.validar(respuestas[e.id] ?? {})));
  estado.sesion.terminar({ tipo: 'simulacro', semilla: estado.semilla, aciertos: r.aciertos, total: r.total, apto: r.apto, detalle: r.detalle, porTiempo });
  $('#resultadoExamen').innerHTML = `
    <div class="veredicto ${r.apto ? 'apto' : 'no-apto'}">
      <h2>${r.apto ? 'Apto' : 'No apto'}</h2>
      <p class="cifra">${r.aciertos}<span style="font-size:1rem;font-family:var(--sans)"> aciertos de ${r.total}</span></p>
      <p style="margin:.6rem 0 0">El mínimo son 2 de 4.${porTiempo ? ' Se acabó el tiempo.' : ''}</p>
    </div>
    <div class="barra"><button class="btn" id="revisarExamen">Ver soluciones</button><a class="btn sec" href="mesa.html?modo=examen&semilla=${Math.floor(Math.random() * 9000 + 1000)}">Otro simulacro</a><a class="btn sec" href="practicas.html">Volver a prácticas</a></div>`;
  $('#revisarExamen').onclick = () => {
    examen.ejercicios.forEach((e, i) => {
      const v = e.validar(respuestas[e.id] ?? {});
      const bloque = document.querySelector(`[data-ej="${e.id}"]`);
      const div = document.createElement('div');
      div.className = 'explica';
      div.style.borderLeftColor = v.correcto ? 'var(--estribor)' : 'var(--babor)';
      div.innerHTML = `<b>${v.correcto ? 'Acierto' : 'Fallo'}.</b> ${v.detalle.map(d => { const c = e.campos.find(x => x.id === d.campo); return `${c.etiqueta}: esperado <span class="mono">${formatearValor(c, d.esperado)}</span>${d.dado === null ? ' (sin respuesta)' : d.dentro ? '' : ` (error ${formatearError(c, d.error)})`}`; }).join(' · ')}
        ${v.avisos.map(a => `<p style="margin:.4rem 0 0"><b>Aviso:</b> ${AVISOS[a] ?? a}</p>`).join('')}
        <ol style="margin:.5rem 0 0;padding-left:1.1rem">${e.solucion.map(p => `<li>${p.texto}</li>`).join('')}</ol>`;
      bloque.append(div);
      e.solucion.forEach(p => p.trazo && dibujarTrazo(estado.vista.capas.solucion, estado.vista.proyeccion, p.trazo));
    });
    $('#revisarExamen').disabled = true;
  };
  $('#resultadoExamen').scrollIntoView({ behavior: 'smooth' });
}

iniciar();
export { estado };
