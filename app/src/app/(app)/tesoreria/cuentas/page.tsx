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
    .select("id, razon_social, rut_empresa, contacto_correo, plazo_pago_ventas, plazo_pago_compras, conciliacion_desde, cobranza_texto, grupo:grupos_cliente(codigo)")
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

  // Correo conocido por RUT (deudores que además son clientes de la cartera),
  // para prellenar el envío del estado de pago.
  const rutKey = (r: string | null) => (r ?? "").toUpperCase().replace(/[^0-9K]/g, "");
  const correoPorRut: Record<string, string> = {};
  for (const c of clientes) {
    if (c.rut_empresa && c.contacto_correo) correoPorRut[rutKey(c.rut_empresa)] = c.contacto_correo;
  }

  // Última gestión de cobranza por deudor ("hace X días", patrón Chipax).
  const actividadPorRut: Record<string, string> = {};
  if (cliente && tipo === "cobrar") {
    const { data: acts } = await supabase
      .from("cobranza_actividad")
      .select("rut_deudor, created_at")
      .eq("cliente_id", cliente.id)
      .order("created_at", { ascending: false })
      .limit(500);
    for (const a of acts ?? []) {
      const k = rutKey(a.rut_deudor as string);
      if (!actividadPorRut[k]) actividadPorRut[k] = (a.created_at as string).slice(0, 10);
    }
  }

  return (
    <main className="mx-auto max-w-[1400px] px-4 pb-10 sm:px-6">
      <CuentasClient
        tipo={tipo}
        clientes={clientes.map((c) => ({
          id: c.id,
          razonSocial: c.razon_social,
          codigo: (c.grupo as unknown as { codigo: string | null } | null)?.codigo ?? null,
        }))}
        clienteSeleccionado={cliente?.id ?? null}
        plazo={plazo}
        conciliacionDesde={conciliacionDesde}
        aging={aging}
        filas={filas}
        correoPorRut={correoPorRut}
        actividadPorRut={actividadPorRut}
        cobranzaTexto={(cliente?.cobranza_texto as string | null) ?? null}
        generado={hoy}
      />
    </main>
  );
}
