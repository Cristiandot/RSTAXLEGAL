import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generarYSubirContrato } from "@/lib/contrato-generacion";
import { formatearRut, validarRut } from "@/lib/rut";

/**
 * Creación de solicitudes de contrato — motor compartido entre el formulario
 * interno (/contratos/nuevo) y la API del agente (/api/agent/contratos).
 * Siempre deja el contrato en el flujo solicitado → generado → aprobado →
 * enviado; aprobar y enviar son acciones humanas del panel, no de esta lib.
 */

export type CrearContratoInput = {
  clienteId: string;
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
    perdidaCaja: number;
    gratificacion: string;
    gratificacionTipo: string;
    gratificacionMonto: number | null;
    clausulasAdicionales: string;
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

export type OrigenSolicitud = {
  /** id en `usuarios` de quien crea (humano o Agente RSTL). */
  creadoPor: string | null;
  /** 'agente' para la API del agente; null = lógica histórica (portal/dashboard). */
  canal?: string | null;
  /** Reutilizar un trabajador existente en vez de crear uno nuevo. */
  trabajadorId?: string | null;
};

/** Validaciones de negocio previas a crear. Devuelve mensaje de error o null. */
export function validarInputContrato(input: CrearContratoInput): string | null {
  const t = input.trabajador;
  const c = input.contrato;
  if (!t.nombres.trim() || !t.apellidos.trim()) {
    return "Nombres y apellidos del trabajador son obligatorios.";
  }
  if (!t.rutProvisorio && !validarRut(t.rut)) {
    return "El RUT del trabajador no es válido (revisa el dígito verificador).";
  }
  if (!c.fechaInicio) return "La fecha de inicio es obligatoria.";
  if (c.tipoContrato === "plazo_fijo" && !c.fechaVencimiento) {
    return "Un contrato a plazo fijo requiere fecha de vencimiento.";
  }
  if (!c.sueldoBase || c.sueldoBase <= 0) {
    return "El sueldo base es obligatorio.";
  }
  return null;
}

export async function crearSolicitudContrato(
  supabase: SupabaseClient,
  input: CrearContratoInput,
  origen: OrigenSolicitud,
): Promise<CrearContratoResult> {
  const t = input.trabajador;
  const c = input.contrato;

  const errorValidacion = validarInputContrato(input);
  if (errorValidacion) return { ok: false, error: errorValidacion };

  // Completar datos del empleador si faltaban (quedan en clientes para siempre)
  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, representante_legal, representante_legal_rut, domicilio, comuna, correo_empresa")
    .eq("id", input.clienteId)
    .single();
  if (!cliente) return { ok: false, error: "No se encontró la empresa seleccionada." };

  const patch: Record<string, string> = {};
  if (!cliente.representante_legal && input.empleador.representanteLegal)
    patch.representante_legal = input.empleador.representanteLegal;
  if (!cliente.representante_legal_rut && input.empleador.representanteLegalRut)
    patch.representante_legal_rut = input.empleador.representanteLegalRut;
  if (!cliente.domicilio && input.empleador.domicilio)
    patch.domicilio = input.empleador.domicilio;
  if (!cliente.comuna && input.empleador.comuna) patch.comuna = input.empleador.comuna;
  if (!cliente.correo_empresa && input.empleador.correoEmpresa)
    patch.correo_empresa = input.empleador.correoEmpresa;
  if (Object.keys(patch).length > 0) {
    await supabase.from("clientes").update(patch).eq("id", cliente.id);
  }

  // Trabajador: reutilizar el indicado (verificando que sea de esta empresa) o crear
  let trabajadorId = origen.trabajadorId ?? null;
  if (trabajadorId) {
    const { data: existente } = await supabase
      .from("trabajadores")
      .select("id")
      .eq("id", trabajadorId)
      .eq("cliente_id", cliente.id)
      .maybeSingle();
    if (!existente) {
      return { ok: false, error: "El trabajador indicado no existe o no pertenece a esta empresa." };
    }
  } else {
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
    if (errTrab || !trab) return { ok: false, error: `Error creando trabajador: ${errTrab?.message}` };
    trabajadorId = trab.id;
  }

  const { data: contrato, error: errCon } = await supabase
    .from("contratos")
    .insert({
      cliente_id: cliente.id,
      trabajador_id: trabajadorId,
      estado: "solicitado",
      tipo_contrato: c.tipoContrato,
      fecha_inicio: c.fechaInicio,
      fecha_vencimiento: c.fechaVencimiento,
      cargo: c.cargo,
      jornada: { tipo: c.jornadaTipo, horas_semanales: c.horasSemanales },
      remuneracion: {
        sueldo_base: c.sueldoBase,
        movilizacion: c.movilizacion,
        colacion: c.colacion,
        perdida_caja: c.perdidaCaja,
        gratificacion:
          c.gratificacion || "25% de lo devengado, con tope de 4,75 IMM anual (Art. 50 CT)",
        gratificacion_tipo: c.gratificacionTipo || "25",
        gratificacion_monto: c.gratificacionMonto,
      },
      clausulas_adicionales: c.clausulasAdicionales || null,
      observaciones: c.observaciones || null,
      creado_por: origen.creadoPor,
      canal: origen.canal ?? null,
    })
    .select("id")
    .single();
  if (errCon || !contrato) return { ok: false, error: `Error creando contrato: ${errCon?.message}` };

  // Generar el documento (motor compartido)
  const gen = await generarYSubirContrato(supabase, contrato.id);
  revalidatePath("/contratos");
  if (!gen.ok) {
    return {
      ok: false,
      contratoId: contrato.id,
      error: `Solicitud creada, pero ${gen.error} — puedes generarla desde el listado cuando esté resuelto.`,
    };
  }
  return {
    ok: true,
    contratoId: contrato.id,
    downloadUrl: gen.downloadUrl,
    nombreArchivo: gen.nombreArchivo,
  };
}
