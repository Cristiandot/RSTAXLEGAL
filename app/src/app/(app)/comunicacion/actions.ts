"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUsuarioActual } from "@/lib/auth";
import { enviarCorreo, htmlCorreoDocumento } from "@/lib/enviar-correo";
import { etiquetaPeriodo } from "@/lib/periodos";
import { formatFecha, formatMonto } from "@/lib/format";
import type { ComunicacionRow } from "@/lib/ciclos";

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

const DIAS_SEMANA = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
];

/** "2026-06-22" → "lunes 22-06-2026" (sin desfase de zona horaria). */
function fechaLarga(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DIAS_SEMANA[dow]} ${formatFecha(iso)}`;
}

const tdIzq = `padding:9px 0;border-bottom:1px solid #e6e9f0;color:#445;`;
const tdDer = `padding:9px 0;border-bottom:1px solid #e6e9f0;text-align:right;`;

function filaDetalle(concepto: string, monto: string, negrita = false): string {
  return `<tr><td style="${tdIzq}${negrita ? "font-weight:bold;color:#0a1a2f;" : ""}">${concepto}</td><td style="${tdDer}${negrita ? "font-weight:bold;" : ""}">${monto}</td></tr>`;
}

function filaSeccion(titulo: string, plazo: string | null): string {
  return `<tr><td colspan="2" style="padding:14px 0 6px;font-weight:bold;color:#0b2545;border-bottom:2px solid #0b2545;">${titulo}${plazo ? `<span style="font-weight:normal;color:#64748b;font-size:12px;"> — vence el ${plazo}</span>` : ""}</td></tr>`;
}

/** Fila con botón de pago directo al portal correspondiente (Previred / SII). */
function filaBoton(texto: string, url: string): string {
  return `<tr><td colspan="2" style="padding:10px 0 2px;"><a href="${url}" style="display:inline-block;background:#0b2545;color:#ffffff;text-decoration:none;font-weight:bold;font-size:13px;padding:9px 16px;border-radius:6px;">${texto} →</a></td></tr>`;
}

