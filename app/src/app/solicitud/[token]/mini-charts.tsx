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

/** Barras agrupadas ventas vs compras por mes (valores en CLP). */
export function BarrasVentasCompras({
  meses,
}: {
  meses: { periodo: string; ventas_neto: number; compras_neto: number }[];
}) {
  if (meses.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Sin datos para el período.</p>;
  }
  const max = Math.max(1, ...meses.flatMap((m) => [m.ventas_neto, m.compras_neto]));
  const W = 560;
  const H = 200;
  const padB = 24;
  const padT = 8;
  const chartH = H - padB - padT;
  const grupoW = W / meses.length;
  const barW = Math.min(26, grupoW / 3);

  return (
    <div className="w-full">
      <div className="mb-2 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: TEAL }} /> Ventas
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: NAVY }} /> Compras
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Ventas y compras netas por mes">
        <line x1="0" y1={padT + chartH} x2={W} y2={padT + chartH} stroke="#e1e7eb" strokeWidth="1" />
        {meses.map((m, i) => {
          const cx = i * grupoW + grupoW / 2;
          const hv = (m.ventas_neto / max) * chartH;
          const hc = (m.compras_neto / max) * chartH;
          const mes = m.periodo.slice(5);
          return (
            <g key={m.periodo}>
              <rect x={cx - barW - 2} y={padT + chartH - hv} width={barW} height={hv} rx="2" fill={TEAL} />
              <rect x={cx + 2} y={padT + chartH - hc} width={barW} height={hc} rx="2" fill={NAVY} />
              <text x={cx} y={H - 8} textAnchor="middle" fontSize="11" fill="#5a6b7a">
                {mes}
              </text>
            </g>
          );
        })}
      </svg>
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
