"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, ChevronDown, ChevronRight, Download } from "lucide-react";
import { formatMonto } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ContabilidadTabs } from "../contabilidad-tabs";
import { urlDocumentoContable } from "../../actions";

export type CuentaLM = {
  codigo: string;
  nombre: string;
  debe: number;
  haber: number;
  saldo: number;
};

export type MovimientoLM = {
  cuentaCodigo: string;
  comprobante: string;
  tipo: string;
  fecha: string;
  concepto: string;
  debe: number;
  haber: number;
  saldo: number | null;
  ficha: string;
  documento: string;
  vencimiento: string;
  unidadNegocio: string;
};

export type CabeceraLM = {
  periodoDesde: string | null;
  periodoHasta: string | null;
  totalDebe: number;
  totalHaber: number;
  nCuentas: number;
  nMovimientos: number;
  cuadra: boolean;
  archivoPath: string | null;
  nombreOriginal: string | null;
  actualizado: string | null;
};

/** ISO (yyyy-mm-dd) → DD-MM-AAAA. */
function fechaCl(iso: string | null): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso;
}

const GRUPOS: Record<string, string> = {
  "1": "Activos",
  "2": "Pasivos y patrimonio",
  "3": "Ingresos / resultado",
  "4": "Costos y gastos",
};

function Card({ label, valor, tono }: { label: string; valor: string; tono?: "ok" | "alerta" }) {
  const color =
    tono === "ok" ? "text-emerald-600" : tono === "alerta" ? "text-red-600" : "";
  return (
    <div className="card-soft rounded-xl bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold tabular-nums ${color}`}>{valor}</div>
    </div>
  );
}

export function DetalleLibroMayor({
  clienteId,
  anio,
  razonSocial,
  rutEmpresa,
  libro,
  cuentas,
  movimientos,
}: {
  clienteId: string;
  anio: number;
  razonSocial: string;
  rutEmpresa: string | null;
  libro: CabeceraLM | null;
  cuentas: CuentaLM[];
  movimientos: MovimientoLM[];
}) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const [bajando, start] = useTransition();

  const movsPorCuenta = useMemo(() => {
    const m = new Map<string, MovimientoLM[]>();
    for (const mv of movimientos) {
      const arr = m.get(mv.cuentaCodigo) ?? [];
      arr.push(mv);
      m.set(mv.cuentaCodigo, arr);
    }
    return m;
  }, [movimientos]);

  const subtotales = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cuentas) {
      const g = c.codigo[0] ?? "?";
      m.set(g, (m.get(g) ?? 0) + c.saldo);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [cuentas]);

  function descargar() {
    if (!libro?.archivoPath) return;
    start(async () => {
      const res = await urlDocumentoContable(
        libro.archivoPath!,
        libro.nombreOriginal ?? `LibroMayor-${anio}.xlsx`,
      );
      if (res.ok && res.url) window.open(res.url, "_blank");
      else toast.error(res.error ?? "No se pudo generar la descarga.");
    });
  }

  return (
    <div className="space-y-5 pt-2">
      <Button
        variant="ghost"
        size="sm"
        render={<Link href={`/contabilidad/libro-mayor?anio=${anio}`} />}
      >
        <ArrowLeft className="size-4" />
        Volver a Libro Mayor
      </Button>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {razonSocial}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {rutEmpresa ? `RUT ${rutEmpresa} · ` : ""}Libro Mayor {anio}
            {libro?.periodoDesde
              ? ` · ${fechaCl(libro.periodoDesde)} a ${fechaCl(libro.periodoHasta)}`
              : ""}
          </p>
        </div>
        {libro?.archivoPath ? (
          <Button variant="outline" size="sm" onClick={descargar} disabled={bajando}>
            <Download className="size-4" />
            {bajando ? "Generando…" : "Descargar XLSX"}
          </Button>
        ) : null}
      </div>

      <ContabilidadTabs clienteId={clienteId} periodo="" active="libro-mayor" />

      {!libro ? (
        <div className="card-soft rounded-xl bg-card p-8 text-center">
          <p className="text-sm font-medium">Sin información</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {razonSocial} no tiene Libro Mayor {anio} cargado. Se carga
            importando el archivo XLSX exportado desde KAME.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card label="Total Debe" valor={formatMonto(libro.totalDebe)} />
            <Card label="Total Haber" valor={formatMonto(libro.totalHaber)} />
            <Card
              label="Cuadratura"
              valor={libro.cuadra ? "✓ Cuadra" : "≠ Descuadre"}
              tono={libro.cuadra ? "ok" : "alerta"}
            />
            <Card
              label="Cuentas / movimientos"
              valor={`${libro.nCuentas} / ${libro.nMovimientos.toLocaleString("es-CL")}`}
            />
          </div>

          {subtotales.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {subtotales.map(([g, saldo]) => (
                <span
                  key={g}
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs"
                >
                  <span className="text-muted-foreground">{GRUPOS[g] ?? `Grupo ${g}`}</span>
                  <span className="font-semibold tabular-nums">{formatMonto(saldo)}</span>
                </span>
              ))}
            </div>
          ) : null}

          <div className="card-soft rounded-xl bg-card">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-8" />
                  <TableHead className="w-[140px]">Código</TableHead>
                  <TableHead>Cuenta</TableHead>
                  <TableHead className="text-right">Debe</TableHead>
                  <TableHead className="text-right">Haber</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead className="text-right">Movs.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cuentas.map((c) => {
                  const movs = movsPorCuenta.get(c.codigo) ?? [];
                  const open = abierta === c.codigo;
                  return (
                    <Fragment key={c.codigo}>
                      <TableRow
                        className="cursor-pointer"
                        onClick={() => setAbierta(open ? null : c.codigo)}
                      >
                        <TableCell>
                          {open ? (
                            <ChevronDown className="size-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="size-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{c.codigo}</TableCell>
                        <TableCell className="font-medium">{c.nombre}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMonto(c.debe)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMonto(c.haber)}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{formatMonto(c.saldo)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{movs.length}</TableCell>
                      </TableRow>
                      {open ? (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={7} className="bg-muted/30 p-0">
                            <div className="max-h-[420px] overflow-auto px-3 py-2">
                              <Table>
                                <TableHeader>
                                  <TableRow className="hover:bg-transparent">
                                    <TableHead className="w-[90px]">Comp.</TableHead>
                                    <TableHead className="w-[92px]">Fecha</TableHead>
                                    <TableHead>Concepto</TableHead>
                                    <TableHead className="text-right">Debe</TableHead>
                                    <TableHead className="text-right">Haber</TableHead>
                                    <TableHead className="text-right">Saldo</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {movs.map((m, i) => (
                                    <TableRow key={i} className="hover:bg-transparent">
                                      <TableCell className="font-mono text-[11px] text-muted-foreground">{m.comprobante}</TableCell>
                                      <TableCell className="text-xs tabular-nums">{fechaCl(m.fecha)}</TableCell>
                                      <TableCell className="text-xs">{m.concepto}</TableCell>
                                      <TableCell className="text-right text-xs tabular-nums">{m.debe ? formatMonto(m.debe) : ""}</TableCell>
                                      <TableCell className="text-right text-xs tabular-nums">{m.haber ? formatMonto(m.haber) : ""}</TableCell>
                                      <TableCell className="text-right text-xs tabular-nums text-muted-foreground">{m.saldo == null ? "" : formatMonto(m.saldo)}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {libro.actualizado ? (
            <p className="text-xs text-muted-foreground">
              Última carga: {fechaCl(libro.actualizado)}.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
