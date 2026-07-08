"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { nombreArchivo } from "@/lib/format";
import {
  calcularDiasHabilesRB,
  desgloseATexto,
  redondear2,
  tipoDeDias,
  PERIODO_PROGRESIVOS,
} from "@/lib/vacaciones-control";
import {
  generarPdfPapeleta,
  generarPdfPermiso,
  generarPdfReconocimiento,
  type DatosPdfDocumento,
} from "@/lib/vacaciones-pdf";

export type ResultadoEmision = {
  ok: boolean;
  error?: string;
  correlativo?: string;
  saldoAnterior?: number;
  saldoFinal?: number;
  downloadUrl?: string;
  aviso?: string;
};

function revalidar() {
  revalidatePath("/vacaciones/control");
}

async function trabajadorDe(
  supabase: SupabaseClient,
  trabajadorId: string,
): Promise<{
  id: string;
  cliente_id: string;
  nombre: string;
  rut: string;
  cargo: string;
  sucursal: string;
  fecha_ingreso: string;
} | null> {
  const { data } = await supabase
    .from("trabajadores")
    .select("id, cliente_id, nombres, apellidos, rut, cargo, sucursal, fecha_ingreso")
    .eq("id", trabajadorId)
    .single();
  if (!data) return null;
  return {
    id: data.id,
    cliente_id: data.cliente_id,
    nombre: `${data.nombres ?? ""} ${data.apellidos ?? ""}`.trim().toUpperCase(),
    rut: data.rut ?? "",
    cargo: data.cargo ?? "",
    sucursal: data.sucursal ?? "",
    fecha_ingreso: data.fecha_ingreso ?? "",
  };
}

/** `PAP-0039 - Apellido Nombre.pdf` (apellido primero, como los históricos). */
function nombrePdf(correlativo: string, nombres: string): string {
  const partes = nombres.trim().split(/\s+/);
  // nombre completo viene "NOMBRES APELLIDOS": tomar primer nombre y primer apellido
  const nombre = partes[0] ?? "";
  const apellido = partes.length > 2 ? partes[partes.length - 2] : (partes[1] ?? "");
  const capital = (s: string) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s);
  return nombreArchivo(`${correlativo} - ${capital(apellido)} ${capital(nombre)}`) + ".pdf";
}

async function subirPdf(
  supabase: SupabaseClient,
  docId: string,
  bytes: Uint8Array,
  nombreDescarga: string,
): Promise<{ path?: string; url?: string; error?: string }> {
  const storagePath = `vacaciones/${docId}.pdf`;
  const { error } = await supabase.storage
    .from("contratos")
    .upload(storagePath, Buffer.from(bytes), { contentType: "application/pdf", upsert: true });
  if (error) return { error: error.message };
  await supabase
    .from("vac_documentos")
    .update({ pdf_path: storagePath, pdf_nombre: nombreDescarga })
    .eq("id", docId);
  const { data } = await supabase.storage
    .from("contratos")
    .createSignedUrl(storagePath, 3600, { download: nombreDescarga });
  return { path: storagePath, url: data?.signedUrl };
}

