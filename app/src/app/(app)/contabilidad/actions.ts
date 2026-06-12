"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { nombreArchivo } from "@/lib/format";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Id en `usuarios` del usuario autenticado (null si no se resuelve). */
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

export type GuardarContabilidadInput = {
  cicloId: string;
  clienteId: string;
  responsableId: string | null;
  kameCierre: string | null;
  fechaCompras: string | null;
  fechaVentas: string | null;
  fechaConciliacion: string | null;
  observaciones: string | null;
};

/**
 * Guarda el ciclo mensual. Si se marcó el estado KAME al cierre, actualiza
 * también el estado vigente del cliente (ON/OFF es por empresa, no historial
 * mensual) con fecha y revisor. (KAME sigue visible durante la transición.)
 */
export async function guardarContabilidad(
  input: GuardarContabilidadInput,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();

  const { error: errCiclo } = await supabase
    .from("ciclo_conciliacion")
    .update({
      responsable_id: input.responsableId,
      fecha_compras_descargadas: input.fechaCompras,
      fecha_ventas_descargadas: input.fechaVentas,
      fecha_conciliacion_kame_ok: input.fechaConciliacion,
      kame_cert_estado_al_cierre: input.kameCierre,
      observaciones: input.observaciones,
    })
    .eq("id", input.cicloId);

  if (errCiclo) return { ok: false, error: errCiclo.message };

  if (input.kameCierre) {
    const revisorId = await usuarioActualId(supabase);
    const { error: errCli } = await supabase
      .from("clientes")
      .update({
        kame_cert_estado: input.kameCierre,
        kame_cert_ultima_revision: new Date().toISOString().slice(0, 10),
        kame_cert_revisado_por: revisorId,
      })
      .eq("id", input.clienteId);
    if (errCli) {
      return {
        ok: false,
        error: `Ciclo guardado, pero error actualizando KAME del cliente: ${errCli.message}`,
      };
    }
  }

  revalidatePath("/contabilidad", "layout");
  return { ok: true };
}

const CATEGORIAS = [
  "fact_compras",
  "fact_ventas",
  "boleta_ventas",
  "boleta_compras",
  "honorarios",
  "otro_gasto",
  "otro_ingreso",
  "otro",
] as const;
export type CategoriaDocumento = (typeof CATEGORIAS)[number];

/**
 * Sube un documento contable del mes (RCV compras/ventas u otro) al bucket
 * "contabilidad" y lo registra. Si es un RCV y el hito de descarga del ciclo
 * está vacío, lo estampa con la fecha de hoy — así el estado del checklist
 * avanza solo, sin tipear fechas a mano.
 */
export async function subirDocumentoContable(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const archivo = formData.get("archivo");
  const clienteId = String(formData.get("clienteId") ?? "");
  const cicloId = String(formData.get("cicloId") ?? "");
  const periodo = String(formData.get("periodo") ?? "");
  const categoria = String(formData.get("categoria") ?? "") as CategoriaDocumento;
  const etiqueta = String(formData.get("etiqueta") ?? "").trim();

  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "No se recibió ningún archivo." };
  }
  if (archivo.size > 20 * 1024 * 1024) {
    return { ok: false, error: "El archivo supera los 20 MB." };
  }
  if (!clienteId || !/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) {
    return { ok: false, error: "Falta el cliente o el período." };
  }
  if (!CATEGORIAS.includes(categoria)) {
    return { ok: false, error: "Categoría de documento inválida." };
  }

  const supabase = await createClient();

  const nombreSano = archivo.name.replace(/[^\w.\-áéíóúñÁÉÍÓÚÑ ]+/g, "_");
  const archivoPath = `${clienteId}/${periodo}/${categoria}-${Date.now()}-${nombreSano}`;
  const bytes = new Uint8Array(await archivo.arrayBuffer());

  const { error: errUp } = await supabase.storage
    .from("contabilidad")
    .upload(archivoPath, bytes, {
      contentType: archivo.type || "application/octet-stream",
    });
  if (errUp) return { ok: false, error: `Falló la subida a Storage: ${errUp.message}` };

  const subidoPor = await usuarioActualId(supabase);
  const { error: errIns } = await supabase.from("documentos_contables").insert({
    cliente_id: clienteId,
    periodo,
    categoria,
    etiqueta: etiqueta || null,
    archivo_path: archivoPath,
    nombre_original: archivo.name,
    tamano_bytes: archivo.size,
    subido_por: subidoPor,
  });
  if (errIns) return { ok: false, error: errIns.message };

  // Estampar el hito de descarga si corresponde y está vacío
  if (cicloId && (categoria === "fact_compras" || categoria === "fact_ventas")) {
    const campo =
      categoria === "fact_compras"
        ? "fecha_compras_descargadas"
        : "fecha_ventas_descargadas";
    const { data: ciclo } = await supabase
      .from("ciclo_conciliacion")
      .select(`id, ${campo}`)
      .eq("id", cicloId)
      .maybeSingle();
    if (ciclo && !(ciclo as Record<string, unknown>)[campo]) {
      await supabase
        .from("ciclo_conciliacion")
        .update({ [campo]: new Date().toISOString().slice(0, 10) })
        .eq("id", cicloId);
    }
  }

  revalidatePath("/contabilidad", "layout");
  return { ok: true };
}

/**
 * Activa la contabilidad completa de una empresa (libros RCV, plan de
 * cuentas, validación F29). Las empresas parten en standby y se van
 * activando una a una a medida que el equipo replica el proceso piloto.
 */
export async function activarContabilidadCompleta(
  clienteId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("clientes")
    .update({ hace_contabilidad_completa: true })
    .eq("id", clienteId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/contabilidad", "layout");
  return { ok: true };
}

/** Anulación lógica: el registro sale del checklist pero el archivo queda. */
export async function anularDocumentoContable(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("documentos_contables")
    .update({ activo: false })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/contabilidad", "layout");
  return { ok: true };
}

/** Link firmado (1 h) para descargar un documento contable. */
export async function urlDocumentoContable(
  archivoPath: string,
  nombre: string,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const supabase = await createClient();
  // El nombre puede traer tildes (razón social/etiquetas) — se normaliza para
  // que la descarga no llegue con el nombre percent-encodeado.
  const punto = nombre.lastIndexOf(".");
  const descarga =
    punto > 0
      ? nombreArchivo(nombre.slice(0, punto)) + nombre.slice(punto).toLowerCase()
      : nombreArchivo(nombre);
  const { data, error } = await supabase.storage
    .from("contabilidad")
    .createSignedUrl(archivoPath, 3600, { download: descarga });
  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message ?? "No se pudo generar el link." };
  }
  return { ok: true, url: data.signedUrl };
}

/**
 * Registra una ejecución de cambio IVA recuperable → no recuperable
 * (solo clientes profesionales de salud).
 */
export async function registrarCambioIva(
  clienteId: string,
  observaciones: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const responsableId = await usuarioActualId(supabase);
  if (!responsableId) return { ok: false, error: "Usuario no autorizado" };

  const { error } = await supabase.from("iva_salud_ejecucion").insert({
    cliente_id: clienteId,
    fecha_ejecutada: new Date().toISOString().slice(0, 10),
    responsable_id: responsableId,
    observaciones: observaciones || null,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/contabilidad", "layout");
  return { ok: true };
}

/** Elimina un registro de cambio IVA (corrección de un registro erróneo). */
export async function eliminarCambioIva(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("iva_salud_ejecucion")
    .delete()
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/contabilidad", "layout");
  return { ok: true };
}
