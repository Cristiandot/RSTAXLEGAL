"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Play, Wand2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CategoriaOpcion } from "@/app/solicitud/[token]/clasificar-actions";
import {
  guardarRegla,
  borrarRegla,
  correrAuto,
  estadoCliente,
  clasificarManual,
  type Regla,
  type ProveedorSin,
} from "./actions";

export type EmpresaOpc = { id: string; nombre: string; rut: string | null };

const selectCls =
  "h-9 rounded-md border border-input bg-card px-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const clp = (n: number) => "$" + new Intl.NumberFormat("es-CL").format(Math.round(n));

export function ClasificacionClient({
  reglas,
  categorias,
  empresas,
  errorCarga,
}: {
  reglas: Regla[];
  categorias: CategoriaOpcion[];
  empresas: EmpresaOpc[];
  errorCarga: string | null;
}) {
  const router = useRouter();
  const [ocupado, start] = useTransition();

  // ---- Diccionario ----
  const [nuevo, setNuevo] = useState({ patron: "", categoria: categorias[0]?.codigo ?? "", orden: "100" });

  function agregarRegla() {
    start(async () => {
      const r = await guardarRegla({ id: null, patron: nuevo.patron, categoria: nuevo.categoria, orden: Number(nuevo.orden) });
      if (r.ok) {
        toast.success("Regla agregada");
        setNuevo({ patron: "", categoria: categorias[0]?.codigo ?? "", orden: "100" });
        router.refresh();
      } else toast.error(r.error ?? "Error");
    });
  }
  function editarRegla(id: string, campo: Partial<Regla>, actual: Regla) {
    start(async () => {
      const r = await guardarRegla({ id, patron: campo.patron ?? actual.patron, categoria: campo.categoria ?? actual.categoria, orden: campo.orden ?? actual.orden });
      if (r.ok) router.refresh();
      else toast.error(r.error ?? "Error");
    });
  }
  function eliminarRegla(id: string) {
    start(async () => {
      const r = await borrarRegla(id);
      if (r.ok) { toast.success("Regla borrada"); router.refresh(); }
      else toast.error(r.error ?? "Error");
    });
  }

  // ---- Auto por cliente ----
  const [clienteId, setClienteId] = useState("");
  const [filtro, setFiltro] = useState("");
  const [sin, setSin] = useState<ProveedorSin[] | null>(null);
  const [resumen, setResumen] = useState<{ auto: number; manual: number } | null>(null);

  const empresasFiltradas = filtro.trim()
    ? empresas.filter((e) => `${e.nombre} ${e.rut ?? ""}`.toLowerCase().includes(filtro.toLowerCase()))
    : empresas;

  function cargarEstado(id: string) {
    if (!id) { setSin(null); setResumen(null); return; }
    start(async () => {
      const r = await estadoCliente(id);
      if (r.ok) { setSin(r.sin ?? []); setResumen({ auto: r.auto ?? 0, manual: r.manual ?? 0 }); }
    });
  }
  function ejecutarAuto() {
    if (!clienteId) { toast.error("Elige una empresa."); return; }
    start(async () => {
      const r = await correrAuto(clienteId);
      if (r.ok) { toast.success(`Auto-clasificados: ${r.nuevos ?? 0}`); cargarEstado(clienteId); }
      else toast.error(r.error ?? "Error");
    });
  }
  function clasificar(rut: string, categoria: string) {
    if (!categoria || !clienteId) return;
    start(async () => {
      const r = await clasificarManual(clienteId, rut, categoria);
      if (r.ok) setSin((prev) => (prev ?? []).filter((p) => p.rut !== rut));
      else toast.error(r.error ?? "Error");
    });
  }

  return (
    <div className="space-y-6 py-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Clasificación de gastos</h1>
        <p className="text-sm text-muted-foreground">
          Diccionario de reglas (nombre → categoría) y auto-clasificación de proveedores exentos por
          empresa. La clasificación manual manda sobre la automática.
        </p>
      </div>

      {errorCarga ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Error al cargar: {errorCarga}
        </div>
      ) : null}

      {/* Diccionario de reglas */}
      <section className="card-soft rounded-xl bg-card p-5">
        <h2 className="mb-1 font-heading text-base font-semibold">Diccionario de reglas</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Cada regla asigna una categoría cuando el nombre del proveedor contiene el patrón (sin
          distinguir tildes). Menor orden = se evalúa primero (gana el más específico).
        </p>

        <div className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-border p-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Patrón</label>
            <Input value={nuevo.patron} onChange={(e) => setNuevo({ ...nuevo, patron: e.target.value })} placeholder="ej. ODONTO" className="h-9 w-48 bg-card" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Categoría</label>
            <select className={selectCls} value={nuevo.categoria} onChange={(e) => setNuevo({ ...nuevo, categoria: e.target.value })}>
              {categorias.map((c) => <option key={c.codigo} value={c.codigo}>{c.etiqueta}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Orden</label>
            <Input type="number" value={nuevo.orden} onChange={(e) => setNuevo({ ...nuevo, orden: e.target.value })} className="h-9 w-20 bg-card" />
          </div>
          <Button size="sm" disabled={ocupado || !nuevo.patron.trim()} onClick={agregarRegla}>
            <Plus className="size-3.5" /> Agregar
          </Button>
        </div>

        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="p-2 text-left font-medium">Patrón</th>
                <th className="p-2 text-left font-medium">Categoría</th>
                <th className="p-2 text-left font-medium w-20">Orden</th>
                <th className="p-2 text-right font-medium w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {reglas.map((r) => (
                <tr key={r.id}>
                  <td className="p-1.5">
                    <Input defaultValue={r.patron} onBlur={(e) => { if (e.target.value.trim() && e.target.value !== r.patron) editarRegla(r.id, { patron: e.target.value.trim() }, r); }} className="h-8 bg-card" />
                  </td>
                  <td className="p-1.5">
                    <select className={selectCls} defaultValue={r.categoria} onChange={(e) => editarRegla(r.id, { categoria: e.target.value }, r)}>
                      {categorias.map((c) => <option key={c.codigo} value={c.codigo}>{c.etiqueta}</option>)}
                    </select>
                  </td>
                  <td className="p-1.5">
                    <Input type="number" defaultValue={r.orden} onBlur={(e) => { const v = Number(e.target.value); if (v && v !== r.orden) editarRegla(r.id, { orden: v }, r); }} className="h-8 w-20 bg-card" />
                  </td>
                  <td className="p-1.5 text-right">
                    <button onClick={() => eliminarRegla(r.id)} disabled={ocupado} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-red-600" aria-label="Borrar regla">
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {reglas.length === 0 ? (
                <tr><td colSpan={4} className="p-4 text-center text-sm text-muted-foreground">Sin reglas todavía.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* Auto-clasificar por cliente */}
      <section className="card-soft rounded-xl bg-card p-5">
        <h2 className="mb-1 font-heading text-base font-semibold">Auto-clasificar por empresa</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Elige una empresa, corre la auto-clasificación (usa la clasificación previa y el diccionario)
          y clasifica a mano lo que no calzó.
        </p>

        <div className="flex flex-wrap items-end gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Filtrar empresa…" value={filtro} onChange={(e) => setFiltro(e.target.value)} className="h-9 w-48 bg-card pl-8" />
          </div>
          <select
            className={`${selectCls} min-w-64`}
            value={clienteId}
            onChange={(e) => { setClienteId(e.target.value); cargarEstado(e.target.value); }}
          >
            <option value="">Elige la empresa…</option>
            {empresasFiltradas.map((e) => (
              <option key={e.id} value={e.id}>{e.nombre}{e.rut ? ` · ${e.rut}` : ""}</option>
            ))}
          </select>
          <Button size="sm" disabled={ocupado || !clienteId} onClick={ejecutarAuto}>
            <Play className="size-3.5" /> Clasificar automáticamente
          </Button>
        </div>

        {resumen ? (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700">Auto: {resumen.auto}</span>
            <span className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-sky-700">Manual: {resumen.manual}</span>
            <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700">Sin clasificar: {sin?.length ?? 0}</span>
          </div>
        ) : null}

        {sin && sin.length > 0 ? (
          <div className="mt-3 space-y-2">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <Wand2 className="size-4 text-[var(--brand-teal)]" /> Sin clasificar — asígnalas a mano
            </p>
            {sin.map((p) => (
              <div key={p.rut} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 p-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium" title={p.nombre}>{p.nombre}</div>
                  <div className="text-xs tabular-nums text-muted-foreground">{clp(Number(p.monto))} · {p.docs} doc{Number(p.docs) === 1 ? "" : "s"} · {p.rut}</div>
                </div>
                <select className={selectCls} defaultValue="" onChange={(e) => clasificar(p.rut, e.target.value)} aria-label={`Clasificar ${p.nombre}`}>
                  <option value="" disabled>Clasificar…</option>
                  {categorias.map((c) => <option key={c.codigo} value={c.codigo}>{c.etiqueta}</option>)}
                </select>
              </div>
            ))}
          </div>
        ) : sin && sin.length === 0 && resumen ? (
          <p className="mt-3 text-sm text-emerald-700">Todo clasificado ✓</p>
        ) : null}
      </section>
    </div>
  );
}
