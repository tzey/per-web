/* ============================================================
   Controlador de mesa.html: carga la carta, pinta, zoom y fichas.
   ============================================================ */

import { pintarRail } from '../comun.js';
import { pintarCarta, crearZoomPan, fichaObjeto } from './carta.js';

pintarRail('mesa.html');

const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);
const cartaId = params.get('carta') ?? 'estrecho-didactico';
const anyo = +(params.get('anyo') ?? new Date().getFullYear());

async function cargarJson(ruta) {
  const r = await fetch(ruta);
  if (!r.ok) throw new Error(`${ruta}: ${r.status}`);
  return r.json();
}

async function iniciar() {
  let carta;
  try {
    carta = await cargarJson(`data/cartas/${cartaId}.json`);
  } catch {
    $('#estadoCarga').textContent = 'No se ha podido cargar la carta. Arranca el sitio desde un servidor local: python3 -m http.server';
    return;
  }

  const svg = $('#carta');
  const vista = pintarCarta(svg, carta, { anyo });
  const esFondo = t => !t.closest('.capa-instrumentos, .capa-trazos, .objeto');
  const zoom = crearZoomPan(svg, vista.mundo, { esFondo });

  // ficha ENC didáctica al tocar un objeto
  const marco = $('#cartaMarco');
  const abrirFicha = id => {
    const f = fichaObjeto(carta, id);
    if (!f) return;
    marco.querySelector('.ficha')?.remove();
    const div = document.createElement('div');
    div.className = 'ficha';
    div.innerHTML = `<button aria-label="Cerrar">×</button><h4>${f.titulo}</h4><dl>${f.filas.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
    div.querySelector('button').onclick = () => div.remove();
    marco.append(div);
  };
  vista.capas.objetos.addEventListener('click', ev => {
    const o = ev.target.closest('.objeto');
    if (o) abrirFicha(o.dataset.id);
  });
  vista.capas.objetos.addEventListener('keydown', ev => {
    const o = ev.target.closest('.objeto');
    if (o && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); abrirFicha(o.dataset.id); }
  });

  $('#cabTitulo').textContent = carta.meta.nombre;
  $('#panel').innerHTML = `<div class="panel">
      <h3>${carta.meta.nombre}</h3>
      <p>${carta.meta.subtitulo}. Escala 1:${carta.meta.escala.toLocaleString('es-ES')}. Rueda o pinza para ampliar, arrastra para desplazar, doble clic para volver.</p>
      <p style="margin:0"><button class="btn sec" id="reiniciarZoom">Ver carta completa</button></p>
    </div>
    <div class="nota aviso"><b>${carta.meta.sello}</b><p>Costa, sondas y faros son inventados. Sirve para practicar el trazado; no para navegar.</p></div>`;
  $('#reiniciarZoom').onclick = () => zoom.reiniciar();
}

iniciar();
