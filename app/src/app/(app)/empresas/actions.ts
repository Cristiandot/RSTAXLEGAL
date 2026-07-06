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

