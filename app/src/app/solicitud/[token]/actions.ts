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

  const esAnexo = datos.tipo_solicitud === "anexo";
  if (esAnexo) {
    if (!datos.anexo_tipo) {
      return { ok: false, error: "Indica el tipo de anexo." };
    }
    if (!datos.fecha_inicio) {
      return { ok: false, error: "La fecha del contrato original es obligatoria." };
    }
    if (datos.anexo_tipo === "renovacion_fijo_a_fijo" && !datos.fecha_vencimiento) {
      return { ok: false, error: "Indica la nueva fecha de término de la renovación." };
    }
    if (datos.anexo_tipo === "otro" && !datos.anexo_detalle) {
      return { ok: false, error: "Explica qué necesitas que diga el anexo." };
    }
    if (datos.anexo_tipo === "cambio_jornada") {
      if (!datos.cargo) {
        return { ok: false, error: "Indica el cargo del trabajador (determina la malla de turnos)." };
      }
      if (!datos.anexo_horas || Number(datos.anexo_horas) <= 0) {
        return { ok: false, error: "Indica las nuevas horas semanales." };
      }
      if (!datos.anexo_fecha_cambio) {
        return { ok: false, error: "Indica desde qué fecha rige la nueva jornada." };
      }
    }
  } else {
    if (!datos.fecha_inicio) {
      return { ok: false, error: "La fecha de inicio es obligatoria." };
    }
    if (datos.tipo_contrato === "plazo_fijo" && !datos.fecha_vencimiento) {
      return { ok: false, error: "Un contrato a plazo fijo necesita fecha de término." };
    }
    if (!datos.sueldo_base || Number(datos.sueldo_base) <= 0) {
      return { ok: false, error: "El sueldo base es obligatorio." };
    }
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

export type GestionInput = {
  tipo: "amonestacion" | "finiquito" | "vacaciones";
  nombres: string;
  apellidos: string;
  rut: string;
  observaciones: string;
  datos: Record<string, string>;
};

/**
 * Gestiones RRHH desde el portal del cliente (amonestación, finiquito,
 * vacaciones). Solo solicitud de datos: el equipo revisa, aprueba y envía el
 * resultado al correo de contacto. Inserta vía SECURITY DEFINER con token.
 */
export async function enviarGestion(
  token: string,
  g: GestionInput,
): Promise<{ ok: boolean; error?: string }> {
  if (!g.nombres.trim() || !g.apellidos.trim()) {
    return { ok: false, error: "Nombres y apellidos del trabajador son obligatorios." };
  }
  if (!validarRut(g.rut)) {
    return { ok: false, error: "El RUT del trabajador no es válido (revisa el dígito verificador)." };
  }
  if (g.tipo === "amonestacion") {
    if (!g.datos.fecha_hechos) return { ok: false, error: "Indica la fecha de los hechos." };
    if (!g.datos.descripcion?.trim()) {
      return { ok: false, error: "Describe los hechos que motivan la amonestación." };
    }
  }
  if (g.tipo === "finiquito") {
    if (!g.datos.fecha_ingreso) return { ok: false, error: "Indica la fecha de ingreso del trabajador." };
    if (!g.datos.fecha_termino) return { ok: false, error: "Indica el último día trabajado (o fecha de término prevista)." };
    if (!g.datos.causal) return { ok: false, error: "Indica la causal de término." };
    if (!g.datos.sueldo_base || Number(g.datos.sueldo_base) <= 0) {
      return { ok: false, error: "Indica el sueldo base actual." };
    }
    if (g.datos.vacaciones_dias_tomados === "" || g.datos.vacaciones_dias_tomados === undefined) {
      return { ok: false, error: "Indica cuántos días de vacaciones se ha tomado (0 si ninguno)." };
    }
  }
  if (g.tipo === "vacaciones") {
    if (!g.datos.fecha_inicio) return { ok: false, error: "Indica la fecha de inicio de las vacaciones." };
    if (!g.datos.fecha_regreso) return { ok: false, error: "Indica la fecha de regreso al trabajo." };
    if (!g.datos.dias_habiles || Number(g.datos.dias_habiles) <= 0) {
      return { ok: false, error: "Indica los días hábiles solicitados." };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("crear_gestion_rrhh", {
    p_token: token,
    p: {
      tipo: g.tipo,
      nombres: g.nombres.trim(),
      apellidos: g.apellidos.trim(),
      rut: g.rut.trim(),
      observaciones: g.observaciones,
      datos: g.datos,
    },
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