export async function emitirPapeleta(input: {
  trabajadorId: string;
  fechaEmision: string;
  fechaDesde: string;
  fechaHasta: string;
  sabadoHabilInicio: boolean;
  items: Record<string, number>;
  progresivosPeriodo?: string;
  observacion?: string;
  permitirNegativo?: boolean;
}): Promise<ResultadoEmision> {
  const supabase = await createClient();
  const t = await trabajadorDe(supabase, input.trabajadorId);
  if (!t) return { ok: false, error: "Trabajador no encontrado." };

  const calc = calcularDiasHabilesRB(input.fechaDesde, input.fechaHasta, input.sabadoHabilInicio);
  if (!calc) return { ok: false, error: "Rango de fechas inválido." };
  if (!calc.cobertura) {
    return { ok: false, error: "El rango cae fuera de la tabla de feriados del sistema. Extender lib/feriados.ts antes de emitir." };
  }

  const items: Record<string, number> = {};
  for (const [per, dias] of Object.entries(input.items)) {
    if (dias > 0) items[per] = redondear2(dias);
  }
  const suma = redondear2(Object.values(items).reduce((a, b) => a + b, 0));
  if (suma <= 0) return { ok: false, error: "El desglose está vacío." };
  if (suma !== redondear2(calc.dias)) {
    return {
      ok: false,
      error: `El desglose suma ${suma} días pero el rango ${input.fechaDesde} → ${input.fechaHasta} son ${calc.dias} días hábiles${input.sabadoHabilInicio ? " (con sábado inicial hábil)" : ""}. Ajusta el desglose o las fechas.`,
    };
  }

  const desgloseTexto = desgloseATexto(items, input.progresivosPeriodo);
  const { data: res, error } = await supabase.rpc("vac_emitir_documento", {
    p: {
      cliente_id: t.cliente_id,
      tipo: "PAP",
      trabajador_id: t.id,
      trabajador_nombre: t.nombre,
      trabajador_rut: t.rut,
      sucursal: t.sucursal,
      fecha_emision: input.fechaEmision,
      fecha_desde: input.fechaDesde,
      fecha_hasta: input.fechaHasta,
      dias: suma,
      desglose: { texto: desgloseTexto, items, progresivos_periodo: input.progresivosPeriodo ?? null },
      items,
      observacion: input.observacion || null,
      permitir_negativo: input.permitirNegativo ?? false,
    },
  });
  if (error) return { ok: false, error: error.message };

  // Saldos finales por período para la sección III del PDF
  const { data: saldos } = await supabase
    .from("vac_saldos")
    .select("periodo, dias")
    .eq("trabajador_id", t.id);
  const saldosFinales = (saldos ?? [])
    .filter((s) => Number(s.dias) !== 0)
    .sort((a, b) => (a.periodo === PERIODO_PROGRESIVOS ? 1 : a.periodo.localeCompare(b.periodo)))
    .map((s) => ({ periodo: s.periodo, dias: Number(s.dias) }));

  const datosPdf: DatosPdfDocumento = {
    correlativo: res.correlativo,
    fechaEmision: input.fechaEmision,
    trabajadorNombre: t.nombre,
    trabajadorRut: t.rut,
    cargo: t.cargo,
    fechaIngreso: t.fecha_ingreso,
    fechaDesde: input.fechaDesde,
    fechaHasta: input.fechaHasta,
    tipoDias: tipoDeDias(items),
    dias: suma,
    desgloseTexto,
    saldoAnterior: Number(res.saldo_anterior),
    saldoFinal: Number(res.saldo_final),
    saldosFinales,
    observacion: input.observacion,
  };

  let aviso: string | undefined;
  if (suma < 10) {
    aviso = "Papeleta inferior a 10 días hábiles: verificar respaldo escrito de fraccionamiento (Art. 69 CT).";
  }

  try {
    const bytes = await generarPdfPapeleta(datosPdf);
    const up = await subirPdf(supabase, res.id, bytes, nombrePdf(res.correlativo, t.nombre));
    revalidar();
    if (up.error) {
      return { ok: true, correlativo: res.correlativo, saldoAnterior: Number(res.saldo_anterior), saldoFinal: Number(res.saldo_final), aviso: `Documento emitido, pero falló la subida del PDF: ${up.error}. Usa "Regenerar PDF".` };
    }
    return { ok: true, correlativo: res.correlativo, saldoAnterior: Number(res.saldo_anterior), saldoFinal: Number(res.saldo_final), downloadUrl: up.url, aviso };
  } catch (e) {
    revalidar();
    return { ok: true, correlativo: res.correlativo, saldoAnterior: Number(res.saldo_anterior), saldoFinal: Number(res.saldo_final), aviso: `Documento emitido, pero falló la generación del PDF: ${e instanceof Error ? e.message : String(e)}. Usa "Regenerar PDF".` };
  }
}

export async function emitirPermiso(input: {
  trabajadorId: string;
  fechaEmision: string;
  permisoTipo: string;
  conGoce: boolean;
  fechaDesde: string;
  fechaHasta: string;
  unidad: "Días" | "Horas";
  cantidad: number;
  observacion?: string;
}): Promise<ResultadoEmision> {
  const supabase = await createClient();
  const t = await trabajadorDe(supabase, input.trabajadorId);
  if (!t) return { ok: false, error: "Trabajador no encontrado." };
  if (!(input.cantidad > 0)) return { ok: false, error: "La cantidad debe ser mayor a cero." };

  const { data: res, error } = await supabase.rpc("vac_emitir_documento", {
    p: {
      cliente_id: t.cliente_id,
      tipo: "PER",
      trabajador_id: t.id,
      trabajador_nombre: t.nombre,
      trabajador_rut: t.rut,
      sucursal: t.sucursal,
      fecha_emision: input.fechaEmision,
      fecha_desde: input.fechaDesde,
      fecha_hasta: input.fechaHasta,
      permiso_tipo: input.permisoTipo,
      con_goce: input.conGoce,
      unidad: input.unidad,
      cantidad: input.cantidad,
      observacion: input.observacion || null,
    },
  });
  if (error) return { ok: false, error: error.message };

  const datosPdf: DatosPdfDocumento = {
    correlativo: res.correlativo,
    fechaEmision: input.fechaEmision,
    trabajadorNombre: t.nombre,
    trabajadorRut: t.rut,
    cargo: t.cargo,
    fechaIngreso: t.fecha_ingreso,
    fechaDesde: input.fechaDesde,
    fechaHasta: input.fechaHasta,
    permisoTipo: input.permisoTipo,
    conGoce: input.conGoce,
    unidad: input.unidad,
    cantidad: input.cantidad,
    observacion: input.observacion,
  };

  try {
    const bytes = await generarPdfPermiso(datosPdf);
    const up = await subirPdf(supabase, res.id, bytes, nombrePdf(res.correlativo, t.nombre));
    revalidar();
    return { ok: true, correlativo: res.correlativo, downloadUrl: up.url, aviso: up.error ? `Documento emitido, pero falló la subida del PDF: ${up.error}.` : undefined };
  } catch (e) {
    revalidar();
    return { ok: true, correlativo: res.correlativo, aviso: `Documento emitido, pero falló el PDF: ${e instanceof Error ? e.message : String(e)}.` };
  }
}

