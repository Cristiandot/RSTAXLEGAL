"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Tablas que aceptan asignación desde la bandeja del inicio (whitelist). */
const TABLAS_GESTION = new Set([
  "solicitudes_rrhh",
  "contratos",
  "licencias_medicas",
  "solicitudes_documento",
]);

/**
 * Asigna (o desasigna con null) una gestión a un usuario del equipo, desde la
 * bandeja de Inicio y requerimientos. Estampa la fecha de asignación y
 * revalida el layout completo para refrescar el contador del sidebar.
 */
export async function asignarGestion(
  fuente: string,
  gestionId: string,
  responsableId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (!TABLAS_GESTION.has(fuente)) {
    return { ok: false, error: "Tipo de gestión no permitido" };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from(fuente)
    .update({
      responsable_id: responsableId,
      asignado_at: responsableId ? new Date().toISOString() : null,
    })
    .eq("id", gestionId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}
