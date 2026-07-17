"use server";

import { createClient } from "@/lib/supabase/server";

export type MesResultado = {
  periodo: string;
  ingresos: number;
  insumos: number;
  servicios: number;
  compras_total: number;
  remuneraciones: number;
  resultado: number;
  remun_cargada: boolean;
};

export type CorteInfo = {
  generado: string | null;
  ventas_hasta: string | null;
  compras_hasta: string | null;
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
