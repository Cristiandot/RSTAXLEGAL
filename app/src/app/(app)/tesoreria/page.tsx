import { createClient } from "@/lib/supabase/server";
import { TesoreriaClient, type CuentaResumen, type Movimiento } from "./tesoreria-client";

export const metadata = { title: "Tesorería y Banco — RS Tax & Legal" };

type CuentaRow = {
  id: string;
  cliente_id: string;
  fuente: string;
  banco_nombre: string | null;
  alias: string | null;
  numero_cuenta: string | null;
  moneda: string;
  activo: boolean;
  clientes: { razon_social: string; rut_empresa: string | null } | null;
};

type MovRow = {
  id: string;
  cuenta_id: string;
  fecha: string;
  glosa: string | null;
  abono: number | null;
  cargo: number | null;
  saldo: number | null;
  estado: string;
  categoria: string | null;
  referencia: string | null;
  rut_contraparte: string | null;
  nombre_contraparte: string | null;
};

const n = (v: number | null | undefined) => (v == null ? 0 : Number(v));

export default async function TesoreriaPage({
  searchParams,
}: {
  searchParams: Promise<{ cuenta?: string }>;
}) {
  const { cuenta: cuentaSel } = await searchParams;
  const supabase = await createClient();

  const { data: cuentasData, error: errCuentas } = await supabase
    .from("banco_cuenta")
    .select(
      "id, cliente_id, fuente, banco_nombre, alias, numero_cuenta, moneda, activo, clientes(razon_social, rut_empresa)",
    )
    .order("created_at", { ascending: true });

  const cuentasRows = (cuentasData ?? []) as unknown as CuentaRow[];

  // Agregados por cuenta (a esta escala se computa en memoria; si crece, mover a una vista SQL).
  const { data: movAgg } = await supabase
    .from("banco_movimiento")
    .select("cuenta_id, abono, cargo, estado");
  const agg = new Map<string, { abonos: number; cargos: number; movs: number; pendientes: number }>();
  for (const m of (movAgg ?? []) as Pick<MovRow, "cuenta_id" | "abono" | "cargo" | "estado">[]) {
    const a = agg.get(m.cuenta_id) ?? { abonos: 0, cargos: 0, movs: 0, pendientes: 0 };
    a.abonos += n(m.abono);
    a.cargos += n(m.cargo);
    a.movs += 1;
    if (m.estado === "pendiente") a.pendientes += 1;
    agg.set(m.cuenta_id, a);
  }

  const cuentas: CuentaResumen[] = cuentasRows.map((c) => {
    const a = agg.get(c.id);
    return {
      id: c.id,
      clienteId: c.cliente_id,
      razonSocial: c.clientes?.razon_social ?? "—",
      rutEmpresa: c.clientes?.rut_empresa ?? null,
      fuente: c.fuente,
      bancoNombre: c.banco_nombre,
      alias: c.alias,
      numeroCuenta: c.numero_cuenta,
      moneda: c.moneda,
      activo: c.activo,
      abonos: a?.abonos ?? 0,
      cargos: a?.cargos ?? 0,
      neto: (a?.abonos ?? 0) - (a?.cargos ?? 0),
      movimientos: a?.movs ?? 0,
      pendientes: a?.pendientes ?? 0,
    };
  });

  // Cuenta seleccionada (por query o la primera): trae sus movimientos.
  const cuentaId = cuentaSel && cuentas.some((c) => c.id === cuentaSel) ? cuentaSel : cuentas[0]?.id ?? null;
  let movimientos: Movimiento[] = [];
  if (cuentaId) {
    const { data: movData } = await supabase
      .from("banco_movimiento")
      .select("id, cuenta_id, fecha, glosa, abono, cargo, saldo, estado, categoria, referencia, rut_contraparte, nombre_contraparte")
      .eq("cuenta_id", cuentaId)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(2000);
    movimientos = ((movData ?? []) as MovRow[]).map((m) => ({
      id: m.id,
      fecha: m.fecha,
      glosa: m.glosa,
      abono: n(m.abono),
      cargo: n(m.cargo),
      saldo: m.saldo == null ? null : n(m.saldo),
      estado: m.estado,
      categoria: m.categoria,
      referencia: m.referencia,
      contraparte: m.nombre_contraparte || m.rut_contraparte || null,
    }));
  }

  return (
    <main className="mx-auto max-w-[1400px] px-4 pb-10 sm:px-6">
      <TesoreriaClient
        cuentas={cuentas}
        cuentaSeleccionada={cuentaId}
        movimientos={movimientos}
        errorCarga={errCuentas?.message ?? null}
      />
    </main>
  );
}
