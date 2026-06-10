"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const TRANSICIONES: Record<string, string[]> = {
  solicitada: ["aprobada", "rechazada"],
  aprobada: ["enviada", "rechazada"],
  enviada: [],
  rechazada: [],
};

/** Avanza el estado de una gestión RRHH validando la transición. */
export async function cambiarEstadoGestion(
  gestionId: string,
  nuevoEstado: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: actual } = await supabase
    .from("solicitudes_rrhh")
    .select("estado")
    .eq("id", gestionId)
    .single();
  if (!actual) return { ok: false, error: "Gestión no encontrada." };

  if (!TRANSICIONES[actual.estado]?.includes(nuevoEstado)) {
    return { ok: false, error: `No se puede pasar de "${actual.estado}" a "${nuevoEstado}".` };
  }
  const { error } = await supabase
    .from("solicitudes_rrhh")
    .update({ estado: nuevoEstado })
    .eq("id", gestionId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/gestiones");
  return { ok: true };
}
