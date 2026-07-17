"use client";

import { useEffect, useState } from "react";
import { Loader2, Tags, Check } from "lucide-react";
import {
  cargarSinClasificar,
  clasificarProveedor,
  type CategoriaOpcion,
  type ProveedorSinClasificar,
} from "./clasificar-actions";

function clp(n: number): string {
  return "$" + new Intl.NumberFormat("es-CL").format(Math.round(n));
}
const NOMBRE_MES: Record<string, string> = {
  "01": "ene", "02": "feb", "03": "mar", "04": "abr", "05": "may", "06": "jun",
  "07": "jul", "08": "ago", "09": "sep", "10": "oct", "11": "nov", "12": "dic",
};
function per(v: string): string {
  const m = v?.match(/^(\d{4})-(\d{2})/);
  return m ? `${NOMBRE_MES[m[2]] ?? m[2]} ${m[1]}` : v;
}

/**
 * "Facturas por clasificar" — el cliente asigna categoría (del catálogo de la
 * oficina) a cada proveedor exento sin clasificar. Se guarda por proveedor y
 * recategoriza el Estado de Resultado. Si no queda nada pendiente, no se muestra.
 */
export function ClasificarGastos({ token }: { token: string }) {
  const [cats, setCats] = useState<CategoriaOpcion[]>([]);
  const [provs, setProvs] = useState<ProveedorSinClasificar[] | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clasificadas, setClasificadas] = useState(0);

  useEffect(() => {
    let vivo = true;
    cargarSinClasificar(token).then((r) => {
      if (!vivo) return;
      setCats(r.categorias ?? []);
      setProvs(r.ok ? (r.proveedores ?? []) : []);
    });
    return () => { vivo = false; };
  }, [token]);

  async function elegir(rut: string, categoria: string) {
    if (!categoria) return;
    setGuardando(rut);
    setError(null);
    const r = await clasificarProveedor(token, rut, categoria);
    setGuardando(null);
    if (!r.ok) {
      setError(r.error ?? "No se pudo guardar.");
      return;
    }
    setProvs((prev) => (prev ?? []).filter((p) => p.rut !== rut));
    setClasificadas((n) => n + 1);
  }

  if (provs === null) {
    return (
      <div className="card-soft flex items-center gap-2 rounded-xl bg-card p-5 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Cargando facturas por clasificar…
      </div>
    );
  }

  if (provs.length === 0) {
    if (clasificadas === 0) return null;
    return (
      <div className="card-soft rounded-xl bg-card p-5">
        <p className="m-0 flex items-center gap-2 text-sm text-emerald-700">
          <Check className="size-4" /> ¡Listo! Clasificaste {clasificadas}{" "}
          {clasificadas === 1 ? "proveedor" : "proveedores"}. No quedan facturas por clasificar.
        </p>
      </div>
    );
  }

  return (
    <div className="card-soft rounded-xl bg-card p-5">
      <p className="mb-1 text-sm font-medium">
        <Tags className="mr-1 inline size-4 align-middle text-[var(--brand-teal)]" aria-hidden="true" />
        Facturas por clasificar
      </p>
      <p className="mb-3 text-xs text-muted-foreground">
        Estos proveedores te emiten factura exenta y aún no tienen categoría. Elige qué es cada uno:
        se aplica a todas sus facturas y ordena tu Estado de Resultado. {provs.length} pendiente
        {provs.length === 1 ? "" : "s"}.
      </p>
      {error ? (
        <p className="mb-2 rounded-md bg-red-50 p-2 text-xs text-red-700">{error}</p>
      ) : null}
      <div className="space-y-2">
        {provs.map((p) => (
          <div
            key={p.rut}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 p-2.5"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium" title={p.nombre}>{p.nombre}</div>
              <div className="text-xs tabular-nums text-muted-foreground">
                {clp(p.monto)} · {p.docs} doc{p.docs === 1 ? "" : "s"} · {per(p.desde)}–{per(p.hasta)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {guardando === p.rut ? (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              ) : null}
              <select
                defaultValue=""
                disabled={guardando === p.rut}
                onChange={(e) => elegir(p.rut, e.target.value)}
                className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                aria-label={`Clasificar ${p.nombre}`}
              >
                <option value="" disabled>Clasificar…</option>
                {cats.map((c) => (
                  <option key={c.codigo} value={c.codigo}>{c.etiqueta}</option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
