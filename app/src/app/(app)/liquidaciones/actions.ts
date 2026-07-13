"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUsuarioActual } from "@/lib/auth";
import { enviarCorreo, htmlCorreoDocumento } from "@/lib/enviar-correo";
import { correosCopiaCliente } from "@/lib/correos-cliente";
import { etiquetaPeriodo } from "@/lib/periodos";
import { descargarLiquidaciones } from "./[clienteId]/actions";

/** El join `grupo:grupos_cliente(correo)` puede venir como objeto o arreglo. */
function correoDelGrupo(g: unknown): string | null {
  const fila = Array.isArray(g) ? g[0] : g;
  return (fila as { correo?: string | null } | null | undefined)?.correo ?? null;
}

export type GuardarLiquidacionInput = {
  cicloId: string;
  clienteId: string;
  responsableId: string | null;
  modalidad: string;
  fechaPreviredListoPago: string | null;
  fechaPreviredPagado: string | null;
  fechaDnpDeclarado: string | null;
  fechaDnpPagado: string | null;
  monto: string | null;
  observaciones: string | null;
  origResponsableDefaultId: string | null;
  origModalidad: string | null;
};

/**
 * Guarda los campos del modal: responsable, modalidad, fechas de pago y monto.
 * Los pasos 1-3 (consulta/detalle/liquidaciones) se marcan con checkbox inline
 * vía `marcarPaso`, no acá. Hereda responsable/modalidad al cliente si cambian.
 */
export async function guardarLiquidacion(
  input: GuardarLiquidacionInput,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();

  const { error: errCiclo } = await supabase
    .from("ciclo_liquidaciones")
    .update({
      responsable_id: input.responsableId,
      fecha_previred_listo_pago: input.fechaPreviredListoPago,
      fecha_previred_pagado: input.fechaPreviredPagado,
      fecha_dnp_declarado: input.fechaDnpDeclarado,
      fecha_dnp_pagado: input.fechaDnpPagado,
      monto_previred_total: input.monto,
      observaciones: input.observaciones,
    })
    .eq("id", input.cicloId);

  if (errCiclo) return { ok: false, error: errCiclo.message };

  const patchCliente: Record<string, unknown> = {};
  if (
    input.responsableId !== null &&
    input.responsableId !== input.origResponsableDefaultId
  ) {
    patchCliente.responsable_default_id = input.responsableId;
  }
  if (input.modalidad !== input.origModalidad) {
    patchCliente.modalidad_previred = input.modalidad;
  }

  if (Object.keys(patchCliente).length > 0) {
    const { error: errCli } = await supabase
      .from("clientes")
      .update(patchCliente)
      .eq("id", input.clienteId);
    if (errCli) {
      return {
        ok: false,
        error: `Ciclo guardado, pero error actualizando el cliente: ${errCli.message}`,
      };
    }
  }

  revalidatePath("/liquidaciones");
  return { ok: true };
}

/**
 * Envía al cliente las liquidaciones del período en un PDF adjunto (una por
 * página, generado por el módulo de cálculo) y estampa la fecha de envío.
 * Con `soloMarcar` no envía nada: solo marca enviadas (para empresas cuyas
 * liquidaciones aún se despachan fuera del panel, p. ej. desde KAME).
 */
