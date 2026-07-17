"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Clasificación de gastos exentos (tipo 34) por el cliente, desde el portal.
 * El catálogo lo define la oficina (categoria_gasto); el cliente sólo elige.
 * Todo por RPCs SECURITY DEFINER validadas por token — anon no toca tablas.
 */

export type CategoriaOpcion = { codigo: string; etiqueta: string };
export type ProveedorSinClasificar = {
  rut: string;
  nombre: string;
  monto: number;
  docs: number;
  desde: string;
  hasta: string;
};

export async function cargarSinClasificar(
  token: string,
): Promise<{ ok: boolean; categorias?: CategoriaOpcion[]; proveedores?: ProveedorSinClasificar[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("portal_sin_clasificar", { p_token: token });
  if (error || !data) return { ok: false };
  const d = data as { categorias?: CategoriaOpcion[]; proveedores?: ProveedorSinClasificar[] };
  return { ok: true, categorias: d.categorias ?? [], proveedores: d.proveedores ?? [] };
}

export async function clasificarProveedor(
  token: string,
  rut: string,
  categoria: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("portal_clasificar_proveedor", {
    p_token: token,
    p_rut: rut,
    p_categoria: categoria,
  });
  if (error) {
    return {
      ok: false,
      error: error.message.includes("inválid")
        ? "Este link no es válido. Contacta a RS Tax & Legal."
        : `No se pudo guardar: ${error.message}`,
    };
  }
  return { ok: true };
}
