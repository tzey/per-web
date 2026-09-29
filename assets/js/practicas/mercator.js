/* ============================================================
   Proyección Mercator de una carta didáctica sobre su viewBox.
   Único módulo que sabe de píxeles. El alto del viewBox se
   deriva del ancho para que la proyección sea conforme.
   ============================================================ */

import { rumboDistancia } from './geo.js';

const RAD = Math.PI / 180;

export function latitudCreciente(latGrados) {
  return Math.log(Math.tan(Math.PI / 4 + latGrados * RAD / 2));
}

export function latitudDesdeCreciente(y) {
  return (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / RAD;
}

/**
 * @param meta  { limites:{latMin,latMax,lonMin,lonMax}, viewBox:{ancho,margen} }
 */
export function crearProyeccion(meta) {
  const { latMin, latMax, lonMin, lonMax } = meta.limites;
  const margen = meta.viewBox.margen ?? 56;
  const ancho = meta.viewBox.ancho;
  const x0 = margen, x1 = ancho - margen;
  const escala = (x1 - x0) / ((lonMax - lonMin) * RAD);       // px por radián
  const yMin = latitudCreciente(latMin), yMax = latitudCreciente(latMax);
  const altoInterior = escala * (yMax - yMin);
  const y0 = margen, y1 = margen + altoInterior;
  const alto = y1 + margen;
  const marco = { x0, y0, x1, y1 };

  const aPx = ([lat, lon]) => ({
    x: x0 + (lon - lonMin) * RAD * escala,
    y: y1 - (latitudCreciente(lat) - yMin) * escala
  });

  const aGeo = (x, y) => [
    latitudDesdeCreciente(yMin + (y1 - y) / escala),
    lonMin + (x - x0) / escala / RAD
  ];

  const pxPorMinutoLon = () => escala * RAD / 60;
  const pxPorMinutoLat = lat => escala * RAD / 60 / Math.cos(lat * RAD);

  const dentroY = p => p.y >= y0 && p.y <= y1;
  const dentroX = p => p.x >= x0 && p.x <= x1;

  const enEscalaLateral = p => {
    if (!dentroY(p)) return null;
    if (p.x >= 0 && p.x < x0) return 'izq';
    if (p.x > x1 && p.x <= ancho) return 'der';
    return null;
  };

  const enEscalaLongitud = p => {
    if (!dentroX(p)) return null;
    if (p.y >= 0 && p.y < y0) return 'sup';
    if (p.y > y1 && p.y <= alto) return 'inf';
    return null;
  };

  const millasEntrePx = (p1, p2) => rumboDistancia(aGeo(p1.x, p1.y), aGeo(p2.x, p2.y)).distancia;

  /** Marcas del marco cada `paso` minutos: tipo grado | minuto | decima. */
  const graduacion = (eje, paso = 1) => {
    const [ini, fin] = eje === 'lat' ? [latMin, latMax] : [lonMin, lonMax];
    const salida = [];
    const n = Math.round((fin - ini) * 60 / paso);
    for (let i = 0; i <= n; i++) {
      const minutos = Math.round((ini * 60 + i * paso) * 1000) / 1000;
      const valor = minutos / 60;
      const enteroMin = Math.abs(minutos - Math.round(minutos)) < 1e-6;
      const tipo = enteroMin && Math.round(minutos) % 60 === 0 ? 'grado' : enteroMin ? 'minuto' : 'decima';
      const p = eje === 'lat' ? aPx([valor, lonMin]) : aPx([latMin, valor]);
      salida.push({ valor, px: eje === 'lat' ? p.y : p.x, tipo });
    }
    return salida;
  };

  return {
    viewBox: { ancho, alto, margen }, marco, escala,
    aPx, aGeo, pxPorMinutoLat, pxPorMinutoLon,
    enEscalaLateral, enEscalaLongitud, millasEntrePx, graduacion
  };
}
