import { createClient } from "@/lib/supabase/server";
import { normalizarPeriodo } from "@/lib/periodos";
import { ClienteLiquidacionClient } from "./cliente-liquidacion-client";

export const metadata = { title: "Carga de liquidaciones — RS Tax & Legal" };

export default async function ClienteLiquidacionPage({
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

  const [clienteRes, trabRes, concRes, liqRes, indRes] = await Promise.all([
    supabase
      .from("clientes")
      .select(
        "id, razon_social, rut_empresa, mutual_institucion, mutual_tasa, caja_compensacion, sabado_habil",
      )
      .eq("id", clienteId)
      .maybeSingle(),
    supabase.from("trabajadores").select("*").eq("cliente_id", clienteId).eq("activo", true).order("apellidos"),
    supabase
      .from("concepto_remuneracion")
      .select("*")
      .eq("cliente_id", clienteId)
      .order("naturaleza")
      .order("orden"),
    supabase
      .from("liquidacion")
      .select("trabajador_id, liquido, total_haberes, total_descuentos, estado, kame_liquido, kame_cuadra, calculado_at, dias_trabajados, detalle")
      .eq("cliente_id", clienteId)
      .eq("periodo", periodo),
    supabase.from("indicadores_previred").select("periodo").eq("periodo", periodo).maybeSingle(),
  ]);

  const novRes = await supabase
    .from("novedades_remuneraciones")
    .select("trabajador_id, tipo, cantidad, monto, concepto_id, origen")
    .eq("cliente_id", clienteId)
    .eq("periodo", periodo);

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

  return (
    <main className="mx-auto max-w-[1400px] px-4 pb-10 sm:px-6">
      <ClienteLiquidacionClient
        periodo={periodo}
        cliente={cliente}
        trabajadores={trabRes.data ?? []}
        conceptos={concRes.data ?? []}
        liquidaciones={liqRes.data ?? []}
        novedades={novRes.data ?? []}
        hayIndicadores={!!indRes.data}
      />
    </main>
  );
}
