import type { SupabaseClient } from "@supabase/supabase-js";
import { generarDocx, fechaLarga, montoCLP } from "@/lib/generar-docx";
import { montoEnPalabras } from "@/lib/numero-palabras";
import { nombreArchivo } from "@/lib/format";
import { redactarClausulasContrato } from "@/lib/redactar-hechos";

export type ResultadoGeneracion = {
  ok: boolean;
  error?: string;
  downloadUrl?: string;
  nombreArchivo?: string;
};

/**
 * Redacción de la cláusula de gratificación según la opción elegida en la
 * solicitud (placeholder {GRATIFICACION_TEXTO} en las plantillas). El texto va
 * después de "Gratificación:" / "Gratificación Legal:" y sin punto final (el
 * punto está en la plantilla). Solicitudes antiguas sin tipo → 25% (Art. 50).
 */
function textoGratificacion(tipo: string | undefined, monto: number): string {
  switch (tipo) {
    case "sin":
      return "No se pacta gratificación convencional. El trabajador tendrá derecho a gratificación legal únicamente si concurren a su respecto los requisitos del Artículo 47 del Código del Trabajo";
    case "tope":
      return "El Empleador pagará mensualmente, por concepto de gratificación legal del Artículo 50 del Código del Trabajo, el equivalente a un doceavo del tope legal de 4,75 Ingresos Mínimos Mensuales";
    case "manual":
      return `El Empleador pagará mensualmente la suma fija de $${montoCLP(monto)} (${montoEnPalabras(monto)}) por concepto de gratificación convencional garantizada, imputable a la gratificación legal de los Artículos 47 y 50 del Código del Trabajo`;
    default:
      return "El Empleador pagará la gratificación legal mensual conforme al Artículo 50 del Código del Trabajo, equivalente al 25% de la remuneración mensual devengada, con el tope legal de 4,75 Ingresos Mínimos Mensuales (prorrateado mensualmente)";
  }
}

/**
 * Denominación del cargo en el documento cuando difiere del valor corto que
 * usan las plantillas en BD. Cargos sin entrada acá van con su valor tal cual.
 */
