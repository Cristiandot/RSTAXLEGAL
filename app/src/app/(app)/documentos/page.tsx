import { createClient } from "@/lib/supabase/server";
import { DocumentosClient, type SolicitudDocRow } from "./documentos-client";

export const metadata = { title: "Solicitudes de documentos — RS Tax & Legal" };

export default async function DocumentosPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("solicitudes_documento")
    .select(
      "id, area, tipo_documento, periodo, detalle, estado, origen, solicitado_por_correo, created_at, clientes(razon_social)",
    )
    .order("created_at", { ascending: false })
    .limit(500);

  const filas: SolicitudDocRow[] = (data ?? []).map((s) => {
    const cli = s.clientes as unknown as { razon_social: string } | null;
    return {
      id: s.id,
      empresa: cli?.razon_social ?? "—",
      area: s.area,
      tipoDocumento: s.tipo_documento,
      periodo: s.periodo,
      detalle: s.detalle,
      estado: s.estado,
      origen: s.origen,
      correo: s.solicitado_por_correo,
      creada: s.created_at,
    };
  });

  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-10 sm:px-6">
      <DocumentosClient filas={filas} errorCarga={error?.message ?? null} />
    </main>
  );
}
