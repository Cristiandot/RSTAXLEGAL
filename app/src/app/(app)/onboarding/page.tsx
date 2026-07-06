import { createClient } from "@/lib/supabase/server";
import { OnboardingClient } from "./onboarding-client";
import type {
  Catalogos,
  EmpresaOnboardingRow,
  GrupoClienteOpcion,
  PorCampoRow,
  CambioPropuestoRow,
} from "@/lib/onboarding";

export const metadata = { title: "Onboarding — RS Tax & Legal" };

export default async function OnboardingPage() {
  const supabase = await createClient();

  const [empresasRes, porCampoRes, cambiosRes, catRes, defsRes, gruposRes, vinculosRes] =
    await Promise.all([
      supabase
        .from("v_onboarding_empresas")
        .select("*")
        .order("pct_empresa", { ascending: true, nullsFirst: true }),
      supabase.from("v_onboarding_por_campo").select("*"),
      supabase
        .from("cambios_propuestos")
        .select("*")
        .eq("estado", "pendiente")
        .order("created_at", { ascending: true }),
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
      supabase
        .from("grupos_cliente")
        .select("id, codigo, nombre")
        .order("codigo"),
      supabase.from("clientes").select("id, grupo_id"),
    ]);

  // Opciones de selectores cerrados + qué selector usa cada campo.
  const catalogos: Catalogos = {};
  for (const c of catRes.data ?? []) {
    (catalogos[c.tipo] ??= []).push({ codigo: c.codigo, etiqueta: c.etiqueta });
  }
  const selectores: Record<string, string | null> = {};
  for (const d of defsRes.data ?? []) {
    selectores[`${d.entidad}:${d.campo}`] = d.selector;
  }

  // Cliente (grupo) de cada empresa, para mostrar y agrupar.
  const grupos: GrupoClienteOpcion[] = gruposRes.data ?? [];
  const grupoPorId = new Map(grupos.map((g) => [g.id, g]));
  const grupoDeEmpresa = new Map<string, GrupoClienteOpcion>();
  for (const v of vinculosRes.data ?? []) {
    const g = v.grupo_id ? grupoPorId.get(v.grupo_id) : undefined;
    if (g) grupoDeEmpresa.set(v.id, g);
  }

  // PostgREST devuelve numeric/bigint como string → coerción explícita.
  const empresas: EmpresaOnboardingRow[] = (empresasRes.data ?? []).map((e) => ({
    cliente_id: e.cliente_id,
    razon_social: e.razon_social,
    rut_empresa: e.rut_empresa,
    onboarding_estado: e.onboarding_estado,
    pct_empresa: e.pct_empresa === null ? null : Number(e.pct_empresa),
    faltan_empresa: Number(e.faltan_empresa) || 0,
    n_trab: Number(e.n_trab) || 0,
    pct_trab: e.pct_trab === null ? null : Number(e.pct_trab),
    faltan_trab: Number(e.faltan_trab) || 0,
    grupo_codigo: grupoDeEmpresa.get(e.cliente_id)?.codigo ?? null,
    grupo_nombre: grupoDeEmpresa.get(e.cliente_id)?.nombre ?? null,
  }));

  const porCampo: PorCampoRow[] = (porCampoRes.data ?? []).map((r) => ({
    entidad: r.entidad,
    grupo: r.grupo,
    campo: r.campo,
    etiqueta: r.etiqueta,
    fuente: r.fuente,
    requeridos: Number(r.requeridos) || 0,
    faltan: Number(r.faltan) || 0,
  }));

  // Enriquecer la cola con razón social y etiqueta del campo.
  let cambios: CambioPropuestoRow[] = [];
  const raw = cambiosRes.data ?? [];
  if (raw.length) {
    const cliIds = [
      ...new Set(raw.map((c) => c.cliente_id).filter(Boolean) as string[]),
    ];
    const cliMap = new Map<string, string>();
    if (cliIds.length) {
      const { data } = await supabase
        .from("clientes")
        .select("id, razon_social")
        .in("id", cliIds);
      data?.forEach((c) => cliMap.set(c.id, c.razon_social));
    }
    const { data: campos } = await supabase
      .from("onboarding_campos")
      .select("entidad, campo, etiqueta");
    const campoMap = new Map<string, string>();
    campos?.forEach((c) => campoMap.set(`${c.entidad}:${c.campo}`, c.etiqueta));

    cambios = raw.map((c) => ({
      id: c.id,
      entidad: c.entidad,
      registro_id: c.registro_id,
      cliente_id: c.cliente_id,
      campo: c.campo,
      etiqueta: campoMap.get(`${c.entidad}:${c.campo}`) ?? c.campo,
      valor_actual: c.valor_actual,
      valor_propuesto: c.valor_propuesto,
      origen: c.origen,
      observacion: c.observacion,
      created_at: c.created_at,
      razon_social: c.cliente_id ? (cliMap.get(c.cliente_id) ?? null) : null,
    }));
  }

  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-10 sm:px-6">
      <OnboardingClient
        empresas={empresas}
        porCampo={porCampo}
        cambios={cambios}
        catalogos={catalogos}
        selectores={selectores}
        grupos={grupos}
        errorCarga={empresasRes.error?.message ?? null}
      />
    </main>
  );
}
