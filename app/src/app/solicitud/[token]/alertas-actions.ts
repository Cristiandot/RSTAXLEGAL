"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Alertas del portal financiero. Por ahora: situación de los F29 (semáforo
 * mensual). El estado lo marca la oficina en el panel interno; acá sólo se lee.
 */

export type F29Estado = "declarada" | "observada" | "guardada" | "postergado" | "sin_declarar";
export type F29Periodo = { periodo: string; estado: F29Estado; nota: string | null };

export async function cargarF29Situacion(
  token: string,
  anio: number,
): Promise<{ ok: boolean; periodos?: F29Periodo[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("portal_f29_situacion", { p_token: token, p_anio: anio });
  if (error || !data) return { ok: false };
  const d = data as { periodos?: F29Periodo[] };
  return { ok: true, periodos: d.periodos ?? [] };
}
