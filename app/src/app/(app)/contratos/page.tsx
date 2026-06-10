import { createClient } from "@/lib/supabase/server";
import {
  ContratosClient,
  type ContratoRow,
  type EmpresaForm,
} from "./contratos-client";

export const metadata = { title: "Contratos — RS Tax & Legal" };

export default async function ContratosPage() {
  const supabase = await createClient();

  // Empresas con plantillas de contrato (para el link del Form de solicitud)
  const { data: conPlantillas } = await supabase
    .from("plantillas_contrato")
    .select("cliente_id, clientes(id, razon_social, form_solicitud_url)")
    .eq("tipo_documento", "contrato")
    .eq("activo", true)
    .not("cliente_id", "is", null);

  const empresasMap = new Map<string, EmpresaForm>();
  for (const p of conPlantillas ?? []) {
    const cli = p.clientes as unknown as {
      id: string;
      razon_social: string;
      form_solicitud_url: string | null;
    } | null;
    if (cli && !empresasMap.has(cli.id)) {
      empresasMap.set(cli.id, {
        id: cli.id,
        razonSocial: cli.razon_social,
        formUrl: cli.form_solicitud_url,
      });
    }
  }

  const { data, error } = await supabase
    .from("contratos")
    .select(
      "id, estado, tipo_contrato, cargo, fecha_inicio, fecha_vencimiento, documento_path, created_at, clientes(razon_social), trabajadores(nombres, apellidos, rut, rut_provisorio), usuarios(nombre)",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  const filas: ContratoRow[] = (data ?? []).map((c) => {
    const cli = c.clientes as unknown as { razon_social: string } | null;
    const t = c.trabajadores as unknown as {
      nombres: string;
      apellidos: string;
      rut: string | null;
      rut_provisorio: boolean;
    } | null;
    const u = c.usuarios as unknown as { nombre: string } | null;
    return {
      id: c.id,
      estado: c.estado,
      tipoContrato: c.tipo_contrato,
      cargo: c.cargo,
      fechaInicio: c.fecha_inicio,
      fechaVencimiento: c.fecha_vencimiento,
      tieneDocumento: !!c.documento_path,
      empresa: cli?.razon_social ?? "—",
      trabajador: t ? `${t.nombres} ${t.apellidos}` : "—",
      rutTrabajador: t?.rut ?? (t?.rut_provisorio ? "(en trámite)" : "—"),
      creadoPor: u?.nombre ?? "—",
    };
  });

  return (
    <main className="mx-auto max-w-7xl px-4 pb-10 sm:px-6">
      <ContratosClient
        filas={filas}
        empresas={[...empresasMap.values()]}
        errorCarga={error?.message ?? null}
      />
    </main>
  );
}