export async function emitirReconocimiento(input: {
  trabajadorId: string;
  fechaEmision: string;
  dias: number;
  respaldo: string;
  observacion?: string;
}): Promise<ResultadoEmision> {
  const supabase = await createClient();
  const t = await trabajadorDe(supabase, input.trabajadorId);
  if (!t) return { ok: false, error: "Trabajador no encontrado." };
  if (!(input.dias > 0)) return { ok: false, error: "Los días reconocidos deben ser mayores a cero." };
  if (!input.respaldo.trim()) {
    return { ok: false, error: "El reconocimiento requiere respaldo documental (certificado AFP). Si aún no llega, indícalo como condicional." };
  }

  const { data: res, error } = await supabase.rpc("vac_emitir_documento", {
    p: {
      cliente_id: t.cliente_id,
      tipo: "REC",
      trabajador_id: t.id,
      trabajador_nombre: t.nombre,
      trabajador_rut: t.rut,
      sucursal: t.sucursal,
      fecha_emision: input.fechaEmision,
      dias: input.dias,
      desglose: { texto: `Progresivos: +${input.dias}` },
      respaldo: input.respaldo,
      observacion: input.observacion || null,
    },
  });
  if (error) return { ok: false, error: error.message };

  const datosPdf: DatosPdfDocumento = {
    correlativo: res.correlativo,
    fechaEmision: input.fechaEmision,
    trabajadorNombre: t.nombre,
    trabajadorRut: t.rut,
    cargo: t.cargo,
    fechaIngreso: t.fecha_ingreso,
    diasReconocidos: input.dias,
    respaldo: input.respaldo,
    saldoAnterior: Number(res.saldo_anterior),
    saldoFinal: Number(res.saldo_final),
    observacion: input.observacion,
  };

  try {
    const bytes = await generarPdfReconocimiento(datosPdf);
    const up = await subirPdf(supabase, res.id, bytes, nombrePdf(res.correlativo, t.nombre));
    revalidar();
    return { ok: true, correlativo: res.correlativo, saldoAnterior: Number(res.saldo_anterior), saldoFinal: Number(res.saldo_final), downloadUrl: up.url };
  } catch (e) {
    revalidar();
    return { ok: true, correlativo: res.correlativo, aviso: `Documento emitido, pero falló el PDF: ${e instanceof Error ? e.message : String(e)}.` };
  }
}

/**
 * Anula un documento (nunca se borra): revierte saldos si el desglose es
 * estructurado y re-estampa el PDF con el sello ANULADO.
 */
export async function anularDocumento(
  docId: string,
  motivo: string,
): Promise<{ ok: boolean; error?: string; aviso?: string }> {
  if (!motivo.trim()) return { ok: false, error: "La anulación requiere motivo." };
  const supabase = await createClient();
  const { data: res, error } = await supabase.rpc("vac_anular_documento", {
    p_id: docId,
    p_motivo: motivo,
  });
  if (error) return { ok: false, error: error.message };

  // Re-generar el PDF con sello (solo docs emitidos desde el panel)
  const regen = await regenerarPdf(docId);
  revalidar();
  const avisos: string[] = [];
  if (!res.saldo_revertido) {
    avisos.push("Documento migrado del Excel: el saldo NO se revirtió automáticamente — ajústalo a mano si corresponde.");
  }
  if (!regen.ok && regen.error !== "excel") {
    avisos.push(`No se pudo re-estampar el PDF: ${regen.error}`);
  }
  return { ok: true, aviso: avisos.join(" ") || undefined };
}

