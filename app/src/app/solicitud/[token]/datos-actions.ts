"use server";

import { createClient } from "@/lib/supabase/server";

export type CampoEmpresa = {
  campo: string;
  etiqueta: string;
  grupo: string;
  fuente: string;
  valor: string | null;
  falta: boolean;
};

export type Accesos = {
  clave_sii: string | null;
  previred_rut: string | null;
  previred_clave: string | null;
  afc_clave: string | null;
};

export type EmpresaDetalle = {
  razon_social: string;
  rut_empresa: string | null;
  pct: number;
  campos: CampoEmpresa[];
  accesos: Accesos;
};

export async function cargarEmpresaDetalle(
  token: string,
): Promise<{ ok: boolean; detalle?: EmpresaDetalle }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("portal_empresa_detalle", {
    p_token: token,
  });
  if (error || !data) return { ok: false };
  return { ok: true, detalle: data as EmpresaDetalle };
}

export async function guardarDatosEmpresa(
  token: string,
  payload: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("portal_guardar_datos", {
    p_token: token,
    p: payload,
  });
  return { ok: !error, error: error?.message };
}
