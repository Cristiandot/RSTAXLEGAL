/**
 * Corrección de formato del Libro de Remuneraciones Electrónico (LRE) para la DT.
 *
 * KAME exporta el LRE (CSV 147 columnas, ANSI, separador ";") con defectos que
 * la Dirección del Trabajo rechaza en validación. Esta función los corrige sin
 * tocar montos ni estructura, preservando codificación y conteo de columnas.
 *
 * Reglas (Manual DT v8.0 + Suplemento LRE):
 *  - Fechas 1102/1103: dd-mm-aaaa → dd/mm/aaaa.
 *  - Obligatorias que KAME deja vacías: 1170=1 (IUSC), 1118/1131/1157=0.
 *  - Jornada 1107 (contractual, no viene en el LRE): default 101 (ordinaria),
 *    PROVISIONAL — se marca para cuadrar en la nómina real de junio.
 *  - Si hay término (1103) sin causal (1104): 6 (Art. 159 N°4 vencimiento del
 *    plazo), PROVISIONAL — el usuario confirma la causal real caso a caso.
 *
 * Región (1105) y comuna (1106) NO se rellenan si vienen vacías (no se pueden
 * inferir): se cuentan en `faltaRegionComuna` para avisar.
 */

export type ResumenLre = {
  ok: boolean;
  error?: string;
  nTrabajadores: number;
  totalLiquido: number;
  cols: number;
  jornadaProvisional: number;
  causalProvisional: number;
  faltaRegionComuna: number;
  fechasCorregidas: number;
  /** Trabajadores cuyo líquido venía negativo y se llevó a 0 (la DT no acepta montos negativos). */
  negativosACero: number;
};

const CODES: Record<string, string> = {
  ini: "1102", ter: "1103", cau: "1104", reg: "1105", com: "1106",
  imp: "1170", jor: "1107", joven: "1118", iate: "1131", apvc: "1157",
  liq: "5501",
};

const vacio = (v: string | undefined) => !v || !v.trim();

export function corregirLreDt(input: Buffer): { output: Buffer; resumen: ResumenLre } {
  const base: ResumenLre = {
    ok: false, nTrabajadores: 0, totalLiquido: 0, cols: 0,
    jornadaProvisional: 0, causalProvisional: 0, faltaRegionComuna: 0, fechasCorregidas: 0,
    negativosACero: 0,
  };

  const text = input.toString("latin1");
  const lines = text.split(/\r?\n/);
  if (lines.length < 2 || !lines[0].includes("(1101)")) {
    return { output: input, resumen: { ...base, error: "El archivo no parece un LRE de KAME (falta el encabezado con Rut trabajador(1101))." } };
  }

  const header = lines[0].split(";");
  const nCols = header.length;
  const idx = (c: string) => header.findIndex((h) => h.includes(`(${c})`));
  const I: Record<string, number> = {};
  for (const [k, c] of Object.entries(CODES)) I[k] = idx(c);

  for (const k of ["ini", "ter", "cau", "imp", "jor", "joven", "iate", "apvc"] as const) {
    if (I[k] < 0) {
      return { output: input, resumen: { ...base, error: `Falta la columna obligatoria (${CODES[k]}) en el encabezado.` } };
    }
  }

  const out: string[] = [lines[0]];
  let n = 0, liq = 0, jorP = 0, cauP = 0, faltaRC = 0, fechas = 0, neg = 0;

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const c = lines[i].split(";");
    if (c.length !== nCols) {
      return { output: input, resumen: { ...base, error: `La fila ${i + 1} tiene ${c.length} columnas (se esperaban ${nCols}).` } };
    }

    if (/-/.test(c[I.ini] ?? "")) { c[I.ini] = c[I.ini].replace(/-/g, "/"); fechas++; }
    if (!vacio(c[I.ter]) && /-/.test(c[I.ter])) { c[I.ter] = c[I.ter].replace(/-/g, "/"); fechas++; }

    if (vacio(c[I.imp])) c[I.imp] = "1";
    if (vacio(c[I.jor])) { c[I.jor] = "101"; jorP++; }
    if (vacio(c[I.joven])) c[I.joven] = "0";
    if (vacio(c[I.iate])) c[I.iate] = "0";
    if (vacio(c[I.apvc])) c[I.apvc] = "0";
    if (!vacio(c[I.ter]) && vacio(c[I.cau])) { c[I.cau] = "6"; cauP++; }
    if (I.reg >= 0 && I.com >= 0 && (vacio(c[I.reg]) || vacio(c[I.com]))) faltaRC++;

    if (I.liq >= 0 && (Number(c[I.liq]) || 0) < 0) neg++;
    // La DT no acepta montos negativos: todo monto negativo se lleva a 0.
    for (let j = 0; j < c.length; j++) if (/^-\d/.test(c[j])) c[j] = "0";

    n++;
    if (I.liq >= 0) liq += Number(c[I.liq]) || 0;
    out.push(c.join(";"));
  }

  return {
    output: Buffer.from(out.join("\r\n"), "latin1"),
    resumen: {
      ok: true, nTrabajadores: n, totalLiquido: liq, cols: nCols,
      jornadaProvisional: jorP, causalProvisional: cauP, faltaRegionComuna: faltaRC, fechasCorregidas: fechas,
      negativosACero: neg,
    },
  };
}
