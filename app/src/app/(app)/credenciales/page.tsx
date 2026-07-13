import { createClient } from "@/lib/supabase/server";
import { CredencialesClient, type CredencialRow } from "./credenciales-client";

export const metadata = { title: "Credenciales — RS Tax & Legal" };

export default async function CredencialesPage() {
  const supabase = await createClient();

  const [grupRes, cliRes] = await Promise.all([
    supabase.from("grupos_cliente").select("id, codigo, nombre"),
    supabase
      .from("clientes")
      .select(
        "id, razon_social, rut_empresa, previred_rut, clave_sii, previred_clave, activo, grupo_id, credencial_fijada",
      )
      .order("credencial_fijada", { ascending: false })
      .order("razon_social"),
  ]);

  const grupos = new Map(
    (grupRes.data ?? []).map((g) => [g.id, `${g.codigo} — ${g.nombre}`]),
  );

  // Las claves NO se mandan al navegador: acá se reducen a un booleano y el
  // valor real solo sale vía la server action revelarCredencial (auditada).
  const filas: CredencialRow[] = (cliRes.data ?? []).map((c) => ({
    id: c.id,
    razonSocial: c.razon_social,
    rut: c.rut_empresa,
    previredRut: c.previred_rut,
    tieneClaveSii: Boolean(c.clave_sii),
    tieneClavePrevired: Boolean(c.previred_clave),
    activo: c.activo ?? true,
    grupo: c.grupo_id ? (grupos.get(c.grupo_id) ?? null) : null,
    fijada: Boolean(c.credencial_fijada),
  }));

  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-10 sm:px-6">
      <CredencialesClient
        filas={filas}
        errorCarga={grupRes.error?.message ?? cliRes.error?.message ?? null}
      />
    </main>
  );
}
