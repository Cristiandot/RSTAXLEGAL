"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUsuarioActual } from "@/lib/auth";
import { enviarCorreo, htmlCorreoDocumento } from "@/lib/enviar-correo";
import { correosCopiaCliente } from "@/lib/correos-cliente";
import { formatMonto } from "@/lib/format";
import { etiquetaPeriodo } from "@/lib/periodos";

const filaTabla = (etiqueta: string, valor: string, destacado = false) =>
  `<tr>
    <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;${destacado ? "font-weight:bold;" : ""}">${etiqueta}</td>
    <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-variant-numeric:tabular-nums;${destacado ? "font-weight:bold;" : ""}">${valor}</td>
  </tr>`;

/**
 * Reporte de avance del mes EN CURSO (ritual del día 23): la contadora revisa
 * el acumulado de compras/ventas desde /control-rcv y se lo envía al cliente
 * para que decida si le conviene comprar o vender antes del cierre. Sigue el
 * patrón "guardar antes de enviar": el snapshot y el destinatario quedan en
 * rcv_reporte_avance aunque el correo falle.
 */
export async function enviarReporteAvance({
  clienteId,
  periodo,
  destinatario,
  observaciones,
}: {
  clienteId: string;
  periodo: string; // mes en curso 'YYYY-MM'
  destinatario: string;
  observaciones: string;
}): Promise<{ ok: boolean; error?: string; enviadoA?: string }> {
  const destino = destinatario.trim();
  if (!destino.includes("@")) {
    return { ok: false, error: "Falta un correo de destino válido." };
  }

  const supabase = await createClient();
  const [clienteRes, totRes] = await Promise.all([
    supabase
      .from("clientes")
      .select("id, razon_social, correo_empresa")
      .eq("id", clienteId)
      .maybeSingle(),
    supabase
      .from("v_rcv_totales_periodo")
      .select("*")
      .eq("cliente_id", clienteId)
      .eq("periodo", periodo)
      .maybeSingle(),
  ]);
  const cliente = clienteRes.data;
  if (!cliente) return { ok: false, error: "Cliente no encontrado." };
  const tot = totRes.data as
    | {
        ventas_total: number | string | null;
        ventas_nc_total: number | string | null;
        ventas_nc_docs: number | null;
        compras_total: number | string | null;
        compras_nc_total: number | string | null;
        compras_nc_docs: number | null;
        bhe_recibidas_total: number | string | null;
        bhe_recibidas_docs: number | null;
        bhe_emitidas_total: number | string | null;
        bhe_emitidas_docs: number | null;
        ventas_iva_total: number | string | null;
        compras_iva_total: number | string | null;
      }
    | null;
  if (!tot) {
    return {
      ok: false,
      error: `No hay documentos descargados de ${etiquetaPeriodo(periodo)} para esta empresa. Corre primero la descarga del RCV del mes en curso.`,
    };
  }

  // Si escribieron un correo distinto, se actualiza la ficha (fuente única).
  if (destino !== (cliente.correo_empresa ?? "")) {
    await supabase.from("clientes").update({ correo_empresa: destino }).eq("id", clienteId);
  }

  const n = (v: number | string | null | undefined) => Number(v ?? 0);
  const ventas = n(tot.ventas_total);
  const compras = n(tot.compras_total);
  const ivaDebito = n(tot.ventas_iva_total);
  const ivaCredito = n(tot.compras_iva_total);
  const ivaEstimado = ivaDebito - ivaCredito;
  const hoy = new Date();
  const fechaCorte = hoy.toISOString().slice(0, 10);
  const obs = observaciones.trim();

  // Snapshot ANTES de intentar el correo (guardar antes de enviar).
  const usuario = await getUsuarioActual();
  const { error: upErr } = await supabase.from("rcv_reporte_avance").upsert(
    {
      cliente_id: clienteId,
      periodo,
      fecha_corte: fechaCorte,
      ventas_total: Math.round(ventas),
      compras_total: Math.round(compras),
      iva_debito: Math.round(ivaDebito),
      iva_credito: Math.round(ivaCredito),
      observaciones: obs || null,
      destinatario: destino,
    },
    { onConflict: "cliente_id,periodo" },
  );
  if (upErr) return { ok: false, error: `No se pudo guardar el reporte: ${upErr.message}` };

  const etiqueta = etiquetaPeriodo(periodo);
  const fechaLegible = hoy.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });
  const filas: string[] = [];
  filas.push(filaTabla("Ventas del mes (neto de notas de crédito)", formatMonto(ventas)));
  if (n(tot.ventas_nc_docs) > 0) {
    filas.push(filaTabla(`Notas de crédito de venta incluidas (${tot.ventas_nc_docs})`, formatMonto(n(tot.ventas_nc_total))));
  }
  filas.push(filaTabla("Compras del mes (neto de notas de crédito)", formatMonto(compras)));
  if (n(tot.compras_nc_docs) > 0) {
    filas.push(filaTabla(`Notas de crédito de compra incluidas (${tot.compras_nc_docs})`, formatMonto(n(tot.compras_nc_total))));
  }
  if (n(tot.bhe_recibidas_docs) > 0) {
    filas.push(filaTabla(`Boletas de honorarios recibidas (${tot.bhe_recibidas_docs})`, formatMonto(n(tot.bhe_recibidas_total))));
  }
  if (n(tot.bhe_emitidas_docs) > 0) {
    filas.push(filaTabla(`Boletas de honorarios emitidas (${tot.bhe_emitidas_docs})`, formatMonto(n(tot.bhe_emitidas_total))));
  }
  filas.push(filaTabla("IVA débito acumulado (ventas)", formatMonto(ivaDebito)));
  filas.push(filaTabla("IVA crédito acumulado (compras)", formatMonto(ivaCredito)));
  filas.push(
    filaTabla(
      ivaEstimado >= 0 ? "IVA estimado a pagar si el mes cerrara hoy" : "Remanente de IVA estimado a favor",
      formatMonto(Math.abs(ivaEstimado)),
      true,
    ),
  );

  const cuerpo = `
    <p>Estimados,</p>
    <p>Les compartimos el avance de <strong>${cliente.razon_social}</strong> en ${etiqueta},
    con las cifras registradas en el SII al <strong>${fechaLegible}</strong>. El mes aún no
    cierra: estos números sirven para decidir compras o ventas antes del término del período.</p>
    <table style="border-collapse:collapse;width:100%;margin:14px 0;font-size:14px;">
      ${filas.join("\n")}
    </table>
    ${obs ? `<p><strong>Comentario de nuestro equipo:</strong> ${obs}</p>` : ""}
    <p style="color:#64748b;font-size:12px;">Cifras preliminares según el Registro de Compras y
    Ventas del SII a la fecha indicada; pueden variar con documentos que se emitan o reciban
    hasta el cierre del mes.</p>`;

  const res = await enviarCorreo({
    para: destino,
    cc: await correosCopiaCliente([clienteId], [destino]),
    asunto: `Avance de ${etiqueta} al ${fechaLegible} — ${cliente.razon_social}`,
    html: htmlCorreoDocumento({ titulo: `Avance del mes — ${etiqueta}`, cuerpo }),
    de: { nombre: usuario.nombre, correo: usuario.correo },
  });
  if (!res.ok) return { ok: false, error: res.error };

  const { data: u } = await supabase
    .from("usuarios")
    .select("id")
    .eq("correo", usuario.correo)
    .maybeSingle();
  await supabase
    .from("rcv_reporte_avance")
    .update({ fecha_correo_enviado: new Date().toISOString(), enviado_por: u?.id ?? null })
    .eq("cliente_id", clienteId)
    .eq("periodo", periodo);

  revalidatePath("/control-rcv");
  return { ok: true, enviadoA: destino };
}
