"use server";

import { createClient } from "@/lib/supabase/server";
import { validarRut } from "@/lib/rut";

export type SolicitudInput = Record<string, string | boolean | null>;

/**
 * Crea la solicitud desde el formulario público del cliente. Toda la escritura
 * pasa por la función SECURITY DEFINER `crear_solicitud_publica`, que valida el
 * token de la empresa — el visitante anónimo no toca tablas directamente.
 */
export async function enviarSolicitud(
  token: string,
  datos: SolicitudInput,
): Promise<{ ok: boolean; error?: string }> {
  if (!datos.nombres || !datos.apellidos) {
    return { ok: false, error: "Nombres y apellidos son obligatorios." };
  }
  if (!datos.rut_provisorio && !validarRut(String(datos.rut ?? ""))) {
    return {
      ok: false,
      error: "El RUT no es válido. Si la persona aún no tiene RUT definitivo, marca la opción de RUT en trámite.",
    };
  }
  if (!datos.fecha_inicio) {
    return { ok: false, error: "La fecha de inicio es obligatoria." };
  }
  if (datos.tipo_contrato === "plazo_fijo" && !datos.fecha_vencimiento) {
    return { ok: false, error: "Un contrato a plazo fijo necesita fecha de término." };
  }
  if (!datos.sueldo_base || Number(datos.sueldo_base) <= 0) {
    return { ok: false, error: "El sueldo base es obligatorio." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("crear_solicitud_publica", {
    p_token: token,
    p: datos,
  });
  if (error) {
    return {
      ok: false,
      error: error.message.includes("inválido")
        ? "Este link de solicitud no es válido. Contacta a RS Tax & Legal."
        : `No se pudo enviar la solicitud: ${error.message}`,
    };
  }
  return { ok: true };
}
