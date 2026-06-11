"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Gastos e ingresos menores del portal del cliente: compras y ventas con
 * boleta que no van al SII mensual pero sí a la Operación Renta. Todo pasa
 * por RPCs SECURITY DEFINER validadas por token — el rol anon no toca tablas.
 */

export type GastoMenorPortal = {
  id: string;
  tipo: "compra" | "venta";
  fecha: string;
  descripcion: string;
  monto: number;
};

export async function listarGastosMenores(
  token: string,
  anio: number,
): Promise<{ ok: boolean; gastos?: GastoMenorPortal[]; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("gastos_menores_de", {
    p_token: token,
    p_anio: anio,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, gastos: (data ?? []) as GastoMenorPortal[] };
}

export async function crearGastoMenor(
  token: string,
  g: { tipo: string; fecha: string; descripcion: string; monto: number },
): Promise<{ ok: boolean; error?: string }> {
  if (g.tipo !== "compra" && g.tipo !== "venta") {
    return { ok: false, error: "Indica si es una compra (gasto) o una venta (ingreso)." };
  }
  if (!g.fecha) return { ok: false, error: "Indica la fecha del movimiento." };
  if (!g.descripcion.trim()) {
    return { ok: false, error: "Describe brevemente el movimiento." };
  }
  if (!Number.isFinite(g.monto) || g.monto <= 0) {
    return { ok: false, error: "El monto debe ser mayor a cero." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("crear_gasto_menor", {
    p_token: token,
    p: {
      tipo: g.tipo,
      fecha: g.fecha,
      descripcion: g.descripcion.trim(),
      monto: String(Math.round(g.monto)),
    },
  });
  if (error) {
    return {
      ok: false,
      error: error.message.includes("inválido")
        ? "Este link no es válido. Contacta a RS Tax & Legal."
        : `No se pudo registrar: ${error.message}`,
    };
  }
  return { ok: true };
}

export async function anularGastoMenor(
  token: string,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("anular_gasto_menor", {
    p_token: token,
    p_id: id,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
