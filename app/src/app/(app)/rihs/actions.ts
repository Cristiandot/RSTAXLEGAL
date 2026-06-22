"use server";

import { revalidatePath } from "next/cache";
import { getUsuarioActual } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { generarDocx } from "@/lib/generar-docx";
import { nombreArchivo } from "@/lib/format";

type Supabase = Awaited<ReturnType<typeof createClient>>;
const PLANTILLA = "plantillas/GENERICO/RIHS DS44 (menos de 10 trabajadores).docx";
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Id en `usuarios` del usuario autenticado (null si no se resuelve). */
async function usuarioActualId(supabase: Supabase): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const { data } = await supabase
    .from("usuarios")
    .select("id")
    .eq("correo", user.email.toLowerCase())
    .eq("activo", true)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Genera el RIHS (.docx) desde la plantilla tipo (D.S. N° 44, < 10 trabajadores)
 * rellenando la razón social, lo guarda en el bucket `reglamentos`, registra la
 * fila en `reglamentos` y devuelve el archivo en base64 para descarga inmediata.
 * La matriz de riesgos y los EPP por tarea se completan a mano según el rubro.
 */
export async function generarRihs(input: {
  clienteId: string | null;
  razonSocial: string;
}): Promise<{ ok: boolean; error?: string; base64?: string; filename?: string }> {
  await getUsuarioActual(); // exige sesión (redirige a /login si no hay)
  const razon = input.razonSocial.trim();
  if (!razon) return { ok: false, error: "Falta la razón social." };

  try {
    const buffer = await generarDocx(PLANTILLA, { RAZON_SOCIAL: razon });
    const filename = nombreArchivo(`RIHS - ${razon}`) + ".docx";

    const supabase = await createClient();
    const path = `${input.clienteId ?? "sin-cliente"}/RIHS-${Date.now()}-${filename}`;
    const { error: errUp } = await supabase.storage
      .from("reglamentos")
      .upload(path, new Uint8Array(buffer), { contentType: DOCX_MIME });
    if (errUp) return { ok: false, error: `Falló la subida a Storage: ${errUp.message}` };

    const { error: errIns } = await supabase.from("reglamentos").insert({
      cliente_id: input.clienteId,
      tipo: "RIHS",
      razon_social: razon,
      documento_path: path,
      nombre_original: filename,
      generado_por: await usuarioActualId(supabase),
    });
    if (errIns) return { ok: false, error: errIns.message };

    revalidatePath("/rihs");
    return { ok: true, base64: buffer.toString("base64"), filename };
  } catch (e) {
    return {
      ok: false,
      error: `No se pudo generar el documento: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/** Link firmado (1 h) para descargar un reglamento ya generado. */
export async function urlReglamento(
  documentoPath: string,
  nombre: string,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  await getUsuarioActual();
  const supabase = await createClient();
  const punto = nombre.lastIndexOf(".");
  const descarga =
    punto > 0
      ? nombreArchivo(nombre.slice(0, punto)) + nombre.slice(punto).toLowerCase()
      : nombreArchivo(nombre);
  const { data, error } = await supabase.storage
    .from("reglamentos")
    .createSignedUrl(documentoPath, 3600, { download: descarga });
  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message ?? "No se pudo generar el link." };
  }
  return { ok: true, url: data.signedUrl };
}
