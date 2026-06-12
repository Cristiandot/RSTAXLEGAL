import { createClient } from "@/lib/supabase/server";
import { LicenciasClient, type LicenciaRow } from "./licencias-client";

export const metadata = { title: "Licencias médicas — RS Tax & Legal" };

export default async function LicenciasPage() {
  const supabase = await createClient();

  const [{ data: licencias, error }, { data: clientes }] = await Promise.all([
    supabase
      .from("licencias_medicas")
      .select(
        "id, cliente_id, trabajador_id, empresa_nombre, empresa_rut, trabajador_nombre, trabajador_rut, tipo, folio, codigo_verificacion, dias, fecha_inicio, fecha_termino, entidad, estado, en_planilla, observacion, created_at, clientes(razon_social)",
      )
      .order("fecha_inicio", { ascending: false, nullsFirst: false })
      .limit(800),
    supabase
      .from("clientes")
      .select("id, razon_social, rut_empresa")
      .eq("activo", true)
      .order("razon_social"),
  ]);

  const filas: LicenciaRow[] = (licencias ?? []).map((l) => {
    const cli = l.clientes as unknown as { razon_social: string } | null;
    return {
      id: l.id,
      clienteId: l.cliente_id,
      trabajadorId: l.trabajador_id,
      empresa: cli?.razon_social ?? l.empresa_nombre ?? "—",
      empresaRut: l.empresa_rut,
      trabajador: l.trabajador_nombre,
      trabajadorRut: l.trabajador_rut,
      tipo: l.tipo,
      folio: l.folio,
      codigo: l.codigo_verificacion,
      dias: l.dias,
      inicio: l.fecha_inicio,
      termino: l.fecha_termino,
      entidad: l.entidad,
      estado: l.estado,
      enPlanilla: l.en_planilla,
      observacion: l.observacion,
      creada: l.created_at,
    };
  });

  return (
    // grilla ancha: más que el estándar del panel (1280px) pero sin desparramarse
    <main className="mx-auto max-w-[1600px] px-4 pb-10 sm:px-6">
      <LicenciasClient
        filas={filas}
        clientes={(clientes ?? []).map((c) => ({
          id: c.id,
          nombre: c.razon_social,
          rut: c.rut_empresa,
        }))}
        errorCarga={error?.message ?? null}
      />
    </main>
  );
}
