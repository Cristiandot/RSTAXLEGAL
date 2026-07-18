import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedMov } from "./parsers";

export const NOMBRE_FUENTE: Record<string, string> = {
  mercadopago: "Mercado Pago",
  mercadopago_settlement: "Mercado Pago (liberaciones)",
  banco_chile: "Banco de Chile",
  bci: "Banco de Crédito e Inversiones (BCI)",
  santander: "Banco Santander",
  banco_estado: "Banco Estado",
  bice: "Banco BICE",
  itau: "Banco Itaú",
  scotiabank: "Banco Scotiabank",
  security: "Banco Security",
  falabella: "Banco Falabella",
  generico: "Banco (genérico)",
};

/** Busca (o crea) la cuenta bancaria de la empresa para una fuente/alias. */
export async function upsertCuenta(
  supabase: SupabaseClient,
  clienteId: string,
  fuente: string,
  alias: string | null,
): Promise<{ id: string } | { error: string }> {
  const q = supabase.from("banco_cuenta").select("id").eq("cliente_id", clienteId).eq("fuente", fuente);
  const { data: existentes } = await (alias ? q.eq("alias", alias) : q);
  if (existentes && existentes.length) return { id: existentes[0].id as string };
  const nombre = NOMBRE_FUENTE[fuente] ?? fuente;
  const { data, error } = await supabase
    .from("banco_cuenta")
    .insert({ cliente_id: clienteId, fuente, banco_nombre: nombre, alias: alias || nombre, moneda: "CLP" })
    .select("id")
    .single();
  if (error) return { error: error.message };
  return { id: data.id as string };
}

/**
 * Actualiza el saldo de la cuenta con el saldo del movimiento más reciente que
 * lo traiga (las cartolas de banco traen saldo corrido; MP no). Así el saldo
 * deja de ser un dato manual: se mantiene solo con cada cartola subida.
 */
export async function actualizarSaldoCuenta(
  supabase: SupabaseClient,
  cuentaId: string,
): Promise<void> {
  const { data } = await supabase
    .from("banco_movimiento")
    .select("fecha, saldo")
    .eq("cuenta_id", cuentaId)
    .not("saldo", "is", null)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);
  const ultimo = data?.[0];
  if (!ultimo) return;
  await supabase
    .from("banco_cuenta")
    .update({ saldo_actual: ultimo.saldo, saldo_fecha: ultimo.fecha, updated_at: new Date().toISOString() })
    .eq("id", cuentaId);
}

/** Inserta movimientos deduplicando por (cuenta_id, hash). Devuelve cuántos nuevos. */
export async function insertarMovimientos(
  supabase: SupabaseClient,
  opts: { cuentaId: string; clienteId: string; fuente: string; filename: string; importadoPor?: string | null },
  movs: ParsedMov[],
): Promise<{ insertados: number; total: number; error?: string }> {
  const filas = movs.map((m) => ({
    cuenta_id: opts.cuentaId,
    cliente_id: opts.clienteId,
    fuente: opts.fuente,
    archivo_origen: opts.filename,
    importado_por: opts.importadoPor ?? null,
    ...m,
  }));
  let insertados = 0;
  for (let i = 0; i < filas.length; i += 500) {
    const { error, count } = await supabase
      .from("banco_movimiento")
      .upsert(filas.slice(i, i + 500), { onConflict: "cuenta_id,hash", ignoreDuplicates: true, count: "exact" });
    if (error) return { insertados, total: filas.length, error: error.message };
    insertados += count ?? 0;
  }
  return { insertados, total: filas.length };
}
