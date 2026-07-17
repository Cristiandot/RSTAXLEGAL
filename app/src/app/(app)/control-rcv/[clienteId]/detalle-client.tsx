"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
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
  clienteId: string;
  periodo: string;
  periodos: string[];
  ventas: DocVenta[];
  compras: DocCompra[];
};

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

export function DetalleRcvClient({ razonSocial, rutEmpresa, clienteId, periodo, periodos, ventas, compras }: Props) {
  const sum = (arr: number[]) => arr.reduce((a, b) => a + (Number(b) || 0), 0);

  return (
    <div className="space-y-4 py-4">
      <Button variant="ghost" size="sm" render={<Link href="/control-rcv" />}>
        <ArrowLeft className="size-4" />
        Volver al control RCV
      </Button>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{razonSocial}</h1>
          <p className="text-sm text-muted-foreground">RUT {rutEmpresa} · Registro de Compras y Ventas del SII</p>
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

      {/* VENTAS */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Ventas ({ventas.length} documentos)</h2>
        <div className="rounded-xl border bg-card">
          <Table stickyHeader>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Folio</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>RUT cliente</TableHead>
                <TableHead>Razón social</TableHead>
                <TableHead className="text-right">Exento</TableHead>
                <TableHead className="text-right">Neto</TableHead>
                <TableHead className="text-right">IVA</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ventas.map((d, i) => (
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
      </section>

      {/* COMPRAS */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Compras ({compras.length} documentos)</h2>
        <div className="rounded-xl border bg-card">
          <Table stickyHeader>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Folio</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>RUT proveedor</TableHead>
                <TableHead>Razón social</TableHead>
                <TableHead className="text-right">Exento</TableHead>
                <TableHead className="text-right">Neto</TableHead>
                <TableHead className="text-right">IVA recup.</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {compras.map((d, i) => (
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
      </section>
    </div>
  );
}
