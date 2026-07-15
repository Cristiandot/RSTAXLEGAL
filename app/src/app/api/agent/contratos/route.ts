import { createServiceClient } from "@/lib/supabase/service";
import {
  CANAL_AGENTE,
  idUsuarioAgente,
  respuestaNoAutorizada,
  validarTokenAgente,
} from "@/lib/agente";
import {
  crearSolicitudContrato,
  validarInputContrato,
  type CrearContratoInput,
} from "@/lib/contrato-solicitud";
import { formatearRut } from "@/lib/rut";

/**
 * POST /api/agent/contratos — crea una SOLICITUD de contrato (estado
 * solicitado/generado). El candado del flujo: este endpoint no puede aprobar
 * ni enviar; esas transiciones solo existen en el panel con sesión humana
 * (cambiarEstadoContrato / enviarContratoAlCliente exigen estado aprobado).
 *
 * Con `dry_run: true` valida y devuelve el resumen de lo que se crearía, sin
 * escribir nada — pensado para que el agente confirme con el usuario antes.
 */

type BodyTrabajador = {
  nombres?: string;
  apellidos?: string;
  rut?: string;
  rut_provisorio?: boolean;
  nacionalidad?: string;
  direccion?: string;
  comuna?: string;
  fecha_nacimiento?: string | null;
  estado_civil?: string;
  correo?: string;
  fono?: string;
  afp?: string;
  salud?: string;
  banco?: string;
  tipo_cuenta?: string;
  numero_cuenta?: string;
};

type BodyContrato = {
  cargo?: string;
  tipo_contrato?: "indefinido" | "plazo_fijo";
  fecha_inicio?: string;
  fecha_vencimiento?: string | null;
  jornada_tipo?: "completa" | "parcial";
  horas_semanales?: number | null;
  lugar_trabajo?: string;
  sueldo_base?: number;
  movilizacion?: number;
  colacion?: number;
  perdida_caja?: number;
  gratificacion_tipo?: string;
  gratificacion_monto?: number | null;
  clausulas_adicionales?: string;
  observaciones?: string;
};

type Body = {
  dry_run?: boolean;
  cliente_id?: string;
  trabajador_id?: string;
  trabajador?: BodyTrabajador;
  contrato?: BodyContrato;
};

