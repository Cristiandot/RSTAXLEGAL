import { createClient } from "@/lib/supabase/server";
import { ExcelClient, type EmpresaExcel } from "./excel-client";

export const metadata = { title: "Excel compartidos — RS Tax & Legal" };

function periodoActual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function ExcelPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const { periodo: qp } = await searchParams;
  const periodo = /^\d{4}-\d{2}$/.test(qp ?? "") ? (qp as string) : periodoActual();

  const supabase = await createClient();

  const [trabRes, novRes, perRes, gesRes] = await Promise.all([
    supabase
      .from("trabajadores")
      .select("id, cliente_id, nombres, apellidos, activo, clientes(razon_social)")
      .order("apellidos")
      .limit(2000),
    supabase
      .from("novedades_remuneraciones")
      .select(
        "id, cliente_id, tipo, fecha, fecha_hasta, cantidad, monto, comentario, origen, trabajadores(nombres, apellidos)",
      )
      .eq("periodo", periodo)
      .limit(1000),
    supabase
      .from("periodos_remuneraciones")
      .select("cliente_id, estado, cerrado_at")
      .eq("periodo", periodo),
    supabase
      .from("solicitudes_rrhh")
      .select("id, cliente_id, tipo, trabajador_nombre, estado, datos")
      .in("tipo", ["permiso", "vacaciones", "finiquito"])
      .neq("estado", "rechazada")
      .limit(1000),
  ]);

  const errorCarga =
    trabRes.error?.message ?? novRes.error?.message ?? perRes.error?.message ??
    gesRes.error?.message ?? null;

  // Gestiones cuya fecha relevante cae en el período (misma regla que la RPC del portal)
  const gestionesMes = (gesRes.data ?? []).filter((g) => {
    const d = (g.datos ?? {}) as Record<string, string>;
    const fecha =
      g.tipo === "permiso" ? d.fecha_desde :
      g.tipo === "vacaciones" ? d.fecha_inicio : d.fecha_termino;
    return (fecha ?? "").slice(0, 7) === periodo;
  });

  const empresas = new Map<string, EmpresaExcel>();
  function empresaDe(clienteId: string, razonSocial: string): EmpresaExcel {
    let e = empresas.get(clienteId);
    if (!e) {
      e = {
        clienteId,
        razonSocial,
        estado: "abierto",
        trabajadores: [],
        novedades: [],
        gestiones: [],
      };
      empresas.set(clienteId, e);
    }
    return e;
  }

  for (const t of trabRes.data ?? []) {
    const cli = t.clientes as unknown as { razon_social: string } | null;
    const e = empresaDe(t.cliente_id, cli?.razon_social ?? "—");
    if (t.activo) {
      e.trabajadores.push({ id: t.id, nombre: `${t.apellidos} ${t.nombres}` });
    }
  }
  for (const n of novRes.data ?? []) {
    const e = empresas.get(n.cliente_id);
    if (!e) continue;
    const t = n.trabajadores as unknown as { nombres: string; apellidos: string } | null;
    e.novedades.push({
      id: n.id,
      trabajador: t ? `${t.nombres} ${t.apellidos}` : "—",
      tipo: n.tipo,
      fecha: n.fecha,
      fecha_hasta: n.fecha_hasta,
      cantidad: n.cantidad,
      monto: n.monto,
      comentario: n.comentario,
      origen: n.origen,
    });
  }
  for (const p of perRes.data ?? []) {
    const e = empresas.get(p.cliente_id);
    if (e) e.estado = p.estado as "abierto" | "cerrado";
  }
  for (const g of gestionesMes) {
    const e = empresas.get(g.cliente_id);
    if (!e) continue;
    e.gestiones.push({
      id: g.id,
      tipo: g.tipo,
      trabajador: g.trabajador_nombre,
      estado: g.estado,
      datos: (g.datos ?? {}) as Record<string, string>,
    });
  }

  const filas = [...empresas.values()].sort((a, b) =>
    a.razonSocial.localeCompare(b.razonSocial, "es"),
  );

  return (
    <main className="mx-auto max-w-7xl px-4 pb-10 sm:px-6">
      <ExcelClient empresas={filas} periodo={periodo} errorCarga={errorCarga} />
    </main>
  );
}
