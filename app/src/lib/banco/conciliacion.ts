import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Motor de conciliación bancaria — lógica compartida entre el panel interno
 * (/tesoreria, server actions con sesión) y el portal del cliente
 * (/tesoreria-portal vía API por token, service client). El cliente concilia
 * en su panel con el apoyo del equipo; las dos superficies usan ESTA lib.
 *
 * Fuente de verdad de "pagado en banco" = banco_conciliacion (no toca el
 * pagado_pct que usa el balance).
 */

export const rutKey = (r: string | null | undefined) =>
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
  /** El folio del documento aparece en la glosa del movimiento ("PAGO FAC 2075"). */
  folioMatch?: boolean;
  confianza: "alta" | "media";
};

/** Números de 2+ dígitos presentes en la glosa (candidatos a folio). */
function foliosEnTexto(...textos: (string | null | undefined)[]): Set<string> {
  const out = new Set<string>();
  for (const t of textos) {
    for (const m of (t ?? "").matchAll(/\d{2,10}/g)) out.add(m[0].replace(/^0+/, "") || m[0]);
  }
  return out;
}

/** El movimiento debe pertenecer al cliente indicado (seguridad del portal). */
async function movimientoDe(
  supabase: SupabaseClient,
  movimientoId: string,
  clienteId?: string,
) {
  const { data: mov } = await supabase
    .from("banco_movimiento")
    .select("id, cliente_id, fecha, abono, cargo, rut_contraparte, glosa, descripcion, referencia")
    .eq("id", movimientoId)
    .maybeSingle();
  if (!mov) return null;
  if (clienteId && mov.cliente_id !== clienteId) return null;
  return mov;
}

/**
 * Sugerencias para un movimiento: cargo → compras/honorarios; abono → ventas
 * (todo del SII). Match por monto exacto; el RUT de la contraparte sube la
 * confianza. Excluye documentos ya conciliados.
 */
