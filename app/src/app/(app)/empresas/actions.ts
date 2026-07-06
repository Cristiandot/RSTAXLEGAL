"use server";

import { createClient } from "@/lib/supabase/server";

export type TrabajadorNominaRow = {
  id: string;
  nombre: string;
  rut: string | null;
  cargo: string | null;
  tipo_contrato: string | null;
  jornada_tipo: string | null;
  fecha_ingreso: string | null;
  sueldo_base: number | null;
  afp: string | null;
  salud: string | null;
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
      "id, nombres, apellidos, apellido_paterno, apellido_materno, rut, cargo, tipo_contrato, jornada_tipo, fecha_ingreso, sueldo_base, afp, salud, activo",
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
    fecha_ingreso: t.fecha_ingreso,
    sueldo_base: t.sueldo_base === null ? null : Number(t.sueldo_base),
    afp: t.afp,
    salud: t.salud,
    activo: t.activo,
  }));
}
