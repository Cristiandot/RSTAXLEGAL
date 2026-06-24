import type { SupabaseClient } from "@supabase/supabase-js";
import { generarDocx, fechaLarga } from "@/lib/generar-docx";
import { nombreArchivo } from "@/lib/format";

/**
 * Carta de aviso de término de contrato (Art. 162 CT) para el módulo
 * Finiquitos. Se genera desde la plantilla genérica con los datos de la
 * solicitud + el cálculo vigente de la calculadora, se sube a Storage y la
 * referencia queda en `datos.carta_aviso` de la solicitud.
 */

export type ResultadoCartaAviso = {
  ok: boolean;
  error?: string;
  downloadUrl?: string;
  nombreArchivo?: string;
};

export type ParametrosCartaAviso = {
  fechaEntrega: string; // fecha en que se entrega/remite la carta
  fechaTermino: string; // fecha desde la que se hace efectivo el término
  modalidadEntrega: "personal" | "certificada";
  domicilioEmpleado: string;
  hechos: string; // fundamentos de la causal
  cotizacionesHasta: string; // YYYY-MM hasta el cual están pagadas
  avisoCon30Dias: boolean;
  causal: string; // código, ej. "161-1"
  resumen: {
    indemAnios: number;
    indemAviso: number;
    vacacionesMonto: number;
    vacacionesDias: number;
    remuneracionPendiente: number;
    total: number;
  };
};

/**
 * Glosa de la causal para la carta, en palabras (sin referencia al Código del
 * Trabajo). Regla RSTL: las cartas/documentos tipo NO citan artículos del CT.
 */
const CAUSAL_CARTA: Record<string, string> = {
  "159-4": "el vencimiento del plazo convenido en el contrato",
  "159-5": "la conclusión del trabajo o servicio que dio origen al contrato",
  "159-6": "caso fortuito o fuerza mayor",
  "160-1":
    "alguna de las conductas indebidas de carácter grave, debidamente comprobadas",
  "160-2":
    "negociaciones que ejecuta el trabajador dentro del giro del negocio y que fueron prohibidas por escrito en el respectivo contrato",
  "160-3": "la no concurrencia del trabajador a sus labores sin causa justificada",
  "160-4": "el abandono del trabajo",
  "160-5":
    "actos, omisiones o imprudencias temerarias que afectan a la seguridad o al funcionamiento del establecimiento, a la seguridad o a la actividad de los trabajadores, o a la salud de éstos",
  "160-6":
    "el perjuicio material causado intencionalmente en las instalaciones, maquinarias, herramientas, útiles de trabajo, productos o mercaderías",
  "160-7": "el incumplimiento grave de las obligaciones que impone el contrato",
  "161-1": "las necesidades de la empresa, establecimiento o servicio",
  "161-2": "el desahucio escrito del empleador",
  "163bis": "el sometimiento del empleador a un procedimiento concursal de liquidación",
};

/** Causales que admiten carta de aviso del Art. 162. */
export const CAUSALES_CON_CARTA = new Set(Object.keys(CAUSAL_CARTA));

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function mesLargo(periodo: string): string {
  const [y, m] = periodo.split("-").map(Number);
  return `${MESES[m - 1] ?? periodo} de ${y}`;
}

function clp(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-CL");
}

