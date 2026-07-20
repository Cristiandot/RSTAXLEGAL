"use server";

import { createClient } from "@/lib/supabase/server";

export type DocTrabajador = {
  id: string;
  tipo: string;
  resena: string | null;
  documento_path: string;
  requiere_firma: boolean;
  estado_firma: string; // no_aplica | pendiente | firmado
  documento_firmado_path: string | null;
  firmado_at: string | null;
  created_at: string;
};

export async function listarDocumentosTrabajador(
  trabajadorId: string,
): Promise<{ ok: boolean; docs?: DocTrabajador[]; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documentos_trabajador")
    .select(
      "id, tipo, resena, documento_path, requiere_firma, estado_firma, documento_firmado_path, firmado_at, created_at",
    )
    .eq("trabajador_id", trabajadorId)
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, docs: (data ?? []) as DocTrabajador[] };
}

function nombreArchivoSeguro(n: string): string {
  return n.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
}

export async function subirDocumentoTrabajador(
  fd: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const clienteId = String(fd.get("cliente_id") ?? "");
  const trabajadorId = String(fd.get("trabajador_id") ?? "");
  const tipo = String(fd.get("tipo") ?? "otro");
  const resena = String(fd.get("resena") ?? "").trim() || null;
  const requiereFirma = String(fd.get("requiere_firma") ?? "") === "true";
  const file = fd.get("archivo");
  if (!clienteId || !trabajadorId) return { ok: false, error: "Faltan datos del trabajador." };
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Selecciona un archivo." };

  const buf = new Uint8Array(await file.arrayBuffer());
  const path = `trabajador/${trabajadorId}/${Date.now()}-${nombreArchivoSeguro(file.name)}`;
  const { error: eUp } = await supabase.storage
    .from("contratos")
    .upload(path, buf, { contentType: file.type || "application/octet-stream", upsert: false });
  if (eUp) return { ok: false, error: eUp.message };

  const { data: u } = await supabase.auth.getUser();
  const { error: eIns } = await supabase.from("documentos_trabajador").insert({
    cliente_id: clienteId,
    trabajador_id: trabajadorId,
    tipo,
    resena,
    documento_path: path,
    requiere_firma: requiereFirma,
    estado_firma: requiereFirma ? "pendiente" : "no_aplica",
    subido_por: u?.user?.id ?? null,
  });
  if (eIns) {
    await supabase.storage.from("contratos").remove([path]);
    return { ok: false, error: eIns.message };
  }
  return { ok: true };
}

/** Sube la copia firmada de un documento pendiente y lo marca como firmado. */
export async function subirDocumentoFirmado(
  fd: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const id = String(fd.get("id") ?? "");
  const trabajadorId = String(fd.get("trabajador_id") ?? "");
  const file = fd.get("archivo");
  if (!id) return { ok: false, error: "Documento no válido." };
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Selecciona el archivo firmado." };

  const buf = new Uint8Array(await file.arrayBuffer());
  const path = `trabajador/${trabajadorId}/firmado-${Date.now()}-${nombreArchivoSeguro(file.name)}`;
  const { error: eUp } = await supabase.storage
    .from("contratos")
    .upload(path, buf, { contentType: file.type || "application/octet-stream", upsert: false });
  if (eUp) return { ok: false, error: eUp.message };

  const { error } = await supabase
    .from("documentos_trabajador")
    .update({ documento_firmado_path: path, estado_firma: "firmado", firmado_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Marca firmado sin subir archivo (p. ej. firma en papel archivada aparte). */
export async function marcarDocumentoFirmado(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("documentos_trabajador")
    .update({ estado_firma: "firmado", firmado_at: new Date().toISOString() })
    .eq("id", id);
  return { ok: !error, error: error?.message };
}

export async function urlDocumentoTrabajador(
  path: string,
  nombre?: string,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("contratos")
    .createSignedUrl(path, 3600, { download: nombre ?? true });
  if (error || !data) return { ok: false, error: error?.message ?? "No se pudo generar el enlace." };
  return { ok: true, url: data.signedUrl };
}

export async function eliminarDocumentoTrabajador(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("documentos_trabajador").delete().eq("id", id);
  return { ok: !error, error: error?.message };
}
