"use server";

import { randomBytes, randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Slug limpio a partir del nombre del cliente (sin tildes, a-z0-9 y guiones). */
function slugify(s: string): string {
  const base = s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "cliente";
}

const pin4 = () => String(randomInt(0, 10000)).padStart(4, "0");

/**
 * Activa el portal por cliente (grupo): asegura slug único, token interno (link
 * de la oficina, sin PIN) y un PIN inicial aleatorio; además genera el token de
 * cada empresa del grupo que aún no lo tenga (el portal las carga por ese token).
 * Devuelve el PIN una sola vez para copiárselo al cliente.
 */
export async function activarPortalGrupo(
  grupoId: string,
): Promise<{ ok: boolean; slug?: string; pin?: string; error?: string }> {
  const supabase = await createClient();
  const { data: g } = await supabase
    .from("grupos_cliente")
    .select("id, codigo, nombre, portal_slug, form_token")
    .eq("id", grupoId)
    .single();
  if (!g) return { ok: false, error: "Cliente no encontrado." };

  // Slug: se conserva si ya existe; si no, se genera del nombre y se hace único.
  let slug = g.portal_slug as string | null;
  if (!slug) {
    const base = slugify(g.nombre);
    slug = base;
    const { data: existentes } = await supabase
      .from("grupos_cliente")
      .select("portal_slug")
      .not("portal_slug", "is", null);
    const usados = new Set((existentes ?? []).map((x) => x.portal_slug as string));
    let i = 2;
    while (usados.has(slug)) slug = `${base}-${i++}`;
  }

  const pin = pin4();
  // Fija slug + hash del PIN (bcrypt) vía RPC existente.
  const { error: e1 } = await supabase.rpc("portal_set_pin", {
    p_grupo_id: grupoId,
    p_slug: slug,
    p_pin: pin,
  });
  if (e1) return { ok: false, error: e1.message };

  // Token interno del grupo (link sin PIN) si aún no tiene.
  if (!g.form_token) {
    await supabase
      .from("grupos_cliente")
      .update({ form_token: randomBytes(16).toString("hex") })
      .eq("id", grupoId);
  }

  // Token por empresa (infraestructura del portal): genera el faltante.
  const { data: emps } = await supabase
    .from("clientes")
    .select("id, form_token")
    .eq("grupo_id", grupoId)
    .eq("activo", true);
  for (const e of emps ?? []) {
    if (!e.form_token) {
      await supabase
        .from("clientes")
        .update({ form_token: randomBytes(16).toString("hex") })
        .eq("id", e.id);
    }
  }

  revalidatePath("/links");
  return { ok: true, slug, pin };
}

/** Regenera el PIN del portal de un cliente (aleatorio, se muestra una vez). */
export async function regenerarPinGrupo(
  grupoId: string,
): Promise<{ ok: boolean; pin?: string; error?: string }> {
  const supabase = await createClient();
  const { data: g } = await supabase
    .from("grupos_cliente")
    .select("portal_slug")
    .eq("id", grupoId)
    .single();
  if (!g?.portal_slug) {
    return { ok: false, error: "Primero activa el portal del cliente." };
  }
  const pin = pin4();
  const { error } = await supabase.rpc("portal_set_pin", {
    p_grupo_id: grupoId,
    p_slug: g.portal_slug,
    p_pin: pin,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/links");
  return { ok: true, pin };
}

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
