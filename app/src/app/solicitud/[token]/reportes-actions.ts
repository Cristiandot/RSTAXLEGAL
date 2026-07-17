"use server";

import { createClient } from "@/lib/supabase/server";

export type Proveedor = { rut?: string; nombre: string; monto: number; docs: number };
export type RemMes = { periodo: string; costo: number; dotacion: number };
export type BoletaMes = { periodo: string; n: number; monto: number; ticket: number };

export type Reportes = {
  anio: number;
  estructura: {
    ingresos: number;
    servicios: number;
    insumos: number;
    otros: number;
    honorarios: number;
    remuneraciones: number;
  };
  iva_credito_no_recuperable: number;
  total_compras: number;
  top_proveedores: Proveedor[];
  servicios_profesionales: Proveedor[];
  sin_clasificar: Proveedor[];
  honorarios_recibidos: Proveedor[];
  boletas_mensual: BoletaMes[];
  remuneraciones_mensual: RemMes[];
};

export async function cargarReportes(
  token: string,
  anio: number,
): Promise<{ ok: boolean; data?: Reportes }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("portal_reportes", {
    p_token: token,
    p_anio: anio,
  });
  if (error || !data) return { ok: false };
  return { ok: true, data: data as Reportes };
}

export type Renta = {
  anio: number;
  tasa_pct: number;
  meses_completos: number;
  resultado_anualizado: number;
  renta_estimada: number;
  ppm_acumulado: number;
  renta_a_pagar: number;
  f29_declarados: string[];
  f29_pendientes: string[];
};

export async function cargarRenta(
  token: string,
  anio: number,
): Promise<{ ok: boolean; data?: Renta }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("portal_renta_proyectada", {
    p_token: token,
    p_anio: anio,
  });
  if (error || !data) return { ok: false };
  return { ok: true, data: data as Renta };
}
