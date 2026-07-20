"use server";

import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

/**
 * Verifica slug + PIN de 4 dígitos vía RPC portal_unlock (con bloqueo). Si es
 * correcto, deja una cookie de sesión (httpOnly, 30 días) con el token interno
 * del grupo, y la página lo usa para renderizar el portal.
 */
export async function desbloquearPortal(
  slug: string,
  pin: string,
): Promise<{ ok: boolean; bloqueado?: boolean; restantes?: number }> {
  if (!/^\d{4}$/.test(pin)) return { ok: false };
  const supabase = await createClient();
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  const { data } = await supabase.rpc("portal_unlock", {
    p_slug: slug,
    p_pin: pin,
    p_ip: ip,
  });
  const r = (data ?? {}) as {
    ok?: boolean;
    token?: string;
    bloqueado?: boolean;
    restantes?: number;
  };

  if (r.ok && r.token) {
    (await cookies()).set(`rstl_portal_${slug}`, r.token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return { ok: true };
  }
  return { ok: false, bloqueado: r.bloqueado, restantes: r.restantes };
}

/**
 * El cliente cambia su propio PIN del portal. Se identifica por slug (el de la
 * URL) y valida el PIN actual; el token interno del grupo (acceso sin PIN de la
 * oficina) no se ve afectado.
 */
export async function cambiarPinPortal(
  slug: string,
  pinActual: string,
  pinNuevo: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!/^\d{4}$/.test(pinNuevo)) {
    return { ok: false, error: "El PIN nuevo debe ser de 4 dígitos." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("portal_cambiar_pin", {
    p_slug: slug,
    p_pin_actual: pinActual,
    p_pin_nuevo: pinNuevo,
  });
  if (error) return { ok: false, error: "No se pudo cambiar el PIN. Reintenta." };
  const r = (data ?? {}) as { ok?: boolean; error?: string };
  return r.ok ? { ok: true } : { ok: false, error: r.error ?? "No se pudo cambiar el PIN." };
}

export type BitacoraItem = {
  fuente: "gestion" | "requerimiento";
  fecha: string | null;
  tipo: string | null;
  trabajador: string | null;
  empresa: string | null;
  estado: string | null;
  canal: string | null;
  detalle: string | null;
};

/** Bitácora de gestiones del grupo (gestiones RRHH + requerimientos WhatsApp/correo). */
export async function cargarBitacoraGrupo(
  token: string,
): Promise<{ ok: boolean; items?: BitacoraItem[]; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("portal_bitacora_grupo", { p_token: token });
  if (error) return { ok: false, error: error.message };
  return { ok: true, items: (data ?? []) as BitacoraItem[] };
}
