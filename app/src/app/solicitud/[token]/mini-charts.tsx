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

/**
 * Líneas con puntos: evolución de ventas vs compras por mes (CLP). Muestra la
 * fluctuación a lo largo del año; complementa a las barras. SVG puro,
 * responsivo por viewBox. Cada punto tiene tooltip con el monto.
 */
export function LineasVentasCompras({
  meses,
}: {
  meses: { periodo: string; ventas_neto: number; compras_neto: number }[];
}) {
  if (meses.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Sin datos para el período.</p>;
  }
  const W = 340;
  const H = 180;
  const padL = 6;
  const padR = 6;
  const padT = 12;
  const padB = 22;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = meses.length;
  const max = Math.max(1, ...meses.flatMap((m) => [m.ventas_neto, m.compras_neto]));
  const px = (i: number) => (n === 1 ? padL + plotW / 2 : padL + (i * plotW) / (n - 1));
  const py = (v: number) => padT + plotH - (Math.max(0, v) / max) * plotH;
  const puntos = (sel: (m: { ventas_neto: number; compras_neto: number }) => number) =>
    meses.map((m, i) => `${px(i).toFixed(1)},${py(sel(m)).toFixed(1)}`).join(" ");

  return (
    <div className="w-full">
      <div className="mb-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: TEAL }} /> Ventas
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: NAVY }} /> Compras
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label="Evolución de ventas y compras por mes"
      >
        <polyline fill="none" stroke={NAVY} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" points={puntos((m) => m.compras_neto)} />
        <polyline fill="none" stroke={TEAL} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" points={puntos((m) => m.ventas_neto)} />
        {meses.map((m, i) => (
          <g key={m.periodo}>
            <circle cx={px(i)} cy={py(m.compras_neto)} r={2.6} fill={NAVY}>
              <title>{`${mesBoton(m.periodo)} · Compras ${fmtM(m.compras_neto)}`}</title>
            </circle>
            <circle cx={px(i)} cy={py(m.ventas_neto)} r={2.6} fill={TEAL}>
              <title>{`${mesBoton(m.periodo)} · Ventas ${fmtM(m.ventas_neto)}`}</title>
            </circle>
            <text x={px(i)} y={H - 6} textAnchor="middle" fontSize="8" fill="currentColor" className="text-muted-foreground">
              {mesBoton(m.periodo)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/** Barras horizontales (top proveedores/clientes). `grande` = más protagonismo. */
export function BarrasHorizontales({
  rows,
  color = TEAL,
  grande = false,
}: {
  rows: { nombre: string; monto: number }[];
  color?: string;
  grande?: boolean;
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Sin datos para el período.</p>;
  }
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.monto)));
  return (
    <div className={grande ? "space-y-3.5" : "space-y-2"}>
      {rows.map((r, i) => {
        const pct = Math.max(2, (Math.abs(r.monto) / max) * 100);
        return (
          <div key={r.nombre} className={grande ? "text-sm" : "text-xs"}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="flex min-w-0 items-baseline gap-1.5">
                {grande ? (
                  <span className="shrink-0 tabular-nums text-xs font-semibold text-muted-foreground">{i + 1}.</span>
                ) : null}
                <span className="truncate text-foreground" title={r.nombre}>
                  {r.nombre}
                </span>
              </span>
              <span className={`shrink-0 tabular-nums ${grande ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                {fmtM(r.monto)}
              </span>
            </div>
            <div className={`w-full overflow-hidden rounded-full bg-muted ${grande ? "h-4" : "h-2.5"}`}>
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
