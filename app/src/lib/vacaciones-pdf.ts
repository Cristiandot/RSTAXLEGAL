/**
 * Generación de comprobantes PDF del control de vacaciones Red Barrera
 * (PAP papeleta de vacaciones, PER permiso, REC reconocimiento de progresivos).
 * Replica el formato de los comprobantes históricos emitidos por los scripts
 * Python (reportlab) del sistema original: encabezado de empresa, título,
 * secciones con barra, bloque de firmas y pie con correlativo.
 */

import { PDFDocument, StandardFonts, rgb, degrees, type PDFFont, type PDFPage } from "pdf-lib";
import { fechaCl, formatDias } from "@/lib/vacaciones-control";

const A4: [number, number] = [595.28, 841.89];
const MARGEN = 48;
const ANCHO = A4[0] - MARGEN * 2;
const GRIS_BARRA = rgb(0.33, 0.39, 0.47);
const GRIS_LABEL = rgb(0.45, 0.45, 0.45);
const NEGRO = rgb(0.1, 0.1, 0.1);

export type DatosEmpresaPdf = {
  razonSocial: string;
  rut: string;
  giro: string;
  direccion: string;
  email: string;
  telefono: string;
};

/** Datos de empresa según hoja "Parámetros" del Excel maestro Red Barrera. */
export const EMPRESA_RED_BARRERA: DatosEmpresaPdf = {
  razonSocial: "DISTRIBUIDORA BARRERA Y CIA. LTDA.",
  rut: "85.274.100-7",
  giro: "Comercialización de repuestos y servicio mecánico",
  direccion: "Calle Maipú N° 505, Quillota, Región de Valparaíso",
  email: "",
  telefono: "",
};

export type DatosPdfDocumento = {
  correlativo: string;
  fechaEmision: string; // ISO
  trabajadorNombre: string;
  trabajadorRut: string;
  cargo: string;
  fechaIngreso: string; // ISO
  // PAP
  fechaDesde?: string;
  fechaHasta?: string;
  tipoDias?: string;
  dias?: number;
  desgloseTexto?: string;
  saldoAnterior?: number;
  saldoFinal?: number;
  saldosFinales?: { periodo: string; dias: number }[];
  // PER
  permisoTipo?: string;
  conGoce?: boolean;
  unidad?: string;
  cantidad?: number;
  // REC
  diasReconocidos?: number;
  respaldo?: string;
  observacion?: string;
  anulado?: boolean;
};

