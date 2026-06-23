"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUsuarioActual } from "@/lib/auth";
import { enviarCorreo, htmlCorreoDocumento } from "@/lib/enviar-correo";
import { etiquetaPeriodo } from "@/lib/periodos";
import { formatFecha, formatMonto } from "@/lib/format";

export type GuardarF29Input = {
  cicloId: string;
  clienteId: string;
  responsableId: string | null;
  fechaArmado: string | null;
  fechaPresentado: string | null;
  monto: string | null;
  ppm: string | null;
  folio: string | null;
  pagoPor: string | null;
  fechaPagoOficina: string | null;
  numeroOperacion: string | null;
  correoCliente: string | null;
  observaciones: string | null;
};

/**
 * Actualiza el ciclo F29. NO hereda responsable al cliente: el responsable de
 * F29 es independiente del de Previred (decisión explícita del proyecto).
 * El correo del cliente se guarda en su ficha (clientes.correo_empresa), que es
 * la fuente única que también usa Facturación.
 */
export async function guardarF29(
  input: GuardarF29Input,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("ciclo_f29")
    .update({
      responsable_id: input.responsableId,
      fecha_f29_armado: input.fechaArmado,
      fecha_f29_presentado: input.fechaPresentado,
      monto_a_pagar: input.monto,
      ppm: input.ppm,
      folio_f29: input.folio,
      pago_por: input.pagoPor,
      fecha_pago_oficina: input.fechaPagoOficina,
      numero_operacion: input.numeroOperacion,
      observaciones: input.observaciones,
    })
    .eq("id", input.cicloId);

  if (error) return { ok: false, error: error.message };

  // El correo vive en la ficha del cliente (fuente única con Facturación).
  const { error: errCorreo } = await supabase
    .from("clientes")
    .update({ correo_empresa: input.correoCliente })
    .eq("id", input.clienteId);
  if (errCorreo) return { ok: false, error: errCorreo.message };

  revalidatePath("/f29");
  return { ok: true };
}

/** Columnas-fecha permitidas para los pasos marcables con checkbox inline. */
const COLUMNAS_PASO_F29 = new Set([
  "fecha_f29_armado",
  "fecha_f29_presentado",
  "fecha_pago_f29",
]);

/**
 * Marca/desmarca un paso del F29 desde el checkbox de la tabla (mismo patrón
 * que Liquidaciones): al marcar estampa la fecha de hoy; al desmarcar, null.
 * El estado lo recalcula la vista.
 */
