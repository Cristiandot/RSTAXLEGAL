import { createClient } from "@/lib/supabase/server";
import { LibroMayorGrid, type FilaLibroMayor } from "./libro-mayor-grid";

export const metadata = { title: "Libro Mayor — RS Tax & Legal" };

export default async function LibroMayorGridPage({
  searchParams,
}: {
  searchParams: Promise<{ anio?: string }>;
}) {
  const { anio: a } = await searchParams;
  const anio = /^\d{4}$/.test(a ?? "") ? Number(a) : 2025;
  const supabase = await createClient();

  const [clientesRes, librosRes] = await Promise.all([
    supabase
      .from("clientes")
      .select("id, razon_social, rut_empresa, activo, fecha_termino_servicio")
      .order("razon_social"),
    supabase
      .from("libro_mayor")
      .select(
        "id, cliente_id, cuadra, n_cuentas, n_movimientos, total_debe, total_haber, updated_at",
      )
      .eq("anio", anio),
  ]);

  // Estado de revisión: preguntas pendientes/respondidas por libro
  const libroIds = (librosRes.data ?? []).map((l) => l.id as string);
  const pregPorLibro = new Map<string, { total: number; pendientes: number }>();
  if (libroIds.length) {
    const { data: pregs } = await supabase
      .from("libro_mayor_pregunta")
      .select("libro_id, respuesta")
      .in("libro_id", libroIds);
    for (const p of pregs ?? []) {
      const cur = pregPorLibro.get(p.libro_id as string) ?? { total: 0, pendientes: 0 };
      cur.total++;
      if (!p.respuesta) cur.pendientes++;
      pregPorLibro.set(p.libro_id as string, cur);
    }
  }

  const librosPorCliente = new Map(
    (librosRes.data ?? []).map((l) => [l.cliente_id as string, l]),
  );

  const filas: FilaLibroMayor[] = (clientesRes.data ?? []).map((c) => {
    const l = librosPorCliente.get(c.id);
    const preg = l ? pregPorLibro.get(l.id as string) : undefined;
    return {
      clienteId: c.id,
      razonSocial: c.razon_social,
      rutEmpresa: c.rut_empresa,
      activo: c.activo,
      terminado: !c.activo || c.fecha_termino_servicio != null,
      cargado: !!l,
      cuadra: l ? Boolean(l.cuadra) : null,
      nCuentas: l ? Number(l.n_cuentas) : 0,
      nMovimientos: l ? Number(l.n_movimientos) : 0,
      totalDebe: l ? Number(l.total_debe) : 0,
      totalHaber: l ? Number(l.total_haber) : 0,
      actualizado: l ? (l.updated_at as string) : null,
      preguntasTotal: preg?.total ?? 0,
      preguntasPendientes: preg?.pendientes ?? 0,
    };
  });

  return (
    <main className="mx-auto max-w-[1400px] px-4 pb-10 sm:px-6">
      <LibroMayorGrid
        anio={anio}
        filas={filas}
        errorCarga={clientesRes.error?.message ?? librosRes.error?.message ?? null}
      />
    </main>
  );
}
