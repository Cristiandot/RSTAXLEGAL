"use client";

/**
 * Gráficos mínimos en SVG puro (sin dependencias) para el portal del cliente.
 * Colores de marca: teal #17a2b8, navy #0b2545.
 */

const TEAL = "#17a2b8";
const NAVY = "#0b2545";

function fmtM(n: number): string {
  const m = n / 1_000_000;
  return `$${m.toLocaleString("es-CL", { maximumFractionDigits: 1 })}M`;
}

const MESES_MM = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

function mesBoton(periodo: string): string {
  const m = Number(periodo.slice(5));
  return MESES_MM[m - 1] ?? periodo.slice(5);
}

/**
 * Barras agrupadas ventas vs compras por mes (CLP), con el nombre del mes como
 * BOTÓN: al tocarlo se selecciona ese mes (drill-down); al tocarlo de nuevo se
 * vuelve al año completo. La columna seleccionada se resalta.
 */
export function BarrasVentasCompras({
  meses,
  seleccionado,
  onSeleccionar,
}: {
  meses: { periodo: string; ventas_neto: number; compras_neto: number }[];
  seleccionado?: string | null;
  onSeleccionar?: (periodo: string) => void;
}) {
  if (meses.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Sin datos para el período.</p>;
  }
  const max = Math.max(1, ...meses.flatMap((m) => [m.ventas_neto, m.compras_neto]));
  const H = 180;

  return (
    <div className="w-full">
      <div className="mb-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: TEAL }} /> Ventas
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: NAVY }} /> Compras
        </span>
      </div>
      <div className="flex items-end gap-1.5">
        {meses.map((m) => {
          const sel = m.periodo === seleccionado;
          const atenuado = seleccionado != null && !sel;
          const hv = Math.round((m.ventas_neto / max) * H);
          const hc = Math.round((m.compras_neto / max) * H);
          return (
            <div key={m.periodo} className="flex flex-1 flex-col items-center gap-2">
              <div
                className="flex items-end justify-center gap-1 transition-opacity"
                style={{ height: H, opacity: atenuado ? 0.35 : 1 }}
              >
                <div className="w-4 rounded-t sm:w-5" style={{ height: hv, background: TEAL }} title="Ventas" />
                <div className="w-4 rounded-t sm:w-5" style={{ height: hc, background: NAVY }} title="Compras" />
              </div>
              <button
                type="button"
                onClick={() => onSeleccionar?.(m.periodo)}
                aria-pressed={sel}
                className={`w-full rounded-md px-1 py-1 text-xs font-medium transition-colors ${
                  sel
                    ? "bg-[var(--brand-navy)] text-white"
                    : "border border-input bg-card text-foreground hover:bg-muted"
                }`}
              >
                {mesBoton(m.periodo)}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Barras horizontales (top proveedores/clientes). */
export function BarrasHorizontales({
  rows,
  color = TEAL,
}: {
  rows: { nombre: string; monto: number }[];
  color?: string;
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Sin datos para el período.</p>;
  }
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.monto)));
  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const pct = Math.max(2, (Math.abs(r.monto) / max) * 100);
        return (
          <div key={r.nombre} className="text-xs">
            <div className="mb-0.5 flex items-baseline justify-between gap-2">
              <span className="truncate text-foreground" title={r.nombre}>
                {r.nombre}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{fmtM(r.monto)}</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Barras horizontales simples para conteos (dotación por área). */
export function BarrasDotacion({ rows }: { rows: { area: string; n: number }[] }) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Sin nómina registrada.</p>;
  }
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const pct = Math.max(4, (r.n / max) * 100);
        return (
          <div key={r.area} className="text-xs">
            <div className="mb-0.5 flex items-baseline justify-between gap-2">
              <span className="truncate text-foreground" title={r.area}>
                {r.area}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{r.n}</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: TEAL }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