export async function marcarPasoF29(
  cicloId: string,
  columna: string,
  hecho: boolean,
): Promise<{ ok: boolean; error?: string }> {
  if (!COLUMNAS_PASO_F29.has(columna)) {
    return { ok: false, error: "Columna no permitida" };
  }
  const supabase = await createClient();
  const hoy = new Date().toISOString().slice(0, 10);
  const { error } = await supabase
    .from("ciclo_f29")
    .update({ [columna]: hecho ? hoy : null })
    .eq("id", cicloId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/f29");
  return { ok: true };
}

/**
 * Edición rápida inline de quién paga el F29 y el monto, sin abrir el modal.
 */
export async function actualizarPagoF29(
  cicloId: string,
  patch: {
    pagoPor?: string | null;
    monto?: string | null;
    ppm?: string | null;
    fechaPagoOficina?: string | null;
    fechaPagoF29?: string | null;
  },
): Promise<{ ok: boolean; error?: string }> {
  const cambios: Record<string, unknown> = {};
  if ("pagoPor" in patch) {
    if (patch.pagoPor !== null && patch.pagoPor !== "rs" && patch.pagoPor !== "cliente") {
      return { ok: false, error: "Pagador no válido" };
    }
    cambios.pago_por = patch.pagoPor;
  }
  if ("monto" in patch) {
    cambios.monto_a_pagar = patch.monto === null || patch.monto === "" ? null : patch.monto;
  }
  if ("ppm" in patch) {
    cambios.ppm = patch.ppm === null || patch.ppm === "" ? null : patch.ppm;
  }
  if ("fechaPagoOficina" in patch) {
    cambios.fecha_pago_oficina =
      patch.fechaPagoOficina === null || patch.fechaPagoOficina === "" ? null : patch.fechaPagoOficina;
  }
  if ("fechaPagoF29" in patch) {
    // Fecha de pago del F29 (cliente paga directo al SII): marca el F29 como
    // pagado. La vista recalcula el estado a "Pagado" cuando esta fecha existe.
    cambios.fecha_pago_f29 =
      patch.fechaPagoF29 === null || patch.fechaPagoF29 === "" ? null : patch.fechaPagoF29;
  }
  if (Object.keys(cambios).length === 0) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase.from("ciclo_f29").update(cambios).eq("id", cicloId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/f29");
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

/**
 * Envía al cliente el aviso del F29 del período: PPM pagado, monto a pagar y
 * plazo (ya corrido al día hábil). Si el pago lo gestiona RS, incluye el aviso
 * de recepción de fondos (2 días hábiles antes del vencimiento). Sale a nombre
 * del usuario conectado (reply-to + copia oculta) y deja registrada la fecha de
 * envío para el botón Enviar/Reenviar.
 *
 * El `correo` es el valor escrito en la casilla; si viene, se persiste en la
 * ficha del cliente antes de enviar.
 */
export async function enviarCorreoF29(
  cicloId: string,
  correo: string | null,
): Promise<{ ok: boolean; error?: string; enviadoA?: string }> {
  const supabase = await createClient();

  const { data: row, error: errRow } = await supabase
    .from("v_checklist_f29")
    .select(
      "cliente_id, razon_social, periodo, monto_a_pagar, ppm, pago_por, plazo_f29, correo_empresa",
    )
    .eq("ciclo_id", cicloId)
    .single();
  if (errRow || !row) {
    return { ok: false, error: errRow?.message ?? "Ciclo F29 no encontrado." };
  }

  const destino = (correo ?? "").trim() || (row.correo_empresa ?? "").trim();
  if (!destino) {
    return {
      ok: false,
      error: "Falta el correo del cliente. Escríbelo en la casilla y reintenta.",
    };
  }

  // Si escribieron un correo en la casilla, se actualiza la ficha del cliente.
  if ((correo ?? "").trim() && (correo ?? "").trim() !== (row.correo_empresa ?? "")) {
    await supabase
      .from("clientes")
      .update({ correo_empresa: destino })
      .eq("id", row.cliente_id);
  }

  const etiqueta = etiquetaPeriodo(row.periodo);
  const esPagaRs = row.pago_por === "rs";

  // Recepción de fondos = 2 días hábiles antes del vencimiento (solo si paga RS).
  let recepcion: string | null = null;
  if (esPagaRs && row.plazo_f29) {
    const { data: rec } = await supabase.rpc("rs_restar_dias_habiles", {
      d: row.plazo_f29,
      n: 2,
    });
    recepcion = (rec as string | null) ?? null;
  }

  const filaPpm =
    row.ppm !== null && row.ppm !== undefined
      ? `<tr><td style="padding:9px 0;border-bottom:1px solid #e6e9f0;color:#445;">PPM</td><td style="padding:9px 0;border-bottom:1px solid #e6e9f0;text-align:right;">${formatMonto(row.ppm)}</td></tr>`
      : "";

  const cajaFondos =
    esPagaRs && recepcion
      ? `<div style="border:1px solid #ef9f27;background:#faeeda;border-radius:8px;padding:14px 16px;margin:0 0 16px;">
           <p style="margin:0 0 6px;font-weight:bold;color:#854f0b;font-size:14px;">Importante — si el pago lo gestionamos nosotros</p>
           <p style="margin:0 0 12px;color:#633806;font-size:13px;line-height:1.55;">Para pagar su F29 a través de RS Tax &amp; Legal, debemos recibir los fondos a más tardar <strong>2 días hábiles antes</strong> del vencimiento, es decir el <strong>${fechaLarga(recepcion)}</strong>. Pasada esa fecha no podemos garantizar el pago dentro de plazo y el F29 podría quedar afecto a multas e intereses de cargo del contribuyente.</p>
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
         </div>`
      : "";

  // Si el pago lo hace el cliente, se incluye el acceso directo al portal del SII.
  const linkPagoSii = !esPagaRs
    ? `<p style="margin:0 0 8px;">Puede revisar y pagar su F29 directamente en el portal del SII:</p>
       <p style="margin:0 0 16px;"><a href="https://www4.sii.cl/propuestaf29ui/index.html#/default" style="display:inline-block;background:#0b2545;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:11px 20px;border-radius:8px;">Pagar el F29 en el SII</a></p>`
    : "";

  const cuerpo = `
    <p style="margin:0 0 12px;">Estimados,</p>
    <p style="margin:0 0 16px;">Les informamos que hemos presentado el Formulario 29 de <strong>${row.razon_social}</strong> correspondiente al período <strong>${etiqueta}</strong>. A continuación, el detalle de lo declarado:</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 16px;">
      <tr><td style="padding:9px 0;border-bottom:1px solid #e6e9f0;color:#445;">Empresa</td><td style="padding:9px 0;border-bottom:1px solid #e6e9f0;text-align:right;">${row.razon_social}</td></tr>
      ${filaPpm}
      <tr><td style="padding:9px 0;border-bottom:1px solid #e6e9f0;color:#445;">Monto total a pagar (F29)</td><td style="padding:9px 0;border-bottom:1px solid #e6e9f0;text-align:right;font-weight:bold;">${formatMonto(row.monto_a_pagar)}</td></tr>
      <tr><td style="padding:9px 0;color:#445;">Fecha límite de pago</td><td style="padding:9px 0;text-align:right;"><strong>${row.plazo_f29 ? fechaLarga(row.plazo_f29) : "—"}</strong></td></tr>
    </table>
    <p style="margin:0 0 16px;font-size:12px;color:#64748b;">El vencimiento legal del F29 es el día 20; si cae sábado, domingo o feriado, el plazo se traslada al siguiente día hábil.</p>
    ${linkPagoSii}
    ${cajaFondos}
    <p style="margin:0 0 4px;">Quedamos atentos a cualquier consulta.</p>`;

  const usuario = await getUsuarioActual();
  const res = await enviarCorreo({
    para: destino,
    asunto: `F29 ${etiqueta} — RS Tax & Legal`,
    html: htmlCorreoDocumento({ titulo: `F29 período ${etiqueta}`, cuerpo }),
    de: { nombre: usuario.nombre, correo: usuario.correo },
  });
  if (!res.ok) return { ok: false, error: res.error };

  await supabase
    .from("ciclo_f29")
    .update({ fecha_correo_f29_enviado: new Date().toISOString() })
    .eq("id", cicloId);

  revalidatePath("/f29");
  return { ok: true, enviadoA: destino };
}

/**
 * Para los F29 que paga la oficina (pago_por='rs'): registra el N° de operación,
 * marca la fecha de pago del F29 (si no estaba) y envía al cliente el aviso de que
 * su F29 quedó pagado, con el comprobante (período, monto pagado, fecha y N° de
 * operación). Sale a nombre del usuario conectado y deja registrada la fecha de
 * envío para el botón Enviar/Reenviar.
 */
export async function enviarCorreoF29Pagado(
  cicloId: string,
  numeroOperacion: string | null,
  correo: string | null,
): Promise<{ ok: boolean; error?: string; enviadoA?: string }> {
  const supabase = await createClient();

  const numOp = (numeroOperacion ?? "").trim();
  if (!numOp) {
    return { ok: false, error: "Falta el N° de operación del pago." };
  }

  const { data: row, error: errRow } = await supabase
    .from("ciclo_f29")
    .select(
      "cliente_id, periodo, monto_a_pagar, pago_por, fecha_pago_f29, clientes(razon_social, correo_empresa)",
    )
    .eq("id", cicloId)
    .single();
  if (errRow || !row) {
    return { ok: false, error: errRow?.message ?? "Ciclo F29 no encontrado." };
  }
  if (row.pago_por !== "rs") {
    return {
      ok: false,
      error: 'El aviso de pago es solo para F29 que paga la oficina ("Paga RS").',
    };
  }

  const cli = row.clientes as unknown as {
    razon_social: string;
    correo_empresa: string | null;
  } | null;
  const destino = (correo ?? "").trim() || (cli?.correo_empresa ?? "").trim();
  if (!destino) {
    return {
      ok: false,
      error: "Falta el correo del cliente. Escríbelo en la casilla y reintenta.",
    };
  }
  if ((correo ?? "").trim() && (correo ?? "").trim() !== (cli?.correo_empresa ?? "")) {
    await supabase
      .from("clientes")
      .update({ correo_empresa: destino })
      .eq("id", row.cliente_id);
  }

  // Fecha de pago del F29: se conserva la registrada; si no hay, se estampa hoy.
  const hoy = new Date().toISOString().slice(0, 10);
  const fechaPago = (row.fecha_pago_f29 as string | null) ?? hoy;

  const etiqueta = etiquetaPeriodo(row.periodo);
  const cuerpo = `
    <div style="border:1px solid #1d9e75;background:#e6f6ef;border-radius:8px;padding:14px 16px;margin:0 0 18px;">
      <p style="margin:0;font-weight:bold;color:#0f6e56;font-size:15px;">Su F29 quedó pagado</p>
      <p style="margin:6px 0 0;color:#0f6e56;font-size:13px;line-height:1.55;">El pago fue gestionado por RS Tax &amp; Legal dentro de plazo. No requiere ninguna acción de su parte.</p>
    </div>
    <p style="margin:0 0 12px;">Estimados,</p>
    <p style="margin:0 0 16px;">Les confirmamos que hemos pagado, a través de nuestra oficina, el Formulario 29 de <strong>${cli?.razon_social ?? ""}</strong> correspondiente al período <strong>${etiqueta}</strong>. A continuación, el comprobante:</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 16px;">
      <tr><td style="padding:9px 0;border-bottom:1px solid #e6e9f0;color:#445;">Empresa</td><td style="padding:9px 0;border-bottom:1px solid #e6e9f0;text-align:right;">${cli?.razon_social ?? ""}</td></tr>
      <tr><td style="padding:9px 0;border-bottom:1px solid #e6e9f0;color:#445;">Período</td><td style="padding:9px 0;border-bottom:1px solid #e6e9f0;text-align:right;">${etiqueta}</td></tr>
      <tr><td style="padding:9px 0;border-bottom:1px solid #e6e9f0;color:#445;">Monto total pagado</td><td style="padding:9px 0;border-bottom:1px solid #e6e9f0;text-align:right;font-weight:bold;">${formatMonto(row.monto_a_pagar)}</td></tr>
      <tr><td style="padding:9px 0;border-bottom:1px solid #e6e9f0;color:#445;">Fecha de pago</td><td style="padding:9px 0;border-bottom:1px solid #e6e9f0;text-align:right;">${fechaLarga(fechaPago)}</td></tr>
      <tr><td style="padding:9px 0;color:#445;">N° de operación</td><td style="padding:9px 0;text-align:right;font-weight:bold;">${numOp}</td></tr>
    </table>
    <p style="margin:0 0 16px;font-size:12px;color:#64748b;">Conserve este correo como respaldo del pago. El número de operación corresponde a la transacción con que se enteró el F29.</p>
    <p style="margin:0 0 4px;">Quedamos atentos a cualquier consulta.</p>`;

  const usuario = await getUsuarioActual();
  const res = await enviarCorreo({
    para: destino,
    asunto: `F29 ${etiqueta} pagado — RS Tax & Legal`,
    html: htmlCorreoDocumento({ titulo: `F29 período ${etiqueta} — Pagado`, cuerpo }),
    de: { nombre: usuario.nombre, correo: usuario.correo },
  });
  if (!res.ok) return { ok: false, error: res.error };

  await supabase
    .from("ciclo_f29")
    .update({
      numero_operacion: numOp,
      fecha_pago_f29: fechaPago,
      fecha_correo_pago_enviado: new Date().toISOString(),
    })
    .eq("id", cicloId);

  revalidatePath("/f29");
  return { ok: true, enviadoA: destino };
}
