"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validarRut, formatearRut } from "@/lib/rut";

type Resp = { ok: boolean; error?: string };

export type Socio = {
  nombre: string | null;
  rut: string | null;
  participacion: number | null;
};

function revalidarFichas() {
  revalidatePath("/empresas");
  revalidatePath("/clientes");
  revalidatePath("/onboarding");
}

/** Agrega un socio (RUT validado con DV) al jsonb `socios` de la empresa. */
export async function agregarSocio(
  empresaId: string,
  nombre: string,
  rut: string,
  participacion: string,
): Promise<Resp> {
  if (!validarRut(rut))
    return { ok: false, error: "RUT inválido (dígito verificador)" };
  const rutFmt = formatearRut(rut);
  let part: number | null = null;
  if (participacion.trim()) {
    part = Number(participacion.replace("%", "").replace(",", "."));
    if (!Number.isFinite(part) || part <= 0 || part > 100)
      return { ok: false, error: "Participación inválida (0–100)" };
  }

  const supabase = await createClient();
  const { data: fila, error: e0 } = await supabase
    .from("clientes")
    .select("socios")
    .eq("id", empresaId)
    .maybeSingle();
  if (e0) return { ok: false, error: e0.message };

  const actuales: Socio[] = Array.isArray(fila?.socios)
    ? (fila.socios as Socio[])
    : [];
  if (actuales.some((s) => s.rut === rutFmt))
    return { ok: false, error: `El socio ${rutFmt} ya está registrado` };

  const nuevos = [
    ...actuales,
    { nombre: nombre.trim() || null, rut: rutFmt, participacion: part },
  ];
  const { error } = await supabase
    .from("clientes")
    .update({ socios: nuevos })
    .eq("id", empresaId);
  if (error) return { ok: false, error: error.message };

  revalidarFichas();
  return { ok: true };
}

/** Quita un socio (por índice) del jsonb `socios` de la empresa. */
export async function quitarSocio(
  empresaId: string,
  indice: number,
): Promise<Resp> {
  const supabase = await createClient();
  const { data: fila, error: e0 } = await supabase
    .from("clientes")
    .select("socios")
    .eq("id", empresaId)
    .maybeSingle();
  if (e0) return { ok: false, error: e0.message };

  const actuales: Socio[] = Array.isArray(fila?.socios)
    ? (fila.socios as Socio[])
    : [];
  if (indice < 0 || indice >= actuales.length)
    return { ok: false, error: "Socio no encontrado" };

  const nuevos = actuales.filter((_, i) => i !== indice);
  const { error } = await supabase
    .from("clientes")
    .update({ socios: nuevos.length ? nuevos : null })
    .eq("id", empresaId);
  if (error) return { ok: false, error: error.message };

  revalidarFichas();
  return { ok: true };
}

export type TrabajadorNominaRow = {
  id: string;
  nombre: string;
  rut: string | null;
  cargo: string | null;
  tipo_contrato: string | null;
  jornada_tipo: string | null;
  horas_semanales: number | null;
  fecha_ingreso: string | null;
  sueldo_base: number | null;
  afp: string | null;
  salud: string | null;
  plan_isapre: string | null;
  activo: boolean | null;
};

/** Nómina de trabajadores de una empresa (activos primero). */
export async function nominaDeEmpresa(
  clienteId: string,
): Promise<TrabajadorNominaRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("trabajadores")
    .select(
      "id, nombres, apellidos, apellido_paterno, apellido_materno, rut, cargo, tipo_contrato, jornada_tipo, horas_semanales, fecha_ingreso, sueldo_base, afp, salud, plan_isapre, activo",
    )
    .eq("cliente_id", clienteId)
    .order("activo", { ascending: false })
    .order("apellido_paterno");

  return (data ?? []).map((t) => ({
    id: t.id,
    nombre:
      `${t.nombres ?? ""} ${t.apellido_paterno ?? ""} ${t.apellido_materno ?? ""}`.trim() ||
      `${t.nombres ?? ""} ${t.apellidos ?? ""}`.trim(),
    rut: t.rut,
    cargo: t.cargo,
    tipo_contrato: t.tipo_contrato,
    jornada_tipo: t.jornada_tipo,
    horas_semanales:
      t.horas_semanales === null ? null : Number(t.horas_semanales),
    fecha_ingreso: t.fecha_ingreso,
    sueldo_base: t.sueldo_base === null ? null : Number(t.sueldo_base),
    afp: t.afp,
    salud: t.salud,
    plan_isapre: t.plan_isapre,
    activo: t.activo,
  }));
}
