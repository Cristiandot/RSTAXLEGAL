"use server";

import { createClient } from "@/lib/supabase/server";

export type ConvenioCliente = {
  id: string;
  tipo: "convenio" | "multa";
  organismo: "sii" | "tesoreria" | "dt" | "otro";
  folio: string | null;
  concepto: string | null;
  monto_total: number | null;
  monto_pagado: number | null;
  n_cuotas: number;
  cuotas_pagadas: number;
  proximo_vencimiento: string | null;
};

export async function cargarConveniosCliente(
  token: string,
): Promise<{ ok: boolean; convenios?: ConvenioCliente[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("portal_convenios", { p_token: token });
  if (error || !data) return { ok: false };
  return { ok: true, convenios: data as ConvenioCliente[] };
}
