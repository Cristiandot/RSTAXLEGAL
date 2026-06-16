"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  decodificarCsv,
  parsearRcv,
  type LibroRcv,
} from "@/lib/contabilidad/rcv";

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function usuarioActualId(supabase: Supabase): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const { data } = await supabase
    .from("usuarios")
    .select("id")
    .eq("correo", user.email.toLowerCase())
    .eq("activo", true)
    .maybeSingle();
  return data?.id ?? null;
}

export type ResumenImportacion = {
  libro: LibroRcv;
  periodo: string;
  total: number;
  insertadas: number;
  actualizadas: number;
  advertencias: string[];
};

/**
 * Importa un CSV del RCV del SII a `rcv_compras` / `rcv_ventas`.
 *
 * - El libro (compras/ventas) se detecta solo por los encabezados.
 * - Reimportar el mismo archivo NO duplica: la llave única por documento hace
 *   upsert, y como el upsert no toca `pagado_pct` ni `cuenta_id`, las
 *   ediciones del contador sobreviven a la reimportación.
 * - El CSV original queda además en el checklist documental del mes (bucket
 *   `contabilidad` + `documentos_contables`) y estampa el hito de descarga.
 */
export async function importarRcv(
  formData: FormData,
): Promise<{ ok: boolean; error?: string; resumen?: ResumenImportacion }> {
  const archivo = formData.get("archivo");
  const clienteId = String(formData.get("clienteId") ?? "");
  const periodo = String(formData.get("periodo") ?? "");

  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "No se recibió ningún archivo." };
  }
  if (archivo.size > 15 * 1024 * 1024) {
    return { ok: false, error: "El archivo supera los 15 MB." };
  }
  if (!clienteId || !/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) {
    return { ok: false, error: "Falta el cliente o el período." };
  }

  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const resultado = parsearRcv(decodificarCsv(bytes));
  if (!resultado.ok) return { ok: false, error: resultado.error };
  if (resultado.filas.length === 0) {
    return { ok: false, error: "El CSV no tiene documentos." };
  }

  const supabase = await createClient();
  const importadoPor = await usuarioActualId(supabase);
  const tabla = resultado.libro === "compra" ? "rcv_compras" : "rcv_ventas";
  const conflicto =
    resultado.libro === "compra"
      ? "cliente_id,periodo,tipo_doc,rut_proveedor,folio"
      : "cliente_id,periodo,tipo_doc,folio";

  // Llaves ya existentes en el período, para informar nuevas vs actualizadas
  const { data: existentes } = await supabase
    .from(tabla)
    .select("tipo_doc, folio" + (resultado.libro === "compra" ? ", rut_proveedor" : ""))
    .eq("cliente_id", clienteId)
    .eq("periodo", periodo);
  const claves = new Set(
    (existentes ?? []).map((e) => {
      const r = e as unknown as {
        tipo_doc: number;
        folio: string;
        rut_proveedor?: string;
      };
      return `${r.tipo_doc}|${r.rut_proveedor ?? ""}|${r.folio}`;
    }),
  );

  const filas = resultado.filas.map((f) => ({
    ...f,
    cliente_id: clienteId,
    periodo,
    archivo_origen: archivo.name,
    importado_por: importadoPor,
  }));

  let actualizadas = 0;
  for (const f of resultado.filas) {
    const rut = "rut_proveedor" in f ? f.rut_proveedor : "";
    if (claves.has(`${f.tipo_doc}|${rut}|${f.folio}`)) actualizadas++;
  }

  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await supabase
      .from(tabla)
      .upsert(filas.slice(i, i + 500), { onConflict: conflicto });
    if (error) return { ok: false, error: `Error al guardar: ${error.message}` };
  }

  // Copia del CSV al checklist documental + hito de descarga (si está vacío)
  const categoria = resultado.libro === "compra" ? "fact_compras" : "fact_ventas";
  const nombreSano = archivo.name.replace(/[^\w.\-áéíóúñÁÉÍÓÚÑ ]+/g, "_");
  const archivoPath = `${clienteId}/${periodo}/${categoria}-${Date.now()}-${nombreSano}`;
  const { error: errUp } = await supabase.storage
    .from("contabilidad")
    .upload(archivoPath, bytes, { contentType: "text/csv" });
  if (!errUp) {
    await supabase.from("documentos_contables").insert({
      cliente_id: clienteId,
      periodo,
      categoria,
      etiqueta: "Importado a libros RCV",
      archivo_path: archivoPath,
      nombre_original: archivo.name,
      tamano_bytes: archivo.size,
      subido_por: importadoPor,
    });
  }

  const campoHito =
    resultado.libro === "compra"
      ? "fecha_compras_descargadas"
      : "fecha_ventas_descargadas";
  const { data: ciclo } = await supabase
    .from("ciclo_conciliacion")
    .select(`id, ${campoHito}`)
    .eq("cliente_id", clienteId)
    .eq("periodo", periodo)
    .maybeSingle();
  if (ciclo && !(ciclo as Record<string, unknown>)[campoHito]) {
    await supabase
      .from("ciclo_conciliacion")
      .update({ [campoHito]: new Date().toISOString().slice(0, 10) })
      .eq("id", (ciclo as Record<string, unknown>).id as string);
  }

  revalidatePath("/contabilidad", "layout");
  return {
    ok: true,
    resumen: {
      libro: resultado.libro,
      periodo,
      total: resultado.filas.length,
      insertadas: resultado.filas.length - actualizadas,
      actualizadas,
      advertencias: resultado.advertencias,
    },
  };
}

