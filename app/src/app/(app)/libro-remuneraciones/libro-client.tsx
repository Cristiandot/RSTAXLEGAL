"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Upload, Trash2, BookText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMonto } from "@/lib/format";
import { componerPeriodo } from "@/lib/periodos";
import { subirLibro, descargarLibro, marcarEstado, eliminarLibro } from "./actions";

export type EmpresaOpcion = {
  id: string;
  razon_social: string;
  rut_empresa: string | null;
  previred_rut: string | null;
};

export type LibroRow = {
  id: string;
  cliente_id: string;
  periodo: string;
  rut_empleador: string | null;
  n_trabajadores: number | null;
  total_liquido: number | string | null;
  estado: string;
  fecha_carga_dt: string | null;
  jornada_provisional: boolean;
  causal_provisional: boolean;
};

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const ESTADOS: Record<string, { label: string; clase: string }> = {
  cargado: { label: "Cargado", clase: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" },
  subido_dt: { label: "Subido a DT", clase: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  declarado: { label: "Declarado", clase: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  observaciones: { label: "Con observaciones", clase: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300" },
};

const ANIOS = ["2026", "2025"];

export function LibroClient({
  empresas,
  filas,
  errorCarga,
}: {
  empresas: EmpresaOpcion[];
  filas: LibroRow[];
  errorCarga: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [empresaId, setEmpresaId] = useState(empresas[0]?.id ?? "");
  const [anio, setAnio] = useState("2026");
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const periodoObjetivo = useRef<string>("");

  const empresa = empresas.find((e) => e.id === empresaId) ?? null;

  const porPeriodo = useMemo(() => {
    const m = new Map<string, LibroRow>();
    for (const f of filas) if (f.cliente_id === empresaId) m.set(f.periodo, f);
    return m;
  }, [filas, empresaId]);

  const cargados = useMemo(
    () => Array.from({ length: 12 }, (_, i) => porPeriodo.has(componerPeriodo(anio, i + 1))).filter(Boolean).length,
    [porPeriodo, anio],
  );

  function pedirArchivo(periodo: string) {
    periodoObjetivo.current = periodo;
    fileRef.current?.click();
  }

  function onArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !empresaId) return;
    const periodo = periodoObjetivo.current;
    const fd = new FormData();
    fd.set("clienteId", empresaId);
    fd.set("periodo", periodo);
    fd.set("archivo", file);
    setSubiendo(periodo);
    startTransition(async () => {
      const r = await subirLibro(fd);
      setSubiendo(null);
      if (!r.ok) { toast.error(r.error ?? "No se pudo subir."); return; }
      const av: string[] = [];
      if (r.resumen?.jornadaProvisional) av.push(`jornada provisional en ${r.resumen.jornadaProvisional}`);
      if (r.resumen?.causalProvisional) av.push(`${r.resumen.causalProvisional} causal(es) provisional(es)`);
      if (r.resumen?.faltaRegionComuna) av.push(`${r.resumen.faltaRegionComuna} sin región/comuna`);
      toast.success(
        `LRE cargado y corregido · ${r.resumen?.nTrabajadores} trabajadores · líquido ${formatMonto(r.resumen?.totalLiquido)}`,
        { description: av.length ? `Ojo: ${av.join(", ")}.` : "Formato DT validado." },
      );
      router.refresh();
    });
  }

  function descargar(id: string) {
    startTransition(async () => {
      const r = await descargarLibro(id);
      if (!r.ok || !r.url) { toast.error(r.error ?? "No se pudo descargar."); return; }
      window.location.href = r.url;
    });
  }

  function cambiarEstado(id: string, estado: LibroRow["estado"]) {
    startTransition(async () => {
      const r = await marcarEstado(id, estado as "cargado" | "subido_dt" | "declarado" | "observaciones");
      if (!r.ok) { toast.error(r.error ?? "No se pudo actualizar."); return; }
      router.refresh();
    });
  }

  function borrar(id: string, periodo: string) {
    if (!confirm(`¿Eliminar el LRE de ${periodo}? Se borra el archivo cargado.`)) return;
    startTransition(async () => {
      const r = await eliminarLibro(id);
      if (!r.ok) { toast.error(r.error ?? "No se pudo eliminar."); return; }
      toast.success("Período eliminado.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5 py-4">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-400">
          <BookText className="size-3.5" /> Gestiones · Recursos humanos
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Libro de Remuneraciones</h1>
        <p className="text-sm text-muted-foreground">
          El LRE de cada empresa por mes, corregido al formato de la Dirección del Trabajo y listo para cargar en Mi DT.
        </p>
      </header>

      {errorCarga ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
          Error cargando datos: {errorCarga}
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-1 min-w-[240px] flex-col gap-1 text-sm">
          <span className="font-medium text-muted-foreground">Empresa</span>
          <select
            value={empresaId}
            onChange={(e) => setEmpresaId(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>{e.razon_social}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-muted-foreground">Año</span>
          <select
            value={anio}
            onChange={(e) => setAnio(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {ANIOS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <div className="ml-auto rounded-md bg-muted px-3 py-2 text-sm">
          <span className="font-semibold tabular-nums">{cargados}</span>
          <span className="text-muted-foreground"> / 12 meses cargados</span>
        </div>
      </div>

      <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onArchivo} />

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 text-left">Período</th>
              <th className="px-4 py-2.5 text-left">Estado DT</th>
              <th className="px-4 py-2.5 text-right">Trab.</th>
              <th className="px-4 py-2.5 text-right">Total líquido</th>
              <th className="px-4 py-2.5 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {MESES.map((mes, i) => {
              const periodo = componerPeriodo(anio, i + 1);
              const row = porPeriodo.get(periodo);
              const estado = row ? ESTADOS[row.estado] ?? ESTADOS.cargado : null;
              const cargando = subiendo === periodo && pending;
              return (
                <tr key={periodo} className="border-t">
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{mes}</span>{" "}
                    <span className="text-muted-foreground">{anio}</span>
                    {row && (row.jornada_provisional || row.causal_provisional) ? (
                      <Badge variant="outline" className="ml-2 border-amber-300 text-amber-700 dark:text-amber-400">
                        Provisional
                      </Badge>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5">
                    {row ? (
                      <select
                        value={row.estado}
                        onChange={(e) => cambiarEstado(row.id, e.target.value as LibroRow["estado"])}
                        disabled={pending}
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${estado?.clase}`}
                      >
                        {Object.entries(ESTADOS).map(([k, v]) => (
                          <option key={k} value={k}>{v.label}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs text-muted-foreground">Sin subir</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{row?.n_trabajadores ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {row?.total_liquido != null ? formatMonto(row.total_liquido) : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1.5">
                      {row ? (
                        <>
                          <Button size="sm" variant="outline" onClick={() => descargar(row.id)} disabled={pending}>
                            <Download className="size-3.5" /> Descargar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => pedirArchivo(periodo)} disabled={pending}>
                            <Upload className="size-3.5" /> Reemplazar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => borrar(row.id, `${mes} ${anio}`)} disabled={pending}
                            className="text-rose-600 hover:text-rose-700">
                            <Trash2 className="size-3.5" />
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => pedirArchivo(periodo)} disabled={pending}>
                          <Upload className="size-3.5" /> {cargando ? "Subiendo…" : "Subir LRE"}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Al subir el CSV de KAME se corrige automáticamente al formato DT (fechas dd/mm/aaaa, columnas obligatorias, causal de término).
        La <strong>jornada</strong> y la <strong>causal</strong> que KAME no exporta quedan en valor provisional (jornada 101, causal 6) para cuadrar en la nómina real de junio.
      </p>
    </div>
  );
}
