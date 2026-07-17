import { createClient } from "@/lib/supabase/server";
import { periodoPorDefecto } from "@/lib/periodos";
import { DetalleRcvClient, type DocVenta, type DocCompra } from "./detalle-client";

export const metadata = { title: "Detalle RCV — RS Tax & Legal" };

function ultimosPeriodos(n: number): string[] {
  const [y, m] = periodoPorDefecto().split("-").map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

function normaliza(p: string | undefined, periodos: string[]): string {
  return p && periodos.includes(p) ? p : periodos[periodos.length - 1];
}

const COLS_VENTA =
  "tipo_doc, folio, fecha_docto, rut_cliente, razon_social, monto_exento, monto_neto, monto_iva, monto_total";
const COLS_COMPRA =
  "tipo_doc, folio, fecha_docto, rut_proveedor, razon_social, monto_exento, monto_neto, iva_recuperable, iva_no_recuperable, monto_total";

export default async function DetalleRcvPage({
  params,
  searchParams,
}: {
  params: Promise<{ clienteId: string }>;
  searchParams: Promise<{ periodo?: string }>;
}) {
  const { clienteId } = await params;
  const { periodo: p } = await searchParams;
  const periodos = ultimosPeriodos(6);
  const periodo = normaliza(p, periodos);
  const supabase = await createClient();

  const [clienteRes, ventasRes, comprasRes] = await Promise.all([
    supabase.from("clientes").select("id, razon_social, rut_empresa, clave_sii").eq("id", clienteId).maybeSingle(),
    supabase
      .from("rcv_ventas")
      .select(COLS_VENTA)
      .eq("cliente_id", clienteId)
      .eq("periodo", periodo)
      .order("fecha_docto", { ascending: true })
      .order("folio", { ascending: true })
      .limit(5000),
    supabase
      .from("rcv_compras")
      .select(COLS_COMPRA)
      .eq("cliente_id", clienteId)
      .eq("periodo", periodo)
      .order("fecha_docto", { ascending: true })
      .order("folio", { ascending: true })
      .limit(5000),
  ]);

  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-10 sm:px-6">
      <DetalleRcvClient
        razonSocial={clienteRes.data?.razon_social ?? "Empresa"}
        rutEmpresa={clienteRes.data?.rut_empresa ?? ""}
        tieneClave={Boolean(clienteRes.data?.clave_sii)}
        clienteId={clienteId}
        periodo={periodo}
        periodos={periodos}
        ventas={(ventasRes.data ?? []) as DocVenta[]}
        compras={(comprasRes.data ?? []) as DocCompra[]}
      />
    </main>
  );
}
