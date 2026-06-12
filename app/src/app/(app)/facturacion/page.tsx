import { createClient } from "@/lib/supabase/server";
import { FacturacionClient, type FacturaRow, type ClienteOpcion } from "./facturacion-client";

export const metadata = { title: "Facturación — RS Tax & Legal" };

export default async function FacturacionPage() {
  const supabase = await createClient();

  const [facturasRes, clientesRes] = await Promise.all([
    supabase
      .from("facturas")
      .select(
        "id, folio, tipo, folio_ref, razon_social_factura, periodo, monto, observaciones, pagada, fecha_pago, cliente_id, clientes(razon_social, suscripcion_pago, suscripcion_dia_pago)",
      )
      .order("periodo", { ascending: false })
      .order("folio", { ascending: false })
      .limit(3000),
    supabase
      .from("clientes")
      .select("id, razon_social, suscripcion_pago, suscripcion_dia_pago")
      .eq("activo", true)
      .order("razon_social"),
  ]);

  const filas: FacturaRow[] = (facturasRes.data ?? []).map((f) => {
    const cli = f.clientes as unknown as {
      razon_social: string;
      suscripcion_pago: boolean;
      suscripcion_dia_pago: number | null;
    } | null;
    return {
      id: f.id,
      folio: f.folio,
      tipo: f.tipo,
      folioRef: f.folio_ref,
      razonFactura: f.razon_social_factura,
      periodo: f.periodo,
      monto: f.monto,
      observaciones: f.observaciones,
      pagada: f.pagada,
      fechaPago: f.fecha_pago,
      clienteId: f.cliente_id,
      clienteNombre: cli?.razon_social ?? null,
      suscrito: cli?.suscripcion_pago ?? false,
      diaPago: cli?.suscripcion_dia_pago ?? null,
    };
  });

  return (
    <main className="mx-auto max-w-7xl px-4 pb-10 sm:px-6">
      <FacturacionClient
        filas={filas}
        clientes={(clientesRes.data ?? []) as ClienteOpcion[]}
        errorCarga={facturasRes.error?.message ?? null}
      />
    </main>
  );
}