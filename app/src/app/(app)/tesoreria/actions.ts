"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseCartola } from "@/lib/banco/parsers";
import { upsertCuenta, insertarMovimientos } from "@/lib/banco/ingesta";

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

const rutKey = (r: string | null | undefined) =>
  (r ?? "").toUpperCase().replace(/[^0-9K]/g, "");

const diasEntre = (a: string, b: string) =>
  Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86400000);

export type DocTipoConciliacion =
  | "venta"
  | "compra"
  | "honorario"
  | "factura_rs"
  | "remuneracion"
  | "impuesto"
  | "transferencia_interna"
  | "comision"
  | "ajuste"
  | "sin_documento";

export type Sugerencia = {
  docTipo: DocTipoConciliacion;
  docId: string | null;
  ref: string;
  contraparte: string | null;
  monto: number;
  fecha: string | null;
  pagadoPct: number | null;
  rutMatch: boolean;
  confianza: "alta" | "media";
};

/**
 * Sugerencias de conciliación para un movimiento bancario:
 *   - Cargo (sale plata)  → compras (rcv_compras) y honorarios del mismo cliente.
 *   - Abono (entra plata)  → facturas emitidas por RS (cuentas por cobrar).
 * Match por monto exacto; el RUT de la contraparte sube la confianza a "alta".
 */
export async function sugerenciasConciliacion(
  movimientoId: string,
): Promise<{ ok: boolean; sugerencias?: Sugerencia[]; error?: string }> {
  const supabase = await createClient();
  const { data: mov, error } = await supabase
    .from("banco_movimiento")
    .select("id, cliente_id, fecha, abono, cargo, rut_contraparte")
    .eq("id", movimientoId)
    .maybeSingle();
  if (error || !mov) return { ok: false, error: error?.message ?? "Movimiento no encontrado" };

  const rutMov = rutKey(mov.rut_contraparte);
  const out: Sugerencia[] = [];

  // Fuente de verdad de "pagado" para la tesorería = banco_conciliacion (no
  // pagado_pct, que el balance usa aparte). Un doc ya conciliado no se sugiere.
  const { data: yaConc } = await supabase
    .from("banco_conciliacion")
    .select("doc_id")
    .eq("cliente_id", mov.cliente_id)
    .not("doc_id", "is", null);
  const tomados = new Set((yaConc ?? []).map((r) => r.doc_id as string));

  if (Number(mov.cargo) > 0) {
    const monto = Number(mov.cargo);
    const { data: compras } = await supabase
      .from("rcv_compras")
      .select("id, folio, fecha_docto, rut_proveedor, razon_social, monto_total")
      .eq("cliente_id", mov.cliente_id)
      .eq("monto_total", monto)
      .limit(20);
    for (const c of compras ?? []) {
      if (tomados.has(c.id as string)) continue;
      const rutMatch = !!rutMov && rutKey(c.rut_proveedor) === rutMov;
      out.push({
        docTipo: "compra",
        docId: c.id as string,
        ref: `Factura ${c.folio ?? "s/f"}`,
        contraparte: c.razon_social || c.rut_proveedor,
        monto: Number(c.monto_total),
        fecha: c.fecha_docto as string | null,
        pagadoPct: null,
        rutMatch,
        confianza: rutMatch ? "alta" : "media",
      });
    }
    const { data: hons } = await supabase
      .from("honorarios_recibidos")
      .select("id, folio, fecha, rut_emisor, nombre, liquido")
      .eq("cliente_id", mov.cliente_id)
      .eq("liquido", monto)
      .limit(20);
    for (const h of hons ?? []) {
      if (tomados.has(h.id as string)) continue;
      const rutMatch = !!rutMov && rutKey(h.rut_emisor) === rutMov;
      out.push({
        docTipo: "honorario",
        docId: h.id as string,
        ref: `Boleta hon. ${h.folio ?? "s/f"}`,
        contraparte: h.nombre || h.rut_emisor,
        monto: Number(h.liquido),
        fecha: h.fecha as string | null,
        pagadoPct: null,
        rutMatch,
        confianza: rutMatch ? "alta" : "media",
      });
    }
  }

  if (Number(mov.abono) > 0) {
    const monto = Number(mov.abono);
    const { data: ventas } = await supabase
      .from("rcv_ventas")
      .select("id, folio, fecha_docto, rut_cliente, razon_social, monto_total")
      .eq("cliente_id", mov.cliente_id)
      .eq("monto_total", monto)
      .limit(20);
    for (const v of ventas ?? []) {
      if (tomados.has(v.id as string)) continue;
      const rutMatch = !!rutMov && rutKey(v.rut_cliente) === rutMov;
      out.push({
        docTipo: "venta",
        docId: v.id as string,
        ref: `Factura ${v.folio ?? "s/f"}`,
        contraparte: v.razon_social || v.rut_cliente,
        monto: Number(v.monto_total),
        fecha: v.fecha_docto as string | null,
        pagadoPct: null,
        rutMatch,
        confianza: rutMatch ? "alta" : "media",
      });
    }
  }

  // Orden: primero RUT calzado, luego fecha más cercana al movimiento.
  out.sort((a, b) => {
    if (a.rutMatch !== b.rutMatch) return a.rutMatch ? -1 : 1;
    const da = a.fecha && mov.fecha ? diasEntre(a.fecha, mov.fecha as string) : 9999;
    const db = b.fecha && mov.fecha ? diasEntre(b.fecha, mov.fecha as string) : 9999;
    return da - db;
  });

  return { ok: true, sugerencias: out.slice(0, 10) };
}

