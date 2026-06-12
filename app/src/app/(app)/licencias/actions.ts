"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { limpiarRut } from "@/lib/rut";

export type NuevaLicenciaInput = {
  clienteId: string | null;
  empresaNombre: string;
  empresaRut: string | null;
  trabajadorId: string | null;
  trabajadorNombre: string;
  trabajadorRut: string | null;
  tipo: string;
  folio: string | null;
  codigoVerificacion: string | null;
  fechaInicio: string | null;
  fechaTermino: string | null;
  dias: number | null;
  entidad: string | null;
  estado: string;
  enPlanilla: boolean;
  observacion: string | null;
};

export async function crearLicencia(
  input: NuevaLicenciaInput,
): Promise<{ ok: boolean; error?: string }> {
  if (!input.trabajadorNombre.trim()) {
    return { ok: false, error: "Falta el nombre del trabajador." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("licencias_medicas").insert({
    cliente_id: input.clienteId,
    empresa_nombre: input.empresaNombre.trim() || null,
    empresa_rut: input.empresaRut ? limpiarRut(input.empresaRut) : null,
    trabajador_id: input.trabajadorId,
    trabajador_nombre: input.trabajadorNombre.trim(),
    trabajador_rut: input.trabajadorRut ? limpiarRut(input.trabajadorRut) : null,
    tipo: input.tipo,
    folio: input.folio?.trim() || null,
    codigo_verificacion: input.codigoVerificacion?.trim() || null,
    fecha_inicio: input.fechaInicio || null,
    fecha_termino: input.fechaTermino || null,
    dias: input.dias,
    entidad: input.entidad?.trim() || null,
    estado: input.estado,
    en_planilla: input.enPlanilla,
    observacion: input.observacion?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/licencias");
  return { ok: true };
}

export type PatchLicencia = {
  estado?: string;
  en_planilla?: boolean;
  folio?: string | null;
  codigo_verificacion?: string | null;
  entidad?: string | null;
  observacion?: string | null;
};

export async function actualizarLicencia(
  id: string,
  patch: PatchLicencia,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("licencias_medicas")
    .update(patch)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/licencias");
  return { ok: true };
}

export type TrabajadorOption = {
  id: string;
  nombre: string;
  rut: string | null;
};

/** Nómina de un cliente para el selector del formulario. */
export async function listarTrabajadoresCliente(
  clienteId: string,
): Promise<TrabajadorOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("trabajadores")
    .select("id, nombres, apellidos, rut")
    .eq("cliente_id", clienteId)
    .order("nombres");
  return (data ?? []).map((t) => ({
    id: t.id,
    nombre: `${t.nombres} ${t.apellidos}`.trim(),
    rut: t.rut,
  }));
}

export type FichaTramitacion = {
  trabajador: {
    nombre: string;
    rut: string | null;
    direccion: string | null;
    comuna: string | null;
    correo: string | null;
    fono: string | null;
    fechaNacimiento: string | null;
    afp: string | null;
    salud: string | null;
    planIsapre: string | null;
    cargo: string | null;
    tipoContrato: string | null;
    fechaIngreso: string | null;
    sueldoBase: number | null;
  } | null;
  empresa: {
    razonSocial: string;
    rut: string | null;
    representanteLegal: string | null;
    representanteLegalRut: string | null;
    domicilio: string | null;
    comuna: string | null;
    ciudad: string | null;
    correo: string | null;
  } | null;
};

/**
 * Datos del trabajador y la empresa para tramitar la licencia
 * (LM Empleador, IMED, Medipass, CCAF). Resuelve el trabajador por
 * vínculo directo o, en su defecto, por RUT dentro del cliente.
 */
export async function obtenerFichaTramitacion(
  licenciaId: string,
): Promise<{ ok: boolean; error?: string; ficha?: FichaTramitacion }> {
  const supabase = await createClient();
  const { data: lic, error } = await supabase
    .from("licencias_medicas")
    .select("cliente_id, trabajador_id, trabajador_rut, trabajador_nombre")
    .eq("id", licenciaId)
    .single();
  if (error || !lic) return { ok: false, error: "Licencia no encontrada." };

  const colsTrab =
    "nombres, apellidos, rut, direccion, comuna, correo, fono, fecha_nacimiento, afp, salud, plan_isapre, cargo, tipo_contrato, fecha_ingreso, sueldo_base";

  let trab: Record<string, unknown> | null = null;
  if (lic.trabajador_id) {
    const { data } = await supabase
      .from("trabajadores")
      .select(colsTrab)
      .eq("id", lic.trabajador_id)
      .maybeSingle();
    trab = data;
  }
  if (!trab && lic.cliente_id && lic.trabajador_rut) {
    // el RUT en licencias va normalizado (sin puntos ni guión); en trabajadores puede venir formateado
    const { data } = await supabase
      .from("trabajadores")
      .select(colsTrab)
      .eq("cliente_id", lic.cliente_id);
    trab =
      (data ?? []).find(
        (t) =>
          (t.rut ?? "").replace(/[^0-9kK]/g, "").toUpperCase() ===
          lic.trabajador_rut,
      ) ?? null;
  }

  let empresa: FichaTramitacion["empresa"] = null;
  if (lic.cliente_id) {
    const { data: cli } = await supabase
      .from("clientes")
      .select(
        "razon_social, rut_empresa, representante_legal, representante_legal_rut, domicilio, comuna, ciudad, correo_empresa",
      )
      .eq("id", lic.cliente_id)
      .maybeSingle();
    if (cli) {
      empresa = {
        razonSocial: cli.razon_social,
        rut: cli.rut_empresa,
        representanteLegal: cli.representante_legal,
        representanteLegalRut: cli.representante_legal_rut,
        domicilio: cli.domicilio,
        comuna: cli.comuna,
        ciudad: cli.ciudad,
        correo: cli.correo_empresa,
      };
    }
  }

  return {
    ok: true,
    ficha: {
      trabajador: trab
        ? {
            nombre: `${trab.nombres ?? ""} ${trab.apellidos ?? ""}`.trim(),
            rut: (trab.rut as string) ?? null,
            direccion: (trab.direccion as string) ?? null,
            comuna: (trab.comuna as string) ?? null,
            correo: (trab.correo as string) ?? null,
            fono: (trab.fono as string) ?? null,
            fechaNacimiento: (trab.fecha_nacimiento as string) ?? null,
            afp: (trab.afp as string) ?? null,
            salud: (trab.salud as string) ?? null,
            planIsapre: (trab.plan_isapre as string) ?? null,
            cargo: (trab.cargo as string) ?? null,
            tipoContrato: (trab.tipo_contrato as string) ?? null,
            fechaIngreso: (trab.fecha_ingreso as string) ?? null,
            sueldoBase:
              trab.sueldo_base != null ? Number(trab.sueldo_base) : null,
          }
        : null,
      empresa,
    },
  };
}