export async function sugerenciasParaMovimiento(
  supabase: SupabaseClient,
  movimientoId: string,
  clienteId?: string,
): Promise<{ ok: boolean; sugerencias?: Sugerencia[]; error?: string }> {
  const mov = await movimientoDe(supabase, movimientoId, clienteId);
  if (!mov) return { ok: false, error: "Movimiento no encontrado" };

  const rutMov = rutKey(mov.rut_contraparte);
  const foliosGlosa = foliosEnTexto(mov.glosa as string, mov.descripcion as string);
  const out: Sugerencia[] = [];

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
      const folioMatch = !!c.folio && foliosGlosa.has(String(c.folio).replace(/^0+/, ""));
      out.push({
        docTipo: "compra",
        docId: c.id as string,
        ref: `Factura ${c.folio ?? "s/f"}`,
        contraparte: c.razon_social || c.rut_proveedor,
        monto: Number(c.monto_total),
        fecha: c.fecha_docto as string | null,
        pagadoPct: null,
        rutMatch,
        folioMatch,
        confianza: rutMatch || folioMatch ? "alta" : "media",
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

    // ── Registros PROPIOS del panel (ventaja RSTL sobre Chipax): el F29, el
    // Previred y las remuneraciones del ciclo mensual ya viven acá, así que el
    // pago TGR/Previred/sueldos de la cartola se sugiere contra ellos.
    const [{ data: f29s }, { data: ciclos }, { data: liqs }] = await Promise.all([
      supabase
        .from("ciclo_f29")
        .select("id, periodo, monto_a_pagar, fecha_pago_f29")
        .eq("cliente_id", mov.cliente_id)
        .eq("monto_a_pagar", monto)
        .limit(5),
      supabase
        .from("ciclo_liquidaciones")
        .select("id, periodo, monto_previred_total")
        .eq("cliente_id", mov.cliente_id)
        .eq("monto_previred_total", monto)
        .limit(5),
      supabase
        .from("liquidacion")
        .select("periodo, liquido")
        .eq("cliente_id", mov.cliente_id),
    ]);
    for (const f of f29s ?? []) {
      if (tomados.has(f.id as string)) continue;
      out.push({
        docTipo: "impuesto",
        docId: f.id as string,
        ref: `F29 ${f.periodo}`,
        contraparte: "Tesorería General de la República",
        monto: Number(f.monto_a_pagar),
        fecha: (f.fecha_pago_f29 as string | null) ?? `${f.periodo}-20`,
        pagadoPct: null,
        rutMatch: false,
        confianza: "alta",
      });
    }
    for (const c of ciclos ?? []) {
      if (tomados.has(c.id as string)) continue;
      out.push({
        docTipo: "remuneracion",
        docId: c.id as string,
        ref: `Previred ${c.periodo}`,
        contraparte: "Previred — cotizaciones",
        monto: Number(c.monto_previred_total),
        fecha: `${c.periodo}-10`,
        pagadoPct: null,
        rutMatch: false,
        confianza: "alta",
      });
    }
    // Remuneraciones: la suma de líquidos del período (el pago de sueldos suele
    // salir como una sola transferencia por el total del mes).
    const liquidoPorPeriodo = new Map<string, number>();
    for (const l of liqs ?? []) {
      const p = l.periodo as string;
      liquidoPorPeriodo.set(p, (liquidoPorPeriodo.get(p) ?? 0) + Number(l.liquido ?? 0));
    }
    for (const [p, suma] of liquidoPorPeriodo) {
      if (Math.round(suma) !== monto) continue;
      out.push({
        docTipo: "remuneracion",
        docId: null,
        ref: `Remuneraciones ${p}`,
        contraparte: "Nómina del período (suma de líquidos)",
        monto: Math.round(suma),
        fecha: `${p}-28`,
        pagadoPct: null,
        rutMatch: false,
        confianza: "alta",
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
      const folioMatch = !!v.folio && foliosGlosa.has(String(v.folio).replace(/^0+/, ""));
      out.push({
        docTipo: "venta",
        docId: v.id as string,
        ref: `Factura ${v.folio ?? "s/f"}`,
        contraparte: v.razon_social || v.rut_cliente,
        monto: Number(v.monto_total),
        fecha: v.fecha_docto as string | null,
        pagadoPct: null,
        rutMatch,
        folioMatch,
        confianza: rutMatch || folioMatch ? "alta" : "media",
      });
    }
  }

  out.sort((a, b) => {
    if (a.rutMatch !== b.rutMatch) return a.rutMatch ? -1 : 1;
    if (!!a.folioMatch !== !!b.folioMatch) return a.folioMatch ? -1 : 1;
    const da = a.fecha && mov.fecha ? diasEntre(a.fecha, mov.fecha as string) : 9999;
    const db = b.fecha && mov.fecha ? diasEntre(b.fecha, mov.fecha as string) : 9999;
    return da - db;
  });

  return { ok: true, sugerencias: out.slice(0, 10) };
}

/** Concilia un movimiento contra un documento (origen manual o auto). */
export async function conciliarMovimientoCore(
  supabase: SupabaseClient,
  input: {
    movimientoId: string;
    docTipo: DocTipoConciliacion;
    docId: string | null;
    docRef: string | null;
    monto: number;
    creadoPor?: string | null;
    clienteId?: string; // scope del portal
  },
): Promise<{ ok: boolean; error?: string }> {
  const mov = await movimientoDe(supabase, input.movimientoId, input.clienteId);
  if (!mov) return { ok: false, error: "Movimiento no encontrado" };

  const { error: errIns } = await supabase.from("banco_conciliacion").insert({
    movimiento_id: input.movimientoId,
    cliente_id: mov.cliente_id,
    doc_tipo: input.docTipo,
    doc_id: input.docId,
    doc_ref: input.docRef,
    monto_asignado: input.monto,
    origen: "manual",
    creado_por: input.creadoPor ?? null,
  });
  if (errIns) return { ok: false, error: errIns.message };

  const { data: conc } = await supabase
    .from("banco_conciliacion")
    .select("monto_asignado")
    .eq("movimiento_id", input.movimientoId);
  const asignado = (conc ?? []).reduce((s, c) => s + Number(c.monto_asignado), 0);
  const montoMov = Math.abs(Number(mov.abono) - Number(mov.cargo));
  const estado = asignado >= montoMov ? "conciliado" : "parcial";
  await supabase.from("banco_movimiento").update({ estado }).eq("id", input.movimientoId);
  return { ok: true };
}

/** Categoriza un movimiento sin documento (traspaso, comisión...). */
export async function categorizarMovimientoCore(
  supabase: SupabaseClient,
  input: {
    movimientoId: string;
    categoria: "transferencia_interna" | "comision" | "sin_documento";
    clienteId?: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  const mov = await movimientoDe(supabase, input.movimientoId, input.clienteId);
  if (!mov) return { ok: false, error: "Movimiento no encontrado" };
  const { error } = await supabase
    .from("banco_movimiento")
    .update({ categoria: input.categoria, estado: "ignorado" })
    .eq("id", input.movimientoId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Deshace la conciliación/categorización de un movimiento. */
export async function desconciliarMovimientoCore(
  supabase: SupabaseClient,
  movimientoId: string,
  clienteId?: string,
): Promise<{ ok: boolean; error?: string }> {
  const mov = await movimientoDe(supabase, movimientoId, clienteId);
  if (!mov) return { ok: false, error: "Movimiento no encontrado" };
  await supabase.from("banco_conciliacion").delete().eq("movimiento_id", movimientoId);
  await supabase
    .from("banco_movimiento")
    .update({ estado: "pendiente", categoria: null })
    .eq("id", movimientoId);
  return { ok: true };
}

/**
 * Cruce automático masivo: concilia lo inequívoco (monto exacto + RUT +
 * candidato único). Lo dudoso queda pendiente.
 */
export async function conciliarAutomaticoCore(
  supabase: SupabaseClient,
  cuentaId: string,
  opts?: { creadoPor?: string | null; clienteId?: string },
): Promise<{ ok: boolean; conciliados?: number; revisar?: number; error?: string }> {
  const { data: cuenta } = await supabase
    .from("banco_cuenta")
    .select("id, cliente_id")
    .eq("id", cuentaId)
    .maybeSingle();
  if (!cuenta) return { ok: false, error: "Cuenta no encontrada" };
  if (opts?.clienteId && cuenta.cliente_id !== opts.clienteId)
    return { ok: false, error: "Cuenta no encontrada" };

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
  const inserts: Array<Record<string, unknown>> = [];
  const movConciliados: string[] = [];

  for (const m of movs ?? []) {
    const monto = Math.abs(Number(m.abono) - Number(m.cargo));
    if (monto === 0) continue;
    const rutMov = rutKey(m.rut_contraparte);
    if (!rutMov) continue;
    const pool = Number(m.cargo) > 0 ? porMontoCargo.get(monto) : porMontoAbono.get(monto);
    const candidatos = (pool ?? []).filter((c) => !asignados.has(c.id) && c.rut === rutMov);
    if (candidatos.length !== 1) continue;
    const c = candidatos[0];
    asignados.add(c.id);
    inserts.push({
      movimiento_id: m.id as string,
      cliente_id: cuenta.cliente_id as string,
      doc_tipo: c.tipo,
      doc_id: c.id,
      monto_asignado: monto,
      origen: "auto",
      creado_por: opts?.creadoPor ?? null,
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
  const totalPend = (movs ?? []).length;
  return { ok: true, conciliados: inserts.length, revisar: totalPend - inserts.length };
}
