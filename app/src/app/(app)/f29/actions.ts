"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUsuarioActual } from "@/lib/auth";
import { enviarCorreo, htmlCorreoDocumento } from "@/lib/enviar-correo";
import { correosCopiaCliente } from "@/lib/correos-cliente";
import {
  construirCorreoAvisoF29,
  construirCorreoF29Pagado,
  fechaLimitePostergacion,
} from "@/lib/f29-correo";

/** Marca "Observada" del F29 (único estado manual del semáforo del portal). */
export async function getObservadaF29(clienteId: string, periodo: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("f29_observada_get", { p_cliente: clienteId, p_periodo: periodo });
  return data === true;
}

export async function marcarObservadaF29(
  clienteId: string,
  periodo: string,
  observada: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("f29_observada_set", {
    p_cliente: clienteId,
    p_periodo: periodo,
    p_valor: observada,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type GuardarF29Input = {
  cicloId: string;
  clienteId: string;
  responsableId: string | null;
  fechaArmado: string | null;
  fechaPresentado: string | null;
  monto: string | null;
  ppm: string | null;
  folio: string | null;
  // Marca manual «Declarado» aunque aún no haya folio (el folio no siempre se
  // captura al momento de pagar). Con folio, la declaración es implícita.
  declarado: boolean;
  pagoPor: string | null;
  fechaPagoOficina: string | null;
  fechaPagoF29: string | null;
  numeroOperacion: string | null;
  correoCliente: string | null;
  postergarIva: boolean;
  // Postergación EJERCIDA al declarar: monto del IVA que quedó postergado
  // (null = no se postergó). Distinto de postergarIva, que solo OFRECE la
  // opción en el aviso. Con monto, el comprobante de pago informa que se pagó
  // solo lo no postergable.
  ivaPostergado: string | null;
  comentarioCorreo: string | null;
  // Desglose del F29 (IVA, Imp. Único, Retenciones, Otros — PPM va aparte).
  montoIva: string | null;
  impUnico: string | null;
  montoRetenciones: string | null;
  montoOtros: string | null;
  observaciones: string | null;
  // Recargos por atraso de la propia declaración (la postergación de IVA es postergarIva).
  multa: string | null;
  condonacion: string | null;
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

  // DECLARADO ante el SII: con folio el estado es «Declarado» pleno; con la
  // casilla manual y sin folio, «Declarado, folio pendiente» (lo resuelve la
  // vista vía declarado_sin_folio). No se toca fecha_f29_presentado —quedó
  // contaminada por flujos antiguos y ya no es la señal de declaración
  // (criterio Cristian 20-07-2026). Enviar el aviso NO requiere declaración.
  const folio = input.folio?.trim() || null;
  const fechaPresentado = folio ? (input.fechaPresentado ?? new Date().toISOString().slice(0, 10)) : null;

  // Se permite marcar PAGADO aunque aún no haya folio (RS a veces paga en el SII
  // antes de tener el folio a mano). En ese caso la vista muestra «Pagado, folio
  // pendiente» como recordatorio; al cargar el folio pasa a «Declarado»
  // (criterio Cristian 20-07-2026, releva el resguardo "no pagar sin declarar").

  const { error } = await supabase
    .from("ciclo_f29")
    .update({
      responsable_id: input.responsableId,
      fecha_f29_armado: input.fechaArmado,
      fecha_f29_presentado: fechaPresentado,
      monto_a_pagar: input.monto,
      ppm: input.ppm,
      folio_f29: folio,
      // Con folio la marca es redundante (el estado lo da el folio); se guarda
      // igual para conservar la intención si luego se borra el folio.
      declarado_sin_folio: input.declarado,
      pago_por: input.pagoPor,
      fecha_pago_oficina: input.fechaPagoOficina,
      fecha_pago_f29: input.fechaPagoF29,
      numero_operacion: input.numeroOperacion,
      postergar_iva: input.postergarIva,
      iva_postergado: input.ivaPostergado,
      comentario_correo: input.comentarioCorreo,
      monto_iva: input.montoIva,
      imp_unico: input.impUnico,
      monto_retenciones: input.montoRetenciones,
      monto_otros: input.montoOtros,
      observaciones: input.observaciones,
      // Recargos de la propia declaración (la postergación de IVA la escribe postergar_iva de arriba).
      multa: input.multa,
      condonacion: input.condonacion,
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

/**
 * Envía al cliente el aviso del F29 del período: desglose completo (IVA,
 * Impuesto Único, Retenciones, PPM, Otros — solo los con monto), total, plazo
 * (ya corrido al día hábil), opción de postergar el IVA y nota del contador
 * (el cuerpo lo arma lib/f29-correo.ts, compartido con las vistas previas).
 * Si el pago lo gestiona RS, incluye el aviso de recepción de fondos (2 días
 * hábiles antes del vencimiento). Sale a nombre del usuario conectado
 * (reply-to + copia oculta) y deja registrada la fecha de envío para el botón
 * Enviar/Reenviar.
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
      "cliente_id, razon_social, periodo, monto_a_pagar, ppm, pago_por, plazo_f29, correo_empresa, monto_iva, imp_unico, monto_retenciones, monto_otros, postergar_iva, comentario_correo",
    )
    .eq("ciclo_id", cicloId)
    .single();
  if (errRow || !row) {
    return { ok: false, error: errRow?.message ?? "Ciclo F29 no encontrado." };
  }
  // El correo sale con los datos GUARDADOS del ciclo: sin monto, el aviso
  // llegaría con "—" (pasó el 13-07-2026) — se bloquea acá como última barrera.
  if (row.monto_a_pagar === null || row.monto_a_pagar === undefined || String(row.monto_a_pagar) === "") {
    return {
      ok: false,
      error:
        "Falta el detalle del F29: llena los conceptos (IVA, PPM, etc.) y el TOTAL se calcula solo. Si el F29 quedó sin pago, escribe 0 en algún concepto (p. ej. IVA 0): el aviso sale como informativo.",
    };
  }
  // F29 declarado en $0: el aviso sale como informativo (sin botón de pago,
  // sin plazo de pago y sin caja de fondos).
  const esMontoCero = Number(row.monto_a_pagar) === 0;

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

  // Recepción de fondos = 2 días hábiles antes del vencimiento. El aviso ofrece
  // siempre las dos formas de pago (SII o transferir a RS), así que la fecha se
  // calcula siempre que haya monto que pagar.
  let recepcion: string | null = null;
  if (!esMontoCero && row.plazo_f29) {
    const { data: rec } = await supabase.rpc("rs_restar_dias_habiles", {
      d: row.plazo_f29,
      n: 2,
    });
    recepcion = (rec as string | null) ?? null;
  }

  const { asunto, titulo, cuerpo } = construirCorreoAvisoF29({
    razonSocial: row.razon_social,
    periodo: row.periodo,
    montoTotal: row.monto_a_pagar,
    desglose: {
      iva: row.monto_iva,
      impUnico: row.imp_unico,
      retenciones: row.monto_retenciones,
      ppm: row.ppm,
      otros: row.monto_otros,
    },
    postergarIva: Boolean(row.postergar_iva),
    comentarioContador: row.comentario_correo,
    plazoF29: row.plazo_f29,
    fechaRecepcionFondos: recepcion,
  });

  const usuario = await getUsuarioActual();
  const res = await enviarCorreo({
    para: destino,
    cc: await correosCopiaCliente([row.cliente_id], [destino]),
    asunto,
    html: htmlCorreoDocumento({ titulo, cuerpo }),
    de: { nombre: usuario.nombre, correo: usuario.correo },
  });
  if (!res.ok) return { ok: false, error: res.error };

  // Enviar el aviso deja el F29 como «Guardado y enviado»: solo se estampa la
  // fecha de envío. NO se marca como presentado/declarado ante el SII —eso se
  // estampa recién cuando el F29 queda pagado (criterio Cristian 17-07-2026)—.
  // El estado lo recalcula la vista.
  await supabase
    .from("ciclo_f29")
    .update({
      fecha_correo_f29_enviado: new Date().toISOString(),
    })
    .eq("id", cicloId);

  revalidatePath("/f29");
  return { ok: true, enviadoA: destino };
}

/**
 * Comprobante de F29 pagado por la oficina: se usa cuando el cliente transfirió
 * los fondos a RS y nosotros pagamos el F29. Registra el N° de operación, marca
 * la fecha de pago del F29 (si no estaba) y envía al cliente el comprobante
 * (período, monto pagado, fecha y N° de operación). Sale a nombre del usuario
 * conectado y deja registrada la fecha de envío para el botón Enviar/Reenviar.
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
      "cliente_id, periodo, monto_a_pagar, iva_postergado, fecha_pago_f29, folio_f29, declarado_sin_folio, clientes(razon_social, correo_empresa)",
    )
    .eq("id", cicloId)
    .single();
  if (errRow || !row) {
    return { ok: false, error: errRow?.message ?? "Ciclo F29 no encontrado." };
  }
  // Se permite pagar aunque no haya folio: el F29 queda como «Pagado, folio
  // pendiente» (la vista lo resuelve) hasta que se cargue el folio → «Declarado»
  // (criterio Cristian 20-07-2026, releva el resguardo "no pagar sin declarar").
  // Mismo resguardo que el aviso de F29: el comprobante no puede salir sin monto.
  if (row.monto_a_pagar === null || row.monto_a_pagar === undefined || String(row.monto_a_pagar) === "") {
    return {
      ok: false,
      error:
        "Falta el monto TOTAL a pagar del F29: escríbelo en el formulario y reintenta (el comprobante saldría sin monto).",
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

  // Postergación ejercida: lo pagado ahora es el total MENOS el IVA postergado
  // (queda pendiente con nuevo plazo). El plazo se corre al día hábil con la
  // misma RPC que usa el resto del módulo.
  const ivaPostergado = Number(row.iva_postergado ?? 0);
  if (ivaPostergado < 0 || ivaPostergado > Number(row.monto_a_pagar)) {
    return {
      ok: false,
      error:
        "El IVA postergado no puede ser negativo ni superar el TOTAL del F29. Corrige el monto en el paso 4 y reintenta.",
    };
  }
  const montoPagado = Number(row.monto_a_pagar) - ivaPostergado;
  let plazoIvaPostergado: string | null = null;
  if (ivaPostergado > 0) {
    const { data: habil } = await supabase.rpc("rs_proximo_dia_habil", {
      d: fechaLimitePostergacion(row.periodo),
    });
    plazoIvaPostergado =
      (habil as string | null) ?? fechaLimitePostergacion(row.periodo);
  }

  const { asunto, titulo, cuerpo } = construirCorreoF29Pagado({
    razonSocial: cli?.razon_social ?? "",
    periodo: row.periodo,
    montoPagado,
    fechaPago,
    numeroOperacion: numOp,
    ivaPostergado,
    plazoIvaPostergado,
  });

  const usuario = await getUsuarioActual();
  const res = await enviarCorreo({
    para: destino,
    cc: await correosCopiaCliente([row.cliente_id], [destino]),
    asunto,
    html: htmlCorreoDocumento({ titulo, cuerpo }),
    de: { nombre: usuario.nombre, correo: usuario.correo },
  });
  if (!res.ok) return { ok: false, error: res.error };

  // El F29 queda pagado. NO se toca la declaración: «Declarado» se ata al folio
  // (ver guardarF29), no al pago.
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
