import { createClient } from "@/lib/supabase/server";
import { periodoActual, periodoPorDefecto, etiquetaPeriodo } from "@/lib/periodos";
import {
  ControlRcvClient,
  type EmpresaControl,
  type DescargaRcv,
  type TotalesRcv,
  type ReporteAvance,
} from "./control-rcv-client";

export const metadata = { title: "Control RCV — RS Tax & Legal" };

/** Todos los períodos (YYYY-MM) desde `desde` hasta el mes por defecto (mes anterior al actual). */
function periodosDesde(desde: string): string[] {
  const [yF, mF] = periodoPorDefecto().split("-").map(Number);
  const out: string[] = [];
  let [y, m] = desde.split("-").map(Number);
  while (y < yF || (y === yF && m <= mF)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (m === 12) { y++; m = 1; } else m++;
  }
  return out;
}

export default async function ControlRcvPage() {
  // Histórico completo cargado en la BD: 2025 entero + 2026 hasta el mes vigente.
  // El cliente filtra por año (pestañas), así la grilla no muestra 18 columnas de golpe.
  const periodos = periodosDesde("2025-01");
  // Mes EN CURSO (no va en la grilla de meses): alimenta el reporte de avance
  // del día 23 — acumulado de compras/ventas para que el cliente decida.
  const periodoEnCurso = periodoActual();
  const periodosConActual = [...periodos, periodoEnCurso];
  const supabase = await createClient();

  const [empresasRes, gruposRes, descargasRes, totalesRes, reportesRes] = await Promise.all([
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
    supabase
      .from("rcv_descargas")
      .select(
        "cliente_id, periodo, ventas_docs, compras_docs, ventas_docs_sii, compras_docs_sii, ventas_total_sii, compras_total_sii, alto_volumen, ultima_descarga",
      )
      .in("periodo", periodosConActual),
    // Totales del registro por empresa y mes (ventas, compras y NC) para la
    // cuadratura visual de la contadora contra el SII (+ el mes en curso).
    supabase.from("v_rcv_totales_periodo").select("*").in("periodo", periodosConActual),
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

  const descargas = (descargasRes.data ?? []) as DescargaRcv[];
  const totales = (totalesRes.data ?? []) as TotalesRcv[];
  const reportes = (reportesRes.data ?? []) as ReporteAvance[];

  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-10 sm:px-6">
      <ControlRcvClient
        periodos={periodos}
        etiquetas={periodos.map(etiquetaPeriodo)}
        empresas={empresas}
        descargas={descargas}
        totales={totales}
        periodoEnCurso={periodoEnCurso}
        reportes={reportes}
        errorCarga={empresasRes.error?.message ?? descargasRes.error?.message ?? null}
      />
    </main>
  );
}
