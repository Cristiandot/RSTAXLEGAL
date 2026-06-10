import type { SupabaseClient } from "@supabase/supabase-js";
import { generarDocx, fechaLarga, montoCLP } from "@/lib/generar-docx";
import { montoEnPalabras } from "@/lib/numero-palabras";

export type ResultadoGeneracion = {
  ok: boolean;
  error?: string;
  downloadUrl?: string;
  nombreArchivo?: string;
};

/**
 * Genera el .docx de un contrato existente (cualquiera sea su origen: formulario
 * interno o solicitud pública), lo sube a Storage y marca el contrato 'generado'.
 * Resuelve la plantilla por cliente × cargo × jornada × nacionalidad × tipo.
 */
export async function generarYSubirContrato(
  supabase: SupabaseClient,
  contratoId: string,
): Promise<ResultadoGeneracion> {
  const { data: con, error: errCon } = await supabase
    .from("contratos")
    .select("*, trabajadores(*), clientes(*)")
    .eq("id", contratoId)
    .single();
  if (errCon || !con) return { ok: false, error: "Contrato no encontrado." };

  const t = con.trabajadores as Record<string, unknown>;
  const cli = con.clientes as Record<string, unknown>;
  if (!t || !cli) return { ok: false, error: "Faltan datos del trabajador o la empresa." };

  const repLegal = (cli.representante_legal as string) ?? "";
  const domicilio = (cli.domicilio as string) ?? "";
  if (!repLegal || !domicilio) {
    return {
      ok: false,
      error: `Faltan datos del empleador de ${cli.razon_social} (representante legal y/o domicilio). Cárgalos antes de generar.`,
    };
  }

  const jornada = (con.jornada ?? {}) as { tipo?: string; horas_semanales?: number | null };
  const rem = (con.remuneracion ?? {}) as {
    sueldo_base?: number;
    movilizacion?: number;
    colacion?: number;
  };
  const nacionalidad = ((t.nacionalidad as string) ?? "Chilena").trim();
  const nacPlantilla = nacionalidad.toLowerCase().startsWith("chilen") ? "chileno" : "extranjero";
  const jornadaTipo = jornada.tipo ?? "completa";
  const horas = jornada.horas_semanales ?? null;

  const { data: candidatas, error: errPl } = await supabase
    .from("plantillas_contrato")
    .select("id, archivo_path, horas_semanales")
    .eq("cliente_id", con.cliente_id)
    .eq("cargo", con.cargo)
    .eq("jornada_tipo", jornadaTipo)
    .eq("nacionalidad", nacPlantilla)
    .eq("tipo_contrato", con.tipo_contrato)
    .eq("tipo_documento", "contrato")
    .eq("aprobada", true)
    .eq("activo", true);
  if (errPl) return { ok: false, error: `Error buscando plantilla: ${errPl.message}` };

  const plantilla =
    candidatas?.find((p) => Number(p.horas_semanales) === horas) ??
    candidatas?.find((p) => p.horas_semanales === null) ??
    candidatas?.[0];
  if (!plantilla) {
    return {
      ok: false,
      error: `No hay plantilla aprobada para: ${con.cargo} · ${jornadaTipo} · ${nacPlantilla} · ${String(con.tipo_contrato).replace("_", " ")}.`,
    };
  }

  const nombreCompleto = `${t.nombres} ${t.apellidos}`;
  const rutEmpleado = t.rut_provisorio
    ? (t.rut ? `${t.rut} (provisorio)` : "(RUT en trámite)")
    : ((t.rut as string) ?? "");
  const sueldo = Number(rem.sueldo_base ?? 0);
  const movilizacion = Number(rem.movilizacion ?? 0);
  const colacion = Number(rem.colacion ?? 0);

  const variables: Record<string, string> = {
    RAZON_SOCIAL: (cli.razon_social as string) ?? "",
    RUT_EMPRESA: (cli.rut_empresa as string) ?? "",
    NOMBRE_REP_LEGAL: repLegal,
    RUT_REP_LEGAL: (cli.representante_legal_rut as string) ?? "",
    EMAIL_EMPRESA: (cli.correo_empresa as string) ?? "",
    DIRECCION_EMPRESA: domicilio,
    NOMBRE_EMPLEADO: nombreCompleto,
    RUT_EMPLEADO: rutEmpleado,
    EMAILPERSONAL_EMPLEADO: (t.correo as string) ?? "",
    TELEFONOPERSONAL_EMPLEADO: (t.fono as string) ?? "",
    NACIONALIDAD_EMPLEADO: nacionalidad,
    DIRECCION_EMPLEADO: (t.direccion as string) ?? "",
    COMUNA_EMPLEADO: (t.comuna as string) ?? "",
    ESTADO_CIVIL: (t.estado_civil as string) ?? "",
    FECHA_NACIMIENTO: fechaLarga(t.fecha_nacimiento as string),
    CARGO:
      con.cargo === "aStop"
        ? "Atendedor de Tienda de Conveniencia (aStop)"
        : "Atendedor de Estación de Servicio",
    FECHA_INICIO_CONTRATO: fechaLarga(con.fecha_inicio),
    FECHA_TERMINO_CONTRATO: fechaLarga(con.fecha_vencimiento),
    TIPO_CONTRATO: con.tipo_contrato === "plazo_fijo" ? "plazo fijo" : "indefinido",
    SUELDO_BASE: montoCLP(sueldo),
    SUELDO_BASE_PALABRA: montoEnPalabras(sueldo),
    ASIGNACION_MOVILIZACION: montoCLP(movilizacion),
    ASIGNACION_MOVILIZACION_PALABRA: montoEnPalabras(movilizacion),
    ASIGNACION_COLACION: montoCLP(colacion),
    ASIGNACION_COLACION_PALABRA: montoEnPalabras(colacion),
    PREVISION: (t.afp as string) ?? "",
    INSTITUCION_SALUD: (t.salud as string) ?? "",
    REGIMEN_PREVISIONAL: "chileno",
  };

  let buffer: Buffer;
  try {
    buffer = await generarDocx(plantilla.archivo_path as string, variables);
  } catch (e) {
    return {
      ok: false,
      error: `Falló la generación del documento: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const storagePath = `${contratoId}/contrato.docx`;
  const { error: errUp } = await supabase.storage
    .from("contratos")
    .upload(storagePath, buffer, {
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: true,
    });
  if (errUp) return { ok: false, error: `Falló la subida a Storage: ${errUp.message}` };

  await supabase
    .from("contratos")
    .update({ documento_path: storagePath, estado: "generado", plantilla_id: plantilla.id })
    .eq("id", contratoId);

  const nombreArchivo = `Contrato - ${nombreCompleto}.docx`;
  const { data: firmado } = await supabase.storage
    .from("contratos")
    .createSignedUrl(storagePath, 3600, { download: nombreArchivo });

  return { ok: true, downloadUrl: firmado?.signedUrl, nombreArchivo };
}
