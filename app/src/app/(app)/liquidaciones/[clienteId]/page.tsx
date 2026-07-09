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
        "id, razon_social, rut_empresa, previred_rut, mutual_institucion, mutual_tasa, caja_compensacion, sabado_habil",
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
      .select("trabajador_id, liquido, total_haberes, total_descuentos, estado, kame_liquido, kame_cuadra, calculado_at, dias_trabajados, dias_vacaciones, dias_licencia, detalle")
      .eq("cliente_id", clienteId)
      .eq("periodo", periodo),
    supabase.from("indicadores_previred").select("periodo").eq("periodo", periodo).maybeSingle(),
  ]);

  const cpRes = await supabase
    .from("concepto_periodo")
    .select("concepto_id, considerado")
    .eq("cliente_id", clienteId)
    .eq("periodo", periodo);
  // Considerado por defecto = true; una fila con considerado=false lo excluye.
  const considerado: Record<string, boolean> = {};
  for (const c of concRes.data ?? []) considerado[c.id as string] = true;
  for (const r of cpRes.data ?? []) considerado[r.concepto_id as string] = r.considerado;

  const ids = (trabRes.data ?? []).map((t) => t.id as string);

  const [novRes, licRes, vacRes] = await Promise.all([
    supabase
      .from("novedades_remuneraciones")
      .select("trabajador_id, tipo, cantidad, monto, concepto_id, origen")
      .eq("cliente_id", clienteId)
      .eq("periodo", periodo),
    ids.length
      ? supabase.from("licencias_medicas").select("trabajador_id, fecha_inicio, fecha_termino, dias").in("trabajador_id", ids)
      : Promise.resolve({ data: [] as { trabajador_id: string | null; fecha_inicio: string | null; fecha_termino: string | null; dias: number | null }[] }),
    ids.length
      ? supabase.from("solicitudes_rrhh").select("trabajador_id, datos").eq("tipo", "vacaciones").in("trabajador_id", ids)
      : Promise.resolve({ data: [] as { trabajador_id: string | null; datos: Record<string, unknown> | null }[] }),
  ]);

  // Sugerencia de días de ausencia del período (intersección con el mes).
  const pStart = `${periodo}-01`;
  const [py, pm] = periodo.split("-").map(Number);
  const pEnd = `${periodo}-${String(new Date(py, pm, 0).getDate()).padStart(2, "0")}`;
  const diasEnPeriodo = (ini: string | null, fin: string | null): number => {
    if (!ini) return 0;
    const a = ini.slice(0, 10) < pStart ? pStart : ini.slice(0, 10);
    const b = !fin || fin.slice(0, 10) > pEnd ? pEnd : fin.slice(0, 10);
    if (b < a) return 0;
    return Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1;
  };
  const ausencias: Record<string, { vac: number; lic: number }> = {};
  for (const id of ids) ausencias[id] = { vac: 0, lic: 0 };
  for (const l of licRes.data ?? []) {
    if (l.trabajador_id && ausencias[l.trabajador_id])
      ausencias[l.trabajador_id].lic += diasEnPeriodo(l.fecha_inicio, l.fecha_termino);
  }
  for (const v of vacRes.data ?? []) {
    const d = (v.datos ?? {}) as Record<string, string>;
    if (v.trabajador_id && ausencias[v.trabajador_id])
      ausencias[v.trabajador_id].vac += diasEnPeriodo(d.fecha_inicio ?? null, d.fecha_termino ?? null);
  }

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
        considerado={considerado}
        liquidaciones={liqRes.data ?? []}
        novedades={novRes.data ?? []}
        ausencias={ausencias}
        hayIndicadores={!!indRes.data}
      />
    </main>
  );
}
