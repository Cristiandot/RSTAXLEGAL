import { createClient } from "@/lib/supabase/server";
import { CredencialesClient, type CredencialRow } from "./credenciales-client";

export const metadata = { title: "Credenciales — RS Tax & Legal" };

export default async function CredencialesPage() {
  const supabase = await createClient();

  const [grupRes, cliRes, extraRes] = await Promise.all([
    supabase.from("grupos_cliente").select("id, codigo, nombre"),
    supabase
      .from("clientes")
      .select(
        "id, razon_social, rut_empresa, previred_rut, clave_sii, previred_clave, mutual_institucion, mutual_rut, mutual_clave, afc_rut, afc_clave, sii_rep_rut, sii_rep_clave, midt_rut, midt_clave, activo, grupo_id, credencial_fijada",
      )
      .order("credencial_fijada", { ascending: false })
      .order("razon_social"),
    // Otros accesos: la clave se reduce a booleano; el valor sale vía revelarCredencialExtra.
    supabase
      .from("credenciales_extra")
      .select("id, cliente_id, sistema, usuario, clave, url, notas")
      .order("sistema"),
  ]);

  const grupos = new Map(
    (grupRes.data ?? []).map((g) => [g.id, `${g.codigo} — ${g.nombre}`]),
  );

  const extrasPorCliente = new Map<string, CredencialRow["extras"]>();
  for (const e of extraRes.data ?? []) {
    const lista = extrasPorCliente.get(e.cliente_id) ?? [];
    lista.push({
      id: e.id,
      sistema: e.sistema,
      usuario: e.usuario,
      url: e.url,
      notas: e.notas,
      tieneClave: Boolean(e.clave),
    });
    extrasPorCliente.set(e.cliente_id, lista);
  }

  // Las claves NO se mandan al navegador: acá se reducen a un booleano y el
  // valor real solo sale vía la server action revelarCredencial (auditada).
  const filas: CredencialRow[] = (cliRes.data ?? []).map((c) => ({
    id: c.id,
    razonSocial: c.razon_social,
    rut: c.rut_empresa,
    previredRut: c.previred_rut,
    tieneClaveSii: Boolean(c.clave_sii),
    tieneClavePrevired: Boolean(c.previred_clave),
    mutualInstitucion: c.mutual_institucion,
    mutualRut: c.mutual_rut,
    tieneClaveMutual: Boolean(c.mutual_clave),
    afcRut: c.afc_rut,
    tieneClaveAfc: Boolean(c.afc_clave),
    siiRepRut: c.sii_rep_rut,
    tieneClaveSiiRep: Boolean(c.sii_rep_clave),
    midtRut: c.midt_rut,
    tieneClaveMidt: Boolean(c.midt_clave),
    activo: c.activo ?? true,
    grupo: c.grupo_id ? (grupos.get(c.grupo_id) ?? null) : null,
    fijada: Boolean(c.credencial_fijada),
    extras: extrasPorCliente.get(c.id) ?? [],
  }));

  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-10 sm:px-6">
      <CredencialesClient
        filas={filas}
        errorCarga={
          grupRes.error?.message ??
          cliRes.error?.message ??
          extraRes.error?.message ??
          null
        }
      />
    </main>
  );
}
