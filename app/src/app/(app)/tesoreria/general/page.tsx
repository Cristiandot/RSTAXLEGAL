import { createClient } from "@/lib/supabase/server";
import { docsPendientes, hoyChile, addDias, n } from "@/lib/tesoreria";
import { GeneralClient, type TopContraparte, type MovReciente, type CuentaSaldo } from "./general-client";

export const metadata = { title: "Tesorería — Vista general — RS Tax & Legal" };

function topPorContraparte(
  docs: { contraparte: string; rut: string | null; pendiente: number }[],
): TopContraparte[] {
  const map = new Map<string, TopContraparte>();
  for (const d of docs) {
    const clave = d.rut || d.contraparte;
    const cur = map.get(clave) ?? { nombre: d.contraparte, rut: d.rut, monto: 0, docs: 0 };
    cur.monto += d.pendiente;
    cur.docs += 1;
    map.set(clave, cur);
  }
  return [...map.values()].sort((a, b) => b.monto - a.monto).slice(0, 6);
}

export default async function GeneralPage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string }>;
}) {
  const { cliente: clienteQ } = await searchParams;
  const supabase = await createClient();

  const { data: clientesData } = await supabase
    .from("clientes")
    .select("id, razon_social, plazo_pago_ventas, plazo_pago_compras, conciliacion_desde, grupo:grupos_cliente(codigo)")
    .eq("activo", true)
    .order("razon_social");
  const clientes = clientesData ?? [];
  const cliente = clientes.find((c) => c.id === clienteQ) ?? clientes[0] ?? null;

  const hoy = hoyChile();
  let saldo = 0;
  let totalCxC = 0;
  let totalCxP = 0;
  let topCobrar: TopContraparte[] = [];
  let topPagar: TopContraparte[] = [];
  let movs: MovReciente[] = [];
  let cuentas: CuentaSaldo[] = [];

  if (cliente) {
    const desde = (cliente.conciliacion_desde as string | null) ?? addDias(hoy, -365);
    const [cxc, cxp, { data: ctas }, { data: movData }, { data: pend }] = await Promise.all([
      docsPendientes(supabase, cliente.id, "cobrar", n(cliente.plazo_pago_ventas), desde, hoy),
      docsPendientes(supabase, cliente.id, "pagar", n(cliente.plazo_pago_compras), desde, hoy),
      supabase.from("banco_cuenta").select("id, alias, fuente, saldo_actual").eq("cliente_id", cliente.id),
      supabase
        .from("banco_movimiento")
        .select("id, fecha, glosa, abono, cargo, estado")
        .eq("cliente_id", cliente.id)
        .order("fecha", { ascending: false })
        .limit(8),
      supabase
        .from("banco_movimiento")
        .select("cuenta_id, estado")
        .eq("cliente_id", cliente.id)
        .eq("estado", "pendiente"),
    ]);

    totalCxC = cxc.reduce((a, d) => a + d.pendiente, 0);
    totalCxP = cxp.reduce((a, d) => a + d.pendiente, 0);
    topCobrar = topPorContraparte(cxc);
    topPagar = topPorContraparte(cxp);

    const pendPorCuenta = new Map<string, number>();
    for (const p of pend ?? []) pendPorCuenta.set(p.cuenta_id as string, (pendPorCuenta.get(p.cuenta_id as string) ?? 0) + 1);
    cuentas = (ctas ?? []).map((c) => {
      if (c.saldo_actual != null) saldo += Number(c.saldo_actual);
      return {
        id: c.id as string,
        alias: (c.alias as string) || (c.fuente as string),
        fuente: c.fuente as string,
        saldo: c.saldo_actual == null ? null : Number(c.saldo_actual),
        pendientes: pendPorCuenta.get(c.id as string) ?? 0,
      };
    });
    movs = (movData ?? []).map((m) => ({
      id: m.id as string,
      fecha: m.fecha as string,
      glosa: (m.glosa as string) || null,
      abono: n(m.abono as number),
      cargo: n(m.cargo as number),
      estado: m.estado as string,
    }));
  }

  return (
    <main className="mx-auto max-w-[1200px] px-4 pb-10 sm:px-6">
      <GeneralClient
        clientes={clientes.map((c) => ({
          id: c.id,
          razonSocial: c.razon_social,
          codigo: (c.grupo as unknown as { codigo: string | null } | null)?.codigo ?? null,
        }))}
        clienteSeleccionado={cliente?.id ?? null}
        saldo={saldo}
        totalCxC={totalCxC}
        totalCxP={totalCxP}
        topCobrar={topCobrar}
        topPagar={topPagar}
        cuentas={cuentas}
        movs={movs}
        generado={hoy}
      />
    </main>
  );
}
