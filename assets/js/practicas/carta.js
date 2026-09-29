/* ============================================================
   Carta didáctica: dibujo SVG desde JSON y utilidades puras
   de simbología. Las funciones puras no tocan el DOM.
   ============================================================ */

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
