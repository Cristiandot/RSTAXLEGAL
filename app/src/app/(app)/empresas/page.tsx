import { createClient } from "@/lib/supabase/server";
import { EmpresasClient, type EmpresaFichaRow } from "./empresas-client";
import type { Socio } from "./actions";
import type { CampoDef, Catalogos, GrupoClienteOpcion } from "@/lib/onboarding";

export const metadata = { title: "Empresas — RS Tax & Legal" };

/** Campos con render propio (encabezado del diálogo o sección dedicada). */
const CAMPOS_ESPECIALES = new Set(["rut_empresa", "razon_social", "socios"]);

export default async function EmpresasPage() {
  const supabase = await createClient();

  const [empresasRes, gruposRes, pctRes, camposRes, catRes] =
    await Promise.all([
      supabase
        .from("clientes")
        .select(
          "id, razon_social, rut_empresa, grupo_id, tipo_sociedad, regimen_tributario, giro, actividades_sii, fecha_inicio_actividades, domicilio, comuna, ciudad, representante_legal, representante_legal_rut, socios, correo_empresa, correos_adicionales, telefono_empresa, contacto_nombre, contacto_correo, contacto_telefono",
        )
        .order("razon_social"),
      supabase
        .from("grupos_cliente")
        .select("id, codigo, nombre")
        .order("codigo"),
      supabase
        .from("v_onboarding_empresas")
        .select("cliente_id, pct_empresa, faltan_empresa"),
      supabase
        .from("onboarding_campos")
        .select("campo, etiqueta, grupo, fuente, selector, obligatorio, inmutable")
        .eq("entidad", "cliente")
        .eq("activo", true)
        .order("orden"),
      supabase
        .from("catalogo_valores")
        .select("tipo, codigo, etiqueta")
        .eq("activo", true)
        .order("orden")
        .order("etiqueta"),
    ]);

  const grupos: GrupoClienteOpcion[] = gruposRes.data ?? [];
  const grupoPorId = new Map(grupos.map((g) => [g.id, g]));

  const pctPorEmpresa = new Map<string, { pct: number | null; faltan: number }>();
  for (const p of pctRes.data ?? []) {
    pctPorEmpresa.set(p.cliente_id, {
      pct: p.pct_empresa === null ? null : Number(p.pct_empresa),
      faltan: Number(p.faltan_empresa) || 0,
    });
  }

  const fichaCampos: CampoDef[] = (camposRes.data ?? []).filter(
    (c) => !CAMPOS_ESPECIALES.has(c.campo),
  );

  const catalogos: Catalogos = {};
  for (const c of catRes.data ?? []) {
    (catalogos[c.tipo] ??= []).push({ codigo: c.codigo, etiqueta: c.etiqueta });
  }

  // Valor de cada campo como texto mostrable (null = falta → editable).
  function aTexto(campo: string, raw: unknown): string | null {
    if (raw === null || raw === undefined || raw === "") return null;
    if (campo === "socios" && Array.isArray(raw)) {
      const partes = raw.map((s) => {
        const o = s as { nombre?: string; rut?: string; participacion?: number };
        return [o.nombre, o.rut, o.participacion != null ? `${o.participacion}%` : null]
          .filter(Boolean)
          .join(" ");
      });
      return partes.join(" · ") || null;
    }
    if (campo === "actividades_sii" && Array.isArray(raw)) {
      return raw.map(String).join(" · ") || null;
    }
    return String(raw);
  }

  const empresas: EmpresaFichaRow[] = (empresasRes.data ?? []).map((e) => {
    const g = e.grupo_id ? grupoPorId.get(e.grupo_id) : undefined;
    const valores: Record<string, string | null> = {};
    for (const def of fichaCampos) {
      valores[def.campo] = aTexto(
        def.campo,
        (e as Record<string, unknown>)[def.campo],
      );
    }
    return {
      id: e.id,
      razon_social: e.razon_social,
      rut_empresa: e.rut_empresa,
      grupo_id: e.grupo_id,
      grupo_codigo: g?.codigo ?? null,
      grupo_nombre: g?.nombre ?? null,
      pct: pctPorEmpresa.get(e.id)?.pct ?? null,
      faltan: pctPorEmpresa.get(e.id)?.faltan ?? 0,
      valores,
      socios: Array.isArray(e.socios) ? (e.socios as Socio[]) : [],
      correos_adicionales: Array.isArray(e.correos_adicionales)
        ? (e.correos_adicionales as string[])
        : [],
    };
  });

  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-10 sm:px-6">
      <EmpresasClient
        empresas={empresas}
        grupos={grupos}
        fichaCampos={fichaCampos}
        catalogos={catalogos}
        errorCarga={empresasRes.error?.message ?? null}
      />
    </main>
  );
}
