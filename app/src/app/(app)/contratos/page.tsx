import { createClient } from "@/lib/supabase/server";
import { getUsuarioActual } from "@/lib/auth";
import { ContratosClient, type ContratoRow } from "./contratos-client";

export const metadata = { title: "Contratos — RS Tax & Legal" };

export default async function ContratosPage() {
  const usuario = await getUsuarioActual();
  const supabase = await createClient();

  const [{ data, error }, { data: indic }] = await Promise.all([
    supabase
      .from("contratos")
      .select(
        "id, estado, tipo_contrato, tipo_documento, anexo_tipo, anexo_detalle, cargo, jornada, remuneracion, fecha_inicio, fecha_vencimiento, documento_path, clausulas_adicionales, created_at, clientes(razon_social), trabajadores(nombres, apellidos, rut, rut_provisorio, afp, salud), usuarios(nombre)",
      )
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("indicadores_previred")
      .select("periodo, rmi_general, utm, afp")
      .order("periodo", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const filas: ContratoRow[] = (data ?? []).map((c) => {
    const cli = c.clientes as unknown as { razon_social: string } | null;
    const t = c.trabajadores as unknown as {
      nombres: string;
      apellidos: string;
      rut: string | null;
      rut_provisorio: boolean;
      afp: string | null;
      salud: string | null;
    } | null;
    const u = c.usuarios as unknown as { nombre: string } | null;
    const j = c.jornada as { horas_semanales?: number | string | null } | null;
    return {
      id: c.id,
      estado: c.estado,
      tipoDocumento: c.tipo_documento ?? "contrato",
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
      remuneracion: (c.remuneracion ?? null) as Record<string, unknown> | null,
      afp: t?.afp ?? null,
      salud: t?.salud ?? null,
    };
  });

  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-10 sm:px-6">
      <ContratosClient
        filas={filas}
        errorCarga={error?.message ?? null}
        esAdmin={usuario.rol === "admin"}
        indicadores={
          indic
            ? {
                periodo: indic.periodo as string,
                imm: Number(indic.rmi_general ?? 0),
                utm: indic.utm != null ? Number(indic.utm) : null,
                tasasAfp: (indic.afp ?? []) as { nombre: string; tasa_trabajador: number }[],
              }
            : null
        }
      />
    </main>
  );
}
