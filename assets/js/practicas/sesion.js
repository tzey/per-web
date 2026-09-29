/* ============================================================
   Sesión de prácticas: estado real frente a percibido, registro
   ordenado de trazos y respuestas, persistencia local y enlace
   con el progreso general del sitio.
   ============================================================ */

import { progreso as progresoSitio } from '../comun.js';
import { VERSION_GENERADORES } from './ejercicios.js';

export const CLAVE_PRACTICAS = 'per.practicas.v1';
const MAX_SESIONES = 30, MAX_RESULTADOS = 200;

const almacenPorDefecto = () => (typeof localStorage !== 'undefined' ? localStorage : null);
const vacio = () => ({ sesiones: [], resultados: [] });

export function leerHistorial(almacen = almacenPorDefecto()) {
  try {
    const d = JSON.parse(almacen?.getItem(CLAVE_PRACTICAS) ?? 'null');
    if (!d || typeof d !== 'object') return vacio();
    return { sesiones: Array.isArray(d.sesiones) ? d.sesiones : [], resultados: Array.isArray(d.resultados) ? d.resultados : [] };
  } catch { return vacio(); }
}

function escribirHistorial(h, almacen = almacenPorDefecto()) {
  try { almacen?.setItem(CLAVE_PRACTICAS, JSON.stringify(h)); } catch { /* modo privado o cuota */ }
}

let contador = 0;
const nuevoId = ahora => `${ahora().toString(36)}-${(++contador).toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;

/**
 * @param {Object} o
 * @param {'aprendizaje'|'examen'} o.modo
 * @param {Array<{tipo,semilla,id?}>} o.ejercicios  referencias regenerables, nunca el objeto
 * @param {Object} [o.errores]  { desvioExtra, dmExtra } simulados solo en aprendizaje
 */
export function crearSesion({ modo, cartaId, versionCarta = 1, ejercicios = [], errores = {}, almacen = almacenPorDefecto(), ahora = Date.now } = {}) {
  const sesion = {
    id: nuevoId(ahora), inicio: ahora(), modo, cartaId, versionCarta, versionGeneradores: VERSION_GENERADORES,
    ejercicios: ejercicios.map(e => ({ ...e })), errores: { ...errores }, eventos: [], trazos: []
  };
  return {
    id: sesion.id,
    estado: () => JSON.parse(JSON.stringify(sesion)),
    /** Valor que muestra un instrumento con los errores configurados; en examen, el real. */
    percibido(magnitud, valor) {
      if (modo !== 'aprendizaje') return valor;
      if ((magnitud === 'rumbo' || magnitud === 'demora') && errores.desvioExtra) return valor - errores.desvioExtra;
      if (magnitud === 'declinacion' && errores.dmExtra) return valor + errores.dmExtra;
      return valor;
    },
    registrarTrazo(trazo) { sesion.eventos.push({ t: ahora(), clase: 'trazo', trazo }); },
    fijarTrazos(lista) { sesion.trazos = lista.map(t => ({ ...t })); },
    registrarRespuesta(ejercicioId, respuesta, resultado) {
      sesion.eventos.push({ t: ahora(), clase: 'respuesta', ejercicioId, respuesta, correcto: resultado?.correcto ?? null, avisos: resultado?.avisos ?? [] });
    },
    guardar() {
      const h = leerHistorial(almacen);
      const i = h.sesiones.findIndex(s => s.id === sesion.id);
      const copia = JSON.parse(JSON.stringify({ ...sesion, actualizado: ahora() }));
      if (i >= 0) h.sesiones[i] = copia; else h.sesiones.unshift(copia);
      h.sesiones = h.sesiones.slice(0, MAX_SESIONES);
      escribirHistorial(h, almacen);
    },
    terminar(resumen) { this.guardar(); if (resumen) registrarResultado({ modo, ...resumen }, { almacen }); }
  };
}

/** Busca la última sesión guardada que contenga un ejercicio con ese id. */
export function sesionPrevia(ejercicioId, almacen = almacenPorDefecto()) {
  return leerHistorial(almacen).sesiones.find(s => s.ejercicios.some(e => e.id === ejercicioId)) ?? null;
}

/**
 * Guarda un resultado en el historial de prácticas y, si es un examen,
 * lo registra también en el progreso general como intento «Carta».
 */
export function registrarResultado(resumen, { almacen = almacenPorDefecto(), progreso = progresoSitio } = {}) {
  const h = leerHistorial(almacen);
  h.resultados.unshift({ fecha: Date.now(), ...resumen });
  h.resultados = h.resultados.slice(0, MAX_RESULTADOS);
  escribirHistorial(h, almacen);
  if (resumen.modo === 'examen') {
    progreso.registrarIntento({ modelo: 'Carta', modo: 'examen', aciertos: resumen.aciertos, total: resumen.total, apto: !!resumen.apto });
  }
}

export function resumenHistorial(h) {
  const porTipo = {};
  const simulacros = { intentos: 0, aptos: 0 };
  for (const r of h.resultados) {
    if (r.modo === 'examen') { simulacros.intentos++; if (r.apto) simulacros.aptos++; continue; }
    porTipo[r.tipo] ??= { intentos: 0, aciertos: 0 };
    porTipo[r.tipo].intentos++;
    if (r.aciertos === r.total) porTipo[r.tipo].aciertos++;
  }
  return { porTipo, simulacros };
}
