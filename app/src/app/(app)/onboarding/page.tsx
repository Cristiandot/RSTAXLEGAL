import { createClient } from "@/lib/supabase/server";
import { OnboardingClient } from "./onboarding-client";
import type {
  AltaEmpresaRow,
  Catalogos,
  GrupoClienteOpcion,
  CambioPropuestoRow,
} from "@/lib/onboarding";

export const metadata = { title: "Onboarding — RS Tax & Legal" };

export default async function OnboardingPage() {
  const supabase = await createClient();

  const [empresasRes, gruposRes, cambiosRes, catRes] = await Promise.all([
    supabase
      .from("clientes")
      .select(
        "id, razon_social, rut_empresa, grupo_id, carpeta_onedrive, carpeta_solicitada_at, created_at",
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("grupos_cliente")
      .select("id, codigo, nombre")
      .order("codigo"),
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
  ]);

  const grupos: GrupoClienteOpcion[] = gruposRes.data ?? [];
  const grupoPorId = new Map(grupos.map((g) => [g.id, g]));

  const empresas: AltaEmpresaRow[] = (empresasRes.data ?? []).map((e) => {
    const g = e.grupo_id ? grupoPorId.get(e.grupo_id) : undefined;
    return {
      id: e.id,
      razon_social: e.razon_social,
      rut_empresa: e.rut_empresa,
      grupo_id: e.grupo_id,
      grupo_codigo: g?.codigo ?? null,
      grupo_nombre: g?.nombre ?? null,
      carpeta_onedrive: e.carpeta_onedrive,
      carpeta_solicitada_at: e.carpeta_solicitada_at,
      created_at: e.created_at,
    };
  });

  const catalogos: Catalogos = {};
  for (const c of catRes.data ?? []) {
    (catalogos[c.tipo] ??= []).push({ codigo: c.codigo, etiqueta: c.etiqueta });
  }

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
        grupos={grupos}
        cambios={cambios}
        catalogos={catalogos}
        errorCarga={empresasRes.error?.message ?? null}
      />
    </main>
  );
}
