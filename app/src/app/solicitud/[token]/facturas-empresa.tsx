"use client";

import { useCallback, useEffect, useState } from "react";
import { Receipt } from "lucide-react";
import { cargarFacturasEmpresa, type FacturaEmpresa } from "./portal-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMonto } from "@/lib/format";
import { etiquetaPeriodo } from "@/lib/periodos";

function fechaCorta(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d}-${m}-${y}`;
}

function tipoLabel(tipo: string): string {
  return tipo === "nota_credito" ? "Nota de crédito" : "Factura";
}

/**
 * Facturas que RS Tax & Legal le ha emitido al cliente, con su estado de pago.
 * Solo lectura — el cliente las consulta; el estado de pago lo administra RS en
 * el módulo interno /facturacion. Por RPC de token (portal_facturas).
 */
export function FacturasEmpresa({ token }: { token: string }) {
  const [rows, setRows] = useState<FacturaEmpresa[]>([]);
  const [cargando, setCargando] = useState(true);

  const recargar = useCallback(async () => {
    setCargando(true);
    const r = await cargarFacturasEmpresa(token);
    if (r.ok && r.facturas) setRows(r.facturas);
    setCargando(false);
  }, [token]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const pendientes = rows.filter((f) => !f.pagada && f.tipo !== "nota_credito");
  const totalPendiente = pendientes.reduce((acc, f) => acc + (Number(f.monto) || 0), 0);

  return (
    <Card className="card-soft border-transparent">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Receipt className="size-4 text-[var(--brand-teal)]" />
          Facturas de RS Tax &amp; Legal
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Estas son las facturas que RS Tax &amp; Legal te ha emitido y su estado de pago. Si ves un
          cobro que no corresponde, escríbenos.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {cargando ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no hay facturas emitidas a tu empresa.
          </p>
        ) : (
          <>
            {pendientes.length > 0 ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Tienes <strong>{pendientes.length}</strong>{" "}
                {pendientes.length === 1 ? "factura pendiente" : "facturas pendientes"} de pago por un
                total de <strong>{formatMonto(totalPendiente)}</strong>.
              </div>
            ) : (
              <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                Estás al día: no tienes facturas pendientes de pago.
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Documento</th>
                    <th className="py-2 pr-3 font-medium">Período</th>
                    <th className="py-2 pr-3 text-right font-medium">Monto</th>
                    <th className="py-2 pl-3 text-right font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((f) => {
                    const esNc = f.tipo === "nota_credito";
                    return (
                      <tr key={f.id} className="border-b last:border-0">
                        <td className="py-2 pr-3">
                          <span className="font-medium">{tipoLabel(f.tipo)} N° {f.folio}</span>
                          {esNc && f.folio_ref ? (
                            <span className="ml-1 text-xs text-muted-foreground">
                              (ref. factura {f.folio_ref})
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">
                          {etiquetaPeriodo(f.periodo)}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">{formatMonto(f.monto)}</td>
                        <td className="py-2 pl-3 text-right">
                          {esNc ? (
                            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              Nota de crédito
                            </span>
                          ) : f.pagada ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                              Pagada{f.fecha_pago ? ` · ${fechaCorta(f.fecha_pago)}` : ""}
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                              Pendiente
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