/**
 * Cruce AUTOMÁTICO masivo: barre los movimientos pendientes de una cuenta y
 * concilia solo los que calzan sin ambigüedad — monto exacto + RUT de la
 * contraparte + un único candidato disponible. Lo dudoso (varios candidatos, o
 * calce solo por monto sin RUT) queda pendiente para revisión manual.
 */
export async function conciliarAutomatico(
  cuentaId: string,
): Promise<{ ok: boolean; conciliados?: number; revisar?: number; error?: string }> {
  const supabase = await createClient();
  const { data: cuenta } = await supabase
    .from("banco_cuenta")
    .select("id, cliente_id")
    .eq("id", cuentaId)
    .maybeSingle();
  if (!cuenta) return { ok: false, error: "Cuenta no encontrada" };

  const [{ data: movs }, { data: yaConc }, { data: compras }, { data: ventas }, { data: hons }] =
    await Promise.all([
      supabase
        .from("banco_movimiento")
        .select("id, fecha, abono, cargo, rut_contraparte")
        .eq("cuenta_id", cuentaId)
        .eq("estado", "pendiente"),
      supabase
        .from("banco_conciliacion")
        .select("doc_id")
        .eq("cliente_id", cuenta.cliente_id)
        .not("doc_id", "is", null),
      supabase
        .from("rcv_compras")
        .select("id, monto_total, rut_proveedor")
        .eq("cliente_id", cuenta.cliente_id),
      supabase
        .from("rcv_ventas")
        .select("id, monto_total, rut_cliente")
        .eq("cliente_id", cuenta.cliente_id),
      supabase
        .from("honorarios_recibidos")
        .select("id, liquido, rut_emisor")
        .eq("cliente_id", cuenta.cliente_id),
    ]);

  // Índice monto -> candidatos {id, rut, tipo}
  type Cand = { id: string; rut: string; tipo: DocTipoConciliacion };
  const porMontoCargo = new Map<number, Cand[]>();
  const porMontoAbono = new Map<number, Cand[]>();
  const push = (m: Map<number, Cand[]>, monto: number, c: Cand) => {
    const arr = m.get(monto) ?? [];
    arr.push(c);
    m.set(monto, arr);
  };
  for (const c of compras ?? []) push(porMontoCargo, Number(c.monto_total), { id: c.id as string, rut: rutKey(c.rut_proveedor), tipo: "compra" });
  for (const h of hons ?? []) push(porMontoCargo, Number(h.liquido), { id: h.id as string, rut: rutKey(h.rut_emisor), tipo: "honorario" });
  for (const v of ventas ?? []) push(porMontoAbono, Number(v.monto_total), { id: v.id as string, rut: rutKey(v.rut_cliente), tipo: "venta" });

  const asignados = new Set((yaConc ?? []).map((r) => r.doc_id as string));
  const inserts: Array<{
    movimiento_id: string;
    cliente_id: string;
    doc_tipo: DocTipoConciliacion;
    doc_id: string;
    monto_asignado: number;
    origen: string;
    creado_por: string | null;
  }> = [];
  const movConciliados: string[] = [];
  const creadoPor = await usuarioActualId(supabase);

  for (const m of movs ?? []) {
    const monto = Math.abs(Number(m.abono) - Number(m.cargo));
    if (monto === 0) continue;
    const rutMov = rutKey(m.rut_contraparte);
    if (!rutMov) continue; // sin RUT no hay match seguro
    const pool = Number(m.cargo) > 0 ? porMontoCargo.get(monto) : porMontoAbono.get(monto);
    const candidatos = (pool ?? []).filter((c) => !asignados.has(c.id) && c.rut === rutMov);
    if (candidatos.length !== 1) continue; // 0 o >1 -> a revisión manual
    const c = candidatos[0];
    asignados.add(c.id);
    inserts.push({
      movimiento_id: m.id as string,
      cliente_id: cuenta.cliente_id as string,
      doc_tipo: c.tipo,
      doc_id: c.id,
      monto_asignado: monto,
      origen: "auto",
      creado_por: creadoPor,
    });
    movConciliados.push(m.id as string);
  }

  if (inserts.length > 0) {
    const { error: e1 } = await supabase.from("banco_conciliacion").insert(inserts);
    if (e1) return { ok: false, error: e1.message };
    for (let i = 0; i < movConciliados.length; i += 200) {
      await supabase
        .from("banco_movimiento")
        .update({ estado: "conciliado" })
        .in("id", movConciliados.slice(i, i + 200));
    }
  }

  revalidatePath("/tesoreria");
  revalidatePath("/tesoreria/cuentas");
  const totalPend = (movs ?? []).length;
  return { ok: true, conciliados: inserts.length, revisar: totalPend - inserts.length };
}

