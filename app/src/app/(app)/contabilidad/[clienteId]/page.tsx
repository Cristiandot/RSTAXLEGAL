import { createClient } from "@/lib/supabase/server";
import { normalizarPeriodo } from "@/lib/periodos";
import type { ConciliacionRow, IvaEjecucionRow, UsuarioOpcion } from "@/lib/ciclos";
import type { DocumentoContable } from "../contabilidad-client";
import { ClienteContabilidadClient, type GastoMenor } from "./cliente-client";

export const metadata = { title: "Contabilidad del cliente — RS Tax & Legal" };

function rangoPeriodo(periodo: string): { inicio: string; fin: string } {
  const [y, m] = periodo.split("-").map(Number);
  const sgte = new Date(y, m, 1);
  const fin = `${sgte.getFullYear()}-${String(sgte.getMonth() + 1).padStart(2, "0")}-01`;
  return { inicio: `${periodo}-01`, fin };
}

export default async function ClienteContabilidadPage({
  params,
  searchParams,
}: {
  params: Promise<{ clienteId: string }>;
  searchParams: Promise<{ periodo?: string }>;
}) {
  const { clienteId } = await params;
  const { periodo: p } = await searchParams;
  const periodo = normalizarPeriodo(p);
  const supabase = await createClient();
  const { inicio, fin } = rangoPeriodo(periodo);
  const anio = Number(periodo.slice(0, 4));

  const [usuariosRes, filaRes, docsRes, ivaRes, gastosRes, clienteRes] = await Promise.all([
    supabase.from("usuarios").select("id, nombre").eq("activo", true).order("nombre"),
    supabase
      .from("v_checklist_conciliacion")
      .select("*")
      .eq("periodo", periodo)
      .eq("cliente_id", clienteId)
      .maybeSingle(),
    supabase
      .from("documentos_contables")
      .select(
        "id, cliente_id, categoria, etiqueta, archivo_path, nombre_original, tamano_bytes, created_at, usuarios(nombre)",
      )
      .eq("cliente_id", clienteId)
      .eq("periodo", periodo)
      .eq("activo", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("iva_salud_ejecucion")
      .select("id, cliente_id, fecha_ejecutada, observaciones, usuarios(nombre)")
      .eq("cliente_id", clienteId)
      .gte("fecha_ejecutada", inicio)
      .lt("fecha_ejecutada", fin)
      .order("fecha_ejecutada", { ascending: false }),
    supabase
      .from("gastos_menores")
      .select("id, tipo, fecha, descripcion, monto, origen, created_at, documento_path")
      .eq("cliente_id", clienteId)
      .eq("activo", true)
      .gte("fecha", `${anio}-01-01`)
      .lte("fecha", `${anio}-12-31`)
      .order("fecha", { ascending: false }),
    supabase
      .from("clientes")
      .select("hace_contabilidad_completa, activo")
      .eq("id", clienteId)
      .maybeSingle(),
  ]);

  // Auto-crear el ciclo del período si no existe (meses históricos o nuevos):
  // sin esto, el detalle bloqueaba la carga de documentos con "no tiene ciclo".
  // Idempotente gracias a la única (cliente_id, periodo).
  let fila = (filaRes.data as ConciliacionRow | null) ?? null;
  if (!fila && !filaRes.error && clienteRes.data?.activo) {
    await supabase
      .from("ciclo_conciliacion")
      .upsert(
        { cliente_id: clienteId, periodo },
        { onConflict: "cliente_id,periodo", ignoreDuplicates: true },
      );
    const { data: creada } = await supabase
      .from("v_checklist_conciliacion")
      .select("*")
      .eq("periodo", periodo)
      .eq("cliente_id", clienteId)
      .maybeSingle();
    fila = (creada as ConciliacionRow | null) ?? null;
  }

  const documentos: DocumentoContable[] = (docsRes.data ?? []).map((d) => {
    const u = d.usuarios as unknown as
      | { nombre: string }
      | { nombre: string }[]
      | null;
    return {
      id: d.id,
      cliente_id: d.cliente_id,
      categoria: d.categoria as DocumentoContable["categoria"],
      etiqueta: d.etiqueta,
      archivo_path: d.archivo_path,
      nombre_original: d.nombre_original,
      tamano_bytes: d.tamano_bytes,
      created_at: d.created_at,
      subido_por_nombre: (Array.isArray(u) ? u[0]?.nombre : u?.nombre) ?? null,
    };
  });

  const ivaEjecuciones: IvaEjecucionRow[] = (ivaRes.data ?? []).map((e) => {
    const u = e.usuarios as unknown as
      | { nombre: string }
      | { nombre: string }[]
      | null;
    return {
      id: e.id,
      cliente_id: e.cliente_id,
      fecha_ejecutada: e.fecha_ejecutada,
      observaciones: e.observaciones,
      responsable_nombre: (Array.isArray(u) ? u[0]?.nombre : u?.nombre) ?? null,
    };
  });

  return (
    <main className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
      <ClienteContabilidadClient
        periodo={periodo}
        fila={fila}
        usuarios={(usuariosRes.data ?? []) as UsuarioOpcion[]}
        documentos={documentos}
        ivaEjecuciones={ivaEjecuciones}
        gastosMenores={(gastosRes.data ?? []) as GastoMenor[]}
        contabilidadCompleta={clienteRes.data?.hace_contabilidad_completa === true}
        errorCarga={filaRes.error?.message ?? null}
      />
    </main>
  );
}
