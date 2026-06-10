"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { generarDocx, fechaLarga, montoCLP } from "@/lib/generar-docx";
import { montoEnPalabras } from "@/lib/numero-palabras";
import { formatearRut, validarRut } from "@/lib/rut";

export type CrearContratoInput = {
  clienteId: string;
  // Datos del empleador (si faltaban, se completan acá y quedan en clientes)
  empleador: {
    representanteLegal: string;
    representanteLegalRut: string;
    domicilio: string;
    comuna: string;
    correoEmpresa: string;
  };
  trabajador: {
    nombres: string;
    apellidos: string;
    rut: string;
    rutProvisorio: boolean;
    nacionalidad: string;
    direccion: string;
    comuna: string;
    fechaNacimiento: string | null;
    estadoCivil: string;
    correo: string;
    fono: string;
    afp: string;
    salud: string;
    banco: string;
    tipoCuenta: string;
    numeroCuenta: string;
  };
  contrato: {
    cargo: string;
    tipoContrato: "indefinido" | "plazo_fijo";
    fechaInicio: string;
    fechaVencimiento: string | null;
    jornadaTipo: "completa" | "parcial";
    horasSemanales: number | null;
    lugarTrabajo: string;
    sueldoBase: number;
    movilizacion: number;
    colacion: number;
    observaciones: string;
  };
};

export type CrearContratoResult = {
  ok: boolean;
  error?: string;
  contratoId?: string;
  downloadUrl?: string;
  nombreArchivo?: string;
};

