import { createClient } from "@/lib/supabase/server";
import { LibroClient, type EmpresaOpcion, type LibroRow } from "./libro-client";

export const metadata = { title: "Libro de Remuneraciones — RS Tax & Legal" };

export default async function LibroRemuneracionesPage() {
  const supabase = await createClient();

  const [empresasRes, filasRes] = await Promise.all([
    supabase
      .from("clientes")
      .select("id, razon_social, rut_empresa, previred_rut")
      .eq("activo", true)
      .order("razon_social"),
    supabase
      .from("libro_remuneraciones")
      .select(
        "id, cliente_id, periodo, rut_empleador, n_trabajadores, total_liquido, estado, fecha_carga_dt, jornada_provisional, causal_provisional",
      )
      .order("periodo", { ascending: false }),
  ]);

  return (
    <main className="mx-auto max-w-5xl px-4 pb-10 sm:px-6">
      <LibroClient
        empresas={(empresasRes.data ?? []) as EmpresaOpcion[]}
        filas={(filasRes.data ?? []) as LibroRow[]}
        errorCarga={empresasRes.error?.message ?? filasRes.error?.message ?? null}
      />
    </main>
  );
}
