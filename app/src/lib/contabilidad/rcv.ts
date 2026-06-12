/**
 * Parser de los CSV del Registro de Compras y Ventas (RCV) del SII.
 *
 * El export real del SII (sii.cl → Registro de Compras y Ventas → Descargar
 * detalle) viene separado por `;`, con una columna `Nro` al inicio y SIN
 * columna de período (el período va en el nombre del archivo:
 * `RCV_COMPRA_REGISTRO_<rut>_<YYYYMM>.csv` / `RCV_VENTA_<rut>_<YYYYMM>.csv`).
 * El workbook consolidado del contador usa otros nombres de columna y agrega
 * `Periodo` — por eso TODO se resuelve por nombre de encabezado (con alias),
 * nunca por posición.
 *
 * Signo de las notas de crédito (tipos 60/61/112): el export crudo del SII
 * las trae con montos POSITIVOS; el workbook consolidado del contador las
 * maneja NEGATIVAS. Acá se normalizan SIEMPRE a negativo (`-abs(monto)`), de
 * modo que la suma simple del período calce con el F29 (débito = Σ ventas,
 * crédito = Σ compras) y la centralización de asientos invierta sola DEBE y
 * HABER.
 */

export type LibroRcv = "compra" | "venta";

export type RcvCompraFila = {
  tipo_doc: number;
  tipo_compra: string | null;
  rut_proveedor: string;
  razon_social: string | null;
  folio: string;
  fecha_docto: string | null;
  fecha_recepcion: string | null;
  fecha_acuse: string | null;
  monto_exento: number;
  monto_neto: number;
  iva_recuperable: number;
  iva_no_recuperable: number;
  codigo_iva_no_rec: string | null;
  monto_total: number;
  neto_activo_fijo: number;
  iva_activo_fijo: number;
  iva_uso_comun: number;
  impto_sin_credito: number;
  iva_no_retenido: number;
  otro_imp_codigo: string | null;
  otro_imp_valor: number;
  otro_imp_tasa: number | null;
};

export type RcvVentaFila = {
  tipo_doc: number;
  tipo_venta: string | null;
  rut_cliente: string | null;
  razon_social: string | null;
  folio: string;
  fecha_docto: string | null;
  fecha_recepcion: string | null;
  fecha_acuse: string | null;
  fecha_reclamo: string | null;
  monto_exento: number;
  monto_neto: number;
  monto_iva: number;
  monto_total: number;
  iva_retenido_total: number;
  iva_retenido_parcial: number;
  iva_no_retenido: number;
  iva_propio: number;
  iva_terceros: number;
  iva_fuera_plazo: number;
  credito_constructoras: number;
  otro_imp_codigo: string | null;
  otro_imp_valor: number;
  otro_imp_tasa: number | null;
};

export type ResultadoRcv =
  | { ok: true; libro: "compra"; filas: RcvCompraFila[]; advertencias: string[] }
  | { ok: true; libro: "venta"; filas: RcvVentaFila[]; advertencias: string[] }
  | { ok: false; error: string };

/** Nombres legibles de los tipos de documento del RCV. */
export const TIPOS_DOC_RCV: Record<number, string> = {
  30: "Factura (papel)",
  32: "Factura exenta (papel)",
  33: "Factura electrónica",
  34: "Factura exenta",
  35: "Boleta (papel)",
  39: "Boleta electrónica",
  41: "Boleta exenta",
  45: "Factura de compra (papel)",
  46: "Factura de compra",
  56: "Nota de débito",
  60: "Nota de crédito (papel)",
  61: "Nota de crédito",
  110: "Factura de exportación",
  111: "Nota de débito exportación",
  112: "Nota de crédito exportación",
};

export function nombreTipoDoc(tipo: number): string {
  return TIPOS_DOC_RCV[tipo] ?? `Tipo ${tipo}`;
}

/**
 * Decodifica el archivo: UTF-8 con fallback a Windows-1252 (los CSV del SII
 * suelen venir en Latin-1 — razones sociales con Ñ/tildes). Quita el BOM.
 */
