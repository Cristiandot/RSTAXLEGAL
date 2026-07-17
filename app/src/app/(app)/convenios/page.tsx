import { createClient } from "@/lib/supabase/server";
import type { ConvenioRow, CuotaRow } from "@/lib/convenios";
import type { UsuarioOpcion } from "@/lib/ciclos";
import { ConveniosClient, type EmpresaOpcion } from "./convenios-client";

export const dynamic = "force-dynamic";

export default async function ConveniosPage() {
  const supabase = await createClient();

  const [conveniosRes, cuotasRes, empresasRes, usuariosRes] = await Promise.all([
    supabase.from("v_convenios").select("*").order("razon_social"),
    supabase
      .from("convenio_cuota")
      .select("id, convenio_id, n_cuota, monto, fecha_vencimiento, fecha_pago")
      .order("n_cuota"),
    supabase
      .from("clientes")
      .select("id, razon_social, rut_empresa")
      .eq("activo", true)
      .order("razon_social"),
    supabase.from("usuarios").select("id, nombre").eq("activo", true).order("nombre"),
  ]);

  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-10 sm:px-6">
      <ConveniosClient
        convenios={(conveniosRes.data ?? []) as ConvenioRow[]}
        cuotas={(cuotasRes.data ?? []) as CuotaRow[]}
        empresas={(empresasRes.data ?? []) as EmpresaOpcion[]}
        usuarios={(usuariosRes.data ?? []) as UsuarioOpcion[]}
        errorCarga={conveniosRes.error?.message ?? null}
      />
    </main>
  );
}