/** Concilia un movimiento contra un documento y marca el documento como pagado. */
export async function conciliarMovimiento(input: {
  movimientoId: string;
  docTipo: DocTipoConciliacion;
  docId: string | null;
  docRef: string | null;
  monto: number;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: mov } = await supabase
    .from("banco_movimiento")
    .select("id, cliente_id, abono, cargo")
    .eq("id", input.movimientoId)
    .maybeSingle();
  if (!mov) return { ok: false, error: "Movimiento no encontrado" };

  const creadoPor = await usuarioActualId(supabase);
  const { error: errIns } = await supabase.from("banco_conciliacion").insert({
    movimiento_id: input.movimientoId,
    cliente_id: mov.cliente_id,
    doc_tipo: input.docTipo,
    doc_id: input.docId,
    doc_ref: input.docRef,
    monto_asignado: input.monto,
    origen: "manual",
    creado_por: creadoPor,
  });
  if (errIns) return { ok: false, error: errIns.message };

  // ¿queda totalmente conciliado? (suma de asignaciones vs. monto del movimiento)
  const { data: conc } = await supabase
    .from("banco_conciliacion")
    .select("monto_asignado")
    .eq("movimiento_id", input.movimientoId);
  const asignado = (conc ?? []).reduce((s, c) => s + Number(c.monto_asignado), 0);
  const montoMov = Math.abs(Number(mov.abono) - Number(mov.cargo));
  const estado = asignado >= montoMov ? "conciliado" : "parcial";
  await supabase.from("banco_movimiento").update({ estado }).eq("id", input.movimientoId);

  // No se toca el documento (pagado_pct es del balance): el "pagado en banco"
  // vive en banco_conciliacion, que es lo que leen CxC/CxP.
  revalidatePath("/tesoreria");
  revalidatePath("/tesoreria/cuentas");
  return { ok: true };
}

/**
 * Categoriza un movimiento que NO va contra un documento (traspaso entre cuentas
 * propias, comisión bancaria, gasto sin factura). Lo saca de "por conciliar".
 */
export async function categorizarMovimiento(input: {
  movimientoId: string;
  categoria: "transferencia_interna" | "comision" | "sin_documento";
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("banco_movimiento")
    .update({ categoria: input.categoria, estado: "ignorado" })
    .eq("id", input.movimientoId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/tesoreria");
  return { ok: true };
}

/** Carga interna de una cartola (equipo RS): parsea, ubica/crea la cuenta e inserta. */
export async function subirCartola(
  formData: FormData,
): Promise<{ ok: boolean; insertados?: number; total?: number; error?: string }> {
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
  revalidatePath("/tesoreria");
  return { ok: true, insertados: res.insertados, total: res.total };
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
  revalidatePath("/tesoreria/cuentas");
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
  revalidatePath("/tesoreria/cuentas");
  revalidatePath("/tesoreria/flujo");
  return { ok: true };
}

/** Deshace la conciliación de un movimiento (revierte estado y pago del documento). */
export async function desconciliarMovimiento(
  movimientoId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  await supabase.from("banco_conciliacion").delete().eq("movimiento_id", movimientoId);
  await supabase
    .from("banco_movimiento")
    .update({ estado: "pendiente", categoria: null })
    .eq("id", movimientoId);
  revalidatePath("/tesoreria");
  revalidatePath("/tesoreria/cuentas");
  return { ok: true };
}
