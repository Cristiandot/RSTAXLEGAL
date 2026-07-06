import { createClient } from "@/lib/supabase/server";
import { NominasClient, type NominaEmpresaRow } from "./nominas-client";
import type { Catalogos, GrupoClienteOpcion } from "@/lib/onboarding";

export const metadata = { title: "Nóminas — RS Tax & Legal" };

export default async function NominasPage() {
  const supabase = await createClient();

  const [empresasRes, gruposRes, trabsRes, pctRes, catRes, defsRes] =
    await Promise.all([
      // Solo empresas con liquidaciones de sueldo.
      supabase
        .from("clientes")
        .select("id, razon_social, rut_empresa, grupo_id, n_trabajadores_esperados")
        .eq("hace_liquidaciones", true)
        .order("razon_social"),
      supabase
        .from("grupos_cliente")
        .select("id, codigo, nombre")
        .order("codigo"),
      supabase.from("trabajadores").select("cliente_id, activo"),
      supabase
        .from("v_onboarding_empresas")
        .select("cliente_id, pct_trab, faltan_trab"),
      supabase
        .from("catalogo_valores")
        .select("tipo, codigo, etiqueta")
        .eq("activo", true)
        .order("orden")
        .order("etiqueta"),
      supabase
        .from("onboarding_campos")
        .select("entidad, campo, selector")
        .eq("activo", true),
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

  const pctPorEmpresa = new Map<string, { pct: number | null; faltan: number }>();
  for (const p of pctRes.data ?? []) {
    pctPorEmpresa.set(p.cliente_id, {
      pct: p.pct_trab === null ? null : Number(p.pct_trab),
      faltan: Number(p.faltan_trab) || 0,
    });
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
      n_trabajadores_esperados:
        e.n_trabajadores_esperados === null
          ? null
          : Number(e.n_trabajadores_esperados),
      n_trab_activos: activosPorEmpresa.get(e.id) ?? 0,
      n_trab_total: totalPorEmpresa.get(e.id) ?? 0,
      pct_trab: pctPorEmpresa.get(e.id)?.pct ?? null,
      faltan_trab: pctPorEmpresa.get(e.id)?.faltan ?? 0,
    };
  });

  const catalogos: Catalogos = {};
  for (const c of catRes.data ?? []) {
    (catalogos[c.tipo] ??= []).push({ codigo: c.codigo, etiqueta: c.etiqueta });
  }
  const selectores: Record<string, string | null> = {};
  for (const d of defsRes.data ?? []) {
    selectores[`${d.entidad}:${d.campo}`] = d.selector;
  }

  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-10 sm:px-6">
      <NominasClient
        empresas={empresas}
        grupos={grupos}
        catalogos={catalogos}
        selectores={selectores}
        errorCarga={empresasRes.error?.message ?? null}
      />
    </main>
  );
}
