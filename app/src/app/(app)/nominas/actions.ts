"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validarRut, formatearRut } from "@/lib/rut";

type Resp = { ok: boolean; error?: string };

export type CargaFamiliar = {
  rut: string | null;
  nombre: string | null;
  fecha_nacimiento: string | null;
  genero: string | null;
  parentesco: string | null;
};

/** Ficha completa de un trabajador para la vista de rellenado. */
export type TrabajadorFichaRow = {
  id: string;
  nombre: string;
  rut: string | null;
  sucursal: string | null;
  cargo: string | null;
  tipo_contrato: string | null;
  sueldo_base: number | null;
  activo: boolean | null;
  /** Valor mostrable de cada campo del catálogo; null = falta (editable). */
  valores: Record<string, string | null>;
  cargas: CargaFamiliar[];
};

/** Fichas completas de los trabajadores de una empresa (activos primero). */
export async function fichasDeEmpresa(
  clienteId: string,
): Promise<TrabajadorFichaRow[]> {
  const supabase = await createClient();

  const [defsRes, trabsRes] = await Promise.all([
    supabase
      .from("onboarding_campos")
      .select("campo")
      .eq("entidad", "trabajador")
      .eq("activo", true),
    supabase
      .from("trabajadores")
      .select("*")
      .eq("cliente_id", clienteId)
      .order("activo", { ascending: false })
      .order("apellido_paterno"),
  ]);

  const campos = (defsRes.data ?? []).map((d) => d.campo);

  return (trabsRes.data ?? []).map((t) => {
    const valores: Record<string, string | null> = {};
    for (const campo of campos) {
      const raw = (t as Record<string, unknown>)[campo];
      valores[campo] =
        raw === null || raw === undefined || raw === "" ? null : String(raw);
    }
    return {
      id: t.id,
      nombre:
        `${t.nombres ?? ""} ${t.apellido_paterno ?? ""} ${t.apellido_materno ?? ""}`.trim() ||
        `${t.nombres ?? ""} ${t.apellidos ?? ""}`.trim(),
      rut: t.rut,
      sucursal: t.sucursal,
      cargo: t.cargo,
      tipo_contrato: t.tipo_contrato,
      sueldo_base: t.sueldo_base === null ? null : Number(t.sueldo_base),
      activo: t.activo,
      valores,
      cargas: Array.isArray(t.cargas_familiares)
        ? (t.cargas_familiares as CargaFamiliar[])
        : [],
    };
  });
}

/** Agrega una carga familiar al jsonb `cargas_familiares` del trabajador. */
export async function agregarCarga(
  trabajadorId: string,
  carga: CargaFamiliar,
): Promise<Resp> {
  const nombre = carga.nombre?.trim();
  if (!nombre) return { ok: false, error: "El nombre de la carga es obligatorio" };
  let rut: string | null = null;
  if (carga.rut?.trim()) {
    if (!validarRut(carga.rut))
      return { ok: false, error: "RUT de la carga inválido (dígito verificador)" };
    rut = formatearRut(carga.rut);
  }
  if (carga.fecha_nacimiento && !/^\d{4}-\d{2}-\d{2}$/.test(carga.fecha_nacimiento))
    return { ok: false, error: "Fecha de nacimiento inválida" };

  const supabase = await createClient();
  const { data: fila, error: e0 } = await supabase
    .from("trabajadores")
    .select("cargas_familiares")
    .eq("id", trabajadorId)
    .maybeSingle();
  if (e0) return { ok: false, error: e0.message };

  const actuales: CargaFamiliar[] = Array.isArray(fila?.cargas_familiares)
    ? (fila.cargas_familiares as CargaFamiliar[])
    : [];
  if (rut && actuales.some((c) => c.rut === rut))
    return { ok: false, error: `La carga ${rut} ya está registrada` };

  const nuevas = [
    ...actuales,
    {
      rut,
      nombre,
      fecha_nacimiento: carga.fecha_nacimiento || null,
      genero: carga.genero || null,
      parentesco: carga.parentesco || null,
    },
  ];
  const { error } = await supabase
    .from("trabajadores")
    .update({ cargas_familiares: nuevas })
    .eq("id", trabajadorId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/nominas", "layout");
  return { ok: true };
}

/** Quita una carga familiar (por índice) del trabajador. */
export async function quitarCarga(
  trabajadorId: string,
  indice: number,
): Promise<Resp> {
  const supabase = await createClient();
  const { data: fila, error: e0 } = await supabase
    .from("trabajadores")
    .select("cargas_familiares")
    .eq("id", trabajadorId)
    .maybeSingle();
  if (e0) return { ok: false, error: e0.message };

  const actuales: CargaFamiliar[] = Array.isArray(fila?.cargas_familiares)
    ? (fila.cargas_familiares as CargaFamiliar[])
    : [];
  if (indice < 0 || indice >= actuales.length)
    return { ok: false, error: "Carga no encontrada" };

  const nuevas = actuales.filter((_, i) => i !== indice);
  const { error } = await supabase
    .from("trabajadores")
    .update({ cargas_familiares: nuevas.length ? nuevas : null })
    .eq("id", trabajadorId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/nominas", "layout");
  return { ok: true };
}
