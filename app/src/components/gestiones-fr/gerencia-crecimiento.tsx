"use client";

import { useMemo, useState } from "react";
import { montoCLP } from "@/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { actualizarCrecimientoMes } from "./actions";
import type { PuntoCrecimiento } from "./tipos";

const selectClase =
  "h-8 rounded-md border border-input bg-white px-2 text-xs shadow-xs focus:outline-2 focus:outline-ring/50";

const MESES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_LARGO = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function etiquetaMes(mes: string): string {
  const [a, m] = mes.split("-");
  return `${MESES_CORTO[Number(m) - 1]} ${a.slice(2)}`;
}

/** Gráfico real vs meta (SVG, sin dependencias — mismo criterio que mini-charts del portal). */
export function GraficoCrecimiento({
  puntos,
}: {
  puntos: PuntoCrecimiento[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 940;
  const H = 240;
  const PAD_L = 56;
  const PAD_B = 26;
  const PAD_T = 14;
  const maxV = Math.max(1, ...puntos.map((p) => Math.max(p.meta, p.real ?? 0))) * 1.08;
  const n = Math.max(1, puntos.length);
  const paso = (W - PAD_L - 8) / n;
  const y = (v: number) => H - PAD_B - ((H - PAD_B - PAD_T) * v) / maxV;

  const lineaMeta = puntos
    .map((p, i) => `${i === 0 ? "M" : "L"}${(PAD_L + paso * (i + 0.5)).toFixed(1)},${y(p.meta).toFixed(1)}`)
    .join(" ");

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[720px]" role="img"
        aria-label="Facturación mensual real versus meta">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={PAD_L} x2={W - 4} y1={y(maxV * f)} y2={y(maxV * f)} stroke="#e5e7eb" strokeWidth={1} />
            <text x={PAD_L - 6} y={y(maxV * f) + 3} textAnchor="end" fontSize={9} fill="#9ca3af">
              {`$${Math.round((maxV * f) / 1e6)}M`}
            </text>
          </g>
        ))}
        {puntos.map((p, i) => {
          const x = PAD_L + paso * i + paso * 0.14;
          const w = paso * 0.72;
          const cumple = p.real !== null && p.real >= p.meta;
          return (
            <g key={p.mes} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={x} y={0} width={paso} height={H - PAD_B} fill="transparent" />
              {p.real !== null ? (
                <rect
                  x={x}
                  y={y(p.real)}
                  width={w}
                  height={H - PAD_B - y(p.real)}
                  rx={2}
                  fill={cumple ? "#17A2B8" : p.enVivo ? "#7fc6d2" : "#c9d4dd"}
                  opacity={hover === i ? 1 : 0.9}
                />
              ) : null}
              {i % 2 === 0 ? (
                <text x={x + w / 2} y={H - 10} textAnchor="middle" fontSize={9} fill="#6b7280">
                  {etiquetaMes(p.mes)}
                </text>
              ) : null}
            </g>
          );
        })}
        <path d={lineaMeta} fill="none" stroke="#0B2545" strokeWidth={2} strokeDasharray="5 3" />
        {hover !== null && puntos[hover] ? (
          <g pointerEvents="none">
            {(() => {
              const p = puntos[hover];
              const bx = Math.min(PAD_L + paso * hover, W - 200);
              const origen = p.realManual !== null ? "manual" : p.enVivo ? "panel" : "histórico";
              return (
                <g>
                  <rect x={bx} y={PAD_T} width={192} height={54} rx={6} fill="#0B2545" opacity={0.94} />
                  <text x={bx + 10} y={PAD_T + 16} fontSize={11} fill="#fff" fontWeight={600}>
                    {etiquetaMes(p.mes)} · {origen}
                  </text>
                  <text x={bx + 10} y={PAD_T + 31} fontSize={10} fill="#a7f3d0">
                    Real: {p.real !== null ? montoCLP(Math.round(p.real)) : "—"}
                  </text>
                  <text x={bx + 10} y={PAD_T + 45} fontSize={10} fill="#bfdbfe">
                    Meta: {montoCLP(Math.round(p.meta))}
                  </text>
                </g>
              );
            })()}
          </g>
        ) : null}
      </svg>
    </div>
  );
}

/** Pestaña Crecimiento: gráfico + grilla mes a mes editable (equivalente a la hoja
 *  "Crecimiento" del Excel). El real del panel se muestra aparte; la columna
 *  "Real manual" permite el criterio propio de Felipe (prorrateos, ajustes). */