export async function POST(req: Request) {
  if (!validarTokenAgente(req)) return respuestaNoAutorizada();

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ ok: false, error: "Body JSON inválido." }, { status: 400 });
  }
  if (!body.cliente_id) {
    return Response.json({ ok: false, error: "Falta cliente_id." }, { status: 400 });
  }
  if (!body.contrato?.cargo || !body.contrato?.tipo_contrato) {
    return Response.json(
      { ok: false, error: "contrato.cargo y contrato.tipo_contrato son obligatorios." },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();

  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, razon_social, representante_legal, domicilio")
    .eq("id", body.cliente_id)
    .eq("activo", true)
    .maybeSingle();
  if (!cliente) {
    return Response.json(
      { ok: false, error: "Empresa no encontrada o sin servicio activo." },
      { status: 404 },
    );
  }

  // Trabajador: existente (se cargan sus datos) o nuevo (vienen en el body)
  let t: BodyTrabajador = body.trabajador ?? {};
  if (body.trabajador_id) {
    const { data: existente } = await supabase
      .from("trabajadores")
      .select("id, nombres, apellidos, rut, rut_provisorio, nacionalidad")
      .eq("id", body.trabajador_id)
      .eq("cliente_id", cliente.id)
      .maybeSingle();
    if (!existente) {
      return Response.json(
        { ok: false, error: "El trabajador indicado no existe o no pertenece a esta empresa." },
        { status: 404 },
      );
    }
    t = {
      nombres: existente.nombres,
      apellidos: existente.apellidos,
      rut: existente.rut ?? "",
      rut_provisorio: existente.rut_provisorio ?? false,
      nacionalidad: existente.nacionalidad ?? "Chilena",
    };
  }

  const c = body.contrato;
  const input: CrearContratoInput = {
    clienteId: cliente.id,
    // El agente no gestiona datos del empleador: si faltan, es advertencia y
    // se completan en el panel (la generación del documento los exige).
    empleador: {
      representanteLegal: "",
      representanteLegalRut: "",
      domicilio: "",
      comuna: "",
      correoEmpresa: "",
    },
    trabajador: {
      nombres: t.nombres ?? "",
      apellidos: t.apellidos ?? "",
      rut: t.rut ?? "",
      rutProvisorio: t.rut_provisorio ?? false,
      nacionalidad: t.nacionalidad ?? "Chilena",
      direccion: t.direccion ?? "",
      comuna: t.comuna ?? "",
      fechaNacimiento: t.fecha_nacimiento ?? null,
      estadoCivil: t.estado_civil ?? "",
      correo: t.correo ?? "",
      fono: t.fono ?? "",
      afp: t.afp ?? "",
      salud: t.salud ?? "",
      banco: t.banco ?? "",
      tipoCuenta: t.tipo_cuenta ?? "",
      numeroCuenta: t.numero_cuenta ?? "",
    },
    contrato: {
      cargo: c.cargo!,
      tipoContrato: c.tipo_contrato!,
      fechaInicio: c.fecha_inicio ?? "",
      fechaVencimiento: c.fecha_vencimiento ?? null,
      jornadaTipo: c.jornada_tipo ?? "completa",
      horasSemanales: c.horas_semanales ?? null,
      lugarTrabajo: c.lugar_trabajo ?? "",
      sueldoBase: c.sueldo_base ?? 0,
      movilizacion: c.movilizacion ?? 0,
      colacion: c.colacion ?? 0,
      perdidaCaja: c.perdida_caja ?? 0,
      gratificacion: "",
      gratificacionTipo: c.gratificacion_tipo ?? "25",
      gratificacionMonto: c.gratificacion_monto ?? null,
      clausulasAdicionales: c.clausulas_adicionales ?? "",
      observaciones: c.observaciones ?? "",
    },
  };

  const errorValidacion = validarInputContrato(input);
  if (errorValidacion) {
    return Response.json({ ok: false, error: errorValidacion }, { status: 422 });
  }

  // Disponibilidad de plantilla (mismos filtros del motor de generación)
  const nacPlantilla = input.trabajador.nacionalidad.toLowerCase().startsWith("chilen")
    ? "chileno"
    : "extranjero";
  const { data: plantillas } = await supabase
    .from("plantillas_contrato")
    .select("id, nombre, horas_semanales")
    .eq("cliente_id", cliente.id)
    .eq("cargo", input.contrato.cargo)
    .eq("jornada_tipo", input.contrato.jornadaTipo)
    .eq("nacionalidad", nacPlantilla)
    .eq("tipo_contrato", input.contrato.tipoContrato)
    .eq("tipo_documento", "contrato")
    .eq("aprobada", true)
    .eq("activo", true);
  const plantilla =
    plantillas?.find((p) => Number(p.horas_semanales) === input.contrato.horasSemanales) ??
    plantillas?.find((p) => p.horas_semanales === null) ??
    plantillas?.[0] ??
    null;

  const advertencias: string[] = [];
  if (!plantilla) {
    advertencias.push(
      `No hay plantilla aprobada para ${input.contrato.cargo} · ${input.contrato.jornadaTipo} · ${nacPlantilla} · ${input.contrato.tipoContrato.replace("_", " ")} en ${cliente.razon_social}. La solicitud quedará sin documento hasta que exista una.`,
    );
  }
  if (!cliente.representante_legal || !cliente.domicilio) {
    advertencias.push(
      `Faltan datos del empleador de ${cliente.razon_social} (representante legal y/o domicilio); el documento no podrá generarse hasta cargarlos en el panel.`,
    );
  }

  const resumen = {
    empresa: cliente.razon_social,
    trabajador: `${input.trabajador.nombres} ${input.trabajador.apellidos}`.trim(),
    rut: input.trabajador.rutProvisorio
      ? `${input.trabajador.rut || "pendiente"} (provisorio)`
      : formatearRut(input.trabajador.rut),
    trabajador_existente: Boolean(body.trabajador_id),
    cargo: input.contrato.cargo,
    tipo_contrato: input.contrato.tipoContrato,
    fecha_inicio: input.contrato.fechaInicio,
    fecha_vencimiento: input.contrato.fechaVencimiento,
    jornada: `${input.contrato.jornadaTipo}${input.contrato.horasSemanales ? ` · ${input.contrato.horasSemanales} hrs` : ""}`,
    sueldo_base: input.contrato.sueldoBase,
    plantilla: plantilla?.nombre ?? null,
  };

  if (body.dry_run) {
    return Response.json({ ok: true, dry_run: true, resumen, advertencias });
  }

  const creadoPor = await idUsuarioAgente(supabase);
  const res = await crearSolicitudContrato(supabase, input, {
    creadoPor,
    canal: CANAL_AGENTE,
    trabajadorId: body.trabajador_id ?? null,
  });

  if (!res.ok && !res.contratoId) {
    return Response.json({ ok: false, error: res.error, advertencias }, { status: 422 });
  }

  return Response.json({
    ok: true,
    contrato_id: res.contratoId,
    estado: res.ok ? "generado" : "solicitado",
    detalle: res.ok ? undefined : res.error,
    resumen,
    advertencias,
    revision:
      "Borrador creado. Requiere revisión y aprobación humana en el panel (/contratos) antes de cualquier envío al cliente.",
  });
}
