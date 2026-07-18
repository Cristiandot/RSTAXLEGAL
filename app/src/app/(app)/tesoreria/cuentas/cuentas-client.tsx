"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, HandCoins, Receipt, Mail, Loader2 } from "lucide-react";
import { formatMonto, formatFecha } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { actualizarPlazoPago, actualizarConciliacionDesde, enviarEstadoPago } from "../actions";
import { TesoreriaNav } from "../tesoreria-nav";

export type Aging = {
  vigente: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d91: number;
};

export type FilaCuenta = {
  id: string;
  folio: string | null;
  fecha: string;
  vencimiento: string;
  contraparte: string;
  rut: string | null;
  total: number;
  pendiente: number;
  pagadoPct: number;
  diasMora: number;
  bucket: keyof Aging;
};

const selectCls =
  "h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function KpiCard({ label, valor, tono }: { label: string; valor: string; tono?: "ok" | "alerta" | "fuerte" }) {
  const color = tono === "ok" ? "text-emerald-600" : tono === "alerta" ? "text-red-600" : "";
  return (
    <div className="card-soft rounded-xl bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold tabular-nums ${color}`}>{valor}</div>
    </div>
  );
}

const BUCKET_LABEL: Record<keyof Aging, string> = {
  vigente: "Vigente",
  d1_30: "1-30 días",
  d31_60: "31-60 días",
  d61_90: "61-90 días",
  d91: "+91 días",
};

function BucketBadge({ bucket }: { bucket: keyof Aging }) {
  const cls: Record<keyof Aging, string> = {
    vigente: "border-emerald-200 bg-emerald-50 text-emerald-700",
    d1_30: "border-amber-200 bg-amber-50 text-amber-700",
    d31_60: "border-orange-200 bg-orange-50 text-orange-700",
    d61_90: "border-red-200 bg-red-50 text-red-700",
    d91: "border-red-300 bg-red-100 text-red-800",
  };
  return (
    <Badge variant="outline" className={cls[bucket]}>
      {BUCKET_LABEL[bucket]}
    </Badge>
  );
}

