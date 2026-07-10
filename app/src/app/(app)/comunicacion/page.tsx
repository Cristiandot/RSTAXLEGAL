import { createClient } from "@/lib/supabase/server";
import { normalizarPeriodo } from "@/lib/periodos";
import type {
  CentroCostoRow,
  ComunicacionRow,
  FacturaPendienteRow,
} from "@/lib/ciclos";
import { ComunicacionClient } from "./comunicacion-client";

export const metadata = { title: "Comunicación mensual — RS Tax & Legal" };

export default async function ComunicacionPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const { periodo: p } = await searchParams;
  const periodo = normalizarPeriodo(p);
  const supabase = await createClient();

  // Crea las filas del período que falten (idempotente) antes de leer la vista.
  await supabase.rpc("rs_asegurar_ciclos_comunicacion", { p_periodo: periodo });

  const filasRes = await supabase
    .from("v_comunicacion_mensual")
    .select("*")
    .eq("periodo", periodo)
    .order("razon_social");
  const filas = (filasRes.data ?? []) as ComunicacionRow[];

  const comunicacionIds = filas.map((f) => f.comunicacion_id);
  const clienteIds = filas.map((f) => f.cliente_id);

  const [centrosRes, facturasRes] = await Promise.all([
    comunicacionIds.length
      ? supabase
          .from("comunicacion_previred")
          .select("id, comunicacion_id, centro_costo, monto, orden")
          .in("comunicacion_id", comunicacionIds)
          .order("orden")
      : Promise.resolve({ data: [] as CentroCostoRow[] }),
    clienteIds.length
      ? supabase
          .from("facturas")
          .select("id, cliente_id, folio, periodo, monto")
          .eq("tipo", "factura")
          .eq("pagada", false)
          .in("cliente_id", clienteIds)
          .order("folio")
      : Promise.resolve({ data: [] as FacturaPendienteRow[] }),
  ]);

  return (
    <main className="mx-auto max-w-[1500px] px-4 pb-10 sm:px-6">
      <ComunicacionClient
        periodo={periodo}
        filas={filas}
        centros={(centrosRes.data ?? []) as CentroCostoRow[]}
        facturas={(facturasRes.data ?? []) as FacturaPendienteRow[]}
        errorCarga={filasRes.error?.message ?? null}
      />
    </main>
  );
}