const CARGO_LABEL: Record<string, string> = {
  aStop: "Atendedor de Tienda de Conveniencia (aStop)",
  Atendedor: "Atendedor de Estación de Servicio",
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

  const jornada = (con.jornada ?? {}) as {
    tipo?: string;
    horas_semanales?: number | null;
    distribucion?: string | null;
  };
  const rem = (con.remuneracion ?? {}) as {
    sueldo_base?: number;
    movilizacion?: number;
    colacion?: number;
    perdida_caja?: number | string | null;
    gratificacion_tipo?: string;
    gratificacion_monto?: number | string | null;
    /** "por_dia" = jornal diario; el sueldo base del documento va por día. */
    modalidad?: string;
    valor_dia?: number;
    valor_hora_base?: number;
    horas_diarias?: number;
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

  const perdidaCaja = Number(rem.perdida_caja ?? 0);

  // Las "otras consideraciones remuneracionales" del cliente (texto libre,
  // a menudo mal redactado) pasan por la IA y entran al contrato como
  // cláusula adicional formal. Sin API key: solo van las cláusulas del
  // equipo, como antes, y lo del cliente queda en observaciones.
  const { texto: clausulasFinales } = await redactarClausulasContrato(
    (con.observaciones as string) ?? "",
    (con.clausulas_adicionales as string) ?? "",
  );

  const nombreCompleto = `${t.nombres} ${t.apellidos}`;
  const rutEmpleado = t.rut_provisorio
    ? (t.rut ? `${t.rut} (provisorio)` : "(RUT en trámite)")
    : ((t.rut as string) ?? "");
  const sueldo = Number(rem.sueldo_base ?? 0);
  const movilizacion = Number(rem.movilizacion ?? 0);
  const colacion = Number(rem.colacion ?? 0);

  // Jornal diario: el "sueldo base" del documento se expresa por día trabajado
  // (con su equivalencia por hora si está pactada), no como suma mensual.
  let sueldoTexto = montoCLP(sueldo);
  let sueldoPalabra = montoEnPalabras(sueldo);
  if (rem.modalidad === "por_dia" && Number(rem.valor_dia ?? 0) > 0) {
    const dia = Number(rem.valor_dia);
    const horaBase = Number(rem.valor_hora_base ?? 0);
    const horasDia = Number(rem.horas_diarias ?? 0);
    sueldoTexto = `${montoCLP(dia)} por día efectivamente trabajado`;
    sueldoPalabra =
      montoEnPalabras(dia).toLowerCase().replace(/ pesos?$/, "") +
      " pesos diarios" +
      (horaBase > 0 && horasDia > 0
        ? `, equivalentes a $${montoCLP(horaBase)} por hora base en jornada de ${String(horasDia).replace(".", ",")} horas diarias`
        : "");
  }

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
    CARGO: CARGO_LABEL[con.cargo as string] ?? (con.cargo as string) ?? "",
    FECHA_INICIO_CONTRATO: fechaLarga(con.fecha_inicio),
    FECHA_TERMINO_CONTRATO: fechaLarga(con.fecha_vencimiento),
    TIPO_CONTRATO: con.tipo_contrato === "plazo_fijo" ? "plazo fijo" : "indefinido",
    SUELDO_BASE: sueldoTexto,
    SUELDO_BASE_PALABRA: sueldoPalabra,
    ASIGNACION_MOVILIZACION: montoCLP(movilizacion),
    ASIGNACION_MOVILIZACION_PALABRA: montoEnPalabras(movilizacion),
    ASIGNACION_COLACION: montoCLP(colacion),
    ASIGNACION_COLACION_PALABRA: montoEnPalabras(colacion),
    GRATIFICACION_TEXTO: textoGratificacion(
      rem.gratificacion_tipo,
      Number(rem.gratificacion_monto ?? 0),
    ),
    ASIGNACION_CAJA_TEXTO:
      perdidaCaja > 0
        ? `$${montoCLP(perdidaCaja)} (${montoEnPalabras(perdidaCaja)})`
        : "No se pacta",
    CIUDAD_FIRMA:
      (cli.lugar_firma_contrato as string) ||
      (cli.ciudad as string) ||
      (cli.comuna as string) ||
      "",
    PREVISION: (t.afp as string) ?? "",
    INSTITUCION_SALUD: (t.salud as string) ?? "",
    REGIMEN_PREVISIONAL: "chileno",
    HORAS_SEMANALES: horas !== null ? String(horas).replace(".", ",") : "42",
    // Distribución semanal/horario de la jornada (plantillas C.6 y futuras);
    // si no viene, queda en blanco para completar a mano en la revisión.
    DISTRIBUCION_JORNADA: jornada.distribucion ?? "",
    CLAUSULAS_ADICIONALES: clausulasFinales
      ? `CLÁUSULA ADICIONAL PACTADA: ${clausulasFinales}`
      : "",
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

  const nombreDescarga = nombreArchivo(`Contrato - ${nombreCompleto}`) + ".docx";
  const { data: firmado } = await supabase.storage
    .from("contratos")
    .createSignedUrl(storagePath, 3600, { download: nombreDescarga });

  return { ok: true, downloadUrl: firmado?.signedUrl, nombreArchivo: nombreDescarga };
}

/** Plantilla genérica por tipo de anexo (archivo en app/plantillas/). */
const PLANTILLA_ANEXO: Record<string, string> = {
  renovacion_fijo_a_fijo: "plantillas/GENERICO/ANEXO Renovacion Plazo Fijo a Fijo.docx",
  renovacion_indefinido: "plantillas/GENERICO/ANEXO Renovacion a Indefinido.docx",
  ajuste_ingreso_minimo: "plantillas/GENERICO/ANEXO Ajuste Ingreso Minimo.docx",
};

/**
 * Genera el .docx de un ANEXO (renovación de plazo fijo a fijo, paso a
 * indefinido o ajuste de ingreso mínimo), lo sube a Storage y marca 'generado'.
 * La plantilla se elige por `anexo_tipo`. Los tipos sin plantilla genérica
 * (cambio de jornada, otro) se preparan a mano y devuelven aviso.
 */
export async function generarYSubirAnexo(
  supabase: SupabaseClient,
  contratoId: string,
): Promise<ResultadoGeneracion> {
  const { data: con, error: errCon } = await supabase
    .from("contratos")
    .select("*, trabajadores(*), clientes(*)")
    .eq("id", contratoId)
    .single();
  if (errCon || !con) return { ok: false, error: "Anexo no encontrado." };

  const plantillaPath = PLANTILLA_ANEXO[(con.anexo_tipo as string) ?? ""];
  if (!plantillaPath) {
    return {
      ok: false,
      error:
        "Este tipo de anexo no tiene plantilla genérica para generar automáticamente (cambio de jornada / otro). Prepáralo manualmente.",
    };
  }

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

  const rem = (con.remuneracion ?? {}) as { sueldo_base?: number };
  const sueldo = Number(rem.sueldo_base ?? 0);
  const nacionalidad = ((t.nacionalidad as string) ?? "Chilena").trim();
  const rutEmpleado = t.rut_provisorio
    ? (t.rut ? `${t.rut} (provisorio)` : "(RUT en trámite)")
    : ((t.rut as string) ?? "");

  // Fecha del anexo (preámbulo "En …, a DD/MM/AAAA"): la registrada en
  // anexo_fecha, o la fecha de generación si no se cargó.
  let dd: string, mm: string, aaaa: string;
  if (con.anexo_fecha) {
    [aaaa, mm, dd] = String(con.anexo_fecha).split("-");
  } else {
    const hoy = new Date();
    dd = String(hoy.getDate()).padStart(2, "0");
    mm = String(hoy.getMonth() + 1).padStart(2, "0");
    aaaa = String(hoy.getFullYear());
  }

  const variables: Record<string, string> = {
    RAZON_SOCIAL: (cli.razon_social as string) ?? "",
    RUT_EMPRESA: (cli.rut_empresa as string) ?? "",
    NOMBRE_REP_LEGAL: repLegal,
    RUT_REP_LEGAL: (cli.representante_legal_rut as string) ?? "",
    EMAIL_EMPRESA: (cli.correo_empresa as string) ?? "",
    DIRECCION_EMPRESA: domicilio,
    COMUNA_EMPRESA: (cli.comuna as string) || (cli.ciudad as string) || "",
    NOMBRE_EMPLEADO: `${t.nombres} ${t.apellidos}`,
    RUT_EMPLEADO: rutEmpleado,
    NACIONALIDAD_EMPLEADO: nacionalidad,
    DIRECCION_EMPLEADO: (t.direccion as string) ?? "",
    EMAILPERSONAL_EMPLEADO: (t.correo as string) ?? "",
    DA_CONTRATO: dd,
    MA_CONTRATO: mm,
    AAAA_CONTRATO: aaaa,
    FECHA_INICIO_CONTRATO: fechaLarga(con.fecha_inicio),
    FECHA_TERMINO_CONTRATO: fechaLarga(con.fecha_vencimiento),
    SUELDO_BASE: montoCLP(sueldo),
    SUELDO_BASE_PALABRA: sueldo > 0 ? montoEnPalabras(sueldo) : "",
  };

  let buffer: Buffer;
  try {
    buffer = await generarDocx(plantillaPath, variables);
  } catch (e) {
    return {
      ok: false,
      error: `Falló la generación del anexo: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const storagePath = `${contratoId}/anexo.docx`;
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
    .update({ documento_path: storagePath, estado: "generado" })
    .eq("id", contratoId);

  const nombreDescarga = nombreArchivo(`Anexo - ${t.nombres} ${t.apellidos}`) + ".docx";
  const { data: firmado } = await supabase.storage
    .from("contratos")
    .createSignedUrl(storagePath, 3600, { download: nombreDescarga });

  return { ok: true, downloadUrl: firmado?.signedUrl, nombreArchivo: nombreDescarga };
}
