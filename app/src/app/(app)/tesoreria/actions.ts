"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseCartola } from "@/lib/banco/parsers";
import { upsertCuenta, insertarMovimientos } from "@/lib/banco/ingesta";
import {
  rutKey,
  sugerenciasParaMovimiento,
  conciliarMovimientoCore,
  categorizarMovimientoCore,
  desconciliarMovimientoCore,
  conciliarAutomaticoCore,
  type DocTipoConciliacion,
  type Sugerencia,
} from "@/lib/banco/conciliacion";
import { docsPendientes, hoyChile, addDias, n as num } from "@/lib/tesoreria";
import { enviarCorreo, htmlCorreoDocumento } from "@/lib/enviar-correo";
import { correosCopiaCliente } from "@/lib/correos-cliente";
import { getUsuarioActual } from "@/lib/auth";
import { formatFecha } from "@/lib/format";

export type { DocTipoConciliacion, Sugerencia };

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

function refrescar() {
  revalidatePath("/tesoreria");
  revalidatePath("/tesoreria/cuentas");
  revalidatePath("/tesoreria/general");
  revalidatePath("/tesoreria/flujo");
}

/** Sugerencias de conciliación para un movimiento (panel interno). */
export async function sugerenciasConciliacion(
  movimientoId: string,
): Promise<{ ok: boolean; sugerencias?: Sugerencia[]; error?: string }> {
  const supabase = await createClient();
  return sugerenciasParaMovimiento(supabase, movimientoId);
}

