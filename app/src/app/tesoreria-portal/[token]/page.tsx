import Image from "next/image";
import { createServiceClient } from "@/lib/supabase/service";
import { docsPendientes, hoyChile, addDias, n } from "@/lib/tesoreria";
import { formatMonto, formatFecha } from "@/lib/format";
import { PortalUpload } from "./portal-upload";

export const metadata = { title: "Mi Tesorería — RS Tax & Legal" };

const NOMBRE_FUENTE: Record<string, string> = {
  mercadopago: "Mercado Pago",
  generico: "Banco",
  banco_demo: "Banco (demo)",
};

export default async function TesoreriaPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createServiceClient();

  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, razon_social, plazo_pago_ventas, plazo_pago_compras, conciliacion_desde")
    .eq("form_token", token)
    .eq("activo", true)
    .maybeSingle();

  if (!cliente) {
    return (
      <main className="min-h-svh bg-background px-4 py-8">
        <div className="mx-auto max-w-lg">
          <div className="card-soft rounded-xl bg-card p-8 text-center">
            <div className="mb-4 flex justify-center">
              <Image src="/logo-claro.png" alt="RS Tax & Legal" width={200} height={56} priority className="h-auto w-[190px]" />
            </div>
            <h1 className="font-heading text-xl font-semibold">Link no válido</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Este link no existe o fue desactivado. Contacta a tu ejecutivo de RS Tax &amp; Legal.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const hoy = hoyChile();
  const desde = (cliente.conciliacion_desde as string | null) ?? addDias(hoy, -365);

  const [{ data: cuentas }, { data: movs }, cxc, cxp] = await Promise.all([
    supabase.from("banco_cuenta").select("id, alias, fuente, saldo_actual").eq("cliente_id", cliente.id),
    supabase
      .from("banco_movimiento")
      .select("id, fecha, glosa, abono, cargo, estado")
      .eq("cliente_id", cliente.id)
      .order("fecha", { ascending: false })
      .limit(40),
    docsPendientes(supabase, cliente.id, "cobrar", n(cliente.plazo_pago_ventas), desde, hoy),
    docsPendientes(supabase, cliente.id, "pagar", n(cliente.plazo_pago_compras), desde, hoy),
  ]);

  const saldo = (cuentas ?? []).reduce((a, c) => a + (c.saldo_actual == null ? 0 : Number(c.saldo_actual)), 0);
  const movRows = movs ?? [];
  const pendientes = movRows.filter((m) => m.estado === "pendiente").length;
  const totalCxC = cxc.reduce((a, d) => a + d.pendiente, 0);
  const totalCxP = cxp.reduce((a, d) => a + d.pendiente, 0);

  return (
    <main className="min-h-svh bg-background px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between">
          <Image src="/logo-claro.png" alt="RS Tax & Legal" width={170} height={48} priority className="h-auto w-[160px]" />
          <div className="text-right text-sm text-muted-foreground">Al día {formatFecha(hoy)}</div>
        </div>

        <h1 className="mt-6 font-heading text-2xl font-semibold">{cliente.razon_social}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tu tesorería: sube la cartola de tu banco y nosotros la cruzamos con tus facturas del SII.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="card-soft rounded-xl bg-card px-4 py-3">
            <div className="text-xs text-muted-foreground">Saldo en banco</div>
            <div className="mt-0.5 text-xl font-semibold tabular-nums">{formatMonto(saldo)}</div>
          </div>
          <div className="card-soft rounded-xl bg-card px-4 py-3">
            <div className="text-xs text-muted-foreground">Por cobrar</div>
            <div className="mt-0.5 text-xl font-semibold tabular-nums text-emerald-600">{formatMonto(totalCxC)}</div>
          </div>
          <div className="card-soft rounded-xl bg-card px-4 py-3">
            <div className="text-xs text-muted-foreground">Por pagar</div>
            <div className="mt-0.5 text-xl font-semibold tabular-nums text-red-600">{formatMonto(totalCxP)}</div>
          </div>
          <div className="card-soft rounded-xl bg-card px-4 py-3">
            <div className="text-xs text-muted-foreground">Movimientos por conciliar</div>
            <div className="mt-0.5 text-xl font-semibold tabular-nums">{pendientes}</div>
          </div>
        </div>

        <PortalUpload token={token} />

        <div className="mt-6">
          <h2 className="font-heading text-lg font-semibold">Últimos movimientos</h2>
          <div className="card-soft mt-2 overflow-hidden rounded-xl bg-card">
            {movRows.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Aún no hay movimientos. Sube tu cartola para empezar.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2">Fecha</th>
                    <th className="px-4 py-2">Glosa</th>
                    <th className="px-4 py-2 text-right">Cargo</th>
                    <th className="px-4 py-2 text-right">Abono</th>
                    <th className="px-4 py-2">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {movRows.map((m) => (
                    <tr key={m.id} className="border-b border-border/60 last:border-0">
                      <td className="whitespace-nowrap px-4 py-2 tabular-nums">{formatFecha(m.fecha)}</td>
                      <td className="px-4 py-2">{m.glosa || "—"}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-red-600">
                        {Number(m.cargo) > 0 ? formatMonto(Number(m.cargo)) : ""}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-emerald-600">
                        {Number(m.abono) > 0 ? formatMonto(Number(m.abono)) : ""}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {m.estado === "conciliado" ? "Conciliado" : m.estado === "ignorado" ? "—" : "Por conciliar"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {cuentas && cuentas.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Cuentas: {cuentas.map((c) => c.alias || NOMBRE_FUENTE[c.fuente] || c.fuente).join(" · ")}
            </p>
          )}
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">Rodríguez Samith Tax &amp; Legal · Viña del Mar</p>
      </div>
    </main>
  );
}
