"use server";

import { createClient } from "@/lib/supabase/server";
import {
  crearSolicitudContrato,
  type CrearContratoInput,
  type CrearContratoResult,
} from "@/lib/contrato-solicitud";

export type { CrearContratoInput, CrearContratoResult };

/**
 * Crea la solicitud de contrato desde el formulario interno. La lógica vive en
 * lib/contrato-solicitud (compartida con la API del agente); acá solo se
 * resuelve la identidad del usuario con sesión.
 */
export async function crearContrato(
  input: CrearContratoInput,
): Promise<CrearContratoResult> {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  const correoUsuario = auth.user?.email?.toLowerCase();
  const { data: u } = correoUsuario
    ? await supabase.from("usuarios").select("id").eq("correo", correoUsuario).maybeSingle()
    : { data: null };

  return crearSolicitudContrato(supabase, input, { creadoPor: u?.id ?? null });
}
