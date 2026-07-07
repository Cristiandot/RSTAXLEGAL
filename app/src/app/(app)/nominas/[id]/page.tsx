import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fichasDeEmpresa } from "../actions";
import { EmpresaNominaClient, type EmpresaCabecera } from "./empresa-client";
import type { CampoDef, Catalogos } from "@/lib/onboarding";

export const metadata = { title: "Nómina de la empresa — RS Tax & Legal" };

export default async function EmpresaNominaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [empresaRes, pctRes, camposRes, catRes] = await Promise.all([
    supabase
      .from("clientes")
      .select(
        "id, razon_social, rut_empresa, grupo_id, regimen_tributario, giro, comuna, ciudad, contacto_nombre, contacto_correo, contacto_telefono, n_trabajadores_esperados, grupos_cliente(codigo, nombre)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("v_onboarding_empresas")
      .select("pct_trab, faltan_trab")
      .eq("cliente_id", id)
      .maybeSingle(),
    supabase
      .from("onboarding_campos")
      .select("campo, etiqueta, grupo, fuente, selector, obligatorio, inmutable")
      .eq("entidad", "trabajador")
      .eq("activo", true)
      .neq("campo", "rut")
      .order("orden"),
    supabase
      .from("catalogo_valores")
      .select("tipo, codigo, etiqueta")
      .eq("activo", true)
      .order("orden")
      .order("etiqueta"),
  ]);

  const e = empresaRes.data;
  if (!e) notFound();

  const fichas = await fichasDeEmpresa(id);

  const grupo = Array.isArray(e.grupos_cliente)
    ? e.grupos_cliente[0]
    : e.grupos_cliente;

  const empresa: EmpresaCabecera = {
    id: e.id,
    razon_social: e.razon_social,
    rut_empresa: e.rut_empresa,
    grupo_codigo: grupo?.codigo ?? null,
    grupo_nombre: grupo?.nombre ?? null,
    regimen_tributario: e.regimen_tributario,
    giro: e.giro,
    comuna: [e.comuna, e.ciudad].filter(Boolean).join(", ") || null,
    contacto_nombre: e.contacto_nombre,
    contacto_correo: e.contacto_correo,
    contacto_telefono: e.contacto_telefono,
    n_trabajadores_esperados:
      e.n_trabajadores_esperados === null
        ? null
        : Number(e.n_trabajadores_esperados),
    pct_trab:
      pctRes.data?.pct_trab === null || pctRes.data?.pct_trab === undefined
        ? null
        : Number(pctRes.data.pct_trab),
    faltan_trab: Number(pctRes.data?.faltan_trab) || 0,
  };

  const fichaCampos: CampoDef[] = camposRes.data ?? [];

  const catalogos: Catalogos = {};
  for (const c of catRes.data ?? []) {
    (catalogos[c.tipo] ??= []).push({ codigo: c.codigo, etiqueta: c.etiqueta });
  }

  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-10 sm:px-6">
      <EmpresaNominaClient
        empresa={empresa}
        fichas={fichas}
        fichaCampos={fichaCampos}
        catalogos={catalogos}
      />
    </main>
  );
}
