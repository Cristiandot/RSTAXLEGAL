import { createClient } from "@/lib/supabase/server";
import { LinksClient, type GrupoCliente, type LinkClienteRow } from "./links-client";

export const metadata = { title: "Links clientes — RS Tax & Legal" };

export default async function LinksPage() {
  const supabase = await createClient();

  const [grupRes, cliRes] = await Promise.all([
    supabase
      .from("grupos_cliente")
      .select("id, codigo, nombre, portal_slug, form_token, portal_pin_hash")
      .order("codigo"),
    supabase
      .from("clientes")
      .select("id, razon_social, rut_empresa, form_token, correo_empresa, grupo_id")
      .eq("activo", true)
      .order("razon_social"),
  ]);

  const grupos: GrupoCliente[] = (grupRes.data ?? []).map((g) => ({
    id: g.id,
    codigo: g.codigo,
    nombre: g.nombre,
    slug: g.portal_slug ?? null,
    token: g.form_token ?? null,
    tienePin: Boolean(g.portal_pin_hash),
  }));

  const filas: LinkClienteRow[] = (cliRes.data ?? []).map((c) => ({
    id: c.id,
    razonSocial: c.razon_social,
    rut: c.rut_empresa,
    token: c.form_token,
    correo: c.correo_empresa,
    grupoId: c.grupo_id,
  }));

  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-10 sm:px-6">
      <LinksClient
        grupos={grupos}
        filas={filas}
        errorCarga={grupRes.error?.message ?? cliRes.error?.message ?? null}
      />
    </main>
  );
}
