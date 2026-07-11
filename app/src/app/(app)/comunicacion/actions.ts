"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUsuarioActual } from "@/lib/auth";
import { enviarCorreo, htmlCorreoDocumento } from "@/lib/enviar-correo";
import { etiquetaPeriodo } from "@/lib/periodos";
import { formatFecha, formatMonto } from "@/lib/format";
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

/** Días desde hoy (Chile) al plazo: 0 = hoy, 1 = mañana, negativo = vencido. */
function diasAlPlazo(iso: string): number {
  const hoy = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
  }).format(new Date());
  const [y1, m1, d1] = hoy.split("-").map(Number);
  const [y2, m2, d2] = iso.split("-").map(Number);
  return Math.round(
    (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000,
  );
}

function etiquetaDiasRestantes(iso: string): string {
  const n = diasAlPlazo(iso);
  if (n < 0) return "plazo vencido";
  if (n === 0) return "vence hoy";
  if (n === 1) return "queda 1 día";
  return `quedan ${n} días`;
}

const tdIzq = `padding:9px 0;border-bottom:1px solid #e6e9f0;color:#445;`;
const tdDer = `padding:9px 0;border-bottom:1px solid #e6e9f0;text-align:right;`;

function filaDetalle(concepto: string, monto: string, negrita = false): string {
  return `<tr><td style="${tdIzq}${negrita ? "font-weight:bold;color:#0a1a2f;" : ""}">${concepto}</td><td style="${tdDer}${negrita ? "font-weight:bold;" : ""}">${monto}</td></tr>`;
}

/**
 * Encabezado de sección. El plazo se destaca en rojo con la cuenta regresiva
 * de días calculada al momento del envío (pedido Cristian 10-07-2026).
 */
function filaSeccion(
  titulo: string,
  plazoIso: string | null,
  hora?: string,
): string {
  let plazo = "";
  if (plazoIso) {
    plazo =
      `<span style="font-weight:bold;color:#a32d2d;font-size:12px;"> — vence el ${fechaLarga(plazoIso)}${hora ? ` a las ${hora}` : ""}</span>` +
      `<span style="display:inline-block;background:#fcebeb;border:1px solid #f09595;color:#a32d2d;font-weight:bold;font-size:11px;padding:2px 9px;border-radius:10px;margin-left:8px;">${etiquetaDiasRestantes(plazoIso)}</span>`;
  }
  return `<tr><td colspan="2" style="padding:14px 0 6px;font-weight:bold;color:#0b2545;border-bottom:2px solid #0b2545;">${titulo}${plazo}</td></tr>`;
}

/**
 * Aviso de DNP dentro de la sección de imposiciones: el período se declaró
 * sin pago, con la recomendación de pagarlo dentro del mes.
 */
function filaAvisoDnp(): string {
  return `<tr><td colspan="2" style="padding:8px 0 2px;"><div style="border:1px solid #ef9f27;background:#faeeda;border-radius:6px;padding:10px 12px;font-size:12px;color:#633806;line-height:1.55;"><strong style="color:#854f0b;">Cotizaciones declaradas sin pago (DNP).</strong> Las imposiciones de este período quedaron declaradas pero pendientes de pago. Le recomendamos pagarlas dentro del mes, para no tener problemas con las cotizaciones previsionales de sus trabajadores.</div></td></tr>`;
}

/** Fila con botón de pago directo al portal correspondiente (Previred / SII). */
function filaBoton(texto: string, url: string): string {
  return `<tr><td colspan="2" style="padding:10px 0 2px;"><a href="${url}" style="display:inline-block;background:#0b2545;color:#ffffff;text-decoration:none;font-weight:bold;font-size:13px;padding:9px 16px;border-radius:6px;">${texto} →</a></td></tr>`;
}

