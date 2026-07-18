"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type Regla = { id: string; patron: string; categoria: string; orden: number };
export type ProveedorSin = { rut: string; nombre: string; monto: number; docs: number };

/** Guarda (crea o edita) una regla del diccionario. */
export async function guardarRegla(input: {
  id: string | null;
  patron: string;
  categoria: string;
  orden: number;
}): Promise<{ ok: boolean; error?: string }> {
  const patron = input.patron.trim();
  if (!patron) return { ok: false, error: "Escribe un patrón." };
  const supabase = await createClient();
  const fila = { patron, categoria: input.categoria, orden: input.orden || 100 };
  const { error } = input.id
    ? await supabase.from("categoria_gasto_regla").update(fila).eq("id", input.id)
    : await supabase.from("categoria_gasto_regla").insert(fila);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/clasificacion");
  return { ok: true };
}

export async function borrarRegla(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("categoria_gasto_regla").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/clasificacion");
  return { ok: true };
}

/** Corre la auto-clasificación (diccionario) para un cliente. Devuelve cuántos asignó. */
export async function correrAuto(
  clienteId: string,
): Promise<{ ok: boolean; nuevos?: number; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("clasificar_auto_cliente", { p_cliente: clienteId });
  if (error) return { ok: false, error: error.message };
  return { ok: true, nuevos: Number(data ?? 0) };
}

/** Proveedores exentos sin clasificar de un cliente + su resumen. */
export async function estadoCliente(
  clienteId: string,
): Promise<{ ok: boolean; sin?: ProveedorSin[]; auto?: number; manual?: number }> {
  const supabase = await createClient();
  const [sinRes, autoRes, manualRes] = await Promise.all([
    supabase.rpc("sin_clasificar_cliente", { p_cliente: clienteId }),
    supabase
      .from("rcv_proveedor_categoria")
      .select("rut_proveedor", { count: "exact", head: true })
      .eq("cliente_id", clienteId)
      .eq("fuente", "auto"),
    supabase
      .from("rcv_proveedor_categoria")
      .select("rut_proveedor", { count: "exact", head: true })
      .eq("cliente_id", clienteId)
      .eq("fuente", "manual"),
  ]);
  if (sinRes.error) return { ok: false };
  return {
    ok: true,
    sin: (sinRes.data as ProveedorSin[]) ?? [],
    auto: autoRes.count ?? 0,
    manual: manualRes.count ?? 0,
  };
}

/** Clasificación manual (oficina) de un proveedor — queda como override 'manual'. */
export async function clasificarManual(
  clienteId: string,
  rut: string,
  categoria: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("rcv_proveedor_categoria")
    .upsert(
      { cliente_id: clienteId, rut_proveedor: rut, categoria, fuente: "manual" },
      { onConflict: "cliente_id,rut_proveedor" },
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
