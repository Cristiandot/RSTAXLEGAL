"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { corregirLreDt, type ResumenLre } from "@/lib/lre-dt";

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function usuarioActualId(supabase: Supabase): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const { data } = await supabase
    .from("usuarios")
    .select("id")
    .eq("correo", user.email.toLowerCase())
    .eq("activo", true)
    .maybeSingle();
  return data?.id ?? null;
}

const rutSinFormato = (r: string | null | undefined) =>
  (r ?? "").toUpperCase().replace(/[^0-9K]/g, "");

/**
 * Sube el LRE de una empresa/período: aplica la corrección de formato DT,
 * guarda el CSV corregido en el bucket `libros` y registra la fila.
 */
export async function subirLibro(
  formData: FormData,
): Promise<{ ok: boolean; error?: string; resumen?: ResumenLre }> {
  const supabase = await createClient();

  const clienteId = String(formData.get("clienteId") ?? "");
  const periodo = String(formData.get("periodo") ?? "");
  const archivo = formData.get("archivo");

  if (!clienteId) return { ok: false, error: "Selecciona la empresa." };
  if (!/^\d{4}-\d{2}$/.test(periodo)) return { ok: false, error: "Período inválido." };
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "Adjunta el CSV del LRE exportado de KAME." };
  }

  const bytes = Buffer.from(await archivo.arrayBuffer());
  const { output, resumen } = corregirLreDt(bytes);
  if (!resumen.ok) return { ok: false, error: resumen.error };

  const { data: cli } = await supabase
    .from("clientes")
    .select("rut_empresa, previred_rut")
    .eq("id", clienteId)
    .single();
  const rut = rutSinFormato(cli?.previred_rut) || rutSinFormato(cli?.rut_empresa);
  const yyyymm = periodo.replace("-", "");
  const archivoPath = `${clienteId}/${rut || "sinrut"}_${yyyymm}.csv`;

  const { error: errUp } = await supabase.storage
    .from("libros")
    .upload(archivoPath, output, { contentType: "text/csv", upsert: true });
  if (errUp) return { ok: false, error: `No se pudo subir el archivo: ${errUp.message}` };

  const subidoPor = await usuarioActualId(supabase);
  const { error: errIns } = await supabase.from("libro_remuneraciones").upsert(
    {
      cliente_id: clienteId,
      periodo,
      rut_empleador: rut || null,
      archivo_path: archivoPath,
      n_trabajadores: resumen.nTrabajadores,
      total_liquido: resumen.totalLiquido,
      jornada_provisional: resumen.jornadaProvisional > 0,
      causal_provisional: resumen.causalProvisional > 0,
      estado: "cargado",
      subido_por: subidoPor,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "cliente_id,periodo" },
  );
  if (errIns) return { ok: false, error: errIns.message };

  revalidatePath("/libro-remuneraciones");
  return { ok: true, resumen };
}

/** Link firmado de descarga con el nombre que exige la DT: rutempleador_aaaamm.csv */
export async function descargarLibro(
  id: string,
): Promise<{ ok: boolean; error?: string; url?: string }> {
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("libro_remuneraciones")
    .select("archivo_path, rut_empleador, periodo")
    .eq("id", id)
    .single();
  if (!row) return { ok: false, error: "Registro no encontrado." };

  const nombre = `${row.rut_empleador ?? "lre"}_${row.periodo.replace("-", "")}.csv`;
  const { data: firmado, error } = await supabase.storage
    .from("libros")
    .createSignedUrl(row.archivo_path, 3600, { download: nombre });
  if (error || !firmado) return { ok: false, error: `No se pudo generar el link: ${error?.message}` };
  return { ok: true, url: firmado.signedUrl };
}

/** Cambia el estado DT del período (y fecha de carga a la DT cuando corresponde). */
export async function marcarEstado(
  id: string,
  estado: "cargado" | "subido_dt" | "declarado" | "observaciones",
  fecha?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const cargaDt = estado === "cargado" ? null : (fecha ?? new Date().toISOString().slice(0, 10));
  const { error } = await supabase
    .from("libro_remuneraciones")
    .update({ estado, fecha_carga_dt: cargaDt, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/libro-remuneraciones");
  return { ok: true };
}

/** Marca un período como "sin movimiento" (la empresa no tuvo remuneraciones ese mes). */
export async function marcarSinMovimiento(
  clienteId: string,
  periodo: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!clienteId || !/^\d{4}-\d{2}$/.test(periodo)) return { ok: false, error: "Datos inválidos." };
  const supabase = await createClient();
  const subidoPor = await usuarioActualId(supabase);
  const { error } = await supabase.from("libro_remuneraciones").upsert(
    {
      cliente_id: clienteId, periodo, estado: "sin_movimiento", archivo_path: "",
      n_trabajadores: 0, total_liquido: 0, jornada_provisional: false, causal_provisional: false,
      observaciones: "Sin remuneraciones en el período", subido_por: subidoPor,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "cliente_id,periodo" },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/libro-remuneraciones");
  return { ok: true };
}

/** Elimina el período: borra el archivo del bucket y la fila. */
export async function eliminarLibro(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("libro_remuneraciones")
    .select("archivo_path")
    .eq("id", id)
    .single();
  if (row?.archivo_path) {
    await supabase.storage.from("libros").remove([row.archivo_path]);
  }
  const { error } = await supabase.from("libro_remuneraciones").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/libro-remuneraciones");
  return { ok: true };
}
