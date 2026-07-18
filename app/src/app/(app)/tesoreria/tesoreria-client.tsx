"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Landmark, Wallet, ChevronDown, Check, Loader2, Undo2, Zap } from "lucide-react";
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
import {
  sugerenciasConciliacion,
  conciliarMovimiento,
  categorizarMovimiento,
  desconciliarMovimiento,
  conciliarAutomatico,
  type Sugerencia,
} from "./actions";
import { TesoreriaNav } from "./tesoreria-nav";

export type CuentaResumen = {
  id: string;
  clienteId: string;
  razonSocial: string;
  rutEmpresa: string | null;
  fuente: string;
  bancoNombre: string | null;
  alias: string | null;
  numeroCuenta: string | null;
  moneda: string;
  activo: boolean;
  abonos: number;
  cargos: number;
  neto: number;
  movimientos: number;
  pendientes: number;
};

export type Movimiento = {
  id: string;
  fecha: string;
  glosa: string | null;
  abono: number;
  cargo: number;
  saldo: number | null;
  estado: string;
  categoria: string | null;
  referencia: string | null;
  contraparte: string | null;
};

const ESTADOS: { valor: string; etiqueta: string }[] = [
  { valor: "", etiqueta: "Todos" },
  { valor: "pendiente", etiqueta: "Por conciliar" },
  { valor: "conciliado", etiqueta: "Conciliados" },
  { valor: "parcial", etiqueta: "Parciales" },
  { valor: "ignorado", etiqueta: "Ignorados" },
];

const selectCls =
  "h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function KpiCard({ label, valor, tono }: { label: string; valor: string; tono?: "ok" | "alerta" | "neutro" }) {
  const color = tono === "ok" ? "text-emerald-600" : tono === "alerta" ? "text-red-600" : "";
  return (
    <div className="card-soft rounded-xl bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-xl font-semibold tabular-nums ${color}`}>{valor}</div>
    </div>
  );
}

function EstadoBadge({ estado }: { estado: string }) {
  const map: Record<string, string> = {
    pendiente: "border-amber-200 bg-amber-50 text-amber-700",
    conciliado: "border-emerald-200 bg-emerald-50 text-emerald-700",
    parcial: "border-blue-200 bg-blue-50 text-blue-700",
    ignorado: "border-border bg-muted text-muted-foreground",
  };
  const label: Record<string, string> = {
    pendiente: "Por conciliar",
    conciliado: "Conciliado",
    parcial: "Parcial",
    ignorado: "Ignorado",
  };
  return (
    <Badge variant="outline" className={map[estado] ?? "border-border"}>
      {label[estado] ?? estado}
    </Badge>
  );
}

const nombreFuente = (f: string) =>
  ({ mercadopago: "Mercado Pago", generico: "Genérico", banco_demo: "Banco (demo)" } as Record<string, string>)[f] ?? f;

