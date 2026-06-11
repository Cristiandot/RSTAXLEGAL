"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  generarYSubirCartaAmonestacion,
  type ResultadoCarta,
} from "@/lib/carta-amonestacion";

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

  revalidarBandejas();
  return { ok: true };
}

/** Las bandejas por gestión comparten estas actions — se revalidan todas. */
function revalidarBandejas() {
  for (const ruta of ["/amonestaciones", "/vacaciones", "/permisos", "/finiquitos"]) {
    revalidatePath(ruta);
  }
}

/**
 * Genera el .docx de la carta de amonestación desde la plantilla genérica
 * (motor compartido) y devuelve el link de descarga.
 */
export async function generarCartaAmonestacion(
  gestionId: string,
): Promise<ResultadoCarta> {
  const supabase = await createClient();
  const res = await generarYSubirCartaAmonestacion(supabase, gestionId);
  if (res.ok) revalidarBandejas();
  return res;
}
