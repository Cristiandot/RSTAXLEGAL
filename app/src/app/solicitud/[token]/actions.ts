"use server";

import { createClient } from "@/lib/supabase/server";
import { validarRut } from "@/lib/rut";
import { calcularVacaciones } from "@/lib/feriados";

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
  // Con trabajador registrado seleccionado, nombre/RUT canónicos salen de la BD.
  const trabajadorRegistrado = Boolean(datos.trabajador_id);
  if (!trabajadorRegistrado && (!datos.nombres || !datos.apellidos)) {
    return { ok: false, error: "Nombres y apellidos son obligatorios." };
  }
  if (!trabajadorRegistrado && !datos.rut_provisorio && !validarRut(String(datos.rut ?? ""))) {
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
  tipo: "amonestacion" | "finiquito" | "vacaciones" | "permiso";
  trabajador_id: string | null;
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
  // Si viene un trabajador registrado, la RPC toma nombre/RUT de la BD —
  // no se valida el texto del formulario.
  if (!g.trabajador_id) {
    if (!g.nombres.trim() || !g.apellidos.trim()) {
      return { ok: false, error: "Nombres y apellidos del trabajador son obligatorios." };
    }
    if (!validarRut(g.rut)) {
      return { ok: false, error: "El RUT del trabajador no es válido (revisa el dígito verificador)." };
    }
  }
  if (g.tipo === "amonestacion") {
    if (!g.datos.fecha_hechos) return { ok: false, error: "Indica la fecha de los hechos." };
    if (!g.datos.descripcion?.trim()) {
      return { ok: false, error: "Describe los hechos que motivan la amonestación." };
    }
  }
  if (g.tipo === "finiquito") {
    if (!g.datos.causal) return { ok: false, error: "Indica la causal de término." };
    if (!g.datos.fecha_aviso) return { ok: false, error: "Indica la fecha de aviso del despido." };
    if (!g.datos.fecha_termino) return { ok: false, error: "Indica la fecha de término de la relación laboral." };
    if (g.datos.causal === "necesidades_empresa" && !g.datos.aviso_modalidad) {
      return { ok: false, error: "Indica si avisarás con 30 días de anticipación o pagarás el mes de aviso." };
    }
  }
  if (g.tipo === "vacaciones") {
    if (!g.datos.fecha_inicio) return { ok: false, error: "Indica el primer día de vacaciones." };
    if (!g.datos.fecha_termino) return { ok: false, error: "Indica el último día de vacaciones." };
    // Los días hábiles se calculan acá (sábados, domingos y feriados legales
    // no cuentan — Arts. 67 y 69 CT); no se confía en lo que mande el navegador.
    const calc = calcularVacaciones(g.datos.fecha_inicio, g.datos.fecha_termino);
    if (!calc) {
      return { ok: false, error: "El último día de vacaciones no puede ser anterior al primero." };
    }
    if (calc.diasHabiles <= 0) {
      return { ok: false, error: "El rango elegido no contiene días hábiles (solo sábados, domingos o feriados)." };
    }
    g.datos.dias_habiles = String(calc.diasHabiles);
    if (calc.fechaRegreso) g.datos.fecha_regreso = calc.fechaRegreso;
    if (!calc.coberturaCompleta) g.datos.cobertura_feriados = "incompleta";
  }
  if (g.tipo === "permiso") {
    if (!g.datos.tipo_permiso) return { ok: false, error: "Indica el tipo de permiso." };
    if (g.datos.goce !== "con" && g.datos.goce !== "sin") {
      return { ok: false, error: "Indica si el permiso es con o sin goce de remuneraciones." };
    }
    if (!g.datos.fecha_desde) return { ok: false, error: "Indica la fecha del permiso." };
    if (g.datos.unidad === "horas") {
      if (!g.datos.horas || Number(g.datos.horas) <= 0) {
        return { ok: false, error: "Indica la cantidad de horas del permiso." };
      }
      g.datos.fecha_hasta = g.datos.fecha_desde;
    } else {
      if (!g.datos.fecha_hasta) return { ok: false, error: "Indica el último día del permiso." };
      // Días corridos y hábiles de referencia calculados acá (un permiso puede
      // caer en sábado/domingo y sigue siendo válido — no se rechaza por eso).
      const calc = calcularVacaciones(g.datos.fecha_desde, g.datos.fecha_hasta);
      if (!calc) {
        return { ok: false, error: "El último día del permiso no puede ser anterior al primero." };
      }
      const ini = Date.parse(`${g.datos.fecha_desde}T00:00:00Z`);
      const fin = Date.parse(`${g.datos.fecha_hasta}T00:00:00Z`);
      g.datos.dias_corridos = String(Math.round((fin - ini) / 86_400_000) + 1);
      g.datos.dias_habiles = String(calc.diasHabiles);
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("crear_gestion_rrhh", {
    p_token: token,
    p: {
      tipo: g.tipo,
      trabajador_id: g.trabajador_id,
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
