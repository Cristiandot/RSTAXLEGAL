"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Genera el token del portal para una empresa que aún no tiene link.
 * No sobreescribe tokens existentes (eso invalidaría el link ya compartido).
 */
export async function generarLinkCliente(
  clienteId: string,
): Promise<{ ok: boolean; token?: string; error?: string }> {
  const supabase = await createClient();
  const { data: actual } = await supabase
    .from("clientes")
    .select("form_token")
    .eq("id", clienteId)
    .single();
  if (!actual) return { ok: false, error: "Empresa no encontrada." };
  if (actual.form_token) {
    return { ok: false, error: "La empresa ya tiene link — se conserva para no invalidar el compartido." };
  }

  const token = randomBytes(16).toString("hex");
  const { error } = await supabase
    .from("clientes")
    .update({ form_token: token })
    .eq("id", clienteId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/links");
  return { ok: true, token };
}
