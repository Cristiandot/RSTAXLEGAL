"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const TRANSICIONES: Record<string, string[]> = {
  solicitado: ["generado", "anulado"],
  generado: ["aprobado", "anulado"],
  aprobado: ["enviado", "anulado"],
  enviado: [],
  anulado: [],
};

/** Avanza el estado del contrato validando la transición. */
export async function cambiarEstadoContrato(
  contratoId: string,
  nuevoEstado: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: actual, error: errGet } = await supabase
    .from("contratos")
    .select("estado")
    .eq("id", contratoId)
    .single();
  if (errGet || !actual) return { ok: false, error: "Contrato no encontrado." };

  if (!TRANSICIONES[actual.estado]?.includes(nuevoEstado)) {
    return {
      ok: false,
      error: `No se puede pasar de "${actual.estado}" a "${nuevoEstado}".`,
    };
  }
  const { error } = await supabase
    .from("contratos")
    .update({ estado: nuevoEstado })
    .eq("id", contratoId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/contratos");
  return { ok: true };
}

/** Guarda el link del Microsoft Form de solicitud de un cliente. */
export async function guardarFormUrl(
  clienteId: string,
  url: string,
): Promise<{ ok: boolean; error?: string }> {
  const limpio = url.trim();
  if (limpio && !/^https:\/\//.test(limpio)) {
    return { ok: false, error: "El link debe comenzar con https://" };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("clientes")
    .update({ form_solicitud_url: limpio || null })
    .eq("id", clienteId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/contratos");
  return { ok: true };
}

/** Genera un link firmado (1 hora) para descargar el documento. */
export async function linkDescargaContrato(
  contratoId: string,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const supabase = await createClient();
  const { data: con } = await supabase
    .from("contratos")
    .select("documento_path, trabajadores(nombres, apellidos)")
    .eq("id", contratoId)
    .single();
  if (!con?.documento_path) {
    return { ok: false, error: "Este contrato no tiene documento generado." };
  }
  const t = con.trabajadores as unknown as { nombres: string; apellidos: string } | null;
  const nombre = t ? `Contrato - ${t.nombres} ${t.apellidos}.docx` : "Contrato.docx";
  const { data, error } = await supabase.storage
    .from("contratos")
    .createSignedUrl(con.documento_path, 3600, { download: nombre });
  if (error || !data) return { ok: false, error: error?.message ?? "Error generando link." };
  return { ok: true, url: data.signedUrl };
}
