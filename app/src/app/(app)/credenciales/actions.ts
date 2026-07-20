"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type TipoClave =
  | "clave_sii"
  | "previred_clave"
  | "mutual_clave"
  | "afc_clave"
  | "sii_rep_clave"
  | "midt_clave";

const CAMPOS_EDITABLES = [
  "clave_sii",
  "previred_clave",
  "previred_rut",
  "mutual_clave",
  "mutual_rut",
  "afc_clave",
  "afc_rut",
  "sii_rep_clave",
  "sii_rep_rut",
  "midt_clave",
  "midt_rut",
] as const;
export type CampoCredencial = (typeof CAMPOS_EDITABLES)[number];

// Claves (secretas): se revelan/copian con auditoría. El resto son RUT (usuario).
const CLAVES_SECRETAS: TipoClave[] = [
  "clave_sii",
  "previred_clave",
  "mutual_clave",
  "afc_clave",
  "sii_rep_clave",
  "midt_clave",
];

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
  if (!CLAVES_SECRETAS.includes(campo)) {
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
  revalidatePath("/liquidaciones");
  revalidatePath("/f29");
  return { ok: true };
}

// ─── Otros accesos (tabla credenciales_extra) ────────────────────────────────
// Accesos sin columna estándar en `clientes` (ERP, KAME, banco, correo, CCAF,
// IST, accesos alternativos, etc.). La clave nunca viaja en la carga inicial:
// se pide con revelarCredencialExtra (auditada como el resto).

export type CampoExtra = "sistema" | "usuario" | "clave" | "url" | "notas";

/** Devuelve la clave real de un acceso extra (revelar/copiar), auditada. */
export async function revelarCredencialExtra(
  id: string,
  accion: "revelar" | "copiar" = "revelar",
): Promise<{ ok: boolean; valor?: string | null; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("credenciales_extra")
    .select("cliente_id, clave")
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Acceso no encontrado." };

  await supabase.rpc("registrar_revelacion_credencial", {
    p_cliente_id: data.cliente_id,
    p_campo: `extra:${id}`,
    p_accion: accion,
  });

  return { ok: true, valor: data.clave ?? null };
}

/** Crea un acceso extra para una empresa. `sistema` es obligatorio. */
export async function crearCredencialExtra(
  clienteId: string,
  datos: { sistema: string; usuario?: string; clave?: string; url?: string; notas?: string },
): Promise<{ ok: boolean; error?: string }> {
  const sistema = datos.sistema.trim();
  if (!sistema) return { ok: false, error: "El sistema es obligatorio." };

  const supabase = await createClient();
  const { error } = await supabase.from("credenciales_extra").insert({
    cliente_id: clienteId,
    sistema,
    usuario: datos.usuario?.trim() || null,
    clave: datos.clave?.trim() || null,
    url: datos.url?.trim() || null,
    notas: datos.notas?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/credenciales");
  revalidatePath("/empresas");
  return { ok: true };
}

/** Actualiza campos de un acceso extra. Strings vacíos borran el campo. */
export async function guardarCredencialExtra(
  id: string,
  datos: Partial<Record<CampoExtra, string>>,
): Promise<{ ok: boolean; error?: string }> {
  const patch: Record<string, string | null> = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(datos)) {
    if (k === "sistema") {
      const s = (v ?? "").trim();
      if (!s) return { ok: false, error: "El sistema es obligatorio." };
      patch.sistema = s;
    } else {
      patch[k] = (v ?? "").trim() || null;
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.from("credenciales_extra").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/credenciales");
  revalidatePath("/empresas");
  return { ok: true };
}

/** Elimina un acceso extra. */
export async function eliminarCredencialExtra(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("credenciales_extra").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/credenciales");
  revalidatePath("/empresas");
  return { ok: true };
}
