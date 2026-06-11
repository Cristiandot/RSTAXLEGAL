"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parsearPdfPrevired, type IndicadoresPrevired } from "@/lib/previred";

export type ResultadoCarga =
  | {
      ok: true;
      datos: IndicadoresPrevired;
      pdfPath: string;
      periodoExistente: boolean;
    }
  | { ok: false; error: string };

/**
 * Recibe el PDF mensual de Previred, lo parsea y lo sube a Storage. NO escribe
 * la fila todavía: los datos vuelven al cliente para revisión y se persisten
 * recién con `guardarIndicadores` (el equipo confirma los valores leídos).
 */
export async function cargarPdfPrevired(
  formData: FormData,
): Promise<ResultadoCarga> {
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File)) {
    return { ok: false, error: "No se recibió ningún archivo." };
  }
  if (archivo.type && archivo.type !== "application/pdf") {
    return { ok: false, error: "El archivo debe ser un PDF." };
  }
  if (archivo.size > 5 * 1024 * 1024) {
    return { ok: false, error: "El PDF supera los 5 MB; no parece la hoja de Previred." };
  }

  const bytes = new Uint8Array(await archivo.arrayBuffer());

  let datos: IndicadoresPrevired;
  try {
    datos = await parsearPdfPrevired(bytes);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo leer el PDF.",
    };
  }

  const supabase = await createClient();

  const { data: existente } = await supabase
    .from("indicadores_previred")
    .select("id")
    .eq("periodo", datos.periodo)
    .maybeSingle();

  const pdfPath = `previred/${datos.periodo}.pdf`;
  const { error: errUp } = await supabase.storage
    .from("indicadores")
    .upload(pdfPath, bytes, { contentType: "application/pdf", upsert: true });
  if (errUp) {
    return { ok: false, error: `Falló la subida del PDF a Storage: ${errUp.message}` };
  }

  return { ok: true, datos, pdfPath, periodoExistente: existente !== null };
}

export type GuardarIndicadoresInput = {
  datos: IndicadoresPrevired;
  pdfPath: string | null;
  observaciones: string | null;
};

/** Inserta o actualiza (por período) la fila de indicadores ya revisada. */
export async function guardarIndicadores(
  input: GuardarIndicadoresInput,
): Promise<{ ok: boolean; error?: string }> {
  const d = input.datos;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(d.periodo)) {
    return { ok: false, error: `Período inválido: ${d.periodo}` };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("indicadores_previred").upsert(
    {
      periodo: d.periodo,
      uf_ultimo_dia: d.uf_ultimo_dia,
      uf_ultimo_dia_anterior: d.uf_ultimo_dia_anterior,
      utm: d.utm,
      uta: d.uta,
      tope_imponible_afp: d.tope_imponible_afp,
      tope_imponible_ips: d.tope_imponible_ips,
      tope_imponible_afc: d.tope_imponible_afc,
      tope_uf_afp: d.tope_uf_afp,
      tope_uf_ips: d.tope_uf_ips,
      tope_uf_afc: d.tope_uf_afc,
      rmi_general: d.rmi_general,
      rmi_menores_mayores: d.rmi_menores_mayores,
      rmi_casa_particular: d.rmi_casa_particular,
      rmi_no_remuneracional: d.rmi_no_remuneracional,
      tasa_sis: d.tasa_sis,
      tasa_seguro_social: d.tasa_seguro_social,
      salud_ccaf: d.salud_ccaf,
      salud_fonasa_ccaf: d.salud_fonasa_ccaf,
      apv_tope_mensual: d.apv_tope_mensual,
      apv_tope_anual: d.apv_tope_anual,
      deposito_convenido_tope: d.deposito_convenido_tope,
      afp: d.afp,
      afc: d.afc,
      trabajos_pesados: d.trabajos_pesados,
      asignacion_familiar: d.asignacion_familiar,
      datos: { mes_pago: d.mes_pago },
      pdf_path: input.pdfPath,
      observaciones: input.observaciones,
    },
    { onConflict: "periodo" },
  );

  if (error) return { ok: false, error: error.message };

  revalidatePath("/indicadores");
  return { ok: true };
}

/** Link firmado (1 h) para descargar el PDF original de un período. */
export async function urlPdfIndicadores(
  pdfPath: string,
  periodo: string,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("indicadores")
    .createSignedUrl(pdfPath, 3600, {
      download: `Indicadores-Previred-${periodo}.pdf`,
    });
  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message ?? "No se pudo generar el link." };
  }
  return { ok: true, url: data.signedUrl };
}