export function decodificarCsv(bytes: Uint8Array): string {
  let texto = new TextDecoder("utf-8").decode(bytes);
  if (texto.includes("�")) {
    texto = new TextDecoder("windows-1252").decode(bytes);
  }
  return texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
}

/** `RCV_COMPRA_REGISTRO_78073973-8_202501.csv` → `2025-01` (null si no hay). */
export function periodoDesdeNombre(nombre: string): string | null {
  const m = nombre.match(/(\d{4})(0[1-9]|1[0-2])/);
  return m ? `${m[1]}-${m[2]}` : null;
}

/** Normaliza un encabezado: minúsculas, sin tildes, sin puntos, espacios simples. */
function normalizarEncabezado(h: string): string {
  return Array.from(h.normalize("NFD"))
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code < 0x300 || code > 0x36f;
    })
    .join("")
    .toLowerCase()
    .replace(/[.]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Divide una línea CSV respetando comillas dobles. */
function dividirLinea(linea: string): string[] {
  if (!linea.includes('"')) return linea.split(";");
  const campos: string[] = [];
  let actual = "";
  let enComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i];
    if (ch === '"') {
      if (enComillas && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else {
        enComillas = !enComillas;
      }
    } else if (ch === ";" && !enComillas) {
      campos.push(actual);
      actual = "";
    } else {
      actual += ch;
    }
  }
  campos.push(actual);
  return campos;
}

/** Entero CLP: "2.097.500" / "2097500" / "-879" / "" → number (vacío = 0). */
function parseEntero(v: string | undefined): number {
  if (!v) return 0;
  const limpio = v.replace(/\./g, "").replace(/\s/g, "").replace(",", ".").trim();
  if (!limpio || limpio === "-") return 0;
  const n = Number(limpio);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** Decimal (tasas): coma o punto decimal. Vacío → null. */
function parseDecimal(v: string | undefined): number | null {
  if (!v) return null;
  const limpio = v.replace(",", ".").trim();
  if (!limpio || limpio === "-") return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

/** Texto: trim; vacío o "-" → null. */
function parseTexto(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  return t && t !== "-" ? t : null;
}

/** `31/12/2025` → `2025-12-31`; `05/01/2026 12:17:12` → `2026-01-05 12:17:12`. */
function parseFecha(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  if (!t) return null;
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}:\d{2}(?::\d{2})?))?/);
  if (!m) return null;
  const fecha = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return m[4] ? `${fecha} ${m[4]}` : fecha;
}

/** Tipos de documento que RESTAN en el período (notas de crédito). */
const TIPOS_NC = new Set([60, 61, 112]);

/**
 * Normaliza el signo de los campos monetarios de una NC: siempre negativos,
 * venga como venga el CSV (el SII las exporta positivas; el workbook del
 * contador las trae negativas).
 */
function normalizarNC<T extends Record<string, unknown>>(
  fila: T,
  tipoDoc: number,
): T {
  if (!TIPOS_NC.has(tipoDoc)) return fila;
  for (const k of Object.keys(fila)) {
    const v = fila[k];
    if (typeof v === "number" && k !== "tipo_doc" && k !== "otro_imp_tasa") {
      (fila as Record<string, unknown>)[k] = -Math.abs(v);
    }
  }
  return fila;
}

type Indices = Map<string, number>;

/** Busca el índice de la primera alias presente en los encabezados. */
function idx(indices: Indices, ...alias: string[]): number {
  for (const a of alias) {
    const i = indices.get(a);
    if (i !== undefined) return i;
  }
  return -1;
}

function campo(celdas: string[], i: number): string | undefined {
  return i >= 0 ? celdas[i] : undefined;
}

/**
 * Parsea el contenido de un CSV del RCV. Detecta solo si es libro de compras
 * (encabezado "RUT Proveedor") o de ventas ("Rut cliente").
 */
