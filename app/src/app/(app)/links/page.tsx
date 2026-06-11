import { createClient } from "@/lib/supabase/server";
import { LinksClient, type LinkClienteRow } from "./links-client";

export const metadata = { title: "Links clientes — RS Tax & Legal" };

export default async function LinksPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("clientes")
    .select("id, razon_social, rut_empresa, form_token, correo_empresa")
    .eq("activo", true)
    .order("razon_social");

  const filas: LinkClienteRow[] = (data ?? []).map((c) => ({
    id: c.id,
    razonSocial: c.razon_social,
    rut: c.rut_empresa,
    token: c.form_token,
    correo: c.correo_empresa,
  }));

  return (
    <main className="mx-auto max-w-7xl px-4 pb-10 sm:px-6">
      <LinksClient filas={filas} errorCarga={error?.message ?? null} />
    </main>
  );
}
