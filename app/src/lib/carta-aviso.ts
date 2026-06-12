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

/** Texto legal de la causal para la carta (artículo + glosa). */
const CAUSAL_CARTA: Record<string, string> = {
  "159-4":
    "el artículo 159 N°4 del Código del Trabajo, esto es, vencimiento del plazo convenido en el contrato",
  "159-5":
    "el artículo 159 N°5 del Código del Trabajo, esto es, conclusión del trabajo o servicio que dio origen al contrato",
  "159-6":
    "el artículo 159 N°6 del Código del Trabajo, esto es, caso fortuito o fuerza mayor",
  "160-1":
    "el artículo 160 N°1 del Código del Trabajo, esto es, alguna de las conductas indebidas de carácter grave, debidamente comprobadas, que en dicha norma se señalan",
  "160-2":
    "el artículo 160 N°2 del Código del Trabajo, esto es, negociaciones que ejecute el trabajador dentro del giro del negocio y que hubieren sido prohibidas por escrito en el respectivo contrato",
  "160-3":
    "el artículo 160 N°3 del Código del Trabajo, esto es, no concurrencia del trabajador a sus labores sin causa justificada",
  "160-4":
    "el artículo 160 N°4 del Código del Trabajo, esto es, abandono del trabajo",
  "160-5":
    "el artículo 160 N°5 del Código del Trabajo, esto es, actos, omisiones o imprudencias temerarias que afecten a la seguridad o al funcionamiento del establecimiento, a la seguridad o a la actividad de los trabajadores, o a la salud de éstos",
  "160-6":
    "el artículo 160 N°6 del Código del Trabajo, esto es, perjuicio material causado intencionalmente en las instalaciones, maquinarias, herramientas, útiles de trabajo, productos o mercaderías",
  "160-7":
    "el artículo 160 N°7 del Código del Trabajo, esto es, incumplimiento grave de las obligaciones que impone el contrato",
  "161-1":
    "el artículo 161 inciso primero del Código del Trabajo, esto es, necesidades de la empresa, establecimiento o servicio",
  "161-2":
    "el artículo 161 inciso segundo del Código del Trabajo, esto es, desahucio escrito del empleador",
  "163bis":
    "el artículo 163 bis del Código del Trabajo, esto es, sometimiento del empleador a un procedimiento concursal de liquidación",
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
  if (!p.hechos.trim()) {
    return { ok: false, error: "Describe los hechos que fundan la causal (obligatorio en la carta del Art. 162)." };
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

  const avisoTexto = p.avisoCon30Dias
    ? "El presente aviso se otorga con la anticipación mínima de treinta días que exige el artículo 162 inciso cuarto del Código del Trabajo."
    : "Atendido que el término del contrato se hará efectivo sin mediar el aviso previo de treinta días, se pagará a usted la indemnización sustitutiva del aviso previo equivalente a la última remuneración mensual devengada, conforme al artículo 162 inciso cuarto del Código del Trabajo.";

  const entregaTexto =
    p.modalidadEntrega === "personal"
      ? "La presente carta se entrega personalmente al trabajador, quien firma su recepción al pie."
      : "La presente carta se remite por correo certificado al domicilio del trabajador registrado en su contrato de trabajo, conforme al artículo 162 inciso primero del Código del Trabajo.";

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
    FECHA_TERMINO: fechaLarga(p.fechaTermino),
    HECHOS_TEXTO: p.hechos.trim(),
    AVISO_TEXTO: avisoTexto,
    INDEM_ANIOS: p.resumen.indemAnios > 0 ? clp(p.resumen.indemAnios) : "No procede",
    INDEM_AVISO: p.resumen.indemAviso > 0 ? clp(p.resumen.indemAviso) : "No procede",
    VACACIONES_TEXTO: `${clp(p.resumen.vacacionesMonto)} (${p.resumen.vacacionesDias.toLocaleString("es-CL")} días corridos)`,
    REM_PENDIENTE: clp(p.resumen.remuneracionPendiente),
    TOTAL_FINIQUITO: clp(p.resumen.total),
    COTIZACIONES_TEXTO: `Asimismo, se informa a usted que sus cotizaciones previsionales se encuentran íntegramente pagadas hasta el mes de ${mesLargo(p.cotizacionesHasta)}, según consta en los certificados que se adjuntan a la presente comunicación (artículo 162 inciso quinto del Código del Trabajo).`,
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
