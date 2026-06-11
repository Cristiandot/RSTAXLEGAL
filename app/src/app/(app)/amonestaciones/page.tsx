import { createClient } from "@/lib/supabase/server";
import { GestionesClient, type GestionRow } from "../gestiones/gestiones-client";

export const metadata = { title: "Carta amonestación — RS Tax & Legal" };

export default async function AmonestacionesPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("solicitudes_rrhh")
    .select("id, tipo, trabajador_nombre, trabajador_rut, correo_contacto, datos, estado, observaciones, created_at, clientes(razon_social)")
    .eq("tipo", "amonestacion")
    .order("created_at", { ascending: false })
    .limit(300);

  const filas: GestionRow[] = (data ?? []).map((g) => {
    const cli = g.clientes as unknown as { razon_social: string } | null;
    return {
      id: g.id,
      tipo: g.tipo,
      trabajador: g.trabajador_nombre,
      rut: g.trabajador_rut ?? "—",
      empresa: cli?.razon_social ?? "—",
      correo: g.correo_contacto ?? "—",
      datos: (g.datos ?? {}) as Record<string, string>,
      estado: g.estado,
      observaciones: g.observaciones,
      creada: g.created_at,
    };
  });

  return (
    <main className="mx-auto max-w-7xl px-4 pb-10 sm:px-6">
      <GestionesClient
        filas={filas}
        errorCarga={error?.message ?? null}
        titulo="Carta amonestación"
        descripcion="Amonestaciones solicitadas por los clientes: la carta se genera desde la plantilla con redacción formal de los hechos."
        tipoFijo="amonestacion"
      />
    </main>
  );
}
