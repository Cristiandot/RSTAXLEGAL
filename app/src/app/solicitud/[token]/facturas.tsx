"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Receipt, ChevronDown, Check, Circle, AlertTriangle } from "lucide-react";
import {
  cargarFacturas,
  marcarPago,
  type FacturaPortal,
  type TipoFactura,
} from "./facturas-actions";
import { cargarSinClasificar, clasificarProveedor, type CategoriaOpcion } from "./clasificar-actions";

function clp(n: number | string | null): string {
  const v = Number(n ?? 0);
  return (v < 0 ? "-$" : "$") + new Intl.NumberFormat("es-CL").format(Math.abs(Math.round(v)));
}
const MES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
function nombreMes(periodo: string): string {
  const m = periodo.match(/^(\d{4})-(\d{2})/);
  return m ? `${MES[+m[2]] ?? m[2]} ${m[1]}` : periodo;
}
function fmtFecha(f: string | null): string {
  const m = f?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : (f ?? "—");
}
export function Facturas({ token, anio = 2026 }: { token: string; anio?: number }) {
  const [tipo, setTipo] = useState<TipoFactura>("recibidas");
  const [facturas, setFacturas] = useState<FacturaPortal[] | null>(null);
  const [cats, setCats] = useState<CategoriaOpcion[]>([]);
  const [abierto, setAbierto] = useState<Set<string>>(new Set());
  const [guardando, setGuardando] = useState<string | null>(null);

  useEffect(() => {
    void cargarSinClasificar(token).then((r) => setCats(r.categorias ?? []));
  }, [token]);

  useEffect(() => {
    let vivo = true;
    setFacturas(null);
    cargarFacturas(token, anio, tipo).then((r) => {
      if (!vivo) return;
      const fs = r.ok ? (r.facturas ?? []) : [];
      setFacturas(fs);
      // Abre el mes más reciente por defecto.
      const meses = [...new Set(fs.map((f) => f.periodo))].sort().reverse();
      setAbierto(new Set(meses.slice(0, 1)));
    });
    return () => { vivo = false; };
  }, [token, anio, tipo]);

  const porMes = useMemo(() => {
    const map = new Map<string, FacturaPortal[]>();
    for (const f of facturas ?? []) {
      const arr = map.get(f.periodo) ?? [];
      arr.push(f);
      map.set(f.periodo, arr);
    }
    // Dentro de cada mes, las sin clasificar primero.
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const sa = a.clasificable && !a.categoria ? 0 : 1;
        const sb = b.clasificable && !b.categoria ? 0 : 1;
        return sa - sb;
      });
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [facturas]);

  const sinClasificar = useMemo(
    () => (facturas ?? []).filter((f) => f.clasificable && !f.categoria).length,
    [facturas],
  );

  async function togglePago(f: FacturaPortal) {
    const nuevo = !f.pagado;
    setFacturas((prev) => (prev ?? []).map((x) => (x.id === f.id ? { ...x, pagado: nuevo } : x)));
    const r = await marcarPago(token, tipo, f.id, nuevo);
    if (!r.ok) {
      setFacturas((prev) => (prev ?? []).map((x) => (x.id === f.id ? { ...x, pagado: !nuevo } : x)));
    }
  }

  async function reclasificar(f: FacturaPortal, valor: string) {
    if (!valor || !f.rut) return;
    const categoria = valor === "sin_clasificar" ? null : valor;
    setGuardando(f.id);
    const r = await clasificarProveedor(token, f.rut, valor);
    setGuardando(null);
    if (r.ok) {
      // Aplica a todas las facturas del mismo proveedor (RUT).
      setFacturas((prev) => (prev ?? []).map((x) => (x.rut === f.rut ? { ...x, categoria } : x)));
    }
  }

  function toggleMes(periodo: string) {
    setAbierto((prev) => {
      const n = new Set(prev);
      if (n.has(periodo)) n.delete(periodo); else n.add(periodo);
      return n;
    });
  }

  return (
    <div className="card-soft rounded-xl bg-card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-sm font-medium">
          <Receipt className="mr-1 inline size-4 align-middle text-[var(--brand-teal)]" aria-hidden="true" />
          Tus facturas {anio}
        </p>
        <div className="inline-flex rounded-md bg-muted p-0.5">
          {(["recibidas", "emitidas"] as TipoFactura[]).map((t) => (
            <button
              key={t}
              onClick={() => setTipo(t)}
              className={`rounded px-3 py-1 text-sm font-medium capitalize transition ${
                tipo === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-3 text-xs text-muted-foreground">
        {tipo === "recibidas"
          ? "Facturas que recibes de tus proveedores, por mes. Se asumen pagadas; toca el estado para marcar un pago pendiente. Puedes reclasificar cualquier proveedor exento."
          : "Facturas y boletas que emites, por mes. Se asumen cobradas; toca el estado para marcar un pago no recibido."}
      </p>

      {tipo === "recibidas" && facturas && sinClasificar > 0 ? (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            Tienes <strong>{sinClasificar}</strong> factura{sinClasificar === 1 ? "" : "s"} sin
            clasificar. Aparecen primero en cada mes — asígnales una categoría para ordenar tu Estado
            de Resultado.
          </span>
        </div>
      ) : null}

      {facturas === null ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Cargando facturas…
        </div>
      ) : porMes.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">Sin facturas {tipo} en {anio}.</p>
      ) : (
        <div className="space-y-2">
          {porMes.map(([periodo, fs]) => {
            const total = fs.reduce((a, f) => a + Number(f.monto ?? 0), 0);
            const noPag = fs.filter((f) => !f.pagado).length;
            const open = abierto.has(periodo);
            return (
              <div key={periodo} className="rounded-lg border border-border/60">
                <button
                  onClick={() => toggleMes(periodo)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <ChevronDown className={`size-4 text-muted-foreground transition ${open ? "" : "-rotate-90"}`} />
                    {nombreMes(periodo)}
                  </span>
                  <span className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{fs.length} doc{fs.length === 1 ? "" : "s"}</span>
                    {noPag > 0 ? <span className="font-medium text-red-600">{noPag} sin pagar</span> : null}
                    <span className="tabular-nums font-medium text-foreground">{clp(total)}</span>
                  </span>
                </button>

                {open ? (
                  <div className="divide-y divide-border/50 border-t border-border/50">
                    {fs.map((f) => (
                      <div key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 text-sm">
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium" title={f.contraparte ?? undefined}>
                            {f.contraparte ?? "—"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {fmtFecha(f.fecha)}{f.folio ? ` · folio ${f.folio}` : ""}
                            {f.n_documentos ? ` · ${f.n_documentos} boletas` : ""}
                          </div>
                        </div>
                        <div className="tabular-nums font-medium">{clp(f.monto)}</div>
                        <button
                          onClick={() => togglePago(f)}
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition ${
                            f.pagado
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-red-200 bg-red-50 text-red-700"
                          }`}
                          title={f.pagado ? "Marcada como pagada — toca para marcar pendiente" : "Pendiente — toca para marcar pagada"}
                        >
                          {f.pagado ? <Check className="size-3" /> : <Circle className="size-3" />}
                          {f.pagado ? (tipo === "emitidas" ? "Cobrada" : "Pagada") : "Pendiente"}
                        </button>
                        {tipo === "recibidas" ? (
                          <select
                            value={f.categoria ?? "sin_clasificar"}
                            disabled={guardando === f.id}
                            onChange={(e) => reclasificar(f, e.target.value)}
                            className={`rounded-md border px-2 py-0.5 text-xs ${
                              f.categoria
                                ? "border-input bg-background"
                                : "border-amber-300 bg-amber-50 text-amber-800"
                            }`}
                            aria-label={`Clasificar ${f.contraparte ?? ""}`}
                          >
                            <option value="sin_clasificar">Sin clasificar</option>
                            {cats.map((c) => (
                              <option key={c.codigo} value={c.codigo}>{c.etiqueta}</option>
                            ))}
                          </select>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
