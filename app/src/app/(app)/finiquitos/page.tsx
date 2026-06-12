import { createClient } from "@/lib/supabase/server";
import { getUsuarioActual } from "@/lib/auth";
import { FiniquitosClient, type FiniquitoRow } from "./finiquitos-client";

export const metadata = { title: "Finiquitos — RS Tax & Legal" };

export default async function FiniquitosPage() {
  const usuario = await getUsuarioActual();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("solicitudes_rrhh")
    .select(
      "id, trabajador_nombre, trabajador_rut, correo_contacto, datos, estado, observaciones, created_at, clientes(razon_social)",
    )
    .eq("tipo", "finiquito")
    .order("created_at", { ascending: false })
    .limit(300);

  const filas: FiniquitoRow[] = (data ?? []).map((g) => {
    const cli = g.clientes as unknown as { razon_social: string } | null;
    const datos = (g.datos ?? {}) as Record<string, unknown>;
    const calculo = datos.calculo_finiquito as
      | {
          resumen?: {
            total?: number;
            remuneracionPendiente?: number;
            vacacionesMonto?: number;
            vacacionesDias?: number;
            indemAviso?: number;
            indemAnios?: number;
          };
          calculado_en?: string;
        }
      | undefined;
    const r = calculo?.resumen;
    return {
      id: g.id,
      trabajador: g.trabajador_nombre,
      rut: g.trabajador_rut ?? "—",
      empresa: cli?.razon_social ?? "—",
      causal: typeof datos.causal === "string" ? datos.causal : "",
      fechaTermino: typeof datos.fecha_termino === "string" ? datos.fecha_termino : null,
      estado: g.estado,
      totalCalculado: r?.total ?? null,
      calculadoEn: calculo?.calculado_en ?? null,
      resumen:
        r && typeof r.total === "number"
          ? {
              total: r.total,
              remuneracionPendiente: r.remuneracionPendiente ?? 0,
              vacacionesMonto: r.vacacionesMonto ?? 0,
              vacacionesDias: r.vacacionesDias ?? 0,
              indemAviso: r.indemAviso ?? 0,
              indemAnios: r.indemAnios ?? 0,
            }
          : null,
      creada: g.created_at,
    };
  });

  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-10 sm:px-6">
      <FiniquitosClient
        filas={filas}
        esAdmin={usuario.rol === "admin"}
        errorCarga={error?.message ?? null}
      />
    </main>
  );
}
