import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { normalizarPeriodo } from "@/lib/periodos";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import {
  RcvClient,
  type CuentaOpcion,
  type DocCompra,
  type DocVenta,
  type F29Montos,
} from "./rcv-client";

export const metadata = { title: "Libros RCV — RS Tax & Legal" };

const COLS_COMPRA =
  "id, tipo_doc, tipo_compra, rut_proveedor, razon_social, folio, fecha_docto, monto_exento, monto_neto, iva_recuperable, iva_no_recuperable, monto_total, neto_activo_fijo, iva_activo_fijo, impto_sin_credito, otro_imp_valor, pagado_pct, cuenta_id, archivo_origen";
const COLS_VENTA =
  "id, tipo_doc, tipo_venta, rut_cliente, razon_social, folio, fecha_docto, monto_exento, monto_neto, monto_iva, monto_total, pagado_pct, cuenta_id, archivo_origen";

export default async function RcvPage({
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

  const [clienteRes, comprasRes, ventasRes, cuentasRes, f29Res] =
    await Promise.all([
      supabase
        .from("clientes")
        .select("id, razon_social, rut_empresa, hace_contabilidad_completa")
        .eq("id", clienteId)
        .maybeSingle(),
      supabase
        .from("rcv_compras")
        .select(COLS_COMPRA)
        .eq("cliente_id", clienteId)
        .eq("periodo", periodo)
        .order("fecha_docto", { ascending: true })
        .order("folio", { ascending: true })
        .limit(5000),
      supabase
        .from("rcv_ventas")
        .select(COLS_VENTA)
        .eq("cliente_id", clienteId)
        .eq("periodo", periodo)
        .order("fecha_docto", { ascending: true })
        .order("folio", { ascending: true })
        .limit(5000),
      supabase
        .from("plan_cuentas")
        .select("id, cliente_id, codigo, nombre, tipo")
        .or(`cliente_id.is.null,cliente_id.eq.${clienteId}`)
        .eq("activo", true)
        .order("codigo"),
      supabase
        .from("ciclo_f29")
        .select(
          "id, iva_debito, iva_credito, ppm, imp_unico, imp_2da_categoria, iva_postergado, monto_a_pagar, fecha_pago_f29",
        )
        .eq("cliente_id", clienteId)
        .eq("periodo", periodo)
        .maybeSingle(),
    ]);

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
  if (!cliente.hace_contabilidad_completa) {
    return (
      <main className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
        <div className="space-y-4 pt-2">
          <Button
            variant="ghost"
            size="sm"
            render={<Link href={`/contabilidad/${clienteId}?periodo=${periodo}`} />}
          >
            <ArrowLeft className="size-4" />
            Volver al detalle
          </Button>
          <div className="card-soft rounded-xl bg-card p-8 text-center text-sm text-muted-foreground">
            {cliente.razon_social} no tiene activada la contabilidad completa.
            Se activa empresa por empresa (flag{" "}
            <code>hace_contabilidad_completa</code> en la ficha del cliente).
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-10 sm:px-6">
      <RcvClient
        clienteId={cliente.id}
        razonSocial={cliente.razon_social}
        rutEmpresa={cliente.rut_empresa}
        periodo={periodo}
        compras={(comprasRes.data ?? []) as DocCompra[]}
        ventas={(ventasRes.data ?? []) as DocVenta[]}
        cuentas={(cuentasRes.data ?? []) as CuentaOpcion[]}
        f29={(f29Res.data as F29Montos | null) ?? null}
      />
    </main>
  );
}
