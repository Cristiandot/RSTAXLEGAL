import { createClient } from "@/lib/supabase/server";
import { ClientesClient } from "./clientes-client";
import type {
  Catalogos,
  ClienteResumenRow,
  EmpresaDeGrupo,
  PorCampoRow,
} from "@/lib/onboarding";

export const metadata = { title: "Clientes — RS Tax & Legal" };

export default async function ClientesPage() {
  const supabase = await createClient();

  const [gruposRes, vinculosRes, trabsRes, empresasRes, porCampoRes, catRes, defsRes] =
    await Promise.all([
      supabase
        .from("grupos_cliente")
        .select("id, codigo, nombre, correo, carpeta_onedrive")
        .order("codigo"),
      supabase
        .from("clientes")
        .select(
          "id, grupo_id, razon_social, rut_empresa, hace_f29, hace_liquidaciones, activo",
        ),
      supabase.from("trabajadores").select("cliente_id, activo"),
      supabase.from("v_onboarding_empresas").select("*"),
      supabase.from("v_onboarding_por_campo").select("*"),
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

  // Completitud por empresa (de la vista), para agregarla por cliente.
  const pctPorEmpresa = new Map<
    string,
    { pct: number | null; pctTrab: number | null; faltan: number; nTrab: number }
  >();
  for (const e of empresasRes.data ?? []) {
    pctPorEmpresa.set(e.cliente_id, {
      pct: e.pct_empresa === null ? null : Number(e.pct_empresa),
      pctTrab: e.pct_trab === null ? null : Number(e.pct_trab),
      faltan: (Number(e.faltan_empresa) || 0) + (Number(e.faltan_trab) || 0),
      nTrab: Number(e.n_trab) || 0,
    });
  }

  // Trabajadores activos por empresa (dotación Previred).
  const trabPorEmpresa = new Map<string, number>();
  for (const t of trabsRes.data ?? []) {
    if (!t.cliente_id || t.activo === false) continue;
    trabPorEmpresa.set(t.cliente_id, (trabPorEmpresa.get(t.cliente_id) ?? 0) + 1);
  }

  // Empresas de cada cliente (datos básicos para el detalle).
  const empresasPorGrupo = new Map<string, EmpresaDeGrupo[]>();
  for (const v of vinculosRes.data ?? []) {
    if (!v.grupo_id) continue;
    const arr = empresasPorGrupo.get(v.grupo_id) ?? [];
    arr.push({
      id: v.id,
      razon_social: v.razon_social,
      rut_empresa: v.rut_empresa,
      pct: pctPorEmpresa.get(v.id)?.pct ?? null,
      faltan: pctPorEmpresa.get(v.id)?.faltan ?? 0,
      hace_f29: v.hace_f29,
      hace_liquidaciones: v.hace_liquidaciones,
      n_trab_activos: trabPorEmpresa.get(v.id) ?? 0,
    });
    empresasPorGrupo.set(v.grupo_id, arr);
  }

  // Grupos dados de baja: tienen empresas cargadas pero NINGUNA activa. Se
  // ocultan del listado. Los grupos sin empresas aún se conservan (recién
  // creados / en onboarding).
  const gruposConCliente = new Set<string>();
  const gruposActivos = new Set<string>();
  for (const v of vinculosRes.data ?? []) {
    if (!v.grupo_id) continue;
    gruposConCliente.add(v.grupo_id);
    if (v.activo !== false) gruposActivos.add(v.grupo_id);
  }
  const gruposVisibles = (gruposRes.data ?? []).filter(
    (g) => !gruposConCliente.has(g.id) || gruposActivos.has(g.id),
  );

  const clientes: ClienteResumenRow[] = gruposVisibles.map((g) => {
    const emps = empresasPorGrupo.get(g.id) ?? [];
    const stats = emps
      .map((e) => pctPorEmpresa.get(e.id))
      .filter((s): s is NonNullable<typeof s> => Boolean(s));
    const pcts = stats
      .flatMap((s) => [s.pct, s.pctTrab])
      .filter((v): v is number => v !== null);
    return {
      grupo_id: g.id,
      codigo: g.codigo,
      nombre: g.nombre,
      correo: g.correo,
      n_empresas: emps.length,
      pct: pcts.length
        ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length)
        : null,
      faltan: stats.reduce((a, s) => a + s.faltan, 0),
      carpeta_onedrive: g.carpeta_onedrive,
    };
  });

  const porCampo: PorCampoRow[] = (porCampoRes.data ?? []).map((r) => ({
    entidad: r.entidad,
    grupo: r.grupo,
    campo: r.campo,
    etiqueta: r.etiqueta,
    fuente: r.fuente,
    requeridos: Number(r.requeridos) || 0,
    faltan: Number(r.faltan) || 0,
  }));

  const catalogos: Catalogos = {};
  for (const c of catRes.data ?? []) {
    (catalogos[c.tipo] ??= []).push({ codigo: c.codigo, etiqueta: c.etiqueta });
  }
  const selectores: Record<string, string | null> = {};
  for (const d of defsRes.data ?? []) {
    selectores[`${d.entidad}:${d.campo}`] = d.selector;
  }

  const empresasDeGrupo: Record<string, EmpresaDeGrupo[]> =
    Object.fromEntries(empresasPorGrupo);

  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-10 sm:px-6">
      <ClientesClient
        clientes={clientes}
        empresasDeGrupo={empresasDeGrupo}
        porCampo={porCampo}
        catalogos={catalogos}
        selectores={selectores}
        errorCarga={gruposRes.error?.message ?? null}
      />
    </main>
  );
}
