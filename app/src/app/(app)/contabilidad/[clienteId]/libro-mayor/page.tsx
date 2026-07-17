import { createClient } from "@/lib/supabase/server";
import { DetalleLibroMayor, type CuentaLM, type MovimientoLM } from "./detalle-client";

export const metadata = { title: "Libro Mayor — RS Tax & Legal" };

export default async function LibroMayorClientePage({
  params,
  searchParams,
}: {
  params: Promise<{ clienteId: string }>;
  searchParams: Promise<{ anio?: string }>;
}) {
  const { clienteId } = await params;
  const { anio: a } = await searchParams;
  const anio = /^\d{4}$/.test(a ?? "") ? Number(a) : 2025;
  const supabase = await createClient();

  const [clienteRes, libroRes] = await Promise.all([
    supabase
      .from("clientes")
      .select("id, razon_social, rut_empresa")
      .eq("id", clienteId)
      .maybeSingle(),
    supabase
      .from("libro_mayor")
      .select(
        "id, anio, periodo_desde, periodo_hasta, total_debe, total_haber, n_cuentas, n_movimientos, cuadra, archivo_path, nombre_original, updated_at",
      )
      .eq("cliente_id", clienteId)
      .eq("anio", anio)
      .maybeSingle(),
  ]);

  const cliente = clienteRes.data;
  const libro = libroRes.data;

  let cuentas: CuentaLM[] = [];
  let movimientos: MovimientoLM[] = [];
  if (libro) {
    const [cuentasRes, movsRes] = await Promise.all([
      supabase
        .from("libro_mayor_cuenta")
        .select("codigo, nombre, debe, haber, saldo")
        .eq("libro_id", libro.id)
        .order("orden"),
      supabase
        .from("libro_mayor_movimiento")
        .select(
          "cuenta_codigo, comprobante, tipo, fecha, concepto, debe, haber, saldo, ficha, documento, vencimiento, unidad_negocio",
        )
        .eq("libro_id", libro.id)
        .order("orden")
        .limit(20000),
    ]);
    const n = (v: unknown) => (v == null ? 0 : Number(v));
    cuentas = (cuentasRes.data ?? []).map((c) => ({
      codigo: c.codigo as string,
      nombre: c.nombre as string,
      debe: n(c.debe),
      haber: n(c.haber),
      saldo: n(c.saldo),
    }));
    movimientos = (movsRes.data ?? []).map((m) => ({
      cuentaCodigo: m.cuenta_codigo as string,
      comprobante: (m.comprobante as string) ?? "",
      tipo: (m.tipo as string) ?? "",
      fecha: (m.fecha as string) ?? "",
      concepto: (m.concepto as string) ?? "",
      debe: n(m.debe),
      haber: n(m.haber),
      saldo: m.saldo == null ? null : n(m.saldo),
      ficha: (m.ficha as string) ?? "",
      documento: (m.documento as string) ?? "",
      vencimiento: (m.vencimiento as string) ?? "",
      unidadNegocio: (m.unidad_negocio as string) ?? "",
    }));
  }

  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-10 sm:px-6">
      <DetalleLibroMayor
        clienteId={clienteId}
        anio={anio}
        razonSocial={cliente?.razon_social ?? "Empresa"}
        rutEmpresa={cliente?.rut_empresa ?? null}
        libro={
          libro
            ? {
                periodoDesde: libro.periodo_desde as string | null,
                periodoHasta: libro.periodo_hasta as string | null,
                totalDebe: Number(libro.total_debe),
                totalHaber: Number(libro.total_haber),
                nCuentas: Number(libro.n_cuentas),
                nMovimientos: Number(libro.n_movimientos),
                cuadra: Boolean(libro.cuadra),
                archivoPath: (libro.archivo_path as string) ?? null,
                nombreOriginal: (libro.nombre_original as string) ?? null,
                actualizado: (libro.updated_at as string) ?? null,
              }
            : null
        }
        cuentas={cuentas}
        movimientos={movimientos}
      />
    </main>
  );
}
