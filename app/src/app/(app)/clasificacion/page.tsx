import { createClient } from "@/lib/supabase/server";
import { ClasificacionClient, type EmpresaOpc } from "./clasificacion-client";
import type { Regla } from "./actions";
import type { CategoriaOpcion } from "@/app/solicitud/[token]/clasificar-actions";

export const metadata = { title: "Clasificación de gastos — RS Tax & Legal" };
export const dynamic = "force-dynamic";

export default async function ClasificacionPage() {
  const supabase = await createClient();
  const [reglasRes, catsRes, cliRes] = await Promise.all([
    supabase.from("categoria_gasto_regla").select("id, patron, categoria, orden").order("orden"),
    supabase.from("categoria_gasto").select("codigo, etiqueta").order("orden"),
    supabase.from("clientes").select("id, razon_social, rut_empresa").eq("activo", true).order("razon_social"),
  ]);

  return (
    <main className="mx-auto max-w-[1100px] px-4 pb-10 sm:px-6">
      <ClasificacionClient
        reglas={(reglasRes.data ?? []) as Regla[]}
        categorias={(catsRes.data ?? []) as CategoriaOpcion[]}
        empresas={(cliRes.data ?? []).map((c) => ({
          id: c.id,
          nombre: c.razon_social,
          rut: c.rut_empresa,
        })) as EmpresaOpc[]}
        errorCarga={reglasRes.error?.message ?? null}
      />
    </main>
  );
}