export function TabCrecimiento({
  crecimiento,
  mesActual,
  pendiente,
  ejecutar,
}: {
  crecimiento: PuntoCrecimiento[];
  mesActual: string;
  pendiente: boolean;
  ejecutar: (fn: () => Promise<{ ok: boolean; error?: string }>, exito: string) => void;
}) {
  const anios = useMemo(
    () => Array.from(new Set(crecimiento.map((p) => p.mes.slice(0, 4)))).sort(),
    [crecimiento],
  );
  const [anio, setAnio] = useState(mesActual.slice(0, 4));

  const serieGrafico = useMemo(
    () => crecimiento.filter((p) => p.mes >= "2025-01" && p.mes <= mesActual),
    [crecimiento, mesActual],
  );
  const filas = useMemo(
    () => crecimiento.filter((p) => p.mes.startsWith(anio)),
    [crecimiento, anio],
  );

  const totalReal = filas.reduce((s, p) => s + (p.real ?? 0), 0);
  const totalMeta = filas
    .filter((p) => p.mes <= mesActual)
    .reduce((s, p) => s + p.meta, 0);

  const parseMonto = (s: string): number | null => {
    const limpio = s.replace(/\./g, "").replace(",", ".").trim();
    if (limpio === "") return null;
    const x = Number(limpio);
    return Number.isFinite(x) ? x : null;
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-4">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <h3 className="mr-auto text-sm font-semibold">Facturación vs meta</h3>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#17A2B8]" /> Real
            <span className="ml-3 inline-block h-0.5 w-5 border-t-2 border-dashed border-[#0B2545]" /> Meta
          </span>
        </div>
        <GraficoCrecimiento puntos={serieGrafico} />
        <p className="mt-2 text-xs text-muted-foreground">
          El real sale en vivo de la grilla de Facturación (neto emitido). Si digitas un valor en
          &quot;Real manual&quot; abajo, ese manda para el mes (mismo criterio que llevabas en el Excel,
          p. ej. prorratear cobros anuales). Borra la celda para volver al automático.
        </p>
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="mr-auto text-sm font-semibold">
            Plan {anio} · acumulado real {montoCLP(Math.round(totalReal))}
            {totalMeta > 0 ? (
              <span className="ml-1 font-normal text-muted-foreground">
                vs meta a la fecha {montoCLP(Math.round(totalMeta))}
              </span>
            ) : null}
          </h3>
          <select className={selectClase} value={anio} onChange={(e) => setAnio(e.target.value)}>
            {anios.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto rounded-xl border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mes</TableHead>
                <TableHead className="text-right">Real panel</TableHead>
                <TableHead className="text-right">Real manual (override)</TableHead>
                <TableHead className="text-right">Real efectivo</TableHead>
                <TableHead className="text-right">Meta</TableHead>
                <TableHead className="text-right">Desviación</TableHead>
                <TableHead className="text-right">UF del mes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((p) => {
                const desv = p.real !== null ? p.real - p.meta : null;
                const esActual = p.mes === mesActual;
                return (
                  <TableRow key={p.mes} className={esActual ? "bg-accent/40" : ""}>
                    <TableCell className="text-sm font-medium whitespace-nowrap">
                      {MESES_LARGO[Number(p.mes.slice(5)) - 1]}
                      {esActual ? (
                        <span className="ml-1.5 text-[10px] text-[#17A2B8]">en curso</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {p.realVivo !== null ? montoCLP(Math.round(p.realVivo)) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <input
                        type="text"
                        className={`${selectClase} w-28 text-right`}
                        defaultValue={p.realManual !== null ? Math.round(p.realManual) : ""}
                        placeholder="auto"
                        disabled={pendiente}
                        onBlur={(e) => {
                          const nuevo = parseMonto(e.target.value);
                          const actual = p.realManual !== null ? Math.round(p.realManual) : null;
                          const nuevoRed = nuevo !== null ? Math.round(nuevo) : null;
                          if (nuevoRed === actual) return;
                          ejecutar(
                            () => actualizarCrecimientoMes(p.mes, { real_manual: nuevo }),
                            nuevo === null ? "Mes vuelto al automático." : "Real manual guardado.",
                          );
                        }}
                      />
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold">
                      {p.real !== null ? montoCLP(Math.round(p.real)) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <input
                        type="text"
                        className={`${selectClase} w-28 text-right`}
                        defaultValue={Math.round(p.meta)}
                        disabled={pendiente}
                        onBlur={(e) => {
                          const nuevo = parseMonto(e.target.value);
                          if (nuevo === null || Math.round(nuevo) === Math.round(p.meta)) return;
                          ejecutar(
                            () => actualizarCrecimientoMes(p.mes, { meta_monto: nuevo }),
                            "Meta actualizada.",
                          );
                        }}
                      />
                    </TableCell>
                    <TableCell
                      className={`text-right text-sm ${
                        desv === null ? "text-muted-foreground" : desv < 0 ? "text-red-600" : "text-teal-700"
                      }`}
                    >
                      {desv !== null ? montoCLP(Math.round(desv)) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <input
                        type="text"
                        className={`${selectClase} w-20 text-right`}
                        defaultValue={p.uf !== null ? Math.round(p.uf) : ""}
                        disabled={pendiente}
                        onBlur={(e) => {
                          const nuevo = parseMonto(e.target.value);
                          const actual = p.uf !== null ? Math.round(p.uf) : null;
                          if ((nuevo !== null ? Math.round(nuevo) : null) === actual) return;
                          ejecutar(
                            () => actualizarCrecimientoMes(p.mes, { uf_valor: nuevo }),
                            "UF del mes actualizada.",
                          );
                        }}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          La meta viene del plan sembrado del Excel (5% mensual 2025, 4% 2026, 3% 2027…); puedes
          ajustarla mes a mes. La UF del mes se usa para las conversiones históricas.
        </p>
      </div>
    </div>
  );
}