export function CuentasClient({
  tipo,
  clientes,
  clienteSeleccionado,
  plazo,
  conciliacionDesde,
  aging,
  filas,
  correoPorRut,
  generado,
}: {
  tipo: "cobrar" | "pagar";
  clientes: { id: string; razonSocial: string }[];
  clienteSeleccionado: string | null;
  plazo: number;
  conciliacionDesde: string | null;
  aging: Aging;
  filas: FilaCuenta[];
  correoPorRut: Record<string, string>;
  generado: string;
}) {
  const router = useRouter();
  const [buscar, setBuscar] = useState("");
  const [plazoEdit, setPlazoEdit] = useState(String(plazo));
  const [desdeEdit, setDesdeEdit] = useState(conciliacionDesde ?? "");
  const [pending, startTransition] = useTransition();

  // Cobranza (solo Por cobrar): panel de envío del estado de pago por deudor.
  const rutKey = (r: string | null) => (r ?? "").toUpperCase().replace(/[^0-9K]/g, "");
  const [cobranzaRut, setCobranzaRut] = useState<string | null>(null);
  const [correoEnvio, setCorreoEnvio] = useState("");
  const [notaEnvio, setNotaEnvio] = useState("");
  const [msgEnvio, setMsgEnvio] = useState<{ ok: boolean; texto: string } | null>(null);

  function abrirCobranza(f: FilaCuenta) {
    const rk = rutKey(f.rut);
    if (cobranzaRut === rk) {
      setCobranzaRut(null);
      return;
    }
    setCobranzaRut(rk);
    setCorreoEnvio(correoPorRut[rk] ?? "");
    setNotaEnvio("");
    setMsgEnvio(null);
  }

  function enviarCobranza(f: FilaCuenta) {
    if (!clienteSeleccionado || !f.rut) return;
    startTransition(async () => {
      const res = await enviarEstadoPago({
        clienteId: clienteSeleccionado,
        rut: f.rut!,
        correo: correoEnvio,
        nota: notaEnvio || undefined,
      });
      if (!res.ok) setMsgEnvio({ ok: false, texto: res.error ?? "No se pudo enviar." });
      else {
        setMsgEnvio({ ok: true, texto: `Estado de pago enviado (${res.docs} documento${res.docs !== 1 ? "s" : ""}).` });
        setNotaEnvio("");
      }
    });
  }

  function guardarDesde() {
    if (!clienteSeleccionado || (desdeEdit || null) === (conciliacionDesde ?? null)) return;
    startTransition(async () => {
      const res = await actualizarConciliacionDesde({
        clienteId: clienteSeleccionado,
        fecha: desdeEdit || null,
      });
      if (res.ok) router.refresh();
    });
  }

  const esCobrar = tipo === "cobrar";
  const vencido = aging.d1_30 + aging.d31_60 + aging.d61_90 + aging.d91;
  const total = vencido + aging.vigente;

  const filtrados = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    if (!q) return filas;
    return filas.filter((f) =>
      `${f.contraparte} ${f.rut ?? ""} ${f.folio ?? ""}`.toLowerCase().includes(q),
    );
  }, [filas, buscar]);

  function irA(next: { tipo?: string; cliente?: string }) {
    const t = next.tipo ?? tipo;
    const c = next.cliente ?? clienteSeleccionado ?? "";
    router.push(`/tesoreria/cuentas?tipo=${t}${c ? `&cliente=${c}` : ""}`);
  }

  function guardarPlazo() {
    const dias = Number(plazoEdit);
    if (!clienteSeleccionado || !Number.isFinite(dias) || dias === plazo) return;
    startTransition(async () => {
      const res = await actualizarPlazoPago({
        clienteId: clienteSeleccionado,
        campo: esCobrar ? "plazo_pago_ventas" : "plazo_pago_compras",
        dias,
      });
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2">
        {esCobrar ? <HandCoins className="h-5 w-5 text-muted-foreground" /> : <Receipt className="h-5 w-5 text-muted-foreground" />}
        <h1 className="font-heading text-2xl font-semibold">
          {esCobrar ? "Cuentas por cobrar" : "Cuentas por pagar"}
        </h1>
      </div>
      <TesoreriaNav cliente={clienteSeleccionado} />
      <p className="mt-3 text-sm text-muted-foreground">
        {esCobrar
          ? "Facturas de venta emitidas al SII que aún no se concilian como pagadas."
          : "Facturas de compra del SII que aún no se concilian como pagadas."}{" "}
        Vencimiento estimado = fecha del documento + plazo de pago. Al día {formatFecha(generado)}.
      </p>

      {/* Controles: tipo, empresa, plazo */}
      <div className="mt-5 flex flex-wrap items-end gap-3">
        <div className="inline-flex rounded-lg border border-border p-0.5">
          <button
            onClick={() => irA({ tipo: "cobrar" })}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${esCobrar ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Por cobrar
          </button>
          <button
            onClick={() => irA({ tipo: "pagar" })}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${!esCobrar ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Por pagar
          </button>
        </div>

        <div>
          <label className="block text-xs text-muted-foreground">Empresa</label>
          <select
            className={`${selectCls} mt-1 w-72`}
            value={clienteSeleccionado ?? ""}
            onChange={(e) => irA({ cliente: e.target.value })}
          >
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.razonSocial}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-muted-foreground">
            Plazo {esCobrar ? "clientes" : "proveedores"} (días)
          </label>
          <div className="mt-1 flex items-center gap-1">
            <Input
              type="number"
              value={plazoEdit}
              onChange={(e) => setPlazoEdit(e.target.value)}
              className="h-9 w-20"
            />
            <button
              onClick={guardarPlazo}
              disabled={pending || Number(plazoEdit) === plazo}
              className="h-9 rounded-md border border-border px-2 text-xs hover:bg-muted/50 disabled:opacity-40"
            >
              Guardar
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs text-muted-foreground">Conciliar desde</label>
          <div className="mt-1 flex items-center gap-1">
            <Input
              type="date"
              value={desdeEdit}
              onChange={(e) => setDesdeEdit(e.target.value)}
              className="h-9 w-40"
            />
            <button
              onClick={guardarDesde}
              disabled={pending || (desdeEdit || null) === (conciliacionDesde ?? null)}
              className="h-9 rounded-md border border-border px-2 text-xs hover:bg-muted/50 disabled:opacity-40"
            >
              Guardar
            </button>
          </div>
        </div>
      </div>

      {/* Aging */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Vigente" valor={formatMonto(aging.vigente)} tono="ok" />
        <KpiCard label="1-30 días" valor={formatMonto(aging.d1_30)} tono="alerta" />
        <KpiCard label="31-60 días" valor={formatMonto(aging.d31_60)} tono="alerta" />
        <KpiCard label="61-90 días" valor={formatMonto(aging.d61_90)} tono="alerta" />
        <KpiCard label="+91 días" valor={formatMonto(aging.d91)} tono="alerta" />
        <KpiCard label="Total vencido" valor={formatMonto(vencido)} tono="alerta" />
      </div>
      <div className="mt-2 text-sm text-muted-foreground">
        Total {esCobrar ? "por cobrar" : "por pagar"}:{" "}
        <span className="font-semibold text-foreground tabular-nums">{formatMonto(total)}</span> ·{" "}
        {filas.length} documentos
      </div>

      {/* Buscar */}
      <div className="mt-4 flex items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder={esCobrar ? "Buscar cliente, RUT, folio…" : "Buscar proveedor, RUT, folio…"}
            className="h-9 w-72 pl-8"
          />
        </div>
        <span className="text-sm text-muted-foreground">{filtrados.length} documentos</span>
      </div>

      {/* Tabla */}
      <div className="card-soft mt-3 overflow-hidden rounded-xl bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{esCobrar ? "Cliente" : "Proveedor"}</TableHead>
              <TableHead className="w-[110px]">Folio</TableHead>
              <TableHead className="w-[110px]">Fecha</TableHead>
              <TableHead className="w-[120px]">Vence</TableHead>
              <TableHead className="w-[130px]">Antigüedad</TableHead>
              <TableHead className="w-[140px] text-right">Pendiente</TableHead>
              {esCobrar && <TableHead className="w-[110px] text-right">Cobranza</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtrados.length === 0 ? (
              <TableRow>
                <TableCell colSpan={esCobrar ? 7 : 6} className="py-8 text-center text-sm text-muted-foreground">
                  Sin documentos {esCobrar ? "por cobrar" : "por pagar"} para esta empresa.
                </TableCell>
              </TableRow>
            ) : (
              filtrados.map((f) => {
                const abierto = esCobrar && cobranzaRut === rutKey(f.rut);
                return (
                  <Fragment key={f.id}>
                    <TableRow>
                      <TableCell>
                        <span className="block">{f.contraparte}</span>
                        {f.rut && <span className="block text-xs text-muted-foreground">{f.rut}</span>}
                      </TableCell>
                      <TableCell className="tabular-nums">{f.folio ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">{formatFecha(f.fecha)}</TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">{formatFecha(f.vencimiento)}</TableCell>
                      <TableCell>
                        <BucketBadge bucket={f.bucket} />
                        {f.diasMora > 0 && (
                          <span className="ml-1 text-xs text-muted-foreground">{f.diasMora}d</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatMonto(f.pendiente)}
                        {f.pagadoPct > 0 && (
                          <span className="block text-xs text-muted-foreground">{f.pagadoPct}% pagado</span>
                        )}
                      </TableCell>
                      {esCobrar && (
                        <TableCell className="text-right">
                          {f.rut ? (
                            <button
                              onClick={() => abrirCobranza(f)}
                              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted/50"
                            >
                              <Mail className="h-3.5 w-3.5" /> Enviar
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">sin RUT</span>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                    {abierto && (
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableCell colSpan={7} className="p-4">
                          <div className="text-xs font-medium text-muted-foreground">
                            Enviar estado de pago a {f.contraparte} — incluye TODOS sus documentos
                            pendientes con esta empresa, con copia a la empresa.
                          </div>
                          <div className="mt-2 flex flex-wrap items-end gap-2">
                            <div>
                              <label className="block text-xs text-muted-foreground">Correo del deudor</label>
                              <Input
                                type="email"
                                value={correoEnvio}
                                onChange={(e) => setCorreoEnvio(e.target.value)}
                                placeholder="correo@deudor.cl"
                                className="mt-1 h-9 w-64"
                              />
                            </div>
                            <div className="min-w-64 flex-1">
                              <label className="block text-xs text-muted-foreground">Nota (opcional)</label>
                              <Input
                                value={notaEnvio}
                                onChange={(e) => setNotaEnvio(e.target.value)}
                                placeholder="Ej: favor regularizar antes de fin de mes"
                                className="mt-1 h-9 w-full"
                              />
                            </div>
                            <button
                              onClick={() => enviarCobranza(f)}
                              disabled={pending || !correoEnvio.includes("@")}
                              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                            >
                              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                              Enviar estado de pago
                            </button>
                          </div>
                          {msgEnvio && (
                            <div
                              className={`mt-2 rounded-lg border p-2.5 text-sm ${
                                msgEnvio.ok
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                  : "border-red-200 bg-red-50 text-red-700"
                              }`}
                            >
                              {msgEnvio.texto}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
