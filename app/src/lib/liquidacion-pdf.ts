/**
 * Genera el PDF de liquidaciones de sueldo con el formato de KAME (una página
 * por trabajador). Sirve para una liquidación individual o para todas las del
 * período en un solo archivo. Usa pdf-lib (dibujo por coordenadas).
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { montoEnPalabras } from "./numero-a-letras";
import type { ResultadoLiquidacion } from "./liquidacion";

export type DatosLiquidacionPdf = {
  empresa: { razonSocial: string; rut: string | null; direccion: string | null };
  trabajador: {
    nombre: string;
    rut: string | null;
    tipoContrato: string | null;
    fechaIngreso: string | null;
    fechaTermino: string | null;
    cargo: string | null;
    unidadNegocio: string | null;
    salud: string | null;
  };
  periodoLabel: string; // "JUNIO DE 2026"
  diasTrabajados: number;
  diasVacaciones: number;
  diasLicencia: number;
  sueldoBase: number;
  r: ResultadoLiquidacion;
};

const NEG = rgb(0, 0, 0);
const fmt = (n: number) => Math.round(n).toLocaleString("en-US"); // miles con coma (estilo KAME)

function dibujar(page: PDFPage, font: PDFFont, bold: PDFFont, d: DatosLiquidacionPdf) {
  const { width } = page.getSize();
  const L = 40; // margen izquierdo
  const Rval = 560; // borde derecho de los montos de totales
  const Rdet = 300; // borde derecho de los montos de detalle
  let y = 770;

  const text = (s: string, x: number, yy: number, size = 9, f = font) =>
    page.drawText(s, { x, y: yy, size, font: f, color: NEG });
  const right = (s: string, xr: number, yy: number, size = 9, f = font) =>
    page.drawText(s, { x: xr - f.widthOfTextAtSize(s, size), y: yy, size, font: f, color: NEG });
  const center = (s: string, yy: number, size = 11, f = bold) =>
    page.drawText(s, { x: (width - f.widthOfTextAtSize(s, size)) / 2, y: yy, size, font: f, color: NEG });
  const hline = (yy: number) =>
    page.drawLine({ start: { x: L, y: yy }, end: { x: Rval, y: yy }, thickness: 0.7, color: NEG });
  const detalle = (etiqueta: string, monto: number, yy: number) => {
    text(etiqueta, L, yy);
    text("$", 200, yy);
    right(fmt(monto), Rdet, yy);
  };
  const total = (etiqueta: string, monto: number, yy: number, f = bold) => {
    right(etiqueta, 470, yy, 9, f);
    text("$", 485, yy, 9, f);
    right(fmt(monto), Rval, yy, 9, f);
  };

  // Título
  center("LIQUIDACION DE SUELDOS", y, 11, bold); y -= 14;
  center(d.periodoLabel, y, 11, bold); y -= 18;
  hline(y); y -= 16;

  // Empresa
  text("Razón Social:", L, y); text(d.empresa.razonSocial, 120, y); y -= 13;
  text("Rut:", L, y); text(d.empresa.rut ?? "", 120, y);
  text("Dirección", 330, y); text(d.empresa.direccion ?? "", 430, y); y -= 16;

  // Trabajador
  text("Nombre:", L, y); text(d.trabajador.nombre, 120, y); y -= 13;
  text("Rut:", L, y); text(d.trabajador.rut ?? "", 120, y);
  text("Sueldo Base: $", 380, y); text(fmt(d.sueldoBase), 470, y); y -= 13;
  text("Tipo de Contrato:", L, y); text(d.trabajador.tipoContrato ?? "", 120, y);
  text("Unidad de Negocio:", 380, y); text(d.trabajador.unidadNegocio ?? "", 480, y); y -= 13;
  text("Fecha de Ingreso:", L, y); text(d.trabajador.fechaIngreso ?? "", 120, y);
  text("Fecha de Término:", 380, y); text(d.trabajador.fechaTermino ?? "", 480, y); y -= 13;
  text("Cargo:", L, y); text(d.trabajador.cargo ?? "", 120, y); y -= 13;
  text("Días trabajados:", L, y); text(String(d.diasTrabajados), 120, y);
  text("Días vacaciones:", 220, y); text(String(d.diasVacaciones), 320, y);
  text("Días licencia médica:", 380, y); text(String(d.diasLicencia), 500, y); y -= 12;
  hline(y); y -= 16;

  // HABERES
  const r = d.r;
  text("HABERES", L, y, 9, bold); y -= 12;
  text("IMPONIBLES", L, y, 9, bold); y -= 14;
  detalle(`SUELDO BASE ${d.diasTrabajados} DIAS`, r.sueldoBase, y); y -= 13;
  if (r.gratificacion > 0) { detalle("GRATIFICACION", r.gratificacion, y); y -= 13; }
  if (r.horasExtras > 0) { detalle("HORAS EXTRAS", r.horasExtras, y); y -= 13; }
  if (r.semanaCorrida > 0) { detalle("SEMANA CORRIDA", r.semanaCorrida, y); y -= 13; }
  for (const h of r.haberesImponibles) { detalle(h.glosa.toUpperCase(), h.monto, y); y -= 13; }
  total("TOTAL IMPONIBLE", r.totalImponible, y); y -= 18;

  text("NO IMPONIBLES", L, y, 9, bold); y -= 14;
  for (const h of r.haberesNoImponibles) { detalle(h.glosa.toUpperCase(), h.monto, y); y -= 13; }
  if (r.asignacionFamiliar > 0) { detalle("ASIGNACION FAMILIAR", r.asignacionFamiliar, y); y -= 13; }
  total("TOTAL NO IMPONIBLE", r.totalNoImponible, y); y -= 16;
  total("TOTAL HABERES", r.totalHaberes, y); y -= 12;
  hline(y); y -= 16;

  // DESCUENTOS
  text("DESCUENTOS", L, y, 9, bold); y -= 14;
  if (r.afpMonto > 0) { detalle(`${(r.afpNombre ?? "AFP").toUpperCase()} ${r.afpTasa ?? ""} %`, r.afpMonto, y); y -= 13; }
  if (r.saludMonto > 0) { detalle(`${(d.trabajador.salud ?? "SALUD").toUpperCase()} 7 %`, r.saludLegal, y); y -= 13; }
  if (r.saludAdicional > 0) { detalle("ADICIONAL SALUD", r.saludAdicional, y); y -= 13; }
  if (r.afcTrabajador > 0) { detalle("SEGURO CESANTIA", r.afcTrabajador, y); y -= 13; }
  if (r.impuestoUnico > 0) { detalle("IMPUESTO UNICO", r.impuestoUnico, y); y -= 13; }
  if (r.anticipo > 0) { detalle("ANTICIPO", r.anticipo, y); y -= 13; }
  for (const dv of r.descuentosVarios) { detalle(dv.glosa.toUpperCase(), dv.monto, y); y -= 13; }
  total("TOTAL DESCUENTOS", r.totalDescuentos, y); y -= 20;

  // Líquido
  right("LIQUIDO A PAGO", 470, y, 12, bold);
  text("$", 485, y, 12, bold);
  right(fmt(r.liquido), Rval, y, 12, bold); y -= 22;

  text("TOTAL TRIBUTABLE", L, y); text("$", 200, y); right(fmt(r.tributable), Rdet, y); y -= 24;

  // Monto en palabras
  const son = "SON: " + montoEnPalabras(r.liquido).toUpperCase();
  text(son, L, y, 9, bold); y -= 20;

  // Leyenda
  text("RECIBI CONFORME EL ALCANCE LIQUIDO DE LA PRESENTE LIQUIDACION, NO TENIENDO CARGO O COBRO ALGUNO", L, y, 8); y -= 11;
  text("QUE HACER POR NINGUN CONCEPTO", L, y, 8); y -= 50;

  // Firma
  page.drawLine({ start: { x: 360, y: y }, end: { x: 560, y: y }, thickness: 0.7, color: NEG }); y -= 12;
  right("FIRMA TRABAJADOR", 510, y, 9);
}

export async function generarPdfLiquidaciones(items: DatosLiquidacionPdf[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  for (const it of items) {
    const page = doc.addPage([612, 792]);
    dibujar(page, font, bold, it);
  }
  return doc.save();
}