export async function crearContrato(
  input: CrearContratoInput,
): Promise<CrearContratoResult> {
  const supabase = await createClient();
  const t = input.trabajador;
  const c = input.contrato;

  // --- Validaciones mínimas de negocio ---
  if (!t.nombres.trim() || !t.apellidos.trim()) {
    return { ok: false, error: "Nombres y apellidos del trabajador son obligatorios." };
  }
  if (!t.rutProvisorio && !validarRut(t.rut)) {
    return { ok: false, error: "El RUT del trabajador no es válido (revisa el dígito verificador)." };
  }
  if (!c.fechaInicio) {
    return { ok: false, error: "La fecha de inicio es obligatoria." };
  }
  if (c.tipoContrato === "plazo_fijo" && !c.fechaVencimiento) {
    return { ok: false, error: "Un contrato a plazo fijo requiere fecha de vencimiento." };
  }
  if (!c.sueldoBase || c.sueldoBase <= 0) {
    return { ok: false, error: "El sueldo base es obligatorio." };
  }

  // --- Empleador: completar datos faltantes en clientes ---
  const { data: cliente, error: errCliente } = await supabase
    .from("clientes")
    .select("id, razon_social, rut_empresa, representante_legal, representante_legal_rut, domicilio, comuna, correo_empresa")
    .eq("id", input.clienteId)
    .single();
  if (errCliente || !cliente) {
    return { ok: false, error: "No se encontró la empresa seleccionada." };
  }

  const patch: Record<string, string> = {};
  if (!cliente.representante_legal && input.empleador.representanteLegal)
    patch.representante_legal = input.empleador.representanteLegal;
  if (!cliente.representante_legal_rut && input.empleador.representanteLegalRut)
    patch.representante_legal_rut = input.empleador.representanteLegalRut;
  if (!cliente.domicilio && input.empleador.domicilio)
    patch.domicilio = input.empleador.domicilio;
  if (!cliente.comuna && input.empleador.comuna)
    patch.comuna = input.empleador.comuna;
  if (!cliente.correo_empresa && input.empleador.correoEmpresa)
    patch.correo_empresa = input.empleador.correoEmpresa;
  if (Object.keys(patch).length > 0) {
    await supabase.from("clientes").update(patch).eq("id", cliente.id);
  }

  const repLegal = cliente.representante_legal ?? input.empleador.representanteLegal;
  const repLegalRut = cliente.representante_legal_rut ?? input.empleador.representanteLegalRut;
  const domicilioEmpresa = cliente.domicilio ?? input.empleador.domicilio;
  const correoEmpresa = cliente.correo_empresa ?? input.empleador.correoEmpresa;
  if (!repLegal || !domicilioEmpresa) {
    return { ok: false, error: "Faltan datos del empleador (representante legal y domicilio). Complétalos en el formulario." };
  }

  // --- Resolver plantilla: cliente × cargo × jornada × nacionalidad × tipo ---
  const nacionalidadPlantilla =
    t.nacionalidad.trim().toLowerCase().startsWith("chilen") ? "chileno" : "extranjero";

  let q = supabase
    .from("plantillas_contrato")
    .select("id, nombre, archivo_path, horas_semanales")
    .eq("cliente_id", cliente.id)
    .eq("cargo", c.cargo)
    .eq("jornada_tipo", c.jornadaTipo)
    .eq("nacionalidad", nacionalidadPlantilla)
    .eq("tipo_contrato", c.tipoContrato)
    .eq("tipo_documento", "contrato")
    .eq("aprobada", true)
    .eq("activo", true);
  const { data: candidatas, error: errPl } = await q;
  if (errPl) return { ok: false, error: `Error buscando plantilla: ${errPl.message}` };

  // Preferir la de horas exactas; si no, la genérica (horas null)
  const plantilla =
    candidatas?.find((p) => Number(p.horas_semanales) === c.horasSemanales) ??
    candidatas?.find((p) => p.horas_semanales === null) ??
    candidatas?.[0];

  if (!plantilla) {
    return {
      ok: false,
      error: `No existe plantilla aprobada para: ${c.cargo} · ${c.jornadaTipo} · ${nacionalidadPlantilla} · ${c.tipoContrato.replace("_", " ")}. Hay que cargarla/aprobarla primero.`,
    };
  }

  // --- Crear trabajador ---
  const { data: trab, error: errTrab } = await supabase
    .from("trabajadores")
    .insert({
      cliente_id: cliente.id,
      nombres: t.nombres.trim(),
      apellidos: t.apellidos.trim(),
      rut: t.rutProvisorio ? (t.rut || null) : formatearRut(t.rut),
      rut_provisorio: t.rutProvisorio,
      nacionalidad: t.nacionalidad || null,
      direccion: t.direccion || null,
      comuna: t.comuna || null,
      fecha_nacimiento: t.fechaNacimiento,
      estado_civil: t.estadoCivil || null,
      correo: t.correo || null,
      fono: t.fono || null,
      afp: t.afp || null,
      salud: t.salud || null,
      banco: t.banco || null,
      tipo_cuenta: t.tipoCuenta || null,
      numero_cuenta: t.numeroCuenta || null,
    })
    .select("id")
    .single();
  if (errTrab || !trab) {
    return { ok: false, error: `Error creando trabajador: ${errTrab?.message}` };
  }

  // --- Crear contrato (solicitado) ---
  const { data: usuario } = await supabase.auth.getUser();
  const correoUsuario = usuario.user?.email?.toLowerCase();
  const { data: u } = correoUsuario
    ? await supabase.from("usuarios").select("id").eq("correo", correoUsuario).maybeSingle()
    : { data: null };

  const { data: contrato, error: errCon } = await supabase
    .from("contratos")
    .insert({
      cliente_id: cliente.id,
      trabajador_id: trab.id,
      plantilla_id: plantilla.id,
      estado: "solicitado",
      tipo_contrato: c.tipoContrato,
      fecha_inicio: c.fechaInicio,
      fecha_vencimiento: c.fechaVencimiento,
      cargo: c.cargo,
      lugar_trabajo: c.lugarTrabajo || domicilioEmpresa,
      jornada: { tipo: c.jornadaTipo, horas_semanales: c.horasSemanales },
      remuneracion: {
        sueldo_base: c.sueldoBase,
        movilizacion: c.movilizacion,
        colacion: c.colacion,
        gratificacion: "Art. 50 CT (tope 4,75 IMM)",
      },
      observaciones: c.observaciones || null,
      creado_por: u?.id ?? null,
    })
    .select("id")
    .single();
  if (errCon || !contrato) {
    return { ok: false, error: `Error creando contrato: ${errCon?.message}` };
  }

  // --- Generar el .docx ---
  const nombreCompleto = `${t.nombres.trim()} ${t.apellidos.trim()}`;
  const rutEmpleado = t.rutProvisorio
    ? (t.rut ? `${t.rut} (provisorio)` : "(RUT en trámite)")
    : formatearRut(t.rut);

  const variables: Record<string, string> = {
    RAZON_SOCIAL: cliente.razon_social,
    RUT_EMPRESA: cliente.rut_empresa ?? "",
    NOMBRE_REP_LEGAL: repLegal,
    RUT_REP_LEGAL: repLegalRut ?? "",
    EMAIL_EMPRESA: correoEmpresa ?? "",
    DIRECCION_EMPRESA: domicilioEmpresa,
    NOMBRE_EMPLEADO: nombreCompleto,
    RUT_EMPLEADO: rutEmpleado,
    EMAILPERSONAL_EMPLEADO: t.correo,
    TELEFONOPERSONAL_EMPLEADO: t.fono,
    NACIONALIDAD_EMPLEADO: t.nacionalidad,
    DIRECCION_EMPLEADO: t.direccion,
    COMUNA_EMPLEADO: t.comuna,
    ESTADO_CIVIL: t.estadoCivil,
    FECHA_NACIMIENTO: fechaLarga(t.fechaNacimiento),
    CARGO: c.cargo === "aStop"
      ? "Atendedor de Tienda de Conveniencia (aStop)"
      : "Atendedor de Estación de Servicio",
    FECHA_INICIO_CONTRATO: fechaLarga(c.fechaInicio),
    FECHA_TERMINO_CONTRATO: fechaLarga(c.fechaVencimiento),
    TIPO_CONTRATO: c.tipoContrato === "plazo_fijo" ? "plazo fijo" : "indefinido",
    SUELDO_BASE: montoCLP(c.sueldoBase),
    SUELDO_BASE_PALABRA: montoEnPalabras(c.sueldoBase),
    ASIGNACION_MOVILIZACION: montoCLP(c.movilizacion),
    ASIGNACION_MOVILIZACION_PALABRA: montoEnPalabras(c.movilizacion),
    ASIGNACION_COLACION: montoCLP(c.colacion),
    ASIGNACION_COLACION_PALABRA: montoEnPalabras(c.colacion),
    PREVISION: t.afp,
    INSTITUCION_SALUD: t.salud,
    REGIMEN_PREVISIONAL: "chileno",
  };

  let buffer: Buffer;
  try {
    buffer = await generarDocx(plantilla.archivo_path, variables);
  } catch (e) {
    return {
      ok: false,
      error: `Trabajador y solicitud creados, pero falló la generación del documento: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  // --- Subir a Storage y marcar generado ---
  const storagePath = `${contrato.id}/contrato.docx`;
  const { error: errUp } = await supabase.storage
    .from("contratos")
    .upload(storagePath, buffer, {
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: true,
    });
  if (errUp) {
    return { ok: false, error: `Documento generado pero falló la subida a Storage: ${errUp.message}` };
  }

  await supabase
    .from("contratos")
    .update({ documento_path: storagePath, estado: "generado" })
    .eq("id", contrato.id);

  const nombreArchivo = `Contrato - ${nombreCompleto}.docx`;
  const { data: firmado } = await supabase.storage
    .from("contratos")
    .createSignedUrl(storagePath, 3600, { download: nombreArchivo });

  revalidatePath("/contratos");
  return {
    ok: true,
    contratoId: contrato.id,
    downloadUrl: firmado?.signedUrl,
    nombreArchivo,
  };
}
