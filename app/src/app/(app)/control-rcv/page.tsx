import { createClient } from "@/lib/supabase/server";
import { periodoActual, etiquetaPeriodo } from "@/lib/periodos";
import {
  ControlRcvClient,
  type EmpresaControl,
  type DescargaRcv,
  type TotalesRcv,
  type BteTotal,
  type ReporteAvance,
} from "./control-rcv-client";

export const metadata = { title: "Control RCV — RS Tax & Legal" };

/** Todos los períodos (YYYY-MM) desde `desde` hasta `hasta` inclusive. */
function periodosEntre(desde: string, hasta: string): string[] {
  const [yF, mF] = hasta.split("-").map(Number);
  const out: string[] = [];
  let [y, m] = desde.split("-").map(Number);
  while (y < yF || (y === yF && m <= mF)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (m === 12) { y++; m = 1; } else m++;
  }
  return out;
}

/**
 * Trae TODAS las filas de una consulta paginando de a 1.000. Este proyecto
 * Supabase tiene un tope duro de 1.000 filas en PostgREST que IGNORA el
 * `.limit()`, así que con el histórico (2025+2026 × ~127 empresas = 2.400+
 * filas) la consulta se truncaba en silencio y los meses cortados salían como
 * "falta". Paginar con `.range()` es la única forma robusta e independiente de
 * la configuración del proyecto. Requiere un orden estable para no saltar filas.
 */
async function traerTodo<T>(
  construir: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ rows: T[]; error: string | null }> {
  const TAM = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += TAM) {
    const { data, error } = await construir(from, from + TAM - 1);
    if (error) return { rows, error: error.message };
    const lote = data ?? [];
    rows.push(...lote);
    if (lote.length < TAM) break;
  }
  return { rows, error: null };
}

export default async function ControlRcvPage() {
  // Mes EN CURSO incluido: la grilla llega hasta el mes vigente (julio hoy), no
  // solo hasta el mes cerrado, para que la contadora vea el avance del mes y
  // pueda enviar el reporte del día 23. El cliente filtra por año (pestañas).
  const periodoEnCurso = periodoActual();
  const periodos = periodosEntre("2025-01", periodoEnCurso);
  const periodosConActual = periodos; // el mes en curso ya está incluido
  const supabase = await createClient();

  const [empresasRes, gruposRes, descargasAll, totalesAll, bteTotalesAll, reportesRes] = await Promise.all([
    // Solo empresas a las que les llevamos el RCV/contabilidad: hacen F29 (que se
    // arma del RCV) o contabilidad completa. Excluye casa particular, solo-RRHH,
    // solo-legal y trabajos puntuales.
    supabase
      .from("clientes")
      .select("id, razon_social, rut_empresa, clave_sii, hace_contabilidad_completa, grupo_id, correo_empresa")
      .eq("activo", true)
      .eq("es_oficina", false)
      .or("hace_f29.eq.true,hace_contabilidad_completa.eq.true")
      .order("razon_social"),
    supabase.from("grupos_cliente").select("id, codigo"),
    // Paginadas (ver traerTodo): superan el tope de 1.000 filas de PostgREST.
    traerTodo<DescargaRcv>((from, to) =>
      supabase
        .from("rcv_descargas")
        .select(
          "cliente_id, periodo, ventas_docs, compras_docs, ventas_docs_sii, compras_docs_sii, ventas_total_sii, compras_total_sii, alto_volumen, ultima_descarga",
        )
        .in("periodo", periodosConActual)
        .order("cliente_id")
        .order("periodo")
        .range(from, to),
    ),
    // Totales del registro por empresa y mes (ventas, compras y NC) para la
    // cuadratura visual de la contadora contra el SII (+ el mes en curso).
    traerTodo<TotalesRcv>((from, to) =>
      supabase
        .from("v_rcv_totales_periodo")
        .select("*")
        .in("periodo", periodosConActual)
        .order("cliente_id")
        .order("periodo")
        .range(from, to),
    ),
    // Totales de BTE (boletas de terceros) por empresa y mes: emitidas y recibidas.
    traerTodo<BteTotal>((from, to) =>
      supabase
        .from("v_bte_totales_periodo")
        .select("*")
        .in("periodo", periodosConActual)
        .order("cliente_id")
        .order("periodo")
        .range(from, to),
    ),
    // Reportes de avance ya enviados este mes (ritual del 23).
    supabase
      .from("rcv_reporte_avance")
      .select("cliente_id, periodo, fecha_corte, fecha_correo_enviado, destinatario, observaciones")
      .eq("periodo", periodoEnCurso),
  ]);

  const codigoPorGrupo = new Map<string, string>();
  for (const g of gruposRes.data ?? []) codigoPorGrupo.set(g.id as string, (g.codigo as string) ?? "");

  // La clave SII NUNCA viaja al navegador: solo el booleano de si existe.
  const empresas: EmpresaControl[] = (empresasRes.data ?? []).map((c) => ({
    id: c.id as string,
    razon_social: (c.razon_social as string) ?? "",
    rut_empresa: (c.rut_empresa as string) ?? "",
    tieneClave: Boolean(c.clave_sii),
    contabilidad: Boolean(c.hace_contabilidad_completa),
    grupoCodigo: (c.grupo_id ? codigoPorGrupo.get(c.grupo_id as string) : "") || "",
    correoEmpresa: (c.correo_empresa as string | null) ?? null,
  }));

  const descargas = descargasAll.rows;
  const totales = totalesAll.rows;
  const reportes = (reportesRes.data ?? []) as ReporteAvance[];

  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-10 sm:px-6">
      <ControlRcvClient
        periodos={periodos}
        etiquetas={periodos.map(etiquetaPeriodo)}
        empresas={empresas}
        descargas={descargas}
        totales={totales}
        bteTotales={bteTotalesAll.rows}
        periodoEnCurso={periodoEnCurso}
        reportes={reportes}
        errorCarga={empresasRes.error?.message ?? descargasAll.error ?? totalesAll.error ?? null}
      />
    </main>
  );
}
