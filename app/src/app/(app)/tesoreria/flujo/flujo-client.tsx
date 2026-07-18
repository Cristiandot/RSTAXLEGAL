"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { TrendingUp } from "lucide-react";
import { formatMonto, formatFecha } from "@/lib/format";
import { comparar, type Orden } from "@/lib/ordenar";
import { ThSort } from "@/components/th-sort";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TesoreriaNav } from "../tesoreria-nav";
import { EmpresaSelect, type EmpresaOpcion } from "../empresa-select";

export type FilaFlujo = {
  mes: string;
  label: string;
  entradas: number;
  salidas: number;
  neto: number;
  saldoProyectado: number;
};

/** Valor por columna para ordenar el desglose de vencido (mes ISO ordena cronológico). */
const VALOR_VENCIDAS: Record<string, (f: FilaFlujo) => unknown> = {
  mes: (f) => f.mes,
  entradas: (f) => f.entradas,
  salidas: (f) => f.salidas,
  neto: (f) => f.neto,
};

function KpiCard({ label, valor, tono, sub }: { label: string; valor: string; tono?: "ok" | "alerta"; sub?: string }) {
  const color = tono === "ok" ? "text-emerald-600" : tono === "alerta" ? "text-red-600" : "";
  return (
    <div className="card-soft rounded-xl bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-xl font-semibold tabular-nums ${color}`}>{valor}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function FlujoClient({
  clientes,
  clienteSeleccionado,
  saldoInicial,
  saldoConfigurado,
  totalCxC,
  totalCxP,
  filas,
  vencidas,
  generado,
}: {
  clientes: EmpresaOpcion[];
  clienteSeleccionado: string | null;
  saldoInicial: number;
  saldoConfigurado: boolean;
  totalCxC: number;
  totalCxP: number;
  filas: FilaFlujo[];
  vencidas: FilaFlujo[];
  generado: string;
}) {
  const router = useRouter();
  const saldoFinal = filas.length ? filas[filas.length - 1].saldoProyectado : saldoInicial;
  const maxAbs = Math.max(1, ...filas.map((f) => Math.abs(f.saldoProyectado)));

  // Orden del desglose de vencido; sin orden queda el cronológico del servidor.
  // (La proyección principal NO se ordena: su saldo es acumulado fila a fila.)
  const [ordenVencidas, setOrdenVencidas] = useState<Orden>(null);
  const vencidasOrdenadas = useMemo(() => {
    if (!ordenVencidas || !VALOR_VENCIDAS[ordenVencidas.col]) return vencidas;
    const valor = VALOR_VENCIDAS[ordenVencidas.col];
    return [...vencidas].sort((a, b) => comparar(valor(a), valor(b), ordenVencidas.dir));
  }, [vencidas, ordenVencidas]);

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-5 w-5 text-muted-foreground" />
        <h1 className="font-heading text-2xl font-semibold">Flujo de caja</h1>
      </div>
      <TesoreriaNav cliente={clienteSeleccionado} />
      <p className="mt-3 text-sm text-muted-foreground">
        Proyección = saldo en banco + cobros esperados (por cobrar) − pagos esperados (por pagar),
        ordenados por vencimiento. Los documentos vencidos se esperan en el mes en curso. Al día{" "}
        {formatFecha(generado)}.
      </p>

      <div className="mt-5">
        <label className="block text-xs text-muted-foreground">Empresa</label>
        <EmpresaSelect
          empresas={clientes}
          value={clienteSeleccionado ?? ""}
          onChange={(id) => router.push(`/tesoreria/flujo?cliente=${id}`)}
        />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Saldo en banco"
          valor={formatMonto(saldoInicial)}
          sub={saldoConfigurado ? undefined : "Sin saldo configurado (se asume $0)"}
        />
        <KpiCard label="Por cobrar" valor={formatMonto(totalCxC)} tono="ok" />
        <KpiCard label="Por pagar" valor={formatMonto(totalCxP)} tono="alerta" />
        <KpiCard
          label="Saldo proyectado"
          valor={formatMonto(saldoFinal)}
          tono={saldoFinal >= 0 ? "ok" : "alerta"}
          sub="al final del horizonte"
        />
      </div>

      {/* Desglose de lo vencido por mes de vencimiento: explica de qué meses
          viene el monto que la proyección apila en el mes en curso. */}
      {vencidas.length > 0 && (
        <div className="mt-4">
          <h2 className="font-heading text-base font-semibold">
            Vencido pendiente por mes de vencimiento
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Documentos que vencieron en meses anteriores y siguen sin conciliarse. La proyección
            los espera completos en el mes en curso.
          </p>
          <div className="card-soft mt-2 overflow-hidden rounded-xl bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <ThSort col="mes" orden={ordenVencidas} setOrden={setOrdenVencidas} className="w-[120px]">
                    Venció en
                  </ThSort>
                  <ThSort col="entradas" orden={ordenVencidas} setOrden={setOrdenVencidas} className="text-right">
                    Por cobrar
                  </ThSort>
                  <ThSort col="salidas" orden={ordenVencidas} setOrden={setOrdenVencidas} className="text-right">
                    Por pagar
                  </ThSort>
                  <ThSort col="neto" orden={ordenVencidas} setOrden={setOrdenVencidas} className="text-right">
                    Neto
                  </ThSort>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vencidasOrdenadas.map((f) => (
                  <TableRow key={f.mes} className="text-sm">
                    <TableCell className="font-medium capitalize">
                      {f.label} <span className="ml-1 rounded border border-red-200 bg-red-50 px-1 py-0.5 text-[10px] text-red-700">vencido</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-600">
                      {f.entradas > 0 ? formatMonto(f.entradas) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-red-600">
                      {f.salidas > 0 ? formatMonto(f.salidas) : "—"}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums ${f.neto >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {formatMonto(f.neto)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/40 font-semibold">
                  <TableCell>Total vencido</TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-600">
                    {formatMonto(vencidas.reduce((a, f) => a + f.entradas, 0))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-red-600">
                    {formatMonto(vencidas.reduce((a, f) => a + f.salidas, 0))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMonto(vencidas.reduce((a, f) => a + f.neto, 0))}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {!saldoConfigurado && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          El saldo inicial en banco no está configurado (se asume $0), así que la proyección muestra la
          variación de caja, no el saldo real. Se configura en cada cuenta bancaria (saldo actual).
        </div>
      )}

      <div className="card-soft mt-4 overflow-hidden rounded-xl bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">Mes</TableHead>
              <TableHead className="text-right">Entradas</TableHead>
              <TableHead className="text-right">Salidas</TableHead>
              <TableHead className="text-right">Flujo neto</TableHead>
              <TableHead className="text-right">Saldo proyectado</TableHead>
              <TableHead className="w-[220px]">Tendencia</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  Sin datos para proyectar.
                </TableCell>
              </TableRow>
            ) : (
              filas.map((f, i) => {
                const ancho = Math.round((Math.abs(f.saldoProyectado) / maxAbs) * 100);
                const neg = f.saldoProyectado < 0;
                return (
                  <TableRow key={f.mes}>
                    <TableCell className="font-medium capitalize">
                      {f.label}
                      {i === 0 && vencidas.length > 0 && (
                        <span className="ml-1.5 rounded border border-amber-200 bg-amber-50 px-1 py-0.5 text-[10px] font-normal text-amber-700">
                          incluye vencido
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-600">
                      {f.entradas > 0 ? formatMonto(f.entradas) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-red-600">
                      {f.salidas > 0 ? formatMonto(f.salidas) : "—"}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums ${f.neto >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {formatMonto(f.neto)}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums font-semibold ${neg ? "text-red-600" : ""}`}>
                      {formatMonto(f.saldoProyectado)}
                    </TableCell>
                    <TableCell>
                      <div className="h-2 w-full rounded-full bg-muted">
                        <div
                          className={`h-2 rounded-full ${neg ? "bg-red-500" : "bg-emerald-500"}`}
                          style={{ width: `${ancho}%` }}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