/** Edición inline de un documento del RCV: % pagado y/o cuenta de gasto. */
export async function actualizarDocRcv(
  libro: LibroRcv,
  id: string,
  cambios: { pagado_pct?: number; cuenta_id?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const payload: Record<string, unknown> = {};
  if (cambios.pagado_pct !== undefined) {
    if (
      !Number.isFinite(cambios.pagado_pct) ||
      cambios.pagado_pct < 0 ||
      cambios.pagado_pct > 100
    ) {
      return { ok: false, error: "El % pagado debe estar entre 0 y 100." };
    }
    payload.pagado_pct = cambios.pagado_pct;
  }
  if (cambios.cuenta_id !== undefined) payload.cuenta_id = cambios.cuenta_id;
  if (Object.keys(payload).length === 0) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase
    .from(libro === "compra" ? "rcv_compras" : "rcv_ventas")
    .update(payload)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/contabilidad", "layout");
  return { ok: true };
}

/** Edición inline de una boleta de honorarios: % pagado y/o cuenta de gasto. */
export async function actualizarHonorario(
  id: string,
  cambios: { pagado_pct?: number; cuenta_id?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const payload: Record<string, unknown> = {};
  if (cambios.pagado_pct !== undefined) {
    if (
      !Number.isFinite(cambios.pagado_pct) ||
      cambios.pagado_pct < 0 ||
      cambios.pagado_pct > 100
    ) {
      return { ok: false, error: "El % pagado debe estar entre 0 y 100." };
    }
    payload.pagado_pct = cambios.pagado_pct;
  }
  if (cambios.cuenta_id !== undefined) payload.cuenta_id = cambios.cuenta_id;
  if (Object.keys(payload).length === 0) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase.from("honorarios_periodo").update(payload).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/contabilidad", "layout");
  return { ok: true };
}

/** Borra TODOS los documentos del libro en el período (para reimportar limpio). */
export async function eliminarRcvPeriodo(
  libro: LibroRcv,
  clienteId: string,
  periodo: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from(libro === "compra" ? "rcv_compras" : "rcv_ventas")
    .delete()
    .eq("cliente_id", clienteId)
    .eq("periodo", periodo);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/contabilidad", "layout");
  return { ok: true };
}

/**
 * Crea una cuenta de gasto propia de la empresa en el plan de cuentas
 * (las estándar RSTL tienen cliente_id NULL y no se tocan desde acá).
 */
export async function crearCuentaGasto(
  clienteId: string,
  codigo: string,
  nombre: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const cod = codigo.trim();
  const nom = nombre.trim();
  if (!/^\d+(\.\d+)*$/.test(cod)) {
    return { ok: false, error: "Código inválido (formato esperado: 4.01.02.01)." };
  }
  if (!nom) return { ok: false, error: "Falta el nombre de la cuenta." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plan_cuentas")
    .insert({
      cliente_id: clienteId,
      codigo: cod,
      nombre: nom,
      tipo: "gasto",
      naturaleza: "deudora",
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/contabilidad", "layout");
  return { ok: true, id: data.id };
}

export type MontosF29 = {
  iva_debito: number | null;
  iva_credito: number | null;
  ppm: number | null;
  imp_unico: number | null;
  imp_2da_categoria: number | null;
  iva_postergado: number | null;
  monto_a_pagar: number | null;
  fecha_pago_f29: string | null;
};

/**
 * Guarda los montos del comprobante F29 del período (consulta manual en
 * sii.cl) sobre el ciclo F29 existente; si el ciclo no existe, lo crea.
 */
export async function guardarMontosF29(
  clienteId: string,
  periodo: string,
  montos: MontosF29,
): Promise<{ ok: boolean; error?: string }> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) {
    return { ok: false, error: "Período inválido." };
  }
  const supabase = await createClient();
  const { data: existente } = await supabase
    .from("ciclo_f29")
    .select("id")
    .eq("cliente_id", clienteId)
    .eq("periodo", periodo)
    .maybeSingle();

  const error = existente
    ? (
        await supabase.from("ciclo_f29").update(montos).eq("id", existente.id)
      ).error
    : (
        await supabase
          .from("ciclo_f29")
          .insert({ cliente_id: clienteId, periodo, ...montos })
      ).error;

  if (error) return { ok: false, error: error.message };
  revalidatePath("/contabilidad", "layout");
  return { ok: true };
}
