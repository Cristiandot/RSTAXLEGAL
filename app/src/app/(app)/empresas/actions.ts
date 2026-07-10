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

const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Agrega un correo adicional al jsonb `correos_adicionales` de la empresa.
 * Todos los correos que salen al cliente (F29, comunicación mensual, facturas,
 * contratos) van con copia a esta lista, sin límite de casillas.
 */
export async function agregarCorreoAdicional(
  empresaId: string,
  correo: string,
): Promise<Resp> {
  const limpio = correo.trim().toLowerCase();
  if (!RE_CORREO.test(limpio))
    return { ok: false, error: "Correo inválido (formato nombre@dominio.cl)" };

  const supabase = await createClient();
  const { data: fila, error: e0 } = await supabase
    .from("clientes")
    .select("correos_adicionales, correo_empresa")
    .eq("id", empresaId)
    .maybeSingle();
  if (e0) return { ok: false, error: e0.message };

  const actuales: string[] = Array.isArray(fila?.correos_adicionales)
    ? (fila.correos_adicionales as string[])
    : [];
  if (
    actuales.some((c) => c.toLowerCase() === limpio) ||
    (fila?.correo_empresa ?? "").trim().toLowerCase() === limpio
  ) {
    return { ok: false, error: `El correo ${limpio} ya está registrado` };
  }

  const { error } = await supabase
    .from("clientes")
    .update({ correos_adicionales: [...actuales, limpio] })
    .eq("id", empresaId);
  if (error) return { ok: false, error: error.message };

  revalidarFichas();
  return { ok: true };
}

/** Quita un correo adicional (por índice) de la empresa. */
export async function quitarCorreoAdicional(
  empresaId: string,
  indice: number,
): Promise<Resp> {
  const supabase = await createClient();
  const { data: fila, error: e0 } = await supabase
    .from("clientes")
    .select("correos_adicionales")
    .eq("id", empresaId)
    .maybeSingle();
  if (e0) return { ok: false, error: e0.message };

  const actuales: string[] = Array.isArray(fila?.correos_adicionales)
    ? (fila.correos_adicionales as string[])
    : [];
  if (indice < 0 || indice >= actuales.length)
    return { ok: false, error: "Correo no encontrado" };

  const nuevos = actuales.filter((_, i) => i !== indice);
  const { error } = await supabase
    .from("clientes")
    .update({ correos_adicionales: nuevos.length ? nuevos : null })
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

