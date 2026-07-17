import { createClient } from "@/lib/supabase/server";
import { docsPendientes, hoyChile, addDias, n } from "@/lib/tesoreria";
import { CuentasClient, type FilaCuenta, type Aging } from "./cuentas-client";

export const metadata = { title: "Cuentas por cobrar / pagar — RS Tax & Legal" };

export default async function CuentasPage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string; tipo?: string }>;
}) {
  const { cliente: clienteQ, tipo: tipoQ } = await searchParams;
  const tipo = tipoQ === "pagar" ? "pagar" : "cobrar";
  const supabase = await createClient();

  const { data: clientesData } = await supabase
    .from("clientes")
    .select("id, razon_social, plazo_pago_ventas, plazo_pago_compras, conciliacion_desde")
    .eq("activo", true)
    .order("razon_social");
  const clientes = clientesData ?? [];
  const cliente = clientes.find((c) => c.id === clienteQ) ?? clientes[0] ?? null;

  const hoy = hoyChile();
  let filas: FilaCuenta[] = [];
  let plazo = 30;
  let conciliacionDesde: string | null = null;

  if (cliente) {
    plazo = tipo === "cobrar" ? n(cliente.plazo_pago_ventas) : n(cliente.plazo_pago_compras);
    conciliacionDesde = (cliente.conciliacion_desde as string | null) ?? null;
    const desde = conciliacionDesde ?? addDias(hoy, -365);
    filas = await docsPendientes(supabase, cliente.id, tipo, plazo, desde, hoy);
  }

  const aging: Aging = { vigente: 0, d1_30: 0, d31_60: 0, d61_90: 0, d91: 0 };
  for (const f of filas) aging[f.bucket] += f.pendiente;

  return (
    <main className="mx-auto max-w-[1400px] px-4 pb-10 sm:px-6">
      <CuentasClient
        tipo={tipo}
        clientes={clientes.map((c) => ({ id: c.id, razonSocial: c.razon_social }))}
        clienteSeleccionado={cliente?.id ?? null}
        plazo={plazo}
        conciliacionDesde={conciliacionDesde}
        aging={aging}
        filas={filas}
        generado={hoy}
      />
    </main>
  );
}
