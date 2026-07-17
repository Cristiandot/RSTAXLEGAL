"use server";

import { createClient } from "@/lib/supabase/server";

/** Guarda los campos completados de un trabajador (RPC pública con whitelist). */
export async function guardarTrabajador(
  token: string,
  trabajadorId: string,
  updates: Record<string, string>,
): Promise<{ ok: boolean; campos?: number; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("completar_nomina_guardar", {
    p_token: token,
    p_trabajador: trabajadorId,
    p_updates: updates,
  });
  if (error) return { ok: false, error: "No pudimos guardar. Intenta de nuevo." };
  const r = data as { ok: boolean; campos?: number; error?: string };
  if (!r?.ok) return { ok: false, error: "Link no válido para este trabajador." };
  return { ok: true, campos: r.campos ?? 0 };
}