export async function enviarLiquidacionesCliente(
  cicloId: string,
  clienteId: string,
  periodo: string,
  soloMarcar: boolean,
): Promise<{ ok: boolean; error?: string; enviadoA?: string }> {
  const supabase = await createClient();
  const hoy = new Date().toISOString().slice(0, 10);

  if (!soloMarcar) {
    const { data: cli } = await supabase
      .from("clientes")
      .select("razon_social, correo_empresa, contacto_correo, grupo:grupos_cliente(correo)")
      .eq("id", clienteId)
      .maybeSingle();
    // Destino: correo de la empresa → correo del contacto → correo del cliente (grupo).
    const destino = (
      cli?.correo_empresa ?? cli?.contacto_correo ?? correoDelGrupo(cli?.grupo) ?? ""
    ).trim();
    if (!destino) {
      return {
        ok: false,
        error: `${cli?.razon_social ?? "La empresa"} no tiene correo en su ficha. Cárgalo en Empresas y reintenta.`,
      };
    }

    const pdf = await descargarLiquidaciones(clienteId, periodo);
    if (!pdf.ok || !pdf.base64) {
      return {
        ok: false,
        error: `${pdf.error ?? "No se pudo generar el PDF."} Si las liquidaciones se enviaron fuera del panel, usa «Solo marcar como enviadas».`,
      };
    }

    const etiqueta = etiquetaPeriodo(periodo);
    const usuario = await getUsuarioActual();
    const res = await enviarCorreo({
      para: destino,
      cc: await correosCopiaCliente([clienteId], [destino]),
      asunto: `Liquidaciones de sueldo ${etiqueta} — RS Tax & Legal`,
      html: htmlCorreoDocumento({
        titulo: `Liquidaciones de sueldo · ${etiqueta}`,
        cuerpo: `
          <p style="margin:0 0 12px;">Estimados,</p>
          <p style="margin:0 0 16px;">Adjuntamos las liquidaciones de sueldo de <strong>${cli?.razon_social ?? ""}</strong> correspondientes al período <strong>${etiqueta}</strong>, en un solo PDF (una liquidación por página).</p>
          <p style="margin:0 0 4px;">Quedamos atentos a cualquier consulta.</p>`,
      }),
      adjuntos: [
        {
          filename: pdf.filename ?? `LIQUIDACIONES ${etiqueta.toUpperCase()}.pdf`,
          content: pdf.base64,
        },
      ],
      de: { nombre: usuario.nombre, correo: usuario.correo },
    });
    if (!res.ok) return { ok: false, error: res.error };

    await supabase
      .from("ciclo_liquidaciones")
      .update({ fecha_liquidaciones_enviadas: hoy })
      .eq("id", cicloId);
    revalidatePath("/liquidaciones");
    return { ok: true, enviadoA: destino };
  }

  const { error } = await supabase
    .from("ciclo_liquidaciones")
    .update({ fecha_liquidaciones_enviadas: hoy })
    .eq("id", cicloId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/liquidaciones");
  return { ok: true };
}

/**
 * Aviso al cliente de que sus imposiciones del período quedaron pagadas
 * (correo inmediato desde el modal, independiente del resumen de Comunicación
 * mensual). Requiere fecha de pago y monto guardados en el ciclo: en modalidad
 * pago usa «Previred pagado»; en DNP usa «DNP pagado» e informa además la
 * fecha de declaración. Va al correo de la empresa con copia a los correos
 * adicionales, y estampa `fecha_correo_previred_enviado` para el estado
 * Enviar→Reenviar.
 */
export async function enviarAvisoPreviredPagado(
  cicloId: string,
  clienteId: string,
  periodo: string,
): Promise<{ ok: boolean; error?: string; enviadoA?: string; cc?: string[] }> {
  const supabase = await createClient();

  const [{ data: ciclo }, { data: cli }] = await Promise.all([
    supabase
      .from("ciclo_liquidaciones")
      .select(
        "fecha_previred_pagado, fecha_dnp_declarado, fecha_dnp_pagado, monto_previred_total",
      )
      .eq("id", cicloId)
      .maybeSingle(),
    supabase
      .from("clientes")
      .select("razon_social, correo_empresa, contacto_correo, grupo:grupos_cliente(correo)")
      .eq("id", clienteId)
      .maybeSingle(),
  ]);

  const fechaPago = ciclo?.fecha_previred_pagado ?? ciclo?.fecha_dnp_pagado ?? null;
  if (!fechaPago) {
    return {
      ok: false,
      error:
        "Primero registra (y guarda) la fecha de «Previred pagado» — o la de «DNP pagado» si el período quedó con DNP.",
    };
  }
  const monto = Number(ciclo?.monto_previred_total);
  if (!Number.isFinite(monto) || monto <= 0) {
    return {
      ok: false,
      error: "Registra (y guarda) el monto de pago antes de enviar el aviso.",
    };
  }
  // Destino: correo de la empresa → correo del contacto → correo del cliente (grupo).
  const destino = (
    cli?.correo_empresa ?? cli?.contacto_correo ?? correoDelGrupo(cli?.grupo) ?? ""
  ).trim();
  if (!destino) {
    return {
      ok: false,
      error: `${cli?.razon_social ?? "La empresa"} no tiene correo en su ficha. Cárgalo en Empresas y reintenta.`,
    };
  }

  const etiqueta = etiquetaPeriodo(periodo);
  const montoTexto = `$${Math.round(monto).toLocaleString("es-CL")}`;
  const fmt = (iso: string) => {
    const [anio, mes, dia] = iso.split("-");
    return `${dia}-${mes}-${anio}`;
  };
  const fechaPagoTexto = fmt(fechaPago);
  // Flujo DNP: la planilla se declaró sin pago y el cliente la pagó después —
  // el correo informa ambas fechas (declaración y pago).
  const esDnp = !ciclo?.fecha_previred_pagado && !!ciclo?.fecha_dnp_pagado;
  const fechaDeclaradoTexto = ciclo?.fecha_dnp_declarado
    ? fmt(ciclo.fecha_dnp_declarado)
    : null;
  const usuario = await getUsuarioActual();
  const cc = await correosCopiaCliente([clienteId], [destino]);

  const tdEtiqueta = `padding:12px 18px;font-size:13px;color:#475569;`;
  const tdValor = `padding:12px 18px;font-size:14px;font-weight:700;color:#0B2545;`;
  const filasDnp = esDnp
    ? `${
        fechaDeclaradoTexto
          ? `<tr><td style="${tdEtiqueta}border-bottom:1px solid #e2e8f0;">DNP declarado</td><td style="${tdValor}border-bottom:1px solid #e2e8f0;">${fechaDeclaradoTexto}</td></tr>`
          : ""
      }<tr><td style="${tdEtiqueta}border-bottom:1px solid #e2e8f0;">DNP pagado</td><td style="${tdValor}border-bottom:1px solid #e2e8f0;">${fechaPagoTexto}</td></tr>`
    : "";
  const parrafo = esDnp
    ? `Les informamos que las cotizaciones previsionales (Previred) de <strong>${cli?.razon_social ?? ""}</strong> correspondientes a las remuneraciones de <strong>${etiqueta}</strong>${fechaDeclaradoTexto ? `, que habían quedado <strong>declaradas sin pago (DNP)</strong> con fecha ${fechaDeclaradoTexto},` : ", que habían quedado <strong>declaradas sin pago (DNP)</strong>,"} quedaron <strong>pagadas</strong> con fecha ${fechaPagoTexto}.`
    : `Les informamos que las cotizaciones previsionales (Previred) de <strong>${cli?.razon_social ?? ""}</strong> correspondientes a las remuneraciones de <strong>${etiqueta}</strong> quedaron <strong>pagadas</strong> con fecha ${fechaPagoTexto}.`;

  const res = await enviarCorreo({
    para: destino,
    cc,
    asunto: `Imposiciones ${etiqueta} pagadas — RS Tax & Legal`,
    html: htmlCorreoDocumento({
      titulo: `Imposiciones previsionales · ${etiqueta}`,
      cuerpo: `
        <p style="margin:0 0 12px;">Estimados,</p>
        <p style="margin:0 0 16px;">${parrafo}</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:1px solid #e2e8f0;border-radius:8px;">
          ${filasDnp}
          <tr>
            <td style="${tdEtiqueta}">Monto pagado</td>
            <td style="padding:12px 18px;font-size:18px;font-weight:700;color:#0B2545;">${montoTexto}</td>
          </tr>
        </table>
        <p style="margin:0 0 4px;">Con esto, las imposiciones de sus trabajadores del período quedan al día. Cualquier duda, quedamos atentos.</p>`,
    }),
    de: { nombre: usuario.nombre, correo: usuario.correo },
  });
  if (!res.ok) return { ok: false, error: res.error };

  await supabase
    .from("ciclo_liquidaciones")
    .update({ fecha_correo_previred_enviado: new Date().toISOString().slice(0, 10) })
    .eq("id", cicloId);

  revalidatePath("/liquidaciones");
  return { ok: true, enviadoA: destino, cc };
}

/**
 * Edición rápida inline del monto Previred desde la tabla. Este monto es el
 * que usa Comunicación mensual como total de imposiciones del período (cuando
 * la empresa no tiene centros de costo cargados).
 */
export async function actualizarMontoPrevired(
  cicloId: string,
  monto: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("ciclo_liquidaciones")
    .update({ monto_previred_total: monto === null || monto === "" ? null : monto })
    .eq("id", cicloId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/liquidaciones");
  return { ok: true };
}

/** Columnas-fecha permitidas para los pasos marcables con checkbox. */
const COLUMNAS_PASO = new Set([
  "fecha_consulta_enviada",
  "fecha_detalle_recibido",
  "fecha_liquidaciones_enviadas",
  "fecha_datos_nomina_ok",
  "fecha_liq_confirmadas",
  "fecha_dnp_declarado",
]);

/**
 * Marca/desmarca un paso del ciclo (checkbox inline en la tabla). Al marcar,
 * estampa la fecha de hoy en la columna; al desmarcar, la deja en null. El
 * estado se recalcula solo en la vista.
 */
export async function marcarPaso(
  cicloId: string,
  columna: string,
  hecho: boolean,
): Promise<{ ok: boolean; error?: string }> {
  if (!COLUMNAS_PASO.has(columna)) {
    return { ok: false, error: "Columna no permitida" };
  }
  const supabase = await createClient();
  const hoy = new Date().toISOString().slice(0, 10);
  const { error } = await supabase
    .from("ciclo_liquidaciones")
    .update({ [columna]: hecho ? hoy : null })
    .eq("id", cicloId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/liquidaciones");
  return { ok: true };
}