/** Concilia un movimiento contra un documento (panel interno). */
export async function conciliarMovimiento(input: {
  movimientoId: string;
  docTipo: DocTipoConciliacion;
  docId: string | null;
  docRef: string | null;
  monto: number;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const creadoPor = await usuarioActualId(supabase);
  const res = await conciliarMovimientoCore(supabase, { ...input, creadoPor });
  if (res.ok) refrescar();
  return res;
}

/** Categoriza un movimiento sin documento (panel interno). */
export async function categorizarMovimiento(input: {
  movimientoId: string;
  categoria: "transferencia_interna" | "comision" | "sin_documento";
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const res = await categorizarMovimientoCore(supabase, input);
  if (res.ok) refrescar();
  return res;
}

/** Deshace la conciliación de un movimiento (panel interno). */
export async function desconciliarMovimiento(
  movimientoId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const res = await desconciliarMovimientoCore(supabase, movimientoId);
  if (res.ok) refrescar();
  return res;
}

/** Cruce automático masivo de una cuenta (panel interno). */
export async function conciliarAutomatico(
  cuentaId: string,
): Promise<{ ok: boolean; conciliados?: number; revisar?: number; error?: string }> {
  const supabase = await createClient();
  const creadoPor = await usuarioActualId(supabase);
  const res = await conciliarAutomaticoCore(supabase, cuentaId, { creadoPor });
  if (res.ok) refrescar();
  return res;
}

/**
 * Carga interna de una cartola (equipo RS): parsea, ubica/crea la cuenta,
 * inserta y corre el cruce automático al tiro.
 */
export async function subirCartola(
  formData: FormData,
): Promise<{ ok: boolean; insertados?: number; total?: number; conciliados?: number; error?: string }> {
  const archivo = formData.get("archivo");
  const clienteId = String(formData.get("clienteId") ?? "");
  const fuente = String(formData.get("fuente") ?? "");
  const alias = String(formData.get("alias") ?? "").trim() || null;
  if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, error: "No se recibió ningún archivo." };
  if (archivo.size > 15 * 1024 * 1024) return { ok: false, error: "El archivo supera los 15 MB." };
  if (!clienteId || !fuente) return { ok: false, error: "Falta la empresa o la fuente." };

  const supabase = await createClient();
  const buffer = Buffer.from(await archivo.arrayBuffer());
  const parsed = parseCartola({ fuente, filename: archivo.name, buffer });
  if (parsed.error) return { ok: false, error: parsed.error };
  if (!parsed.movimientos.length) return { ok: false, error: "No se detectaron movimientos en el archivo." };

  const cuenta = await upsertCuenta(supabase, clienteId, fuente, alias);
  if ("error" in cuenta) return { ok: false, error: cuenta.error };
  const importadoPor = await usuarioActualId(supabase);
  const res = await insertarMovimientos(
    supabase,
    { cuentaId: cuenta.id, clienteId, fuente, filename: archivo.name, importadoPor },
    parsed.movimientos,
  );
  if (res.error) return { ok: false, error: res.error };
  // Cruce automático al tiro: lo inequívoco se concilia solo.
  const auto = await conciliarAutomaticoCore(supabase, cuenta.id, { creadoPor: importadoPor });
  refrescar();
  return {
    ok: true,
    insertados: res.insertados,
    total: res.total,
    conciliados: auto.ok ? (auto.conciliados ?? 0) : 0,
  };
}

const CLP = (v: number) => "$" + Math.round(v).toLocaleString("es-CL");

/**
 * Cobranza (patrón Chipax "Enviar"): manda al deudor el estado de pago con
 * TODOS sus documentos pendientes de la empresa, a nombre del usuario
 * conectado, con copia a la empresa (contacto + correos adicionales).
 */
export async function enviarEstadoPago(input: {
  clienteId: string; // empresa que cobra (cliente del panel)
  rut: string; // RUT del deudor
  correo: string; // destinatario
  nota?: string;
}): Promise<{ ok: boolean; docs?: number; error?: string }> {
  const correo = input.correo.trim();
  if (!correo.includes("@")) return { ok: false, error: "Correo del destinatario inválido." };

  const supabase = await createClient();
  const { data: empresa } = await supabase
    .from("clientes")
    .select("id, razon_social, contacto_correo, plazo_pago_ventas, conciliacion_desde")
    .eq("id", input.clienteId)
    .maybeSingle();
  if (!empresa) return { ok: false, error: "Empresa no encontrada." };

  const hoy = hoyChile();
  const desde = (empresa.conciliacion_desde as string | null) ?? addDias(hoy, -365);
  const todos = await docsPendientes(
    supabase,
    empresa.id,
    "cobrar",
    num(empresa.plazo_pago_ventas as number),
    desde,
    hoy,
  );
  const docs = todos.filter((d) => rutKey(d.rut) === rutKey(input.rut));
  if (!docs.length) return { ok: false, error: "El deudor no tiene documentos pendientes." };

  const total = docs.reduce((a, d) => a + d.pendiente, 0);
  const deudor = docs[0].contraparte;
  const filas = docs
    .map(
      (d) => `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;">${d.folio ?? "—"}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;">${formatFecha(d.fecha)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;${d.diasMora > 0 ? "color:#dc2626;" : ""}">${formatFecha(d.vencimiento)}${d.diasMora > 0 ? ` (${d.diasMora}d vencida)` : ""}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;">${CLP(d.pendiente)}</td>
      </tr>`,
    )
    .join("");
  const cuerpo = `
    <p>Junto con saludar, compartimos el estado de pago de <strong>${deudor}</strong> con
    <strong>${empresa.razon_social}</strong> al ${formatFecha(hoy)}:</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin:12px 0;">
      <thead><tr style="background:#f1f5f9;">
        <th style="padding:6px 10px;text-align:left;">Folio</th>
        <th style="padding:6px 10px;text-align:left;">Emisión</th>
        <th style="padding:6px 10px;text-align:left;">Vencimiento</th>
        <th style="padding:6px 10px;text-align:right;">Monto pendiente</th>
      </tr></thead>
      <tbody>${filas}</tbody>
      <tfoot><tr>
        <td colspan="3" style="padding:8px 10px;font-weight:bold;">Total pendiente</td>
        <td style="padding:8px 10px;text-align:right;font-weight:bold;">${CLP(total)}</td>
      </tr></tfoot>
    </table>
    ${input.nota ? `<p>${input.nota}</p>` : ""}
    <p>Si alguno de estos documentos ya fue pagado, agradecemos indicarlo respondiendo este correo.</p>`;

  const usuario = await getUsuarioActual();
  const cc = [
    ...(empresa.contacto_correo && empresa.contacto_correo !== correo ? [empresa.contacto_correo as string] : []),
    ...(await correosCopiaCliente([empresa.id], [correo, empresa.contacto_correo as string | null])),
  ];
  const res = await enviarCorreo({
    para: correo,
    asunto: `Estado de pago — ${empresa.razon_social} (${docs.length} documento${docs.length !== 1 ? "s" : ""} pendiente${docs.length !== 1 ? "s" : ""})`,
    html: htmlCorreoDocumento({ titulo: `Estado de pago — ${empresa.razon_social}`, cuerpo }),
    de: { nombre: usuario.nombre, correo: usuario.correo },
    cc,
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, docs: docs.length };
}

/** Actualiza el plazo de pago por defecto de una empresa (ventas o compras). */
export async function actualizarPlazoPago(input: {
  clienteId: string;
  campo: "plazo_pago_ventas" | "plazo_pago_compras";
  dias: number;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const dias = Math.max(0, Math.min(365, Math.round(input.dias)));
  const { error } = await supabase
    .from("clientes")
    .update({ [input.campo]: dias })
    .eq("id", input.clienteId);
  if (error) return { ok: false, error: error.message };
  refrescar();
  return { ok: true };
}

/** Fija (o limpia) la fecha de inicio de conciliación de una empresa. */
export async function actualizarConciliacionDesde(input: {
  clienteId: string;
  fecha: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const fecha = input.fecha && /^\d{4}-\d{2}-\d{2}$/.test(input.fecha) ? input.fecha : null;
  const { error } = await supabase
    .from("clientes")
    .update({ conciliacion_desde: fecha })
    .eq("id", input.clienteId);
  if (error) return { ok: false, error: error.message };
  refrescar();
  return { ok: true };
}