/** Banda de encabezado por empresa (solo correos de grupo con varias empresas). */
function filaEmpresa(razon: string, rut: string | null): string {
  return `<tr><td colspan="2" style="padding:10px 12px;background:#0b2545;color:#ffffff;font-weight:bold;font-size:14px;">${razon}${rut ? `<span style="font-weight:normal;color:#b9c6dc;font-size:12px;"> · RUT ${rut}</span>` : ""}</td></tr>`;
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

  const esGrupo = empresas.length > 1;
  const etiqueta = etiquetaPeriodo(com.periodo);
  let cuerpoTabla = "";
  let total = 0;
  let hayPrevired = false;
  let hayF29 = false;
  const idsIncluidos: string[] = [];

  for (const emp of empresas) {
    const centros = todosCentros.filter(
      (c) => c.comunicacion_id === emp.comunicacion_id,
    );
    const facturas = todasFacturas.filter((f) => f.cliente_id === emp.cliente_id);
    const montoPrevired =
      emp.monto_previred !== null ? Number(emp.monto_previred) : null;
    const montoF29 = emp.monto_f29 !== null ? Number(emp.monto_f29) : null;
    const totalFacturas = facturas.reduce((s, f) => s + Number(f.monto ?? 0), 0);

    // Empresas del grupo sin nada que cobrar quedan fuera del correo.
    if (!montoPrevired && !montoF29 && facturas.length === 0) continue;
    idsIncluidos.push(emp.comunicacion_id);
    let subtotal = 0;

    if (esGrupo) {
      cuerpoTabla += filaEmpresa(emp.razon_social, emp.rut_empresa);
    }

    if (montoPrevired !== null && montoPrevired > 0) {
      subtotal += montoPrevired;
      hayPrevired = true;
      cuerpoTabla += filaSeccion(
        "Imposiciones (Previred)",
        emp.plazo_previred,
        "13:45 hrs",
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
        cuerpoTabla += filaDetalle(
          "Imposiciones del período",
          formatMonto(montoPrevired),
        );
      }
      if (emp.dnp_declarado) cuerpoTabla += filaAvisoDnp();
      if (!esGrupo) cuerpoTabla += filaBoton("Pagar en Previred", URL_PREVIRED);
    }

    if (montoF29 !== null && montoF29 > 0) {
      subtotal += montoF29;
      hayF29 = true;
      cuerpoTabla += filaSeccion(
        "Formulario 29 (SII)",
        emp.plazo_f29,
        "23:59 hrs",
      );
      cuerpoTabla += filaDetalle("Monto a pagar F29", formatMonto(montoF29));
      // Opción de postergar IVA y comentario del contador (módulo F29).
      if (emp.f29_postergacion_monto !== null && Number(emp.f29_postergacion_monto) > 0) {
        cuerpoTabla += filaDetalle(
          "Opción de postergar",
          formatMonto(emp.f29_postergacion_monto),
        );
      }
      if ((emp.f29_comentario ?? "").trim()) {
        cuerpoTabla += `<tr><td colspan="2" style="padding:8px 0 2px;"><div style="border:1px solid #b5d4f4;background:#e6f1fb;border-radius:6px;padding:9px 12px;font-size:12px;color:#0c447c;line-height:1.55;"><strong>Nota de su contador:</strong> ${emp.f29_comentario!.trim()}</div></td></tr>`;
      }
      if (!esGrupo) cuerpoTabla += filaBoton("Pagar el F29 en el SII", URL_PAGO_F29);
    }

    if (facturas.length > 0) {
      subtotal += totalFacturas;
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

    if (esGrupo) {
      cuerpoTabla += filaDetalle(
        `Subtotal ${emp.razon_social}`,
        formatMonto(subtotal),
        true,
      );
    }
    total += subtotal;
  }

  if (idsIncluidos.length === 0) {
    return {
      ok: false,
      error:
        "No hay nada que comunicar: sin monto Previred, sin F29 y sin facturas pendientes.",
    };
  }

  cuerpoTabla += `<tr><td style="padding:12px 0;font-weight:bold;font-size:15px;color:#0a1a2f;">Total a pagar${esGrupo ? " (todas las empresas)" : ""}</td><td style="padding:12px 0;text-align:right;font-weight:bold;font-size:15px;">${formatMonto(total)}</td></tr>`;

  // En correos de grupo los botones van una sola vez, al final del detalle.
  if (esGrupo && hayPrevired) {
    cuerpoTabla += filaBoton("Pagar en Previred", URL_PREVIRED);
  }
  if (esGrupo && hayF29) {
    cuerpoTabla += filaBoton("Pagar el F29 en el SII", URL_PAGO_F29);
  }

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

  const intro = esGrupo
    ? `Les compartimos el resumen de los pagos del período <strong>${etiqueta}</strong> de sus empresas, con el detalle separado por cada una:`
    : `Les compartimos el resumen de los pagos del período <strong>${etiqueta}</strong> de <strong>${com.razon_social}</strong>:`;

  const cuerpo = `
    <p style="margin:0 0 12px;">Estimados,</p>
    <p style="margin:0 0 16px;">${intro}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 16px;">
      ${cuerpoTabla}
    </table>
    ${cajaTransferencia}
    <p style="margin:0 0 4px;">Quedamos atentos a cualquier consulta.</p>`;

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
