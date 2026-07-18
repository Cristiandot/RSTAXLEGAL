"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RutCopiable } from "@/components/rut-copiable";
import { ClaveCell } from "@/components/credencial-celdas";
import { ThSort } from "@/components/th-sort";
import { comparar, type Orden } from "@/lib/ordenar";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatMonto, formatFecha } from "@/lib/format";
import { nombreTipoDoc } from "@/lib/contabilidad/rcv";
import { etiquetaPeriodo } from "@/lib/periodos";

export type DocVenta = {
  tipo_doc: number;
  folio: string;
  fecha_docto: string | null;
  rut_cliente: string | null;
  razon_social: string | null;
  monto_exento: number;
  monto_neto: number;
  monto_iva: number;
  monto_total: number;
};

export type DocCompra = {
  tipo_doc: number;
  folio: string;
  fecha_docto: string | null;
  rut_proveedor: string | null;
  razon_social: string | null;
  monto_exento: number;
  monto_neto: number;
  iva_recuperable: number;
  iva_no_recuperable: number;
  monto_total: number;
};

type Props = {
  razonSocial: string;
  rutEmpresa: string;
  tieneClave: boolean;
  clienteId: string;
  periodo: string;
  periodos: string[];
  ventas: DocVenta[];
  compras: DocCompra[];
};

/** Login del SII que, tras autenticar, redirige al Registro de Compras y Ventas. */
const URL_RCV_SII =
  "https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html?https://www4.sii.cl/consdcvinternetui/";

function BadgeTipo({ tipo }: { tipo: number }) {
  const nc = tipo === 60 || tipo === 61 || tipo === 112;
  const nd = tipo === 56;
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-normal",
        nc && "border-red-200 bg-red-50 text-red-700",
        nd && "border-amber-200 bg-amber-50 text-amber-700",
      )}
    >
      {nombreTipoDoc(tipo)}
    </Badge>
  );
}

type FilaResumen = { tipo: number; cantidad: number; exento: number; neto: number; iva: number; total: number };

/** Agrupa documentos por tipo (como el resumen del SII): cantidad y montos por tipo de doc. */
function resumenPorTipo(
  docs: Array<{ tipo_doc: number; monto_exento: number; monto_neto: number; monto_total: number }>,
  iva: (d: { tipo_doc: number; monto_exento: number; monto_neto: number; monto_total: number }) => number,
): FilaResumen[] {
  const m = new Map<number, FilaResumen>();
  for (const d of docs) {
    const f = m.get(d.tipo_doc) ?? { tipo: d.tipo_doc, cantidad: 0, exento: 0, neto: 0, iva: 0, total: 0 };
    f.cantidad += 1;
    f.exento += Number(d.monto_exento) || 0;
    f.neto += Number(d.monto_neto) || 0;
    f.iva += iva(d) || 0;
    f.total += Number(d.monto_total) || 0;
    m.set(d.tipo_doc, f);
  }
  return [...m.values()].sort((a, b) => a.tipo - b.tipo);
}

function ResumenPorTipo({ titulo, filas }: { titulo: string; filas: FilaResumen[] }) {
  const [orden, setOrden] = useState<Orden>(null);
  const tot = filas.reduce(
    (a, f) => ({ cantidad: a.cantidad + f.cantidad, exento: a.exento + f.exento, neto: a.neto + f.neto, iva: a.iva + f.iva, total: a.total + f.total }),
    { cantidad: 0, exento: 0, neto: 0, iva: 0, total: 0 },
  );
  const ordenadas = useMemo(() => {
    if (!orden) return filas; // default: por código de tipo de documento
    const valor = (f: FilaResumen): unknown => {
      switch (orden.col) {
        case "tipo": return nombreTipoDoc(f.tipo);
        case "cantidad": return f.cantidad;
        case "exento": return f.exento;
        case "neto": return f.neto;
        case "iva": return f.iva;
        case "total": return f.total;
        default: return null;
      }
    };
    return [...filas].sort((a, b) => comparar(valor(a), valor(b), orden.dir));
  }, [filas, orden]);
  return (
    <div className="rounded-xl border bg-card">
      <div className="border-b px-3 py-2 text-sm font-semibold">{titulo}</div>
      <Table>
        <TableHeader>
          <TableRow>
            <ThSort col="tipo" orden={orden} setOrden={setOrden}>Tipo de documento</ThSort>
            <ThSort col="cantidad" orden={orden} setOrden={setOrden} className="text-right">Cant.</ThSort>
            <ThSort col="exento" orden={orden} setOrden={setOrden} className="text-right">Exento</ThSort>
            <ThSort col="neto" orden={orden} setOrden={setOrden} className="text-right">Neto</ThSort>
            <ThSort col="iva" orden={orden} setOrden={setOrden} className="text-right">IVA</ThSort>
            <ThSort col="total" orden={orden} setOrden={setOrden} className="text-right">Total</ThSort>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ordenadas.map((f) => (
            <TableRow key={f.tipo}>
              <TableCell><BadgeTipo tipo={f.tipo} /></TableCell>
              <TableCell className="text-right font-medium tabular-nums">{f.cantidad}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMonto(f.exento)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMonto(f.neto)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMonto(f.iva)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMonto(f.total)}</TableCell>
            </TableRow>
          ))}
          {filas.length === 0 && (
            <TableRow><TableCell colSpan={6} className="py-4 text-center text-muted-foreground">Sin documentos.</TableCell></TableRow>
          )}
        </TableBody>
        {filas.length > 0 && (
          <TableFooter>
            <TableRow>
              <TableCell className="font-semibold">Total</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">{tot.cantidad}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMonto(tot.exento)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMonto(tot.neto)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMonto(tot.iva)}</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">{formatMonto(tot.total)}</TableCell>
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </div>
  );
}

