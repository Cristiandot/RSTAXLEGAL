"use server";

import { createClient } from "@/lib/supabase/server";

export type TipoFactura = "emitidas" | "recibidas";

export type FacturaPortal = {
  id: string;
  periodo: string;
  fecha: string | null;
  contraparte: string | null;
  rut: string | null;
  folio: string | null;
  monto: number | string | null;
  tipo_doc: number | null;
  pagado: boolean;
  clasificable: boolean;
  categoria: string | null;
  n_documentos: number | null;
};

export type AjusteMes = { periodo: string; monto: number | string; docs: number };

export async function cargarFacturas(
  token: string,
  anio: number,
  tipo: TipoFactura,
): Promise<{ ok: boolean; facturas?: FacturaPortal[]; ajustes?: AjusteMes[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("portal_facturas", {
    p_token: token,
    p_anio: anio,
    p_tipo: tipo,
  });
  if (error || !data) return { ok: false };
  const d = data as { facturas?: FacturaPortal[]; ajustes?: AjusteMes[] };
  return { ok: true, facturas: d.facturas ?? [], ajustes: d.ajustes ?? [] };
}

export async function marcarPago(
  token: string,
  tipo: TipoFactura,
  id: string,
  pagado: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("portal_marcar_pago", {
    p_token: token,
    p_tabla: tipo,
    p_id: id,
    p_pagado: pagado,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
