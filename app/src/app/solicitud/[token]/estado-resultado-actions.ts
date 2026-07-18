"use server";

import { createClient } from "@/lib/supabase/server";

export type MesResultado = {
  periodo: string;
  ingresos: number;
  servicios: number;
  insumos: number;
  arriendo: number;
  otros: number;
  honorarios: number;
  compras_total: number;
  remuneraciones: number;
  resultado: number;
  remun_cargada: boolean;
};

export type CorteInfo = {
  generado: string | null;
  ventas_hasta: string | null;
  compras_hasta: string | null;
  honorarios_hasta: string | null;
  remun_hasta: string | null;
};

export async function cargarEstadoResultado(
  token: string,
  anio: number,
): Promise<{ ok: boolean; meses?: MesResultado[]; corte?: CorteInfo }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("portal_estado_resultado", {
    p_token: token,
    p_anio: anio,
  });
  if (error || !data) return { ok: false };
  const d = data as { meses?: MesResultado[]; corte?: CorteInfo };
  return { ok: true, meses: d.meses ?? [], corte: d.corte };
}

/** ¿La empresa tiene información financiera cargada (ventas/ingresos)? */
export async function tieneFinanciera(token: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("portal_tiene_financiera", { p_token: token });
  if (error) return false;
  return data === true;
}