const URL_PREVIRED = "https://www.previred.com/";
const URL_PAGO_F29 =
  "https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html?https://www4.sii.cl/propuestaf29ui/index.html#/default";

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

  const [centrosRes, facturasRes] = await Promise.all([
    supabase
      .from("comunicacion_previred")
      .select("centro_costo, monto, orden")
      .eq("comunicacion_id", comunicacionId)
      .order("orden"),
    supabase
      .from("facturas")
      .select("folio, periodo, monto")
      .eq("cliente_id", com.cliente_id)
      .eq("tipo", "factura")
      .eq("pagada", false)
      .order("folio"),
  ]);
  const centros = centrosRes.data ?? [];
  const facturas = facturasRes.data ?? [];

  const montoPrevired =
    com.monto_previred !== null ? Number(com.monto_previred) : null;
  const montoF29 = com.monto_f29 !== null ? Number(com.monto_f29) : null;
  const totalFacturas = facturas.reduce((s, f) => s + Number(f.monto ?? 0), 0);

  if (!montoPrevired && !montoF29 && facturas.length === 0) {
    return {
      ok: false,
      error:
        "No hay nada que comunicar: sin monto Previred, sin F29 y sin facturas pendientes.",
    };
  }

  const etiqueta = etiquetaPeriodo(com.periodo);
  let cuerpoTabla = "";
  let total = 0;

  if (montoPrevired !== null && montoPrevired > 0) {
    total += montoPrevired;
    cuerpoTabla += filaSeccion(
      "Imposiciones (Previred)",
      com.plazo_previred ? fechaLarga(com.plazo_previred) : null,
    );
    if (centros.length > 0) {
      for (const c of centros) {
        cuerpoTabla += filaDetalle(
          c.centro_costo || "Centro de costo",
          formatMonto(c.monto),
        );
      }
      if (centros.length > 1) {
        cuerpoTabla += filaDetalle(
          "Subtotal imposiciones",
          formatMonto(montoPrevired),
          true,
        );
      }
    } else {
      cuerpoTabla += filaDetalle("Imposiciones del período", formatMonto(montoPrevired));
    }
    cuerpoTabla += filaBoton("Pagar en Previred", URL_PREVIRED);
  }

  if (montoF29 !== null && montoF29 > 0) {
    total += montoF29;
    cuerpoTabla += filaSeccion(
      "Formulario 29 (SII)",
      com.plazo_f29 ? fechaLarga(com.plazo_f29) : null,
    );
    cuerpoTabla += filaDetalle("Monto a pagar F29", formatMonto(montoF29));
    cuerpoTabla += filaBoton("Pagar el F29 en el SII", URL_PAGO_F29);
  }

  if (facturas.length > 0) {
    total += totalFacturas;
    cuerpoTabla += filaSeccion("Facturas RS Tax & Legal pendientes de pago", null);
    for (const f of facturas) {
      cuerpoTabla += filaDetalle(
        `Factura N° ${f.folio} · ${etiquetaPeriodo(f.periodo)}`,
        formatMonto(f.monto),
      );
    }
    if (facturas.length > 1) {
      cuerpoTabla += filaDetalle(
        "Subtotal facturas",
        formatMonto(totalFacturas),
        true,
      );
    }
  }

  cuerpoTabla += `<tr><td style="padding:12px 0;font-weight:bold;font-size:15px;color:#0a1a2f;">Total a pagar</td><td style="padding:12px 0;text-align:right;font-weight:bold;font-size:15px;">${formatMonto(total)}</td></tr>`;

  const cajaTransferencia = `
    <div style="border:1px solid #ef9f27;background:#faeeda;border-radius:8px;padding:14px 16px;margin:0 0 16px;">
      <p style="margin:0 0 6px;font-weight:bold;color:#854f0b;font-size:14px;">Importante — pagos gestionados por RS Tax &amp; Legal</p>
      <p style="margin:0 0 12px;color:#633806;font-size:13px;line-height:1.55;">Para los pagos que gestionamos por usted (imposiciones y F29), debemos recibir los fondos a más tardar <strong>2 días hábiles antes</strong> del vencimiento respectivo. Pasada esa fecha no podemos garantizar el pago dentro de plazo.</p>
      <p style="margin:0 0 6px;font-weight:bold;color:#854f0b;font-size:13px;">Datos para la transferencia:</p>
      <div style="background:#ffffff;border:1px solid #f0d9a8;border-radius:6px;padding:10px 12px;font-size:13px;color:#3a2a10;line-height:1.7;">
        <div><span style="color:#7a5a18;">Titular:</span> Rodríguez Samith Servicios Legales y Contables II Limitada</div>
        <div><span style="color:#7a5a18;">RUT:</span> 78.073.973-8</div>
        <div><span style="color:#7a5a18;">Banco:</span> Mercado Pago</div>
        <div><span style="color:#7a5a18;">Tipo de cuenta:</span> Cuenta Vista</div>
        <div><span style="color:#7a5a18;">N° de cuenta:</span> <strong>1093709982</strong></div>
        <div><span style="color:#7a5a18;">Correo:</span> admin@rstaxlegal.cl</div>
      </div>
      <p style="margin:12px 0 0;"><a href="https://rstaxlegal-panel.vercel.app/datos-transferencia" style="display:inline-block;background:#854f0b;color:#ffffff;text-decoration:none;font-weight:bold;font-size:13px;padding:9px 16px;border-radius:6px;">Copiar datos para transferir →</a></p>
    </div>`;

  const cuerpo = `
    <p style="margin:0 0 12px;">Estimados,</p>
    <p style="margin:0 0 16px;">Les compartimos el resumen de los pagos del período <strong>${etiqueta}</strong> de <strong>${com.razon_social}</strong>:</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 16px;">
      ${cuerpoTabla}
    </table>
    ${cajaTransferencia}
    <p style="margin:0 0 4px;">Quedamos atentos a cualquier consulta.</p>`;

  const usuario = await getUsuarioActual();
  const res = await enviarCorreo({
    para: destino,
    asunto: `Resumen de pagos ${etiqueta} — RS Tax & Legal`,
    html: htmlCorreoDocumento({
      titulo: `Resumen de pagos · ${etiqueta}`,
      cuerpo,
    }),
    de: { nombre: usuario.nombre, correo: usuario.correo },
  });
  if (!res.ok) return { ok: false, error: res.error };

  await supabase
    .from("ciclo_comunicacion")
    .update({ fecha_correo_enviado: new Date().toISOString() })
    .eq("id", comunicacionId);

  revalidatePath("/comunicacion");
  return { ok: true, enviadoA: destino };
}
