import PizZip from "pizzip";

/**
 * Parsers de cartola bancaria (servidor). Convierten el archivo que sube el
 * cliente en movimientos normalizados para banco_movimiento. Hoy:
 *   - mercadopago : export "cartola" de MP (5 columnas).
 *   - generico    : xlsx/csv con encabezados (mapea fecha/glosa/cargo/abono/monto).
 * Es el mismo criterio del script scripts/cargar-cartola.mjs, portado a TS y
 * compartido por la carga interna y el portal del cliente.
 */

export type ParsedMov = {
  fecha: string;
  fecha_hora: string | null;
  glosa: string | null;
  descripcion: string | null;
  rut_contraparte: string | null;
  nombre_contraparte: string | null;
  referencia: string | null;
  referencia_grupo: string | null;
  abono: number;
  cargo: number;
  saldo: number | null;
  categoria: string | null;
  estado: "pendiente" | "ignorado";
  hash: string;
};

export type ParseResult = {
  movimientos: ParsedMov[];
  error?: string;
};

// ── helpers numéricos ──
// Formato máquina (punto decimal): así vienen los importes de Mercado Pago.
const numMaquina = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
// Formato chileno ("1.234.567,89"): para cartolas de banco.
const numCL = (v: unknown) => {
  let s = String(v ?? "").replace(/[^0-9.,\-]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

function decodeEnt(s: string): string {
  return (s || "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&amp;/g, "&");
}
function colIndex(ref: string): number {
  const m = ref.match(/^([A-Z]+)\d+$/);
  if (!m) return -1;
  let n = 0;
  for (const c of m[1]) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

/** Lee un xlsx a matriz de filas (inlineStr, sharedStrings y <v> plano). */
export function parseXlsx(buf: Buffer | Uint8Array): string[][] {
  const zip = new PizZip(buf);
  const ssFile = zip.file("xl/sharedStrings.xml");
  const strs = ssFile
    ? [...ssFile.asText().matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
        decodeEnt([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")))
    : [];
  const shName = zip.file("xl/worksheets/sheet1.xml")
    ? "xl/worksheets/sheet1.xml"
    : Object.keys(zip.files).find((k) => /^xl\/worksheets\/.*\.xml$/.test(k));
  if (!shName) return [];
  const sh = zip.file(shName)!.asText();
  return [...sh.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((r) => {
    const arr: string[] = [];
    for (const c of r[1].matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const idx = colIndex(c[1]);
      const tipo = (c[2].match(/t="([^"]+)"/) || [])[1];
      const inner = c[3] || "";
      if (tipo === "inlineStr") {
        arr[idx] = decodeEnt([...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(""));
      } else {
        const vm = inner.match(/<v>([\s\S]*?)<\/v>/);
        arr[idx] = vm ? (tipo === "s" ? strs[+vm[1]] : decodeEnt(vm[1])) : "";
      }
    }
    return arr;
  });
}

/** CSV con separador ; o , (autodetectado por el encabezado). */
export function parseCsv(text: string): string[][] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (!lines.length) return [];
  const sep = (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  return lines.map((l) => l.split(sep).map((c) => c.replace(/^"|"$/g, "").trim()));
}

// Fecha local Chile (America/Santiago) a partir de un ISO/uso general.
function fechaChile(v: string): string | null {
  const s = String(v).trim();
  const iso = new Date(s);
  if (!isNaN(iso.getTime()) && /\d{4}-\d{2}-\d{2}/.test(s)) {
    return iso.toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
  }
  const dmy = s.match(/(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})/);
  if (dmy) {
    const yyyy = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${yyyy}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }
  const ymd = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  return ymd ? `${ymd[1]}-${ymd[2]}-${ymd[3]}` : null;
}

// ── Mercado Pago ──
function parseMercadoPago(rows: string[][]): ParsedMov[] {
  const movs: ParsedMov[] = [];
  for (const r of rows) {
    const a = (r[0] ?? "").toString().trim();
    if (!a || /^fecha de pago$/i.test(a)) continue;
    const tipo = (r[1] ?? "").toString().trim();
    const nroMov = (r[2] ?? "").toString().trim();
    const opRel = (r[3] ?? "").toString().trim();
    const importe = Math.round(numMaquina(r[4]));
    const fecha = fechaChile(a);
    if (!fecha) continue;
    let categoria: string | null = null;
    if (/costo de mercado pago|anulaci[oó]n parcial de costo/i.test(tipo)) categoria = "comision";
    else if (/conversi[oó]n por pago en moneda/i.test(tipo)) categoria = "cambio_moneda";
    movs.push({
      fecha,
      fecha_hora: /\dT\d/.test(a) ? new Date(a).toISOString() : null,
      glosa: tipo || null,
      descripcion: null,
      rut_contraparte: null,
      nombre_contraparte: null,
      referencia: nroMov || null,
      referencia_grupo: opRel || null,
      abono: importe > 0 ? importe : 0,
      cargo: importe < 0 ? -importe : 0,
      saldo: null,
      categoria,
      estado: importe === 0 ? "ignorado" : "pendiente",
      hash: nroMov ? `mp:${nroMov}` : `mp:${fecha}:${importe}:${opRel}`,
    });
  }
  return movs;
}

// ── Genérico (mapeo por encabezado) ──
const RUT_RE = /(\d{1,2}\.?\d{3}\.?\d{3}-?[\dkK])/;
function parseGenerico(rows: string[][]): ParseResult {
  if (rows.length < 2) return { movimientos: [], error: "El archivo no tiene filas de datos." };
  // Buscar la fila de encabezado (la que tenga 'fecha').
  let hi = rows.findIndex((r) => r.some((c) => /fecha/i.test(c ?? "")));
  if (hi < 0) hi = 0;
  const head = rows[hi].map((c) => (c ?? "").toString().toLowerCase().trim());
  const col = (re: RegExp) => head.findIndex((h) => re.test(h));
  const iFecha = col(/fecha/);
  const iGlosa = col(/glosa|descrip|detalle|concepto|movimiento/);
  const iCargo = col(/cargo|d[eé]bito|giro/);
  const iAbono = col(/abono|cr[eé]dito|dep[oó]sito/);
  const iMonto = col(/monto|importe|valor/);
  const iSaldo = col(/saldo/);
  if (iFecha < 0 || (iCargo < 0 && iAbono < 0 && iMonto < 0)) {
    return { movimientos: [], error: "No se reconocieron columnas de fecha y montos. Revisa el encabezado." };
  }
  const vistos = new Map<string, number>();
  const movs: ParsedMov[] = [];
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i];
    const fecha = fechaChile(r[iFecha] ?? "");
    if (!fecha) continue;
    let abono = 0;
    let cargo = 0;
    if (iCargo >= 0 || iAbono >= 0) {
      cargo = Math.round(Math.abs(numCL(r[iCargo] ?? 0)));
      abono = Math.round(Math.abs(numCL(r[iAbono] ?? 0)));
    } else {
      const m = Math.round(numCL(r[iMonto] ?? 0));
      abono = m > 0 ? m : 0;
      cargo = m < 0 ? -m : 0;
    }
    if (abono === 0 && cargo === 0) continue;
    const glosa = iGlosa >= 0 ? (r[iGlosa] ?? "").toString().trim() : null;
    const rutM = (r[iGlosa] ?? "").toString().match(RUT_RE);
    const base = `${fecha}|${cargo}|${abono}|${glosa ?? ""}`;
    const nth = (vistos.get(base) ?? 0) + 1;
    vistos.set(base, nth);
    movs.push({
      fecha,
      fecha_hora: null,
      glosa: glosa || null,
      descripcion: null,
      rut_contraparte: rutM ? rutM[1] : null,
      nombre_contraparte: null,
      referencia: null,
      referencia_grupo: null,
      abono,
      cargo,
      saldo: iSaldo >= 0 ? Math.round(numCL(r[iSaldo] ?? 0)) : null,
      categoria: null,
      estado: "pendiente",
      hash: `gen:${base}:${nth}`,
    });
  }
  return { movimientos: movs };
}

/** Punto de entrada: parsea según la fuente y el tipo de archivo. */
export function parseCartola(input: {
  fuente: string;
  filename: string;
  buffer: Buffer | Uint8Array;
}): ParseResult {
  const esXlsx = /\.xlsx$/i.test(input.filename);
  let rows: string[][];
  try {
    rows = esXlsx
      ? parseXlsx(input.buffer)
      : parseCsv(Buffer.from(input.buffer).toString("utf8"));
  } catch (e) {
    return { movimientos: [], error: `No se pudo leer el archivo: ${(e as Error).message}` };
  }
  if (input.fuente === "mercadopago") return { movimientos: parseMercadoPago(rows) };
  return parseGenerico(rows);
}
