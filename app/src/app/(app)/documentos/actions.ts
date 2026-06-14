"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type EstadoDoc = "solicitada" | "en_revision" | "enviada" | "rechazada";

/**
 * Cambia el estado de una solicitud de documento (bandeja del equipo). La toma
 * cualquiera del área — no hay responsable nominado. Escribe con la sesión
 * autenticada (RLS de equipo).
 */
export async function actualizarEstadoDocumento(
  id: string,
  estado: EstadoDoc,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("solicitudes_documento")
    .update({ estado })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/documentos");
  return { ok: true };
}
