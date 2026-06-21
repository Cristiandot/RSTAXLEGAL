import { createClient } from "@/lib/supabase/server";
import { normalizarPeriodo } from "@/lib/periodos";
import { GeneralClient, type ResumenMes, type KpisPeriodo } from "./general-client";

export const metadata = { title: "Contabilidad — RS Tax & Legal" };

type FilaVenta = {
  periodo: string;
  tipo_doc: number;
  total_neto: number | null;
  total_exento: number | null;
  total_iva: number | null;
  total: number | null;
};
type FilaCompra = {
  periodo: string;
  tipo_doc: number;
  total_neto: number | null;
  total_iva_recuperable: number | null;
  total: number | null;
};

const n = (v: number | null | undefined) => (v == null ? 0 : Number(v));
const ES_LIQ = (t: number) => t === 43; // liquidación-factura (comisionista) — se informa aparte

export default async function GeneralPage({
  params,
  searchParams,
}: {
  params: Promise<{ clienteId: string }>;
  searchParams: Promise<{ periodo?: string }>;
}) {
  const { clienteId } = await params;
  const { periodo: p } = await searchParams;
  const periodo = normalizarPeriodo(p);
  const supabase = await createClient();

  const [clienteRes, ventasRes, comprasRes] = await Promise.all([
    supabase
      .from("clientes")
      .select("id, razon_social, rut_empresa, hace_contabilidad_completa")
      .eq("id", clienteId)
      .maybeSingle(),
    supabase
      .from("v_rcv_ventas_resumen")
      .select("periodo, tipo_doc, total_neto, total_exento, total_iva, total")
      .eq("cliente_id", clienteId),
    supabase
      .from("v_rcv_compras_resumen")
      .select("periodo, tipo_doc, total_neto, total_iva_recuperable, total")
      .eq("cliente_id", clienteId),
  ]);

  const cliente = clienteRes.data;
  if (!cliente) {
    return (
      <main className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
        <div className="card-soft mt-4 rounded-xl bg-card p-8 text-center text-sm text-muted-foreground">
          Empresa no encontrada.
        </div>
      </main>
    );
  }

  const ventas = (ventasRes.data ?? []) as FilaVenta[];
  const compras = (comprasRes.data ?? []) as FilaCompra[];

  // KPIs del período seleccionado (excluye liquidación-factura tipo 43)
  const vPer = ventas.filter((v) => v.periodo === periodo);
  const cPer = compras.filter((c) => c.periodo === periodo);
  const kpis: KpisPeriodo = {
    ventasNeto: vPer.filter((v) => !ES_LIQ(v.tipo_doc)).reduce((a, v) => a + n(v.total_neto) + n(v.total_exento), 0),
    ivaDebito: vPer.filter((v) => !ES_LIQ(v.tipo_doc)).reduce((a, v) => a + n(v.total_iva), 0),
    comprasNeto: cPer.filter((c) => !ES_LIQ(c.tipo_doc)).reduce((a, c) => a + n(c.total_neto), 0),
    ivaCredito: cPer.filter((c) => !ES_LIQ(c.tipo_doc)).reduce((a, c) => a + n(c.total_iva_recuperable), 0),
    liqDocs: vPer.filter((v) => ES_LIQ(v.tipo_doc)).length,
    liqMonto: vPer.filter((v) => ES_LIQ(v.tipo_doc)).reduce((a, v) => a + Math.abs(n(v.total)), 0),
  };

  // Tendencia: ventas/compras netas por período (excluye tipo 43)
  const periodos = Array.from(
    new Set([...ventas, ...compras].map((r) => r.periodo)),
  ).sort();
  const tendencia: ResumenMes[] = periodos.map((per) => ({
    periodo: per,
    ventasNeto: ventas
      .filter((v) => v.periodo === per && !ES_LIQ(v.tipo_doc))
      .reduce((a, v) => a + n(v.total_neto) + n(v.total_exento), 0),
    comprasNeto: compras
      .filter((c) => c.periodo === per && !ES_LIQ(c.tipo_doc))
      .reduce((a, c) => a + n(c.total_neto), 0),
  }));

  return (
    <main className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
      <GeneralClient
        clienteId={cliente.id}
        razonSocial={cliente.razon_social}
        rutEmpresa={cliente.rut_empresa}
        contabilidadCompleta={cliente.hace_contabilidad_completa === true}
        periodo={periodo}
        kpis={kpis}
        tendencia={tendencia}
      />
    </main>
  );
}
