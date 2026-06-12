"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUsuarioActual } from "@/lib/auth";
import { generarYSubirContrato } from "@/lib/contrato-generacion";
import { enviarCorreo, htmlCorreoDocumento } from "@/lib/enviar-correo";

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

/**
 * Guarda las cláusulas adicionales de un contrato (modificación particular,
 * ej. funciones extra). Solo antes de enviar; luego hay que regenerar.
 */
export async function actualizarClausulas(
  contratoId: string,
  texto: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: con } = await supabase
    .from("contratos")
    .select("estado")
    .eq("id", contratoId)
    .single();
  if (!con) return { ok: false, error: "Contrato no encontrado." };
  if (!["solicitado", "generado", "aprobado"].includes(con.estado)) {
    return { ok: false, error: "Este contrato ya fue enviado o anulado; no se puede modificar." };
  }
  const { error } = await supabase
    .from("contratos")
    .update({ clausulas_adicionales: texto.trim() || null, estado: con.estado === "aprobado" ? "generado" : con.estado })
    .eq("id", contratoId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/contratos");
  return { ok: true };
}

/** Genera (o regenera) el documento de una solicitud pendiente. */
export async function generarContrato(
  contratoId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const res = await generarYSubirContrato(supabase, contratoId);
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/contratos");
  return { ok: true };
}

/**
 * Envía el contrato APROBADO al correo asignado de la empresa, con el .docx
 * adjunto, y lo marca como enviado (con trazabilidad de destino y fecha).
 */
export async function enviarContratoAlCliente(
  contratoId: string,
): Promise<{ ok: boolean; error?: string; enviadoA?: string }> {
  const supabase = await createClient();

  const { data: con } = await supabase
    .from("contratos")
    .select(
      "id, estado, documento_path, tipo_documento, clientes(razon_social, correo_empresa), trabajadores(nombres, apellidos)",
    )
    .eq("id", contratoId)
    .single();
  if (!con) return { ok: false, error: "Contrato no encontrado." };
  if (con.estado !== "aprobado") {
    return { ok: false, error: "Solo se puede enviar un contrato APROBADO (revísalo y apruébalo primero)." };
  }
  if (!con.documento_path) {
    return { ok: false, error: "Este contrato no tiene documento generado." };
  }

  const cli = con.clientes as unknown as { razon_social: string; correo_empresa: string | null } | null;
  const t = con.trabajadores as unknown as { nombres: string; apellidos: string } | null;
  if (!cli?.correo_empresa) {
    return { ok: false, error: `La empresa ${cli?.razon_social ?? ""} no tiene correo asignado. Cárgalo en sus datos primero.` };
  }

  const { data: archivo, error: errDl } = await supabase.storage
    .from("contratos")
    .download(con.documento_path);
  if (errDl || !archivo) {
    return { ok: false, error: `No se pudo leer el documento: ${errDl?.message}` };
  }
  const base64 = Buffer.from(await archivo.arrayBuffer()).toString("base64");

  const trabajador = t ? `${t.nombres} ${t.apellidos}` : "trabajador";
  const usuario = await getUsuarioActual();
  const res = await enviarCorreo({
    de: { nombre: usuario.nombre, correo: usuario.correo },
    para: cli.correo_empresa,
    asunto: `Contrato de trabajo — ${trabajador} · ${cli.razon_social}`,
    html: htmlCorreoDocumento({
      titulo: "Contrato de trabajo listo",
      cuerpo: `<p>Estimado cliente:</p>
<p>Adjuntamos el contrato de trabajo de <strong>${trabajador}</strong>, revisado y aprobado por nuestro equipo.</p>
<p>Por favor imprímelo en dos ejemplares, fírmenlo ambas partes y conserva uno en la carpeta del trabajador. Cualquier ajuste que necesites, responde a este correo o contacta a tu ejecutivo.</p>`,
    }),
    adjuntos: [{ filename: `Contrato - ${trabajador}.docx`, content: base64 }],
  });
  if (!res.ok) return { ok: false, error: res.error };

  await supabase
    .from("contratos")
    .update({
      estado: "enviado",
      enviado_a: cli.correo_empresa,
      enviado_fecha: new Date().toISOString(),
    })
    .eq("id", contratoId);

  revalidatePath("/contratos");
  return { ok: true, enviadoA: cli.correo_empresa };
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