/** WinAnsi no cubre todo unicode: normalizar caracteres problemáticos. */
function limpiar(s: string): string {
  return (s ?? "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/→/g, "->")
    .replace(/≈/g, "~")
    .replace(/[✓✔]/g, "OK")
    .replace(/[^\x00-\xFF–—]/g, "?");
}

type Ctx = {
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  y: number;
};

function texto(c: Ctx, s: string, x: number, size: number, opts?: { bold?: boolean; color?: ReturnType<typeof rgb> }) {
  c.page.drawText(limpiar(s), {
    x,
    y: c.y,
    size,
    font: opts?.bold ? c.bold : c.font,
    color: opts?.color ?? NEGRO,
  });
}

function envolver(s: string, font: PDFFont, size: number, maxAncho: number): string[] {
  const palabras = limpiar(s).split(/\s+/);
  const lineas: string[] = [];
  let actual = "";
  for (const p of palabras) {
    const intento = actual ? actual + " " + p : p;
    if (font.widthOfTextAtSize(intento, size) <= maxAncho) {
      actual = intento;
    } else {
      if (actual) lineas.push(actual);
      actual = p;
    }
  }
  if (actual) lineas.push(actual);
  return lineas.length ? lineas : [""];
}

function barraSeccion(c: Ctx, titulo: string) {
  c.y -= 22;
  c.page.drawRectangle({ x: MARGEN, y: c.y - 4, width: ANCHO, height: 16, color: GRIS_BARRA });
  c.page.drawText(limpiar(titulo), { x: MARGEN + 8, y: c.y, size: 9, font: c.bold, color: rgb(1, 1, 1) });
  c.y -= 16;
}

/**
 * Fila etiqueta/valor a una columna. `derecha` alinea el valor al margen
 * derecho (sección "efecto de la solicitud", como los comprobantes históricos)
 * y evita choques con etiquetas largas.
 */
function fila(c: Ctx, etiqueta: string, valor: string, opts?: { valorBold?: boolean; derecha?: boolean }) {
  c.y -= 15;
  texto(c, etiqueta, MARGEN + 8, 7.5, { bold: true, color: GRIS_LABEL });
  const fontValor = opts?.valorBold ? c.bold : c.font;
  if (opts?.derecha) {
    const w = fontValor.widthOfTextAtSize(limpiar(valor), 9.5);
    c.page.drawText(limpiar(valor), { x: MARGEN + ANCHO - 8 - w, y: c.y, size: 9.5, font: fontValor, color: NEGRO });
    return;
  }
  const etiquetaW = c.bold.widthOfTextAtSize(limpiar(etiqueta), 7.5);
  const xValor = Math.max(MARGEN + 150, MARGEN + 8 + etiquetaW + 12);
  const lineas = envolver(valor, c.font, 9.5, MARGEN + ANCHO - xValor - 8);
  for (let i = 0; i < lineas.length; i++) {
    if (i > 0) c.y -= 12;
    c.page.drawText(lineas[i], { x: xValor, y: c.y, size: 9.5, font: fontValor, color: NEGRO });
  }
}

/** Fila con dos pares etiqueta/valor en la misma línea (v1 envuelve si es largo). */
function fila2(c: Ctx, e1: string, v1: string, e2: string, v2: string) {
  c.y -= 15;
  const mitad = MARGEN + ANCHO / 2;
  const y0 = c.y;
  texto(c, e1, MARGEN + 8, 7.5, { bold: true, color: GRIS_LABEL });
  const lineas1 = envolver(v1, c.font, 9.5, mitad - (MARGEN + 118) - 10);
  for (let i = 0; i < lineas1.length; i++) {
    c.page.drawText(lineas1[i], { x: MARGEN + 118, y: y0 - i * 11, size: 9.5, font: c.font, color: NEGRO });
  }
  texto(c, e2, mitad + 8, 7.5, { bold: true, color: GRIS_LABEL });
  const lineas2 = envolver(v2, c.font, 9.5, MARGEN + ANCHO - (mitad + 100) - 8);
  for (let i = 0; i < lineas2.length; i++) {
    c.page.drawText(lineas2[i], { x: mitad + 100, y: y0 - i * 11, size: 9.5, font: c.font, color: NEGRO });
  }
  c.y -= (Math.max(lineas1.length, lineas2.length) - 1) * 11;
}

function encabezadoEmpresa(c: Ctx, emp: DatosEmpresaPdf) {
  const anchoTitulo = c.bold.widthOfTextAtSize(limpiar(emp.razonSocial), 12);
  c.page.drawText(limpiar(emp.razonSocial), {
    x: MARGEN + (ANCHO - anchoTitulo) / 2,
    y: c.y,
    size: 12,
    font: c.bold,
    color: rgb(0.15, 0.25, 0.4),
  });
  c.y -= 16;
  const mitad = MARGEN + ANCHO / 2 + 30;
  texto(c, "RUT: " + emp.rut, MARGEN, 8);
  const giroLineas = envolver("GIRO: " + emp.giro, c.font, 8, ANCHO / 2 - 40);
  for (let i = 0; i < giroLineas.length; i++) {
    c.page.drawText(giroLineas[i], { x: mitad, y: c.y - i * 10, size: 8, font: c.font, color: NEGRO });
  }
  c.y -= Math.max(1, giroLineas.length) * 10 + 2;
  texto(c, "DIRECCIÓN: " + emp.direccion, MARGEN, 8);
  texto(c, "E-MAIL: " + emp.email, mitad, 8);
  c.y -= 12;
  texto(c, "TELÉFONO: " + emp.telefono, MARGEN, 8);
  c.y -= 10;
  c.page.drawLine({
    start: { x: MARGEN, y: c.y },
    end: { x: MARGEN + ANCHO, y: c.y },
    thickness: 0.8,
    color: rgb(0.3, 0.3, 0.3),
  });
}

function tituloDocumento(c: Ctx, titulo: string, fechaEmisionIso: string) {
  c.y -= 30;
  const w = c.bold.widthOfTextAtSize(limpiar(titulo), 12.5);
  c.page.drawText(limpiar(titulo), {
    x: MARGEN + (ANCHO - w) / 2,
    y: c.y,
    size: 12.5,
    font: c.bold,
    color: rgb(0.15, 0.25, 0.4),
  });
  c.y -= 16;
  const f = "Fecha Emisión: " + fechaCl(fechaEmisionIso);
  const wf = c.bold.widthOfTextAtSize(f, 9);
  c.page.drawText(f, { x: MARGEN + (ANCHO - wf) / 2, y: c.y, size: 9, font: c.bold, color: NEGRO });
}

function bloqueFirmas(c: Ctx, nombre: string, rut: string) {
  const yFirma = 150;
  const col1 = MARGEN + 30;
  const col2 = MARGEN + ANCHO / 2 + 30;
  const anchoLinea = ANCHO / 2 - 60;
  for (const x of [col1, col2]) {
    c.page.drawLine({
      start: { x, y: yFirma },
      end: { x: x + anchoLinea, y: yFirma },
      thickness: 0.7,
      color: NEGRO,
    });
  }
  const centrado = (s: string, x0: number, size: number, f: PDFFont, y: number) => {
    const w = f.widthOfTextAtSize(limpiar(s), size);
    c.page.drawText(limpiar(s), { x: x0 + (anchoLinea - w) / 2, y, size, font: f, color: NEGRO });
  };
  centrado("FIRMA DEL TRABAJADOR / A", col1, 8.5, c.bold, yFirma - 14);
  centrado(nombre, col1, 8, c.font, yFirma - 26);
  centrado("RUT: " + rut, col1, 8, c.font, yFirma - 38);
  centrado("AUTORIZACIÓN DE LA EMPRESA", col2, 8.5, c.bold, yFirma - 14);
  centrado("Jefatura Directa / RRHH", col2, 8, c.font, yFirma - 26);
}

function pie(c: Ctx, correlativo: string) {
  const ahora = new Date();
  const f = `${String(ahora.getDate()).padStart(2, "0")}/${String(ahora.getMonth() + 1).padStart(2, "0")}/${ahora.getFullYear()}`;
  const h = `${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}:${String(ahora.getSeconds()).padStart(2, "0")}`;
  const s = `Documento generado el ${f} a las ${h} — N° ${correlativo}`;
  const w = c.font.widthOfTextAtSize(limpiar(s), 7.5);
  c.page.drawText(limpiar(s), {
    x: MARGEN + (ANCHO - w) / 2,
    y: 90,
    size: 7.5,
    font: c.font,
    color: rgb(0.55, 0.55, 0.55),
  });
}

function selloAnulado(c: Ctx, etiqueta: string) {
  const w = c.bold.widthOfTextAtSize(etiqueta, 72);
  c.page.drawText(etiqueta, {
    x: (A4[0] - w * Math.cos(Math.PI / 5)) / 2,
    y: A4[1] / 2 - 100,
    size: 72,
    font: c.bold,
    color: rgb(0.85, 0.1, 0.1),
    opacity: 0.28,
    rotate: degrees(36),
  });
}

async function crearBase(emp: DatosEmpresaPdf): Promise<{ doc: PDFDocument; c: Ctx }> {
  const doc = await PDFDocument.create();
  const page = doc.addPage(A4);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const c: Ctx = { page, font, bold, y: A4[1] - 70 };
  encabezadoEmpresa(c, emp);
  return { doc, c };
}

function unidadTexto(cantidad: number, unidad: string): string {
  if (unidad === "Horas") return formatDias(cantidad) + (cantidad === 1 ? " hora" : " horas");
  return formatDias(cantidad) + (cantidad === 1 ? " día" : " días");
}

export async function generarPdfPapeleta(
  d: DatosPdfDocumento,
  emp: DatosEmpresaPdf = EMPRESA_RED_BARRERA,
): Promise<Uint8Array> {
  const { doc, c } = await crearBase(emp);
  tituloDocumento(c, "COMPROBANTE DE SOLICITUD Y AUTORIZACIÓN DE VACACIONES", d.fechaEmision);

  barraSeccion(c, "I. DATOS DEL TRABAJADOR");
  fila2(c, "NOMBRE COMPLETO:", d.trabajadorNombre, "R.U.T.:", d.trabajadorRut);
  fila2(c, "FECHA DE INGRESO:", fechaCl(d.fechaIngreso), "CARGO:", d.cargo);

  barraSeccion(c, "II. DETALLE DE LA SOLICITUD");
  fila2(c, "PERÍODO DESDE:", fechaCl(d.fechaDesde), "PERÍODO HASTA:", fechaCl(d.fechaHasta));
  fila2(c, "TIPO DE DÍAS:", d.tipoDias ?? "Normal", "TOTAL CONSUMIDO:", unidadTexto(d.dias ?? 0, "Días"));
  fila(c, "DESGLOSE:", d.desgloseTexto ?? "");
  if (d.observacion) fila(c, "OBSERVACIÓN:", `"${d.observacion}"`);

  barraSeccion(c, "III. EFECTO DE LA SOLICITUD");
  fila(c, "DÍAS ACUMULADOS (ANTERIOR A LA SOLICITUD):", unidadTexto(d.saldoAnterior ?? 0, "Días"), { valorBold: true, derecha: true });
  fila(c, "DÍAS HÁBILES SOLICITADOS (CONSUMIDOS):", unidadTexto(d.dias ?? 0, "Días"), { valorBold: true, derecha: true });
  fila(c, "SALDO FINAL:", unidadTexto(d.saldoFinal ?? 0, "Días"), { valorBold: true, derecha: true });
  for (const s of d.saldosFinales ?? []) {
    if (s.dias === 0) continue;
    fila(
      c,
      (s.periodo === "progresivos" ? "Días progresivos" : "Período " + s.periodo) + ":",
      unidadTexto(s.dias, "Días"),
      { derecha: true },
    );
  }

  bloqueFirmas(c, d.trabajadorNombre, d.trabajadorRut);
  pie(c, d.correlativo);
  if (d.anulado) selloAnulado(c, "ANULADA");
  return doc.save();
}

export async function generarPdfPermiso(
  d: DatosPdfDocumento,
  emp: DatosEmpresaPdf = EMPRESA_RED_BARRERA,
): Promise<Uint8Array> {
  const { doc, c } = await crearBase(emp);
  tituloDocumento(c, "COMPROBANTE DE SOLICITUD Y AUTORIZACIÓN DE PERMISO", d.fechaEmision);

  barraSeccion(c, "I. DATOS DEL TRABAJADOR");
  fila2(c, "NOMBRE COMPLETO:", d.trabajadorNombre, "R.U.T.:", d.trabajadorRut);
  fila2(c, "FECHA DE INGRESO:", fechaCl(d.fechaIngreso), "CARGO:", d.cargo);

  barraSeccion(c, "II. DETALLE DEL PERMISO");
  fila(c, "TIPO DE PERMISO:", d.permisoTipo ?? "", { valorBold: true });
  fila(c, "CONDICIÓN:", d.conGoce ? "Con goce de remuneraciones" : "Sin goce de remuneraciones", { valorBold: true });
  fila2(c, "PERÍODO DESDE:", fechaCl(d.fechaDesde), "PERÍODO HASTA:", fechaCl(d.fechaHasta));
  fila(c, "CONSUMIDO:", unidadTexto(d.cantidad ?? 0, d.unidad ?? "Días"), { valorBold: true });
  if (d.observacion) fila(c, "OBSERVACIÓN:", `"${d.observacion}"`);

  barraSeccion(c, "III. CONSIDERACIONES");
  c.y -= 15;
  const consideracion =
    "Este permiso NO afecta el saldo de vacaciones del trabajador. Queda registrado en la bitácora de permisos de la empresa para fines de control." +
    (d.conGoce
      ? ""
      : " El descuento de remuneración correspondiente se aplicará en la liquidación del cierre comercial respectivo.");
  for (const linea of envolver(consideracion, c.font, 9.5, ANCHO - 20)) {
    texto(c, linea, MARGEN + 8, 9.5);
    c.y -= 12;
  }

  bloqueFirmas(c, d.trabajadorNombre, d.trabajadorRut);
  pie(c, d.correlativo);
  if (d.anulado) selloAnulado(c, "ANULADO");
  return doc.save();
}

export async function generarPdfReconocimiento(
  d: DatosPdfDocumento,
  emp: DatosEmpresaPdf = EMPRESA_RED_BARRERA,
): Promise<Uint8Array> {
  const { doc, c } = await crearBase(emp);
  tituloDocumento(c, "RECONOCIMIENTO DE FERIADO PROGRESIVO — ART. 68 CT", d.fechaEmision);

  barraSeccion(c, "I. DATOS DEL TRABAJADOR");
  fila2(c, "NOMBRE COMPLETO:", d.trabajadorNombre, "R.U.T.:", d.trabajadorRut);
  fila2(c, "FECHA DE INGRESO:", fechaCl(d.fechaIngreso), "CARGO:", d.cargo);

  barraSeccion(c, "II. RECONOCIMIENTO");
  fila(c, "DÍAS RECONOCIDOS:", unidadTexto(d.diasReconocidos ?? 0, "Días"), { valorBold: true });
  fila(c, "RESPALDO DOCUMENTAL:", d.respaldo ?? "");
  if (d.observacion) fila(c, "OBSERVACIÓN:", `"${d.observacion}"`);

  barraSeccion(c, "III. EFECTO");
  fila(c, "SALDO TOTAL ANTERIOR:", unidadTexto(d.saldoAnterior ?? 0, "Días"), { valorBold: true });
  fila(c, "SALDO TOTAL FINAL:", unidadTexto(d.saldoFinal ?? 0, "Días"), { valorBold: true });
  c.y -= 18;
  const nota =
    "Los días reconocidos se agregan al saldo de días progresivos del trabajador conforme al Art. 68 del Código del Trabajo (1994), computando hasta 10 años de servicios prestados a empleadores anteriores debidamente acreditados.";
  for (const linea of envolver(nota, c.font, 9, ANCHO - 20)) {
    texto(c, linea, MARGEN + 8, 9);
    c.y -= 11;
  }

  bloqueFirmas(c, d.trabajadorNombre, d.trabajadorRut);
  pie(c, d.correlativo);
  if (d.anulado) selloAnulado(c, "ANULADO");
  return doc.save();
}
