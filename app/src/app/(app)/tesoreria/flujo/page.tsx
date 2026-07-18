import { createClient } from "@/lib/supabase/server";
import { docsPendientes, hoyChile, addDias, n } from "@/lib/tesoreria";
import { FlujoClient, type FilaFlujo } from "./flujo-client";

export const metadata = { title: "Flujo de caja — RS Tax & Legal" };

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const labelMes = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return `${MESES[m - 1]} ${y}`;
};

export default async function FlujoPage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string }>;
}) {
  const { cliente: clienteQ } = await searchParams;
  const supabase = await createClient();

  const { data: clientesData } = await supabase
    .from("clientes")
    .select("id, razon_social, plazo_pago_ventas, plazo_pago_compras, conciliacion_desde")
    .eq("activo", true)
    .order("razon_social");
  const clientes = clientesData ?? [];
  const cliente = clientes.find((c) => c.id === clienteQ) ?? clientes[0] ?? null;

  const hoy = hoyChile();
  let saldoInicial = 0;
  let filas: FilaFlujo[] = [];
  let totalCxC = 0;
  let totalCxP = 0;
  let saldoConfigurado = false;

  if (cliente) {
    const desde = (cliente.conciliacion_desde as string | null) ?? addDias(hoy, -365);
    const [cxc, cxp, { data: cuentas }] = await Promise.all([
      docsPendientes(supabase, cliente.id, "cobrar", n(cliente.plazo_pago_ventas), desde, hoy),
      docsPendientes(supabase, cliente.id, "pagar", n(cliente.plazo_pago_compras), desde, hoy),
      supabase.from("banco_cuenta").select("saldo_actual").eq("cliente_id", cliente.id),
    ]);

    for (const c of cuentas ?? []) {
      if (c.saldo_actual != null) {
        saldoInicial += Number(c.saldo_actual);
        saldoConfigurado = true;
      }
    }
    totalCxC = cxc.reduce((a, d) => a + d.pendiente, 0);
    totalCxP = cxp.reduce((a, d) => a + d.pendiente, 0);

    // Buckets: mes actual + 5 siguientes + "posterior". Los vencidos se esperan
    // "ya" → caen en el mes actual.
    const [y0, m0] = hoy.slice(0, 7).split("-").map(Number);
    const meses: string[] = [];
    for (let i = 0; i < 6; i++) {
      const idx = m0 - 1 + i;
      const yy = y0 + Math.floor(idx / 12);
      const mo = (idx % 12) + 1;
      meses.push(`${yy}-${String(mo).padStart(2, "0")}`);
    }
    const entradas = new Map<string, number>();
    const salidas = new Map<string, number>();
    const claveBucket = (venc: string): string => {
      const vk = venc.slice(0, 7);
      if (vk <= meses[0]) return meses[0]; // vencido o de este mes
      if (meses.includes(vk)) return vk;
      return "posterior";
    };
    for (const d of cxc) entradas.set(claveBucket(d.vencimiento), (entradas.get(claveBucket(d.vencimiento)) ?? 0) + d.pendiente);
    for (const d of cxp) salidas.set(claveBucket(d.vencimiento), (salidas.get(claveBucket(d.vencimiento)) ?? 0) + d.pendiente);

    const orden = [...meses, "posterior"];
    let saldo = saldoInicial;
    filas = orden.map((k) => {
      const ent = entradas.get(k) ?? 0;
      const sal = salidas.get(k) ?? 0;
      saldo += ent - sal;
      return {
        mes: k,
        label: k === "posterior" ? "Posterior" : labelMes(k),
        entradas: ent,
        salidas: sal,
        neto: ent - sal,
        saldoProyectado: saldo,
      } satisfies FilaFlujo;
    });
  }

  return (
    <main className="mx-auto max-w-[1100px] px-4 pb-10 sm:px-6">
      <FlujoClient
        clientes={clientes.map((c) => ({ id: c.id, razonSocial: c.razon_social }))}
        clienteSeleccionado={cliente?.id ?? null}
        saldoInicial={saldoInicial}
        saldoConfigurado={saldoConfigurado}
        totalCxC={totalCxC}
        totalCxP={totalCxP}
        filas={filas}
        generado={hoy}
      />
    </main>
  );
}