export function parsearRcv(texto: string): ResultadoRcv {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lineas.length < 2) {
    return { ok: false, error: "El archivo no tiene filas de datos." };
  }

  const encabezados = dividirLinea(lineas[0]).map(normalizarEncabezado);
  const indices: Indices = new Map();
  encabezados.forEach((h, i) => {
    if (!indices.has(h)) indices.set(h, i);
  });

  const esCompra = idx(indices, "rut proveedor") >= 0;
  const esVenta = idx(indices, "rut cliente") >= 0;
  if (!esCompra && !esVenta) {
    return {
      ok: false,
      error:
        "No parece un CSV del RCV del SII: no se encontró la columna RUT Proveedor (compras) ni Rut cliente (ventas).",
    };
  }

  const advertencias: string[] = [];
  const iTipoDoc = idx(indices, "tipo doc", "tipo docto");
  const iFolio = idx(indices, "folio");
  if (iTipoDoc < 0 || iFolio < 0) {
    return { ok: false, error: "El CSV no tiene las columnas Tipo Doc y Folio." };
  }

  if (esCompra) {
    const col = {
      tipoCompra: idx(indices, "tipo compra"),
      rut: idx(indices, "rut proveedor"),
      razon: idx(indices, "razon social"),
      fDocto: idx(indices, "fecha docto"),
      fRecep: idx(indices, "fecha recepcion"),
      fAcuse: idx(indices, "fecha acuse", "fecha acuse recibo"),
      exento: idx(indices, "monto exento"),
      neto: idx(indices, "monto neto"),
      ivaRec: idx(indices, "monto iva recuperable", "iva recuperable"),
      ivaNoRec: idx(indices, "monto iva no recuperable", "iva no recuperable"),
      codNoRec: idx(indices, "codigo iva no rec", "cod iva no rec"),
      total: idx(indices, "monto total"),
      netoAF: idx(indices, "monto neto activo fijo", "neto activo fijo"),
      ivaAF: idx(indices, "iva activo fijo"),
      ivaUC: idx(indices, "iva uso comun"),
      sinCred: idx(indices, "impto sin derecho a credito", "impto sin cred", "impto sin credito"),
      ivaNoRet: idx(indices, "iva no retenido"),
      otroCod: idx(indices, "codigo otro impuesto", "cod otro imp", "codigo otro imp"),
      otroVal: idx(indices, "valor otro impuesto", "valor otro imp"),
      otroTasa: idx(indices, "tasa otro impuesto", "tasa otro imp"),
    };

    const filas: RcvCompraFila[] = [];
    for (let n = 1; n < lineas.length; n++) {
      const c = dividirLinea(lineas[n]);
      const tipoDoc = parseEntero(campo(c, iTipoDoc));
      const folio = parseTexto(campo(c, iFolio));
      const rut = parseTexto(campo(c, col.rut));
      if (!tipoDoc || !folio || !rut) {
        if (c.some((v) => v.trim() !== "")) {
          advertencias.push(`Línea ${n + 1} omitida (sin tipo doc, folio o RUT).`);
        }
        continue;
      }
      filas.push(normalizarNC({
        tipo_doc: tipoDoc,
        tipo_compra: parseTexto(campo(c, col.tipoCompra)),
        rut_proveedor: rut,
        razon_social: parseTexto(campo(c, col.razon)),
        folio,
        fecha_docto: parseFecha(campo(c, col.fDocto)),
        fecha_recepcion: parseFecha(campo(c, col.fRecep)),
        fecha_acuse: parseFecha(campo(c, col.fAcuse)),
        monto_exento: parseEntero(campo(c, col.exento)),
        monto_neto: parseEntero(campo(c, col.neto)),
        iva_recuperable: parseEntero(campo(c, col.ivaRec)),
        iva_no_recuperable: parseEntero(campo(c, col.ivaNoRec)),
        codigo_iva_no_rec: parseTexto(campo(c, col.codNoRec)),
        monto_total: parseEntero(campo(c, col.total)),
        neto_activo_fijo: parseEntero(campo(c, col.netoAF)),
        iva_activo_fijo: parseEntero(campo(c, col.ivaAF)),
        iva_uso_comun: parseEntero(campo(c, col.ivaUC)),
        impto_sin_credito: parseEntero(campo(c, col.sinCred)),
        iva_no_retenido: parseEntero(campo(c, col.ivaNoRet)),
        otro_imp_codigo: parseTexto(campo(c, col.otroCod)),
        otro_imp_valor: parseEntero(campo(c, col.otroVal)),
        otro_imp_tasa: parseDecimal(campo(c, col.otroTasa)),
      }, tipoDoc));
    }
    return { ok: true, libro: "compra", filas, advertencias };
  }

  const col = {
    tipoVenta: idx(indices, "tipo venta"),
    rut: idx(indices, "rut cliente"),
    razon: idx(indices, "razon social"),
    fDocto: idx(indices, "fecha docto"),
    fRecep: idx(indices, "fecha recepcion"),
    fAcuse: idx(indices, "fecha acuse recibo", "fecha acuse"),
    fReclamo: idx(indices, "fecha reclamo"),
    exento: idx(indices, "monto exento"),
    neto: idx(indices, "monto neto"),
    iva: idx(indices, "monto iva"),
    total: idx(indices, "monto total"),
    retTotal: idx(indices, "iva retenido total"),
    retParcial: idx(indices, "iva retenido parcial"),
    noRet: idx(indices, "iva no retenido"),
    propio: idx(indices, "iva propio"),
    terceros: idx(indices, "iva terceros"),
    fueraPlazo: idx(indices, "iva fuera de plazo", "iva fuera plazo"),
    constructora: idx(indices, "credito empresa constructora", "credito constr"),
    otroCod: idx(indices, "codigo otro imp", "otro imp cod", "codigo otro impuesto"),
    otroVal: idx(indices, "valor otro imp", "otro imp valor", "valor otro impuesto"),
    otroTasa: idx(indices, "tasa otro imp", "tasa otro impuesto"),
  };

  const filas: RcvVentaFila[] = [];
  for (let n = 1; n < lineas.length; n++) {
    const c = dividirLinea(lineas[n]);
    const tipoDoc = parseEntero(campo(c, iTipoDoc));
    const folio = parseTexto(campo(c, iFolio));
    if (!tipoDoc || !folio) {
      if (c.some((v) => v.trim() !== "")) {
        advertencias.push(`Línea ${n + 1} omitida (sin tipo doc o folio).`);
      }
      continue;
    }
    filas.push(normalizarNC({
      tipo_doc: tipoDoc,
      tipo_venta: parseTexto(campo(c, col.tipoVenta)),
      rut_cliente: parseTexto(campo(c, col.rut)),
      razon_social: parseTexto(campo(c, col.razon)),
      folio,
      fecha_docto: parseFecha(campo(c, col.fDocto)),
      fecha_recepcion: parseFecha(campo(c, col.fRecep)),
      fecha_acuse: parseFecha(campo(c, col.fAcuse)),
      fecha_reclamo: parseFecha(campo(c, col.fReclamo)),
      monto_exento: parseEntero(campo(c, col.exento)),
      monto_neto: parseEntero(campo(c, col.neto)),
      monto_iva: parseEntero(campo(c, col.iva)),
      monto_total: parseEntero(campo(c, col.total)),
      iva_retenido_total: parseEntero(campo(c, col.retTotal)),
      iva_retenido_parcial: parseEntero(campo(c, col.retParcial)),
      iva_no_retenido: parseEntero(campo(c, col.noRet)),
      iva_propio: parseEntero(campo(c, col.propio)),
      iva_terceros: parseEntero(campo(c, col.terceros)),
      iva_fuera_plazo: parseEntero(campo(c, col.fueraPlazo)),
      credito_constructoras: parseEntero(campo(c, col.constructora)),
      otro_imp_codigo: parseTexto(campo(c, col.otroCod)),
      otro_imp_valor: parseEntero(campo(c, col.otroVal)),
      otro_imp_tasa: parseDecimal(campo(c, col.otroTasa)),
    }, tipoDoc));
  }
  return { ok: true, libro: "venta", filas, advertencias };
}