export async function generarYSubirCartaAviso(
  supabase: SupabaseClient,
  gestionId: string,
  p: ParametrosCartaAviso,
): Promise<ResultadoCartaAviso> {
  const causalTexto = CAUSAL_CARTA[p.causal];
  if (!causalTexto) {
    return {
      ok: false,
      error: "La causal seleccionada no lleva carta de aviso del Art. 162 (renuncia, mutuo acuerdo o muerte se documentan de otra forma).",
    };
  }
  if (!p.fechaEntrega || !p.fechaTermino) {
    return { ok: false, error: "Indica la fecha de entrega de la carta y la fecha de término." };
  }
  // Causales objetivas del Art. 159 (vencimiento del plazo, conclusión de obra,
  // caso fortuito) no requieren fundamentación de hechos: esa sección se omite.
  // Sí se exige en las causales de caducidad (160) y necesidades/desahucio (161).
  const mostrarHechos =
    p.causal.startsWith("160") || p.causal.startsWith("161") || p.causal === "163bis";
  if (mostrarHechos && !p.hechos.trim()) {
    return { ok: false, error: "Describe los hechos que fundan la causal." };
  }

  const { data: g, error: errG } = await supabase
    .from("solicitudes_rrhh")
    .select("*, clientes(*)")
    .eq("id", gestionId)
    .single();
  if (errG || !g) return { ok: false, error: "Solicitud no encontrada." };
  if (g.tipo !== "finiquito") {
    return { ok: false, error: "Esta solicitud no es de finiquito." };
  }

  const cli = g.clientes as Record<string, unknown> | null;
  if (!cli) return { ok: false, error: "Falta la empresa de la solicitud." };
  const repLegal = (cli.representante_legal as string) ?? "";
  if (!repLegal) {
    return {
      ok: false,
      error: `Falta el representante legal de ${cli.razon_social}. Cárgalo antes de generar la carta.`,
    };
  }

  // El aviso previo / indemnización sustitutiva solo aplica a las causales con
  // indemnización (Art. 161 y 163 bis). En el resto (Art. 159 y 160) no
  // corresponde y el párrafo se omite — en particular, en el vencimiento del
  // plazo no hay aviso previo ni indemnización sustitutiva.
  const conIndemnizacion =
    p.causal === "161-1" || p.causal === "161-2" || p.causal === "163bis";
  const avisoTexto = !conIndemnizacion
    ? ""
    : p.avisoCon30Dias
      ? "El presente aviso se otorga con la anticipación mínima de treinta días."
      : "Atendido que el término del contrato se hará efectivo sin mediar el aviso previo de treinta días, se pagará a usted la indemnización sustitutiva del aviso previo equivalente a la última remuneración mensual devengada.";

  const entregaTexto =
    p.modalidadEntrega === "personal"
      ? "La presente carta se entrega personalmente al trabajador, quien firma su recepción al pie."
      : "La presente carta se remite por correo certificado al domicilio del trabajador registrado en su contrato de trabajo.";

  // Fecha de inicio del CONTRATO ORIGINAL (antigüedad reconocida): la misma que
  // usa el cálculo de indemnización. Criterio RSTL: las cartas de aviso (y los
  // finiquitos) siempre se fundan en la fecha de inicio del contrato original,
  // no en la de un anexo o renovación posterior.
  const datosGestion = (g.datos ?? {}) as Record<string, unknown>;
  const calc = datosGestion.calculo_finiquito as
    | { entrada?: { fechaInicio?: string } }
    | undefined;
  const fechaInicioContrato =
    calc?.entrada?.fechaInicio ||
    (datosGestion.fecha_ingreso as string) ||
    "";

  const variables: Record<string, string> = {
    CIUDAD_FIRMA:
      (cli.lugar_firma_contrato as string) ||
      (cli.ciudad as string) ||
      (cli.comuna as string) ||
      "",
    FECHA_CARTA: fechaLarga(p.fechaEntrega),
    NOMBRE_EMPLEADO: g.trabajador_nombre ?? "",
    RUT_EMPLEADO: g.trabajador_rut ?? "",
    DOMICILIO_EMPLEADO: p.domicilioEmpleado || "registrado en su contrato de trabajo",
    RAZON_SOCIAL: (cli.razon_social as string) ?? "",
    RUT_EMPRESA: (cli.rut_empresa as string) ?? "",
    NOMBRE_REP_LEGAL: repLegal,
    CAUSAL_TEXTO: causalTexto,
    FECHA_INGRESO: fechaLarga(fechaInicioContrato),
    FECHA_TERMINO: fechaLarga(p.fechaTermino),
    mostrarHechos: mostrarHechos ? "1" : "",
    HECHOS_TEXTO: p.hechos.trim(),
    AVISO_TEXTO: avisoTexto,
    INDEM_ANIOS: p.resumen.indemAnios > 0 ? clp(p.resumen.indemAnios) : "No procede",
    INDEM_AVISO: p.resumen.indemAviso > 0 ? clp(p.resumen.indemAviso) : "No procede",
    VACACIONES_TEXTO: `${clp(p.resumen.vacacionesMonto)} (${p.resumen.vacacionesDias.toLocaleString("es-CL")} días corridos)`,
    REM_PENDIENTE: clp(p.resumen.remuneracionPendiente),
    TOTAL_FINIQUITO: clp(p.resumen.total),
    COTIZACIONES_TEXTO: `Asimismo, se informa a usted que sus cotizaciones previsionales se encuentran íntegramente pagadas hasta el mes de ${mesLargo(p.cotizacionesHasta)}, según consta en los certificados que se adjuntan a la presente comunicación.`,
    ENTREGA_TEXTO: entregaTexto,
  };

  let buffer: Buffer;
  try {
    buffer = await generarDocx("plantillas/GENERICO/CARTA Aviso Termino.docx", variables);
  } catch (e) {
    return {
      ok: false,
      error: `Falló la generación de la carta: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const storagePath = `gestiones/${gestionId}/carta-aviso-termino.docx`;
  const { error: errUp } = await supabase.storage
    .from("contratos")
    .upload(storagePath, buffer, {
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: true,
    });
  if (errUp) return { ok: false, error: `Falló la subida a Storage: ${errUp.message}` };

  const datos = (g.datos ?? {}) as Record<string, unknown>;
  await supabase
    .from("solicitudes_rrhh")
    .update({
      datos: {
        ...datos,
        carta_aviso: {
          path: storagePath,
          fecha_entrega: p.fechaEntrega,
          fecha_termino: p.fechaTermino,
          modalidad: p.modalidadEntrega,
          causal: p.causal,
          generada_en: new Date().toISOString(),
        },
      },
    })
    .eq("id", gestionId);

  const nombreDescarga = nombreArchivo(`Carta Aviso Termino - ${g.trabajador_nombre}`) + ".docx";
  const { data: firmado } = await supabase.storage
    .from("contratos")
    .createSignedUrl(storagePath, 3600, { download: nombreDescarga });

  return { ok: true, downloadUrl: firmado?.signedUrl, nombreArchivo: nombreDescarga };
}
