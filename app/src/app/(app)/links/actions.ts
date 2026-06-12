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

/** Crea un cliente-matriz (grupo) — ej. código 'A.4', nombre 'Red Barrera'. */
export async function crearGrupoCliente(
  codigo: string,
  nombre: string,
): Promise<{ ok: boolean; error?: string }> {
  const cod = codigo.trim();
  const nom = nombre.trim();
  if (!cod || !nom) return { ok: false, error: "Indica código y nombre del cliente." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("grupos_cliente")
    .insert({ codigo: cod, nombre: nom });
  if (error) {
    return {
      ok: false,
      error: error.message.includes("duplicate")
        ? `El código ${cod} ya existe.`
        : error.message,
    };
  }
  revalidatePath("/links");
  return { ok: true };
}

/** Asigna (o quita, con null) el cliente-matriz de una empresa. */
export async function asignarGrupoCliente(
  clienteId: string,
  grupoId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("clientes")
    .update({ grupo_id: grupoId })
    .eq("id", clienteId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/links");
  return { ok: true };
}