/** (Re)genera el PDF de un documento emitido desde el panel y devuelve link. */
export async function regenerarPdf(
  docId: string,
): Promise<{ ok: boolean; error?: string; downloadUrl?: string }> {
  const supabase = await createClient();
  const { data: d } = await supabase.from("vac_documentos").select("*").eq("id", docId).single();
  if (!d) return { ok: false, error: "Documento no encontrado." };
  if (d.origen === "excel") return { ok: false, error: "excel" };

  const { data: trab } = await supabase
    .from("trabajadores")
    .select("cargo, fecha_ingreso")
    .eq("id", d.trabajador_id)
    .single();

  const desglose = (d.desglose ?? {}) as { texto?: string; items?: Record<string, number> };
  const base: DatosPdfDocumento = {
    correlativo: d.correlativo,
    fechaEmision: d.fecha_emision,
    trabajadorNombre: d.trabajador_nombre,
    trabajadorRut: d.trabajador_rut,
    cargo: trab?.cargo ?? "",
    fechaIngreso: trab?.fecha_ingreso ?? "",
    fechaDesde: d.fecha_desde,
    fechaHasta: d.fecha_hasta,
    dias: d.dias === null ? undefined : Number(d.dias),
    desgloseTexto: desglose.texto,
    tipoDias: desglose.items ? tipoDeDias(desglose.items) : undefined,
    saldoAnterior: d.saldo_anterior === null ? undefined : Number(d.saldo_anterior),
    saldoFinal: d.saldo_final === null ? undefined : Number(d.saldo_final),
    permisoTipo: d.permiso_tipo,
    conGoce: d.con_goce,
    unidad: d.unidad,
    cantidad: d.cantidad === null ? undefined : Number(d.cantidad),
    diasReconocidos: d.tipo === "REC" && d.dias !== null ? Number(d.dias) : undefined,
    respaldo: d.respaldo,
    observacion: d.observacion,
    anulado: d.estado === "anulado",
  };

  try {
    const bytes =
      d.tipo === "PAP"
        ? await generarPdfPapeleta(base)
        : d.tipo === "PER"
          ? await generarPdfPermiso(base)
          : await generarPdfReconocimiento(base);
    const up = await subirPdf(supabase, d.id, bytes, d.pdf_nombre ?? nombrePdf(d.correlativo, d.trabajador_nombre));
    if (up.error) return { ok: false, error: up.error };
    revalidar();
    return { ok: true, downloadUrl: up.url };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Link firmado de descarga del PDF (1 hora). */
export async function descargarPdf(
  docId: string,
): Promise<{ ok: boolean; error?: string; downloadUrl?: string }> {
  const supabase = await createClient();
  const { data: d } = await supabase
    .from("vac_documentos")
    .select("pdf_path, pdf_nombre, origen")
    .eq("id", docId)
    .single();
  if (!d) return { ok: false, error: "Documento no encontrado." };
  if (!d.pdf_path) {
    if (d.origen === "excel") {
      return { ok: false, error: `El PDF histórico está en la carpeta VACACIONES de OneDrive (${d.pdf_nombre ?? "sin nombre"}).` };
    }
    return regenerarPdf(docId);
  }
  const { data } = await supabase.storage
    .from("contratos")
    .createSignedUrl(d.pdf_path, 3600, { download: d.pdf_nombre ?? "documento.pdf" });
  if (!data?.signedUrl) return { ok: false, error: "No se pudo generar el link de descarga." };
  return { ok: true, downloadUrl: data.signedUrl };
}

/** Ajuste manual de saldo con motivo (devengamiento aniversario, corrección). */
export async function ajustarSaldo(input: {
  clienteId: string;
  trabajadorId: string;
  periodo: string;
  dias: number;
  motivo: string;
}): Promise<{ ok: boolean; error?: string; antes?: number | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("vac_ajustar_saldo", {
    p_cliente: input.clienteId,
    p_trabajador: input.trabajadorId,
    p_periodo: input.periodo,
    p_dias: input.dias,
    p_motivo: input.motivo,
  });
  if (error) return { ok: false, error: error.message };
  revalidar();
  return { ok: true, antes: data?.antes ?? null };
}

export async function agregarAsistencia(input: {
  clienteId: string;
  trabajadorId: string;
  fecha: string;
  tipo: string;
  cantidad: number;
  unidad: string;
  cierreNubox?: string;
  observacion?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const t = await trabajadorDe(supabase, input.trabajadorId);
  if (!t) return { ok: false, error: "Trabajador no encontrado." };
  const { error } = await supabase.from("vac_asistencia").insert({
    cliente_id: input.clienteId,
    trabajador_id: t.id,
    trabajador_nombre: t.nombre,
    trabajador_rut: t.rut,
    sucursal: t.sucursal,
    fecha: input.fecha,
    tipo: input.tipo,
    cantidad: input.cantidad,
    unidad: input.unidad,
    cierre_nubox: input.cierreNubox || null,
    observacion: input.observacion || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidar();
  return { ok: true };
}