export function TesoreriaClient({
  cuentas,
  cuentaSeleccionada,
  movimientos,
  errorCarga,
}: {
  cuentas: CuentaResumen[];
  cuentaSeleccionada: string | null;
  movimientos: Movimiento[];
  errorCarga: string | null;
}) {
  const router = useRouter();
  const [buscar, setBuscar] = useState("");
  const [estadoF, setEstadoF] = useState("");
  const [expandido, setExpandido] = useState<string | null>(null);
  const [sugs, setSugs] = useState<Record<string, Sugerencia[] | "cargando">>({});
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [autoMsg, setAutoMsg] = useState<string | null>(null);

  function conciliarAuto() {
    if (!cuentaSeleccionada) return;
    setAutoMsg(null);
    startTransition(async () => {
      const res = await conciliarAutomatico(cuentaSeleccionada);
      if (!res.ok) setMsg(res.error ?? "Error en el cruce automático");
      else {
        setAutoMsg(`Cruce automático: ${res.conciliados} conciliados · ${res.revisar} para revisar a mano.`);
        router.refresh();
      }
    });
  }

  const cuenta = cuentas.find((c) => c.id === cuentaSeleccionada) ?? null;

  const filtrados = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return movimientos.filter((m) => {
      if (estadoF && m.estado !== estadoF) return false;
      if (q) {
        const hay = `${m.glosa ?? ""} ${m.categoria ?? ""} ${m.referencia ?? ""} ${m.contraparte ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [movimientos, buscar, estadoF]);

  async function toggleExpand(m: Movimiento) {
    if (expandido === m.id) {
      setExpandido(null);
      return;
    }
    setExpandido(m.id);
    if (!sugs[m.id]) {
      setSugs((s) => ({ ...s, [m.id]: "cargando" }));
      const res = await sugerenciasConciliacion(m.id);
      setSugs((s) => ({ ...s, [m.id]: res.sugerencias ?? [] }));
    }
  }

  function confirmar(m: Movimiento, sug: Sugerencia) {
    startTransition(async () => {
      const res = await conciliarMovimiento({
        movimientoId: m.id,
        docTipo: sug.docTipo,
        docId: sug.docId,
        docRef: sug.ref,
        monto: Math.abs(m.abono - m.cargo),
      });
      if (!res.ok) setMsg(res.error ?? "Error al conciliar");
      else {
        setMsg(null);
        setExpandido(null);
        router.refresh();
      }
    });
  }

  function categorizar(m: Movimiento, categoria: "transferencia_interna" | "comision" | "sin_documento") {
    startTransition(async () => {
      const res = await categorizarMovimiento({ movimientoId: m.id, categoria });
      if (!res.ok) setMsg(res.error ?? "Error");
      else {
        setExpandido(null);
        router.refresh();
      }
    });
  }

  function deshacer(m: Movimiento) {
    startTransition(async () => {
      const res = await desconciliarMovimiento(m.id);
      if (!res.ok) setMsg(res.error ?? "Error");
      else router.refresh();
    });
  }

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2">
        <Landmark className="h-5 w-5 text-muted-foreground" />
        <h1 className="font-heading text-2xl font-semibold">Tesorería y Banco</h1>
      </div>
      <TesoreriaNav cliente={cuenta?.clienteId ?? null} />
      <p className="mt-3 text-sm text-muted-foreground">
        Conciliación bancaria: la cartola que sube el cliente, cruzada contra las facturas y pagos
        que ya tenemos del SII.
      </p>

      {errorCarga && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Error al cargar: {errorCarga}
        </div>
      )}
      {msg && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{msg}</div>
      )}

      {cuentas.length === 0 ? (
        <div className="card-soft mt-6 rounded-xl bg-card p-8 text-center text-sm text-muted-foreground">
          Aún no hay cuentas bancarias cargadas. Cuando el cliente suba su cartola (o se cargue con el
          importador), aparecerán acá sus movimientos para conciliar.
        </div>
      ) : (
        <>
          {/* Selector de cuentas */}
          <div className="mt-5 flex flex-wrap gap-2">
            {cuentas.map((c) => {
              const activa = c.id === cuentaSeleccionada;
              return (
                <button
                  key={c.id}
                  onClick={() => router.push(`/tesoreria?cuenta=${c.id}`)}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition ${
                    activa ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border bg-card hover:bg-muted/50"
                  }`}
                >
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                  <span>
                    <span className="block font-medium">{c.alias || nombreFuente(c.fuente)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {c.razonSocial} · {nombreFuente(c.fuente)}
                      {c.pendientes > 0 ? ` · ${c.pendientes} por conciliar` : ""}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* KPIs de la cuenta */}
          {cuenta && (
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <KpiCard label="Abonos" valor={formatMonto(cuenta.abonos)} tono="ok" />
              <KpiCard label="Cargos" valor={formatMonto(cuenta.cargos)} tono="alerta" />
              <KpiCard label="Neto del período" valor={formatMonto(cuenta.neto)} tono={cuenta.neto >= 0 ? "ok" : "alerta"} />
              <KpiCard label="Por conciliar" valor={`${cuenta.pendientes} / ${cuenta.movimientos}`} />
            </div>
          )}

          {/* Filtros */}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
                placeholder="Buscar glosa, categoría, referencia…"
                className="h-9 w-64 pl-8"
              />
            </div>
            <select className={selectCls} value={estadoF} onChange={(e) => setEstadoF(e.target.value)}>
              {ESTADOS.map((e) => (
                <option key={e.valor} value={e.valor}>
                  {e.etiqueta}
                </option>
              ))}
            </select>
            <span className="text-sm text-muted-foreground">{filtrados.length} movimientos</span>
            {cuenta && cuenta.pendientes > 0 && (
              <button
                onClick={conciliarAuto}
                disabled={pending}
                className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                Conciliar automáticamente
              </button>
            )}
          </div>
          {autoMsg && (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              {autoMsg}
            </div>
          )}

          {/* Tabla de movimientos */}
          <div className="card-soft mt-3 overflow-hidden rounded-xl bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[110px]">Fecha</TableHead>
                  <TableHead>Glosa</TableHead>
                  <TableHead className="text-right">Cargo</TableHead>
                  <TableHead className="text-right">Abono</TableHead>
                  <TableHead className="w-[150px]">Estado</TableHead>
                  <TableHead className="w-[130px] text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      Sin movimientos para el filtro.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtrados.map((m) => {
                    const abierto = expandido === m.id;
                    const sug = sugs[m.id];
                    return (
                      <Fragment key={m.id}>
                        <TableRow className={m.estado === "ignorado" ? "opacity-60" : ""}>
                          <TableCell className="whitespace-nowrap tabular-nums">{formatFecha(m.fecha)}</TableCell>
                          <TableCell>
                            <span className="block">{m.glosa || "—"}</span>
                            <span className="block text-xs text-muted-foreground">
                              {m.contraparte ? m.contraparte : ""}
                              {m.categoria ? `${m.contraparte ? " · " : ""}${m.categoria}` : ""}
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-red-600">
                            {m.cargo > 0 ? formatMonto(m.cargo) : ""}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-emerald-600">
                            {m.abono > 0 ? formatMonto(m.abono) : ""}
                          </TableCell>
                          <TableCell>
                            <EstadoBadge estado={m.estado} />
                          </TableCell>
                          <TableCell className="text-right">
                            {m.estado === "pendiente" ? (
                              <button
                                onClick={() => toggleExpand(m)}
                                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted/50"
                              >
                                Conciliar
                                <ChevronDown className={`h-3.5 w-3.5 transition ${abierto ? "rotate-180" : ""}`} />
                              </button>
                            ) : m.estado === "conciliado" || m.estado === "parcial" || m.estado === "ignorado" ? (
                              <button
                                onClick={() => deshacer(m)}
                                disabled={pending}
                                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                              >
                                <Undo2 className="h-3.5 w-3.5" /> Deshacer
                              </button>
                            ) : null}
                          </TableCell>
                        </TableRow>

                        {abierto && (
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableCell colSpan={6} className="p-4">
                              <div className="text-xs font-medium text-muted-foreground">
                                Sugerencias para {formatMonto(Math.abs(m.abono - m.cargo))}
                                {m.cargo > 0 ? " (pago)" : " (cobro)"}
                              </div>

                              {sug === "cargando" ? (
                                <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                                  <Loader2 className="h-4 w-4 animate-spin" /> Buscando documentos…
                                </div>
                              ) : sug && sug.length > 0 ? (
                                <div className="mt-2 space-y-1.5">
                                  {sug.map((s, i) => (
                                    <div
                                      key={`${s.docTipo}-${s.docId}-${i}`}
                                      className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2"
                                    >
                                      <div className="text-sm">
                                        <span className="font-medium">{s.ref}</span>
                                        <span className="text-muted-foreground"> · {s.contraparte ?? "—"}</span>
                                        <span className="ml-2 tabular-nums text-muted-foreground">
                                          {formatMonto(s.monto)} · {formatFecha(s.fecha)}
                                        </span>
                                        {s.rutMatch ? (
                                          <Badge variant="outline" className="ml-2 border-emerald-200 bg-emerald-50 text-emerald-700">
                                            RUT calza
                                          </Badge>
                                        ) : s.folioMatch ? (
                                          <Badge variant="outline" className="ml-2 border-cyan-200 bg-cyan-50 text-cyan-700">
                                            folio en glosa
                                          </Badge>
                                        ) : s.docTipo === "impuesto" || s.docTipo === "remuneracion" ? (
                                          <Badge variant="outline" className="ml-2 border-violet-200 bg-violet-50 text-violet-700">
                                            registro del panel
                                          </Badge>
                                        ) : (
                                          <Badge variant="outline" className="ml-2 border-amber-200 bg-amber-50 text-amber-700">
                                            solo monto
                                          </Badge>
                                        )}
                                      </div>
                                      <button
                                        onClick={() => confirmar(m, s)}
                                        disabled={pending}
                                        className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                                      >
                                        <Check className="h-3.5 w-3.5" /> Conciliar
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="mt-2 text-sm text-muted-foreground">
                                  No se encontró ningún documento que calce por monto.
                                </div>
                              )}

                              {/* Categorizar (no va contra documento) */}
                              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                                <span className="text-xs text-muted-foreground">O marcar como:</span>
                                <button onClick={() => categorizar(m, "transferencia_interna")} disabled={pending} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted/50 disabled:opacity-50">
                                  Traspaso entre cuentas
                                </button>
                                <button onClick={() => categorizar(m, "comision")} disabled={pending} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted/50 disabled:opacity-50">
                                  Comisión / gasto banco
                                </button>
                                <button onClick={() => categorizar(m, "sin_documento")} disabled={pending} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted/50 disabled:opacity-50">
                                  Sin documento
                                </button>
                              </div>
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
        </>
      )}
    </div>
  );
}
