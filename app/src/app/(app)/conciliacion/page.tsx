import { redirect } from "next/navigation";

/**
 * El módulo Conciliación evolucionó a Contabilidad mensual (/contabilidad):
 * misma checklist por empresa + carga de documentos del SII. Se mantiene la
 * ruta vieja como redirect por marcadores y costumbre del equipo.
 */
export default async function ConciliacionRedirect({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const { periodo } = await searchParams;
  redirect(periodo ? `/contabilidad?periodo=${periodo}` : "/contabilidad");
}