export function DetalleRcvClient({ razonSocial, rutEmpresa, tieneClave, clienteId, periodo, periodos, ventas, compras }: Props) {
  const sum = (arr: number[]) => arr.reduce((a, b) => a + (Number(b) || 0), 0);
  const resumenVentas = resumenPorTipo(ventas, (d) => (d as DocVenta).monto_iva);
  const resumenCompras = resumenPorTipo(compras, (d) => (d as DocCompra).iva_recuperable);

  // Orden por columna de los detalles documento por documento (uno por tabla).
  const [ordenVentas, setOrdenVentas] = useState<Orden>(null);
  const [ordenCompras, setOrdenCompras] = useState<Orden>(null);

  const ventasOrdenadas = useMemo(() => {
    if (!ordenVentas) return ventas; // default: orden del SII (fecha/folio)
    const valor = (d: DocVenta): unknown => {
      switch (ordenVentas.col) {
        case "tipo": return nombreTipoDoc(d.tipo_doc);
        case "folio": return d.folio;
        case "fecha": return d.fecha_docto;
        case "rut": return d.rut_cliente;
        case "razon": return d.razon_social;
        case "exento": return Number(d.monto_exento) || 0;
        case "neto": return Number(d.monto_neto) || 0;
        case "iva": return Number(d.monto_iva) || 0;
        case "total": return Number(d.monto_total) || 0;
        default: return null;
      }
    };
    return [...ventas].sort((a, b) => comparar(valor(a), valor(b), ordenVentas.dir));
  }, [ventas, ordenVentas]);

  const comprasOrdenadas = useMemo(() => {
    if (!ordenCompras) return compras;
    const valor = (d: DocCompra): unknown => {
      switch (ordenCompras.col) {
        case "tipo": return nombreTipoDoc(d.tipo_doc);
        case "folio": return d.folio;
        case "fecha": return d.fecha_docto;
        case "rut": return d.rut_proveedor;
        case "razon": return d.razon_social;
        case "exento": return Number(d.monto_exento) || 0;
        case "neto": return Number(d.monto_neto) || 0;
        case "iva": return Number(d.iva_recuperable) || 0;
        case "total": return Number(d.monto_total) || 0;
        default: return null;
      }
    };
    return [...compras].sort((a, b) => comparar(valor(a), valor(b), ordenCompras.dir));
  }, [compras, ordenCompras]);

  return (
    <div className="space-y-4 py-4">
      <Button variant="ghost" size="sm" render={<Link href="/control-rcv" />}>
        <ArrowLeft className="size-4" />
        Volver al control RCV
      </Button>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{razonSocial}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="text-xs">RUT</span> <RutCopiable rut={rutEmpresa} />
            </span>
            <span className="flex items-center gap-1">
              <span className="text-xs">Clave SII</span>
              <ClaveCell
                clienteId={clienteId}
                campo="clave_sii"
                etiqueta="Clave SII"
                razonSocial={razonSocial}
                tiene={tieneClave}
                compacto
              />
            </span>
            <Button
              variant="outline"
              size="sm"
              render={<a href={URL_RCV_SII} target="_blank" rel="noopener noreferrer" />}
            >
              <ExternalLink className="size-4" />
              Abrir RCV en el SII
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {periodos.map((p) => (
            <Button
              key={p}
              variant={p === periodo ? "default" : "outline"}
              size="sm"
              render={<Link href={`/control-rcv/${clienteId}?periodo=${p}`} />}
            >
              {etiquetaPeriodo(p)}
            </Button>
          ))}
        </div>
      </div>

      {/* RESUMEN POR TIPO (comparación rápida con el SII) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ResumenPorTipo titulo={`Ventas — resumen (${ventas.length} docs)`} filas={resumenVentas} />
        <ResumenPorTipo titulo={`Compras — resumen (${compras.length} docs)`} filas={resumenCompras} />
      </div>

      {/* VENTAS — detalle plegable */}
      <details className="rounded-xl border bg-card">
        <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-muted-foreground">
          Ventas — detalle documento por documento ({ventas.length})
        </summary>
        <div className="border-t">
          <Table stickyHeader>
            <TableHeader>
              <TableRow>
                <ThSort col="tipo" orden={ordenVentas} setOrden={setOrdenVentas}>Tipo</ThSort>
                <ThSort col="folio" orden={ordenVentas} setOrden={setOrdenVentas}>Folio</ThSort>
                <ThSort col="fecha" orden={ordenVentas} setOrden={setOrdenVentas}>Fecha</ThSort>
                <ThSort col="rut" orden={ordenVentas} setOrden={setOrdenVentas}>RUT cliente</ThSort>
                <ThSort col="razon" orden={ordenVentas} setOrden={setOrdenVentas}>Razón social</ThSort>
                <ThSort col="exento" orden={ordenVentas} setOrden={setOrdenVentas} className="text-right">Exento</ThSort>
                <ThSort col="neto" orden={ordenVentas} setOrden={setOrdenVentas} className="text-right">Neto</ThSort>
                <ThSort col="iva" orden={ordenVentas} setOrden={setOrdenVentas} className="text-right">IVA</ThSort>
                <ThSort col="total" orden={ordenVentas} setOrden={setOrdenVentas} className="text-right">Total</ThSort>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ventasOrdenadas.map((d, i) => (
                <TableRow key={`${d.tipo_doc}-${d.folio}-${i}`}>
                  <TableCell><BadgeTipo tipo={d.tipo_doc} /></TableCell>
                  <TableCell className="tabular-nums">{d.folio}</TableCell>
                  <TableCell>{formatFecha(d.fecha_docto)}</TableCell>
                  <TableCell className="tabular-nums">{d.rut_cliente ?? "—"}</TableCell>
                  <TableCell className="max-w-[280px] truncate">{d.razon_social ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMonto(d.monto_exento)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMonto(d.monto_neto)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMonto(d.monto_iva)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{formatMonto(d.monto_total)}</TableCell>
                </TableRow>
              ))}
              {ventas.length === 0 && (
                <TableRow><TableCell colSpan={9} className="py-6 text-center text-muted-foreground">Sin ventas en {etiquetaPeriodo(periodo)}.</TableCell></TableRow>
              )}
            </TableBody>
            {ventas.length > 0 && (
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={5} className="font-medium">Totales</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMonto(sum(ventas.map((d) => d.monto_exento)))}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMonto(sum(ventas.map((d) => d.monto_neto)))}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMonto(sum(ventas.map((d) => d.monto_iva)))}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{formatMonto(sum(ventas.map((d) => d.monto_total)))}</TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>
      </details>

      {/* COMPRAS — detalle plegable */}
      <details className="rounded-xl border bg-card">
        <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-muted-foreground">
          Compras — detalle documento por documento ({compras.length})
        </summary>
        <div className="border-t">
          <Table stickyHeader>
            <TableHeader>
              <TableRow>
                <ThSort col="tipo" orden={ordenCompras} setOrden={setOrdenCompras}>Tipo</ThSort>
                <ThSort col="folio" orden={ordenCompras} setOrden={setOrdenCompras}>Folio</ThSort>
                <ThSort col="fecha" orden={ordenCompras} setOrden={setOrdenCompras}>Fecha</ThSort>
                <ThSort col="rut" orden={ordenCompras} setOrden={setOrdenCompras}>RUT proveedor</ThSort>
                <ThSort col="razon" orden={ordenCompras} setOrden={setOrdenCompras}>Razón social</ThSort>
                <ThSort col="exento" orden={ordenCompras} setOrden={setOrdenCompras} className="text-right">Exento</ThSort>
                <ThSort col="neto" orden={ordenCompras} setOrden={setOrdenCompras} className="text-right">Neto</ThSort>
                <ThSort col="iva" orden={ordenCompras} setOrden={setOrdenCompras} className="text-right">IVA recup.</ThSort>
                <ThSort col="total" orden={ordenCompras} setOrden={setOrdenCompras} className="text-right">Total</ThSort>
              </TableRow>
            </TableHeader>
            <TableBody>
              {comprasOrdenadas.map((d, i) => (
                <TableRow key={`${d.tipo_doc}-${d.rut_proveedor}-${d.folio}-${i}`}>
                  <TableCell><BadgeTipo tipo={d.tipo_doc} /></TableCell>
                  <TableCell className="tabular-nums">{d.folio}</TableCell>
                  <TableCell>{formatFecha(d.fecha_docto)}</TableCell>
                  <TableCell className="tabular-nums">{d.rut_proveedor ?? "—"}</TableCell>
                  <TableCell className="max-w-[280px] truncate">{d.razon_social ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMonto(d.monto_exento)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMonto(d.monto_neto)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMonto(d.iva_recuperable)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{formatMonto(d.monto_total)}</TableCell>
                </TableRow>
              ))}
              {compras.length === 0 && (
                <TableRow><TableCell colSpan={9} className="py-6 text-center text-muted-foreground">Sin compras en {etiquetaPeriodo(periodo)}.</TableCell></TableRow>
              )}
            </TableBody>
            {compras.length > 0 && (
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={5} className="font-medium">Totales</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMonto(sum(compras.map((d) => d.monto_exento)))}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMonto(sum(compras.map((d) => d.monto_neto)))}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMonto(sum(compras.map((d) => d.iva_recuperable)))}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{formatMonto(sum(compras.map((d) => d.monto_total)))}</TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>
      </details>
    </div>
  );
}
