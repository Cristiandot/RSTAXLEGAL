"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Trash2, BookText, Search, ChevronsUpDown, Check, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { formatMonto, formatFecha } from "@/lib/format";
import { componerPeriodo } from "@/lib/periodos";
import { descargarLibro, marcarEstado, marcarSinMovimiento, eliminarLibro } from "./actions";

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

const ANIOS = ["2026", "2025"];

const norm = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Combobox con buscador para elegir empresa entre toda la cartera. */
function BuscadorEmpresa({
  empresas,
  valor,
  onChange,
}: {
  empresas: EmpresaOpcion[];
  valor: string;
  onChange: (id: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");
  const sel = empresas.find((e) => e.id === valor);
  const filtradas = useMemo(() => {
    const n = norm(q.trim());
    if (!n) return empresas;
    return empresas.filter(
      (e) => norm(e.razon_social).includes(n) || (e.rut_empresa ?? "").includes(n),
    );
  }, [empresas, q]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm"
      >
        <span className="truncate">{sel?.razon_social ?? "Selecciona empresa…"}</span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
      </button>
      {abierto ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setAbierto(false)} />
          <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover shadow-md">
            <div className="flex items-center gap-2 border-b px-3">
              <Search className="size-4 opacity-50" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por razón social o RUT…"
                className="h-9 w-full bg-transparent text-sm outline-none"
              />
            </div>
            <ul className="max-h-72 overflow-y-auto py-1">
              {filtradas.length === 0 ? (
                <li className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</li>
              ) : (
                filtradas.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => { onChange(e.id); setAbierto(false); setQ(""); }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent"
                    >
                      <Check className={`size-4 shrink-0 ${e.id === valor ? "opacity-100" : "opacity-0"}`} />
                      <span className="truncate">{e.razon_social}</span>
                      {e.rut_empresa ? (
                        <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">{e.rut_empresa}</span>
                      ) : null}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
}

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
  const pendientesRef = useRef<HTMLElement | null>(null);
  const grillaRef = useRef<HTMLElement | null>(null);

  const irAGrilla = (id: string) => {
    setEmpresaId(id);
    requestAnimationFrame(() => grillaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const irAPendientes = () =>
    pendientesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const porPeriodo = useMemo(() => {
    const m = new Map<string, LibroRow>();
    for (const f of filas) if (f.cliente_id === empresaId) m.set(f.periodo, f);
    return m;
  }, [filas, empresaId]);

  const cargados = useMemo(
    () => Array.from({ length: 12 }, (_, i) => {
      const r = porPeriodo.get(componerPeriodo(anio, i + 1));
      return r && r.estado !== "sin_movimiento";
    }).filter(Boolean).length,
    [porPeriodo, anio],
  );

  // Completitud de carga a la DT: de los libros cargados de cada empresa,
  // cuántos están marcados como subidos a la DT (estado subido_dt/declarado).
  const resumen = useMemo(() => {
    const esSubido = (estado: string) => estado === "subido_dt" || estado === "declarado";
    const cuenta = (f: LibroRow) => f.estado !== "sin_movimiento"; // sin movimiento no es un libro a declarar
    const libPor = new Map<string, { total: number; subidos: number }>();
    for (const f of filas) {
      if (!cuenta(f)) continue;
      const e = libPor.get(f.cliente_id) ?? { total: 0, subidos: 0 };
      e.total++;
      if (esSubido(f.estado)) e.subidos++;
      libPor.set(f.cliente_id, e);
    }
    // Todas las empresas con Previred (llegan filtradas del server), con su avance.
    const lista = empresas
      .map((emp) => {
        const v = libPor.get(emp.id) ?? { total: 0, subidos: 0 };
        return {
          id: emp.id, nombre: emp.razon_social, total: v.total, subidos: v.subidos,
          pct: v.total ? Math.round((v.subidos / v.total) * 100) : 0,
        };
      })
      .sort((a, b) => {
        const ka = a.total === 0 ? 0 : 1, kb = b.total === 0 ? 0 : 1;
        if (ka !== kb) return ka - kb; // sin ningún libro cargado, primero
        return a.pct - b.pct || a.nombre.localeCompare(b.nombre);
      });
    const total = filas.filter(cuenta).length;
    const subidos = filas.filter((f) => esSubido(f.estado)).length;
    return {
      lista, total, subidos,
      pct: total ? Math.round((subidos / total) * 100) : 0,
      completas: lista.filter((e) => e.total > 0 && e.pct === 100).length,
      sinCargar: lista.filter((e) => e.total === 0).length,
      totalEmpresas: empresas.length,
    };
  }, [filas, empresas]);

  function descargar(id: string) {
    startTransition(async () => {
      const r = await descargarLibro(id);
      if (!r.ok || !r.url) { toast.error(r.error ?? "No se pudo descargar."); return; }
      window.location.href = r.url;
    });
  }

  function toggleSubidoDt(row: LibroRow, subido: boolean) {
    startTransition(async () => {
      const r = await marcarEstado(row.id, subido ? "subido_dt" : "cargado");
      if (!r.ok) { toast.error(r.error ?? "No se pudo actualizar."); return; }
      toast.success(subido ? "Marcado como subido a la DT." : "Marca de DT quitada.");
      router.refresh();
    });
  }

  function borrar(id: string, etiqueta: string) {
    if (!confirm(`¿Eliminar el LRE de ${etiqueta}? Se borra el archivo cargado.`)) return;
    startTransition(async () => {
      const r = await eliminarLibro(id);
      if (!r.ok) { toast.error(r.error ?? "No se pudo eliminar."); return; }
      toast.success("Período eliminado.");
      router.refresh();
    });
  }

  function sinMovimiento(periodo: string) {
    startTransition(async () => {
      const r = await marcarSinMovimiento(empresaId, periodo);
      if (!r.ok) { toast.error(r.error ?? "No se pudo marcar."); return; }
      toast.success("Marcado como sin movimiento.");
      router.refresh();
    });
  }

  function quitarSinMovimiento(id: string) {
    startTransition(async () => {
      const r = await eliminarLibro(id);
      if (!r.ok) { toast.error(r.error ?? "No se pudo quitar."); return; }
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

      <section ref={pendientesRef} className="flex scroll-mt-4 flex-col gap-3 rounded-lg border p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Completitud de carga a la DT</h2>
          <span className="text-xs text-muted-foreground">
            {resumen.completas}/{resumen.totalEmpresas} empresas al día · {resumen.sinCargar} sin cargar
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {resumen.subidos} de {resumen.total} libros subidos a la DT
            </span>
            <span className="font-semibold tabular-nums">{resumen.pct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${resumen.pct === 100 ? "bg-emerald-500" : "bg-teal-500"}`}
              style={{ width: `${resumen.pct}%` }}
            />
          </div>
        </div>
        {resumen.lista.length ? (
          <ul className="flex max-h-96 flex-col overflow-y-auto">
            {resumen.lista.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => irAGrilla(e.id)}
                  className={`flex w-full items-center gap-3 rounded px-1.5 py-2 text-left text-sm hover:bg-accent/60 ${e.id === empresaId ? "bg-accent/40" : ""}`}
                >
                  <span className="flex-1 truncate">{e.nombre}</span>
                  {e.total === 0 ? (
                    <span className="shrink-0 text-xs italic text-muted-foreground">Sin cargar</span>
                  ) : (
                    <>
                      <div className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-muted sm:w-32">
                        <div
                          className={`h-full rounded-full ${e.pct === 100 ? "bg-emerald-500" : "bg-teal-500"}`}
                          style={{ width: `${e.pct}%` }}
                        />
                      </div>
                      <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{e.subidos}/{e.total}</span>
                      <span className="w-10 shrink-0 text-right text-xs font-medium tabular-nums">{e.pct}%</span>
                    </>
                  )}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No hay empresas con Previred cargadas.</p>
        )}
      </section>

      <section ref={grillaRef} className="flex scroll-mt-4 flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-1 min-w-[260px] flex-col gap-1 text-sm">
          <span className="font-medium text-muted-foreground">Empresa</span>
          <BuscadorEmpresa empresas={empresas} valor={empresaId} onChange={setEmpresaId} />
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
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={irAPendientes}>
            <ListChecks className="size-3.5" /> Ver empresas pendientes
          </Button>
          <div className="rounded-md bg-muted px-3 py-2 text-sm">
            <span className="font-semibold tabular-nums">{cargados}</span>
            <span className="text-muted-foreground"> / 12 meses cargados</span>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 text-left">Período</th>
              <th className="px-4 py-2.5 text-right">Trab.</th>
              <th className="px-4 py-2.5 text-right">Total líquido</th>
              <th className="px-4 py-2.5 text-center">Subido a la DT</th>
              <th className="px-4 py-2.5 text-right">Archivo</th>
            </tr>
          </thead>
          <tbody>
            {MESES.map((mes, i) => {
              const periodo = componerPeriodo(anio, i + 1);
              const row = porPeriodo.get(periodo);
              const subido = row?.estado === "subido_dt" || row?.estado === "declarado";
              const sinMov = row?.estado === "sin_movimiento";
              return (
                <tr key={periodo} className={`border-t ${sinMov ? "text-muted-foreground" : ""}`}>
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{mes}</span>{" "}
                    <span className="text-muted-foreground">{anio}</span>
                    {sinMov ? (
                      <Badge variant="outline" className="ml-2 border-slate-300 text-slate-500">Sin movimiento</Badge>
                    ) : row && (row.jornada_provisional || row.causal_provisional) ? (
                      <Badge variant="outline" className="ml-2 border-amber-300 text-amber-700 dark:text-amber-400">
                        Provisional
                      </Badge>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{sinMov ? "—" : (row?.n_trabajadores ?? "—")}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {!sinMov && row?.total_liquido != null ? formatMonto(row.total_liquido) : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    {sinMov ? (
                      <div className="text-center text-xs italic text-muted-foreground">No aplica</div>
                    ) : row ? (
                      <div className="flex items-center justify-center gap-2">
                        <Checkbox
                          checked={subido}
                          onCheckedChange={(v) => toggleSubidoDt(row, v === true)}
                          disabled={pending}
                          aria-label="Subido a la DT"
                        />
                        {subido && row.fecha_carga_dt ? (
                          <span className="text-xs text-muted-foreground">{formatFecha(row.fecha_carga_dt)}</span>
                        ) : null}
                      </div>
                    ) : (
                      <div className="text-center text-xs text-muted-foreground">—</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1.5">
                      {sinMov && row ? (
                        <Button size="sm" variant="ghost" onClick={() => quitarSinMovimiento(row.id)} disabled={pending}>
                          Quitar
                        </Button>
                      ) : row ? (
                        <>
                          <Button size="sm" variant="outline" onClick={() => descargar(row.id)} disabled={pending}>
                            <Download className="size-3.5" /> Descargar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => borrar(row.id, `${mes} ${anio}`)} disabled={pending}
                            className="text-rose-600 hover:text-rose-700">
                            <Trash2 className="size-3.5" />
                          </Button>
                        </>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Pendiente de carga</span>
                          <Button size="sm" variant="ghost" onClick={() => sinMovimiento(periodo)} disabled={pending}
                            className="text-xs text-muted-foreground">
                            Sin movimiento
                          </Button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </section>

      <p className="text-xs text-muted-foreground">
        Los LRE los carga el equipo desde la carpeta compartida: se corrigen al formato DT (fechas dd/mm/aaaa, columnas obligatorias, causal de término)
        y quedan aquí para descargar. La <strong>jornada</strong> y la <strong>causal</strong> que KAME no exporta van en valor provisional
        (jornada 101, causal 6) para cuadrar en la nómina real de junio.
      </p>
    </div>
  );
}
