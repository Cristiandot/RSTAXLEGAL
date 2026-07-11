"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUsuarioActual } from "@/lib/auth";
import { enviarCorreo, htmlCorreoDocumento } from "@/lib/enviar-correo";
import { etiquetaPeriodo } from "@/lib/periodos";
import { construirCorreoComunicacion } from "@/lib/comunicacion-correo";
import { copiasComunicacion, type ComunicacionRow } from "@/lib/ciclos";

export type CentroCostoInput = { centro: string; monto: string };

export type GuardarComunicacionInput = {
  comunicacionId: string;
  clienteId: string;
  /** Override del F29; null/vacío = usar el monto del ciclo F29. */
  montoF29: string | null;
  observaciones: string | null;
  correoCliente: string | null;
  centros: CentroCostoInput[];
};

/**
 * Guarda la comunicación del período: override de F29, observaciones y el set
 * completo de centros de costo Previred (se reemplazan las filas existentes).
 * El correo del cliente se persiste en su ficha (clientes.correo_empresa),
 * fuente única compartida con F29 y Facturación.
 */
export async function guardarComunicacion(
  input: GuardarComunicacionInput,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("ciclo_comunicacion")
    .update({
      monto_f29:
        input.montoF29 === null || input.montoF29.trim() === ""
          ? null
          : input.montoF29,
      observaciones: input.observaciones,
    })
    .eq("id", input.comunicacionId);
  if (error) return { ok: false, error: error.message };

  if ((input.correoCliente ?? "").trim()) {
    const { error: errCorreo } = await supabase
      .from("clientes")
      .update({ correo_empresa: input.correoCliente!.trim() })
      .eq("id", input.clienteId);
    if (errCorreo) return { ok: false, error: errCorreo.message };
  }

  // Reemplazo del detalle: se descartan filas sin centro ni monto.
  const filas = input.centros
    .map((c, i) => ({
      comunicacion_id: input.comunicacionId,
      centro_costo: c.centro.trim(),
      monto: c.monto.trim() === "" ? 0 : Number(c.monto),
      orden: i,
    }))
    .filter((c) => c.centro_costo !== "" || c.monto > 0);
  if (filas.some((c) => Number.isNaN(c.monto) || c.monto < 0)) {
    return { ok: false, error: "Hay un monto Previred no válido." };
  }

  const { error: errDel } = await supabase
    .from("comunicacion_previred")
    .delete()
    .eq("comunicacion_id", input.comunicacionId);
  if (errDel) return { ok: false, error: errDel.message };

  if (filas.length > 0) {
    const { error: errIns } = await supabase
      .from("comunicacion_previred")
      .insert(filas);
    if (errIns) return { ok: false, error: errIns.message };
  }

  revalidatePath("/comunicacion");
  return { ok: true };
}

/**
 * Envía al cliente el resumen consolidado de pagos del período: imposiciones
 * Previred (por centro de costo si hay detalle; si no, el total del ciclo de
 * Liquidaciones), F29 y facturas RS pendientes de pago, con el total general y
 * los datos de transferencia. Sale a nombre del usuario conectado (reply-to +
 * copia oculta) y estampa la fecha de envío para el botón Enviar/Reenviar.
 */
export async function enviarCorreoComunicacion(
  comunicacionId: string,
  correo: string | null,
  /** Checklist del diálogo: incluir (o no) las facturas RS pendientes. */
  incluirFacturas: boolean = true,
): Promise<{ ok: boolean; error?: string; enviadoA?: string }> {
  const supabase = await createClient();

  const { data: row, error: errRow } = await supabase
    .from("v_comunicacion_mensual")
    .select("*")
    .eq("comunicacion_id", comunicacionId)
    .single();
  if (errRow || !row) {
    return { ok: false, error: errRow?.message ?? "Comunicación no encontrada." };
  }
  const com = row as ComunicacionRow;

  const destino = (correo ?? "").trim() || (com.correo_empresa ?? "").trim();
  if (!destino) {
    return {
      ok: false,
      error: "Falta el correo del cliente. Escríbelo en la casilla y reintenta.",
    };
  }
  if ((correo ?? "").trim() && (correo ?? "").trim() !== (com.correo_empresa ?? "")) {
    await supabase
      .from("clientes")
      .update({ correo_empresa: destino })
      .eq("id", com.cliente_id);
  }

  // Comunicación por CLIENTE: si la empresa pertenece a un grupo, el correo
  // consolida todas las empresas del grupo en el período, cada una con su
  // propio detalle y subtotal.
  let empresas: ComunicacionRow[] = [com];
  if (com.grupo_id) {
    const { data: grupoRows } = await supabase
      .from("v_comunicacion_mensual")
      .select("*")
      .eq("grupo_id", com.grupo_id)
      .eq("periodo", com.periodo)
      .order("razon_social");
    if (grupoRows && grupoRows.length > 0) {
      empresas = grupoRows as ComunicacionRow[];
    }
  }

  const [centrosRes, facturasRes] = await Promise.all([
    supabase
      .from("comunicacion_previred")
      .select("comunicacion_id, centro_costo, monto, orden")
      .in("comunicacion_id", empresas.map((e) => e.comunicacion_id))
      .order("orden"),
    supabase
      .from("facturas")
      .select("cliente_id, folio, periodo, monto")
      .in("cliente_id", empresas.map((e) => e.cliente_id))
      .eq("tipo", "factura")
      .eq("pagada", false)
      .order("folio"),
  ]);
  const todosCentros = centrosRes.data ?? [];
  const todasFacturas = facturasRes.data ?? [];

  const etiqueta = etiquetaPeriodo(com.periodo);

  // El cuerpo lo arma la librería compartida (misma que usan las vistas
  // previas): secciones solo con monto, grupos, DNP, postergación, etc.
  const { cuerpo, idsIncluidos } = construirCorreoComunicacion({
    empresas,
    centros: todosCentros,
    facturas: todasFacturas,
    incluirFacturas,
  });

  if (!cuerpo) {
    return {
      ok: false,
      error:
        "No hay nada que comunicar: sin monto Previred, sin F29 y sin facturas pendientes.",
    };
  }

  // Por CLIENTE: además del destino principal, van en copia los correos de
  // TODAS sus empresas (correo principal de cada una + correos adicionales).
  const copias = copiasComunicacion(empresas, destino);

  const usuario = await getUsuarioActual();
  const res = await enviarCorreo({
    para: destino,
    cc: copias,
    asunto: `Resumen de pagos ${etiqueta} — RS Tax & Legal`,
    html: htmlCorreoDocumento({
      titulo: `Resumen de pagos · ${etiqueta}`,
      cuerpo,
    }),
    de: { nombre: usuario.nombre, correo: usuario.correo },
  });
  if (!res.ok) return { ok: false, error: res.error };

  // El envío queda registrado en TODAS las empresas incluidas en el correo.
  await supabase
    .from("ciclo_comunicacion")
    .update({ fecha_correo_enviado: new Date().toISOString() })
    .in("id", idsIncluidos);

  revalidatePath("/comunicacion");
  return {
    ok: true,
    enviadoA: copias.length ? `${destino} (+${copias.length} en copia)` : destino,
  };
}
