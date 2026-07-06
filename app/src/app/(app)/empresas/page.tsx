import { createClient } from "@/lib/supabase/server";
import { EmpresasClient, type EmpresaFichaRow } from "./empresas-client";
import type { GrupoClienteOpcion } from "@/lib/onboarding";

export const metadata = { title: "Empresas — RS Tax & Legal" };

export default async function EmpresasPage() {
  const supabase = await createClient();

  const [empresasRes, gruposRes, trabsRes] = await Promise.all([
    supabase
      .from("clientes")
      .select(
        "id, razon_social, nombre_fantasia, rut_empresa, grupo_id, tipo_sociedad, regimen_tributario, giro, fecha_inicio_actividades, domicilio, comuna, ciudad, correo_empresa, telefono_empresa, contacto_nombre, contacto_correo, contacto_telefono, banco, tipo_cuenta, numero_cuenta, hace_f29, hace_liquidaciones, n_trabajadores_esperados, activo",
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

  // Trabajadores activos por empresa.
  const trabPorEmpresa = new Map<string, number>();
  for (const t of trabsRes.data ?? []) {
    if (!t.cliente_id || t.activo === false) continue;
    trabPorEmpresa.set(t.cliente_id, (trabPorEmpresa.get(t.cliente_id) ?? 0) + 1);
  }

  const empresas: EmpresaFichaRow[] = (empresasRes.data ?? []).map((e) => {
    const g = e.grupo_id ? grupoPorId.get(e.grupo_id) : undefined;
    return {
      ...e,
      n_trabajadores_esperados:
        e.n_trabajadores_esperados === null
          ? null
          : Number(e.n_trabajadores_esperados),
      grupo_codigo: g?.codigo ?? null,
      grupo_nombre: g?.nombre ?? null,
      n_trab_activos: trabPorEmpresa.get(e.id) ?? 0,
    };
  });

  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-10 sm:px-6">
      <EmpresasClient
        empresas={empresas}
        grupos={grupos}
        errorCarga={empresasRes.error?.message ?? null}
      />
    </main>
  );
}
