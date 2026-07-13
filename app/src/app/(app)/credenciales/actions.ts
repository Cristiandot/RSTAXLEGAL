"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type TipoClave = "clave_sii" | "previred_clave";

const CAMPOS_EDITABLES = ["clave_sii", "previred_clave", "previred_rut"] as const;
export type CampoCredencial = (typeof CAMPOS_EDITABLES)[number];

/**
 * Devuelve el valor real de una clave (SII o Previred) de una empresa.
 * Se llama recién cuando el usuario aprieta "ver" o "copiar" — las claves
 * nunca viajan en la carga inicial de la página. Cada revelación queda
 * registrada en audit_log (quién, qué empresa, qué campo).
 */
export async function revelarCredencial(
  clienteId: string,
  campo: TipoClave,
  accion: "revelar" | "copiar" = "revelar",
): Promise<{ ok: boolean; valor?: string | null; error?: string }> {
  if (campo !== "clave_sii" && campo !== "previred_clave") {
    return { ok: false, error: "Campo no permitido." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clientes")
    .select(campo)
    .eq("id", clienteId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Empresa no encontrada." };

  // Auditoría de la revelación; si falla el registro no se bloquea el uso.
  await supabase.rpc("registrar_revelacion_credencial", {
    p_cliente_id: clienteId,
    p_campo: campo,
    p_accion: accion,
  });

  return { ok: true, valor: (data as Record<string, string | null>)[campo] ?? null };
}

/**
 * Guarda una clave o el RUT Previred de una empresa. Texto vacío la borra
 * (queda null). El trigger de auditoría de `clientes` registra el cambio.
 */
export async function guardarCredencial(
  clienteId: string,
  campo: CampoCredencial,
  valor: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!CAMPOS_EDITABLES.includes(campo)) {
    return { ok: false, error: "Campo no permitido." };
  }

  const limpio = valor.trim();
  const supabase = await createClient();
  const { error } = await supabase
    .from("clientes")
    .update({ [campo]: limpio || null })
    .eq("id", clienteId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/credenciales");
  revalidatePath("/empresas");
  revalidatePath("/onboarding");
  return { ok: true };
}
