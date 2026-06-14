"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Gastos e ingresos menores del portal del cliente: compras y ventas con
 * boleta que no van al SII mensual pero sí a la Operación Renta. Todo pasa
 * por RPCs SECURITY DEFINER validadas por token — el rol anon no toca tablas.
 */

export type GastoMenorPortal = {
  id: string;
  tipo: "compra" | "venta";
  fecha: string;
  descripcion: string;
  monto: number;
  documento_path: string | null;
};

export async function listarGastosMenores(
  token: string,
  anio: number,
): Promise<{ ok: boolean; gastos?: GastoMenorPortal[]; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("gastos_menores_de", {
    p_token: token,
    p_anio: anio,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, gastos: (data ?? []) as GastoMenorPortal[] };
}

export async function crearGastoMenor(
  token: string,
  g: { tipo: string; fecha: string; descripcion: string; monto: number },
): Promise<{ ok: boolean; error?: string }> {
  if (g.tipo !== "compra" && g.tipo !== "venta") {
    return { ok: false, error: "Indica si es una compra (gasto) o una venta (ingreso)." };
  }
  if (!g.fecha) return { ok: false, error: "Indica la fecha del movimiento." };
  if (!g.descripcion.trim()) {
    return { ok: false, error: "Describe brevemente el movimiento." };
  }
  if (!Number.isFinite(g.monto) || g.monto <= 0) {
    return { ok: false, error: "El monto debe ser mayor a cero." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("crear_gasto_menor", {
    p_token: token,
    p: {
      tipo: g.tipo,
      fecha: g.fecha,
      descripcion: g.descripcion.trim(),
      monto: String(Math.round(g.monto)),
    },
  });
  if (error) {
    return {
      ok: false,
      error: error.message.includes("inválido")
        ? "Este link no es válido. Contacta a RS Tax & Legal."
        : `No se pudo registrar: ${error.message}`,
    };
  }
  return { ok: true };
}

/**
 * Crea un gasto/ingreso menor con un archivo OPCIONAL (boleta) adjunto. El
 * archivo se sube al bucket privado `gastos` (anon puede insertar; el equipo
 * lo lee) y la fila guarda su ruta. Si no se adjunta archivo, funciona igual.
 */
export async function crearGastoMenorConArchivo(
  token: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const tipo = String(formData.get("tipo") ?? "");
  const fecha = String(formData.get("fecha") ?? "");
  const descripcion = String(formData.get("descripcion") ?? "").trim();
  const montoRaw = String(formData.get("monto") ?? "").replace(/\./g, "").replace(",", ".");
  const monto = Number(montoRaw);

  if (tipo !== "compra" && tipo !== "venta") {
    return { ok: false, error: "Indica si es una compra (gasto) o una venta (ingreso)." };
  }
  if (!fecha) return { ok: false, error: "Indica la fecha del movimiento." };
  if (!descripcion) return { ok: false, error: "Describe brevemente el movimiento." };
  if (!Number.isFinite(monto) || monto <= 0) {
    return { ok: false, error: "El monto debe ser mayor a cero." };
  }

  const supabase = await createClient();

  // Valida el token antes de subir nada (evita archivos huérfanos).
  const { data: valido, error: errTok } = await supabase.rpc("portal_token_valido", { p_token: token });
  if (errTok || !valido) {
    return { ok: false, error: "Este link no es válido. Contacta a RS Tax & Legal." };
  }

  let documentoPath: string | null = null;
  const archivo = formData.get("archivo");
  if (archivo instanceof File && archivo.size > 0) {
    if (archivo.size > 5 * 1024 * 1024) {
      return { ok: false, error: "El archivo supera los 5 MB. Sube una versión más liviana." };
    }
    const punto = archivo.name.lastIndexOf(".");
    const ext = punto >= 0 ? archivo.name.slice(punto + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
    const path = `portal/${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;
    const { error: errUp } = await supabase.storage
      .from("gastos")
      .upload(path, archivo, { contentType: archivo.type || undefined, upsert: false });
    if (errUp) {
      return { ok: false, error: `No se pudo subir el archivo: ${errUp.message}` };
    }
    documentoPath = path;
  }

  const { error } = await supabase.rpc("crear_gasto_menor", {
    p_token: token,
    p: {
      tipo,
      fecha,
      descripcion,
      monto: String(Math.round(monto)),
      documento_path: documentoPath,
    },
  });
  if (error) {
    return {
      ok: false,
      error: error.message.includes("inválido")
        ? "Este link no es válido. Contacta a RS Tax & Legal."
        : `No se pudo registrar: ${error.message}`,
    };
  }
  return { ok: true };
}

export async function anularGastoMenor(
  token: string,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("anular_gasto_menor", {
    p_token: token,
    p_id: id,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
