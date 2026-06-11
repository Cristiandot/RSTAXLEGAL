import type { SupabaseClient } from "@supabase/supabase-js";
import { generarDocx, fechaLarga } from "@/lib/generar-docx";

export type ResultadoCarta = {
  ok: boolean;
  error?: string;
  downloadUrl?: string;
  nombreArchivo?: string;
};

/**
 * Redacción del párrafo de hechos según el motivo del catálogo
 * (lib/amonestaciones.ts). Continúa la frase "Con fecha X, …" de la plantilla
 * y va sin punto final (el punto está en la plantilla).
 */
const MOTIVO_TEXTO: Record<string, string> = {
  atrasos:
    "usted incurrió nuevamente en atrasos en su hora de llegada, conducta que se ha verificado en forma reiterada según los registros de control de asistencia de la empresa",
  inasistencia:
    "usted no se presentó a trabajar, sin dar aviso previo a su jefatura ni acompañar justificación posterior",
  abandono:
    "usted hizo abandono de su puesto de trabajo, retirándose antes del término de su jornada sin autorización de su jefatura ni causa justificada",
  no_marcar:
    "usted no registró su asistencia en el sistema de control dispuesto por la empresa, en circunstancias de que ello constituye una obligación expresa de su contrato de trabajo y del Reglamento Interno",
  incumplimiento:
    "usted incumplió las instrucciones impartidas por su jefatura y/o las funciones propias de su cargo",
  seguridad:
    "usted infringió las normas de seguridad e higiene aplicables a sus funciones, incluyendo la no utilización de los elementos de protección personal proporcionados por la empresa",
  celular:
    "usted hizo uso de su teléfono celular u otros dispositivos personales durante el horario y en el lugar de trabajo, contraviniendo la prohibición expresa contemplada en su contrato de trabajo y en el Reglamento Interno",
  respeto:
    "usted incurrió en un trato irrespetuoso hacia su jefatura, compañeros de trabajo y/o clientes, conducta contraria a sus obligaciones contractuales y al Reglamento Interno",
  presentacion:
    "usted se presentó a sus labores sin su uniforme o sin cumplir los estándares de presentación personal definidos por la empresa",
  caja:
    "se constató una diferencia o faltante de dinero y/o errores en el procedimiento de manejo de valores a su cargo durante su turno",
  otro: "usted incurrió en la conducta que se describe a continuación",
};

/**
 * Genera la carta de amonestación de una gestión RRHH desde la plantilla
 * genérica (válida para todas las empresas), la sube a Storage y guarda la
 * ruta en la solicitud. Devuelve link firmado de descarga.
 */
export async function generarYSubirCartaAmonestacion(
  supabase: SupabaseClient,
  gestionId: string,
): Promise<ResultadoCarta> {
  const { data: g, error: errG } = await supabase
    .from("solicitudes_rrhh")
    .select("*, clientes(*)")
    .eq("id", gestionId)
    .single();
  if (errG || !g) return { ok: false, error: "Gestión no encontrada." };
  if (g.tipo !== "amonestacion") {
    return { ok: false, error: "Esta gestión no es una amonestación." };
  }

  const cli = g.clientes as Record<string, unknown> | null;
  if (!cli) return { ok: false, error: "Falta la empresa de la gestión." };
  const repLegal = (cli.representante_legal as string) ?? "";
  if (!repLegal) {
    return {
      ok: false,
      error: `Falta el representante legal de ${cli.razon_social}. Cárgalo antes de generar la carta.`,
    };
  }

  const datos = (g.datos ?? {}) as {
    fecha_hechos?: string;
    motivo?: string;
    descripcion?: string;
  };

  const hoy = new Date().toISOString().slice(0, 10);
  const variables: Record<string, string> = {
    CIUDAD_FIRMA:
      (cli.lugar_firma_contrato as string) ||
      (cli.ciudad as string) ||
      (cli.comuna as string) ||
      "",
    FECHA_CARTA: fechaLarga(hoy),
    NOMBRE_EMPLEADO: g.trabajador_nombre ?? "",
    RUT_EMPLEADO: g.trabajador_rut ?? "",
    RAZON_SOCIAL: (cli.razon_social as string) ?? "",
    RUT_EMPRESA: (cli.rut_empresa as string) ?? "",
    NOMBRE_REP_LEGAL: repLegal,
    FECHA_HECHOS: fechaLarga(datos.fecha_hechos),
    MOTIVO_TEXTO: MOTIVO_TEXTO[datos.motivo ?? ""] ?? MOTIVO_TEXTO.otro,
    DESCRIPCION_HECHOS: datos.descripcion ?? "",
  };

  let buffer: Buffer;
  try {
    buffer = await generarDocx("plantillas/GENERICO/CARTA Amonestacion.docx", variables);
  } catch (e) {
    return {
      ok: false,
      error: `Falló la generación de la carta: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const storagePath = `gestiones/${gestionId}/carta-amonestacion.docx`;
  const { error: errUp } = await supabase.storage
    .from("contratos")
    .upload(storagePath, buffer, {
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: true,
    });
  if (errUp) return { ok: false, error: `Falló la subida a Storage: ${errUp.message}` };

  await supabase
    .from("solicitudes_rrhh")
    .update({ documento_path: storagePath })
    .eq("id", gestionId);

  const nombreArchivo = `Carta Amonestación - ${g.trabajador_nombre}.docx`;
  const { data: firmado } = await supabase.storage
    .from("contratos")
    .createSignedUrl(storagePath, 3600, { download: nombreArchivo });

  return { ok: true, downloadUrl: firmado?.signedUrl, nombreArchivo };
}
