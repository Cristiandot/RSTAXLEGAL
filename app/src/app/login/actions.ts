"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type EstadoLogin = {
  ok: boolean;
  mensaje: string;
};

/**
 * Valida que el correo esté presente y activo en `usuarios` (igual que el
 * sistema HTML) y recién entonces envía el magic link. El callback del enlace
 * apunta a /auth/callback para el intercambio de sesión vía cookies.
 */
export async function enviarMagicLink(
  _prev: EstadoLogin,
  formData: FormData,
): Promise<EstadoLogin> {
  const correo = String(formData.get("correo") ?? "")
    .trim()
    .toLowerCase();

  if (!correo || !correo.includes("@")) {
    return { ok: false, mensaje: "Ingresa un correo válido." };
  }

  const supabase = await createClient();

  const { data: usuario, error: errUsuario } = await supabase
    .from("usuarios")
    .select("correo, activo")
    .eq("correo", correo)
    .eq("activo", true)
    .maybeSingle();

  if (errUsuario) {
    console.error("Error validando usuario:", errUsuario);
    return { ok: false, mensaje: "Error al validar el usuario. Reintenta." };
  }

  if (!usuario) {
    return {
      ok: false,
      mensaje: "Este correo no está autorizado. Contacta al administrador.",
    };
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  const origin = `${proto}://${host}`;

  const { error: errAuth } = await supabase.auth.signInWithOtp({
    email: correo,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });

  if (errAuth) {
    console.error("Error enviando magic link:", errAuth);
    return { ok: false, mensaje: `Error al enviar el link: ${errAuth.message}` };
  }

  return {
    ok: true,
    mensaje:
      "Listo. Revisa tu correo (incluida la carpeta de spam) y haz clic en el link de acceso.",
  };
}
