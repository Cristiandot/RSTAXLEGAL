import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { etiquetaPeriodo, expandirRango, normalizarRango } from "@/lib/periodos";
import { Button } from "@/components/ui/button";
import {
  generarLibroDiario,
  type CompraInput,
  type VentaInput,
  type HonorarioInput,
  type F29Input,
  type LineaDiario,
} from "@/lib/contabilidad/centralizacion";
import { construirBalance, type CuentaPlan } from "@/lib/contabilidad/balance";
import { BalanceClient } from "./balance-client";

export const metadata = { title: "Balance 8 columnas — RS Tax & Legal" };

const COLS_COMPRA =
  "periodo, tipo_doc, rut_proveedor, razon_social, folio, monto_exento, monto_neto, iva_recuperable, iva_no_recuperable, impto_sin_credito, otro_imp_valor, monto_total, pagado_pct, cuenta_id";
const COLS_VENTA =
  "periodo, tipo_doc, rut_cliente, razon_social, folio, monto_exento, monto_neto, monto_iva, otro_imp_valor, monto_total, pagado_pct";
const COLS_HON =
  "periodo, numero, rut_emisor, nombre_emisor, brutos, retencion, liquido, pagado_pct, cuenta_id";

export default async function BalancePage({
  params,
  searchParams,
}: {
  params: Promise<{ clienteId: string }>;
  searchParams: Promise<{ periodo?: string; desde?: string; hasta?: string }>;
}) {
  const { clienteId } = await params;
  const sp = await searchParams;
  const { desde, hasta } = normalizarRango(sp.desde, sp.hasta, sp.periodo);
  const periodos = expandirRango(desde, hasta);
  const supabase = await createClient();

  const [clienteRes, comprasRes, ventasRes, honorariosRes, cuentasRes, f29Res] =
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
        .in("periodo", periodos)
        .limit(20000),
      supabase
        .from("rcv_ventas")
        .select(COLS_VENTA)
        .eq("cliente_id", clienteId)
        .in("periodo", periodos)
        .limit(20000),
      supabase
        .from("honorarios_periodo")
        .select(COLS_HON)
        .eq("cliente_id", clienteId)
        .in("periodo", periodos)
        .limit(20000),
      supabase
        .from("plan_cuentas")
        .select("id, codigo, nombre, tipo")
        .or(`cliente_id.is.null,cliente_id.eq.${clienteId}`)
        .eq("activo", true)
        .order("codigo"),
      supabase
        .from("ciclo_f29")
        .select("periodo, ppm, imp_unico, imp_2da_categoria")
        .eq("cliente_id", clienteId)
        .in("periodo", periodos),
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
            render={<Link href={`/contabilidad/${clienteId}?periodo=${hasta}`} />}
          >
            <ArrowLeft className="size-4" />
            Volver al detalle
          </Button>
          <div className="card-soft rounded-xl bg-card p-8 text-center text-sm text-muted-foreground">
            {cliente.razon_social} no tiene activada la contabilidad completa.
          </div>
        </div>
      </main>
    );
  }

  const num = (v: unknown) => (v == null ? 0 : Number(v));

  // Mapa cuenta_id -> código, para que la clasificación del contador (Cuenta
  // Gasto asignada en los libros) llegue a los asientos y al balance.
  const codigoPorCuentaId = new Map<string, string>(
    (cuentasRes.data ?? []).map((c) => [c.id as string, c.codigo as string]),
  );
  const resolverCuenta = (cuentaId: unknown): string | null =>
    typeof cuentaId === "string" ? (codigoPorCuentaId.get(cuentaId) ?? null) : null;

  const mapCompra = (c: NonNullable<typeof comprasRes.data>[number]): CompraInput => ({
    tipo_doc: num(c.tipo_doc),
    cuenta_codigo: resolverCuenta(c.cuenta_id),
    rut_proveedor: c.rut_proveedor as string,
    razon_social: (c.razon_social as string) ?? null,
    folio: String(c.folio),
    monto_exento: num(c.monto_exento),
    monto_neto: num(c.monto_neto),
    iva_recuperable: num(c.iva_recuperable),
    iva_no_recuperable: num(c.iva_no_recuperable),
    impto_sin_credito: num(c.impto_sin_credito),
    otro_imp_valor: num(c.otro_imp_valor),
    monto_total: num(c.monto_total),
    pagado_pct: num(c.pagado_pct),
  });

  const mapVenta = (v: NonNullable<typeof ventasRes.data>[number]): VentaInput => ({
    tipo_doc: num(v.tipo_doc),
    rut_cliente: (v.rut_cliente as string) ?? null,
    razon_social: (v.razon_social as string) ?? null,
    folio: String(v.folio),
    monto_exento: num(v.monto_exento),
    monto_neto: num(v.monto_neto),
    monto_iva: num(v.monto_iva),
    otro_imp_valor: num(v.otro_imp_valor),
    monto_total: num(v.monto_total),
    pagado_pct: num(v.pagado_pct),
  });

  const mapHonorario = (
    h: NonNullable<typeof honorariosRes.data>[number],
  ): HonorarioInput => ({
    numero: String(h.numero),
    rut_emisor: (h.rut_emisor as string) ?? null,
    nombre_emisor: (h.nombre_emisor as string) ?? null,
    cuenta_codigo: resolverCuenta(h.cuenta_id),
    brutos: num(h.brutos),
    retencion: num(h.retencion),
    liquido: num(h.liquido),
    pagado_pct: num(h.pagado_pct),
  });

  const comprasRows = comprasRes.data ?? [];
  const ventasRows = ventasRes.data ?? [];
  const honorariosRows = honorariosRes.data ?? [];
  const f29Rows = f29Res.data ?? [];
  const cuentas = (cuentasRes.data ?? []) as CuentaPlan[];

  // Centralización MES A MES: cada período del rango genera su propio libro
  // diario (con su asiento F29 y su fecha de cierre); el balance consolida
  // todas las líneas del rango.
  const lineas: LineaDiario[] = [];
  const advPorMensaje = new Map<string, string[]>();
  const conteos = { compras: 0, ventas: 0, honorarios: 0 };

  for (const per of periodos) {
    const compras = comprasRows.filter((c) => c.periodo === per).map(mapCompra);
    const ventas = ventasRows.filter((v) => v.periodo === per).map(mapVenta);
    const honorarios = honorariosRows
      .filter((h) => h.periodo === per)
      .map(mapHonorario);
    const f29Row = f29Rows.find((f) => f.periodo === per);
    const f29: F29Input | null = f29Row
      ? {
          ppm: num(f29Row.ppm),
          imp_unico: num(f29Row.imp_unico),
          imp_2da_categoria: num(f29Row.imp_2da_categoria),
        }
      : null;

    const generado = generarLibroDiario({ periodo: per, compras, ventas, honorarios, f29 });
    lineas.push(...generado.lineas);
    for (const msg of generado.advertencias) {
      const arr = advPorMensaje.get(msg) ?? [];
      arr.push(etiquetaPeriodo(per));
      advPorMensaje.set(msg, arr);
    }
    conteos.compras += compras.length;
    conteos.ventas += ventas.length;
    conteos.honorarios += honorarios.length;
  }

  // Advertencias del rango: las comunes a TODOS los meses se muestran una vez;
  // las de meses puntuales se prefijan con su período.
  const advertencias = [...advPorMensaje].map(([msg, pers]) =>
    pers.length === periodos.length ? msg : `${pers.join(", ")}: ${msg}`,
  );

  const { filas, totales } = construirBalance(lineas, cuentas);

  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-10 sm:px-6">
      <BalanceClient
        clienteId={cliente.id}
        razonSocial={cliente.razon_social}
        rutEmpresa={cliente.rut_empresa}
        desde={desde}
        hasta={hasta}
        lineas={lineas}
        filas={filas}
        totales={totales}
        advertencias={advertencias}
        conteos={conteos}
      />
    </main>
  );
}
