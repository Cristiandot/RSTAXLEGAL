import { createClient } from "@/lib/supabase/server";
import {
  TesoreriaClient,
  type CuentaResumen,
  type Movimiento,
  type ResumenCartola,
  type Automatizaciones,
} from "./tesoreria-client";

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
  let cartolas: ResumenCartola[] = [];
  let auto: Automatizaciones | null = null;
  const clienteDeCuenta = cuentas.find((c) => c.id === cuentaId)?.clienteId ?? null;
  if (clienteDeCuenta) {
    const [{ data: flags }, { data: ejec }] = await Promise.all([
      supabase
        .from("clientes")
        .select("auto_conc_rut, auto_conc_folio, auto_conc_panel, auto_conc_monto")
        .eq("id", clienteDeCuenta)
        .maybeSingle(),
      supabase
        .from("banco_conciliacion")
        .select("criterio")
        .eq("cliente_id", clienteDeCuenta)
        .eq("origen", "auto"),
    ]);
    const cuenta_ = (k: string) => (ejec ?? []).filter((e) => e.criterio === k).length;
    auto = {
      clienteId: clienteDeCuenta,
      rut: flags?.auto_conc_rut !== false,
      folio: flags?.auto_conc_folio === true,
      panel: flags?.auto_conc_panel === true,
      monto: flags?.auto_conc_monto === true,
      ejecuciones: { rut: cuenta_("rut"), folio: cuenta_("folio"), panel: cuenta_("panel"), monto: cuenta_("monto") },
    };
  }
  if (cuentaId) {
    const { data: movData } = await supabase
      .from("banco_movimiento")
      .select("id, cuenta_id, fecha, glosa, abono, cargo, saldo, estado, categoria, referencia, rut_contraparte, nombre_contraparte, archivo_origen")
      .eq("cuenta_id", cuentaId)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(2000);

    // Cuadratura por cartola importada (estilo reporte "Conciliación Bancaria"
    // de Chipax): por archivo, rango de fechas, abonos, cargos y saldo final.
    const porArchivo = new Map<string, ResumenCartola>();
    for (const m of (movData ?? []) as (MovRow & { archivo_origen: string | null })[]) {
      const clave = m.archivo_origen ?? "(sin archivo)";
      const r = porArchivo.get(clave) ?? {
        archivo: clave,
        movs: 0,
        desde: m.fecha,
        hasta: m.fecha,
        abonos: 0,
        cargos: 0,
        saldoFinal: null,
        pendientes: 0,
      };
      r.movs += 1;
      if (m.fecha < r.desde) r.desde = m.fecha;
      if (m.fecha >= r.hasta) {
        r.hasta = m.fecha;
        if (m.saldo != null) r.saldoFinal = n(m.saldo);
      }
      r.abonos += n(m.abono);
      r.cargos += n(m.cargo);
      if (m.estado === "pendiente") r.pendientes += 1;
      porArchivo.set(clave, r);
    }
    cartolas = [...porArchivo.values()].sort((a, b) => (a.hasta < b.hasta ? 1 : -1));

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
        cartolas={cartolas}
        auto={auto}
        errorCarga={errCuentas?.message ?? null}
      />
    </main>
  );
}
