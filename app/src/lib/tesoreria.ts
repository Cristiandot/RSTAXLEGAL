import type { SupabaseClient } from "@supabase/supabase-js";

// Acepta tanto el cliente de servidor (sesión) como el service client (portal).
type Supabase = SupabaseClient;

// Documentos de crédito (cuenta por cobrar/pagar). Se excluyen boletas (39/41 =
// contado) y liquidación-factura (43).
export const DOC_CREDITO = [33, 34, 46, 56, 61];

export const n = (v: number | null | undefined) => (v == null ? 0 : Number(v));
export const hoyChile = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });

export function addDias(iso: string, dias: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
export const diasEntre = (aIso: string, bIso: string) =>
  Math.round((Date.parse(aIso + "T00:00:00Z") - Date.parse(bIso + "T00:00:00Z")) / 86400000);

export type Bucket = "vigente" | "d1_30" | "d31_60" | "d61_90" | "d91";
export function bucketDe(diasMora: number): Bucket {
  if (diasMora <= 0) return "vigente";
  if (diasMora <= 30) return "d1_30";
  if (diasMora <= 60) return "d31_60";
  if (diasMora <= 90) return "d61_90";
  return "d91";
}

export type DocPendiente = {
  id: string;
  folio: string | null;
  fecha: string;
  vencimiento: string;
  contraparte: string;
  rut: string | null;
  total: number;
  pendiente: number;
  pagadoPct: number;
  diasMora: number;
  bucket: Bucket;
};

/**
 * Documentos por cobrar (ventas) o por pagar (compras) de una empresa: DTE de
 * crédito desde `desde`, con lo pendiente = monto_total − lo conciliado en banco
 * (banco_conciliacion, NO pagado_pct que es del balance). vencimiento = fecha +
 * plazo. Fuente única para Cuentas por cobrar/pagar y Flujo de caja.
 */
export async function docsPendientes(
  supabase: Supabase,
  clienteId: string,
  tipo: "cobrar" | "pagar",
  plazo: number,
  desde: string,
  hoy: string,
): Promise<DocPendiente[]> {
  const base = tipo === "cobrar" ? "rcv_ventas" : "rcv_compras";
  const rutCol = tipo === "cobrar" ? "rut_cliente" : "rut_proveedor";
  const docTipo = tipo === "cobrar" ? "venta" : "compra";

  const [{ data: docs }, { data: concs }] = await Promise.all([
    supabase
      .from(base)
      .select(`id, folio, fecha_docto, tipo_doc, ${rutCol}, razon_social, monto_total`)
      .eq("cliente_id", clienteId)
      .in("tipo_doc", DOC_CREDITO)
      .gte("fecha_docto", desde)
      .not("fecha_docto", "is", null)
      .limit(4000),
    supabase
      .from("banco_conciliacion")
      .select("doc_id, monto_asignado")
      .eq("cliente_id", clienteId)
      .eq("doc_tipo", docTipo),
  ]);

  const conciliadoPorDoc = new Map<string, number>();
  for (const c of concs ?? []) {
    if (!c.doc_id) continue;
    conciliadoPorDoc.set(
      c.doc_id as string,
      (conciliadoPorDoc.get(c.doc_id as string) ?? 0) + n(c.monto_asignado as number),
    );
  }

  return (docs ?? [])
    .map((d) => {
      const rec = d as Record<string, unknown>;
      const total = n(rec.monto_total as number);
      const conciliado = conciliadoPorDoc.get(String(rec.id)) ?? 0;
      const pendiente = total - conciliado;
      const pagadoPct = total > 0 ? Math.round((conciliado / total) * 100) : 0;
      const fecha = String(rec.fecha_docto);
      const vencimiento = addDias(fecha, plazo);
      const diasMora = diasEntre(hoy, vencimiento);
      return {
        id: String(rec.id),
        folio: rec.folio == null ? null : String(rec.folio),
        fecha,
        vencimiento,
        contraparte: (rec.razon_social as string) || (rec[rutCol] as string) || "—",
        rut: (rec[rutCol] as string) || null,
        total,
        pendiente,
        pagadoPct,
        diasMora,
        bucket: bucketDe(diasMora),
      } satisfies DocPendiente;
    })
    .filter((x) => x.pendiente > 0)
    .sort((a, b) => b.diasMora - a.diasMora);
}
