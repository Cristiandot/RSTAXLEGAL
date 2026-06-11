import { createClient } from "@/lib/supabase/server";
import {
  ContratosClient,
  type ContratoRow,
} from "../contratos/contratos-client";

export const metadata = { title: "Anexos — RS Tax & Legal" };

export default async function AnexosPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("contratos")
    .select(
      "id, estado, tipo_contrato, tipo_documento, anexo_tipo, anexo_detalle, cargo, jornada, fecha_inicio, fecha_vencimiento, documento_path, clausulas_adicionales, created_at, clientes(razon_social), trabajadores(nombres, apellidos, rut, rut_provisorio), usuarios(nombre)",
    )
    .eq("tipo_documento", "anexo")
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
    const j = c.jornada as { horas_semanales?: number | string | null } | null;
    return {
      id: c.id,
      estado: c.estado,
      tipoDocumento: c.tipo_documento ?? "anexo",
      anexoTipo: c.anexo_tipo,
      anexoDetalle: c.anexo_detalle,
      jornadaHoras:
        j?.horas_semanales != null ? Number(j.horas_semanales) : null,
      clausulasAdicionales: c.clausulas_adicionales,
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
        empresas={[]}
        errorCarga={error?.message ?? null}
        titulo="Anexos"
        descripcion="Anexos de contrato solicitados por los clientes: renovaciones, cambios de jornada y otras modificaciones."
        mostrarHerramientasContrato={false}
      />
    </main>
  );
}
