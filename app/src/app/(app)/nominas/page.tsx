import { createClient } from "@/lib/supabase/server";
import { NominasClient, type NominaEmpresaRow } from "./nominas-client";
import type { GrupoClienteOpcion } from "@/lib/onboarding";

export const metadata = { title: "Nóminas — RS Tax & Legal" };

export default async function NominasPage() {
  const supabase = await createClient();

  const [empresasRes, gruposRes, trabsRes] = await Promise.all([
    supabase
      .from("clientes")
      .select(
        "id, razon_social, rut_empresa, grupo_id, hace_liquidaciones, n_trabajadores_esperados",
      )
      .order("razon_social"),
    supabase
      .from("grupos_cliente")
      .select("id, codigo, nombre")
      .order("codigo"),
    supabase.from("trabajadores").select("cliente_id, activo"),
  ]);

  const grupos: GrupoClienteOpcion[] = gruposRes.data ?? [];
  const grupoPorId = new Map(grupos.map((g) => [g.id, g]));

  const activosPorEmpresa = new Map<string, number>();
  const totalPorEmpresa = new Map<string, number>();
  for (const t of trabsRes.data ?? []) {
    if (!t.cliente_id) continue;
    totalPorEmpresa.set(t.cliente_id, (totalPorEmpresa.get(t.cliente_id) ?? 0) + 1);
    if (t.activo !== false)
      activosPorEmpresa.set(
        t.cliente_id,
        (activosPorEmpresa.get(t.cliente_id) ?? 0) + 1,
      );
  }

  const empresas: NominaEmpresaRow[] = (empresasRes.data ?? []).map((e) => {
    const g = e.grupo_id ? grupoPorId.get(e.grupo_id) : undefined;
    return {
      id: e.id,
      razon_social: e.razon_social,
      rut_empresa: e.rut_empresa,
      grupo_id: e.grupo_id,
      grupo_codigo: g?.codigo ?? null,
      grupo_nombre: g?.nombre ?? null,
      hace_liquidaciones: e.hace_liquidaciones,
      n_trabajadores_esperados:
        e.n_trabajadores_esperados === null
          ? null
          : Number(e.n_trabajadores_esperados),
      n_trab_activos: activosPorEmpresa.get(e.id) ?? 0,
      n_trab_total: totalPorEmpresa.get(e.id) ?? 0,
    };
  });

  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-10 sm:px-6">
      <NominasClient
        empresas={empresas}
        grupos={grupos}
        errorCarga={empresasRes.error?.message ?? null}
      />
    </main>
  );
}
