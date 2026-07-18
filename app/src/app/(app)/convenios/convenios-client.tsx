"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Search, Trash2, CalendarClock } from "lucide-react";
import { formatFecha, formatMonto } from "@/lib/format";
import { ThSort } from "@/components/th-sort";
import { comparar, ordenarPorGrupo, type Orden } from "@/lib/ordenar";
import type { UsuarioOpcion } from "@/lib/ciclos";
import {
  type ConvenioRow,
  type CuotaRow,
  type Organismo,
  type TipoConvenio,
  TIPO_LABEL,
  ORGANISMO_LABEL,
  claseEstadoConvenio,
} from "@/lib/convenios";
import { guardarConvenio, marcarCuotaPagada, borrarConvenio, type CuotaInput } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  soloCerrarConX,
} from "@/components/ui/dialog";

export type EmpresaOpcion = { id: string; razon_social: string; rut_empresa: string | null };

const selectCls =
  "h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

type FormCuota = { key: string; monto: string; fechaVencimiento: string; fechaPago: string };

/** Días entre hoy y una fecha ISO (negativo = ya venció). */
function diasHasta(iso: string | null): number | null {
  if (!iso) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const d = new Date(`${iso}T00:00:00`);
  return Math.round((d.getTime() - hoy.getTime()) / 86_400_000);
}

export function ConveniosClient({
  convenios,
  cuotas,
  empresas,
  usuarios,
  errorCarga,
}: {
  convenios: ConvenioRow[];
  cuotas: CuotaRow[];
  empresas: EmpresaOpcion[];
  usuarios: UsuarioOpcion[];
  errorCarga: string | null;
}) {
  const router = useRouter();
  const [buscar, setBuscar] = useState("");
  const [tipoF, setTipoF] = useState("");
  const [estadoF, setEstadoF] = useState("");
  const [orden, setOrden] = useState<Orden>(null);
  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState<ConvenioRow | null>(null);
  const [guardando, startGuardar] = useTransition();
  const [, startCuota] = useTransition();

  // Estado del formulario.
  const [clienteId, setClienteId] = useState("");
  const [tipo, setTipo] = useState<TipoConvenio>("convenio");
  const [organismo, setOrganismo] = useState<Organismo>("tesoreria");
  const [folio, setFolio] = useState("");
  const [concepto, setConcepto] = useState("");
  const [montoTotal, setMontoTotal] = useState("");
  const [fechaSuscripcion, setFechaSuscripcion] = useState("");
  const [caido, setCaido] = useState(false);
  const [observaciones, setObservaciones] = useState("");
  const [responsableId, setResponsableId] = useState("");
  const [periodos, setPeriodos] = useState("");
  const [formCuotas, setFormCuotas] = useState<FormCuota[]>([]);
  const [keySeq, setKeySeq] = useState(0);

  const cuotasPorConvenio = useMemo(() => {
    const m = new Map<string, CuotaRow[]>();
    for (const c of cuotas) {
      const arr = m.get(c.convenio_id) ?? [];
      arr.push(c);
      m.set(c.convenio_id, arr);
    }
    return m;
  }, [cuotas]);

  function nuevaCuotaKey() {
    const k = `k${keySeq}`;
    setKeySeq((s) => s + 1);
    return k;
  }

  function abrirNuevo() {
    setEditando(null);
    setClienteId("");
    setTipo("convenio");
    setOrganismo("tesoreria");
    setFolio("");
    setConcepto("");
    setMontoTotal("");
    setFechaSuscripcion("");
    setCaido(false);
    setObservaciones("");
    setResponsableId("");
    setPeriodos("");
    setFormCuotas([]);
    setAbierto(true);
  }

  function abrirEdicion(cv: ConvenioRow) {
    setEditando(cv);
    setClienteId(cv.cliente_id);
    setTipo(cv.tipo);
    setOrganismo(cv.organismo);
    setFolio(cv.folio ?? "");
    setConcepto(cv.concepto ?? "");
    setMontoTotal(cv.monto_total == null ? "" : String(cv.monto_total));
    setFechaSuscripcion(cv.fecha_suscripcion ?? "");
    setCaido(cv.caido);
    setObservaciones(cv.observaciones ?? "");
    setResponsableId(cv.responsable_id ?? "");
    setPeriodos((cv.periodos_f29 ?? []).join(", "));
    const cs = (cuotasPorConvenio.get(cv.id) ?? []).map((q) => ({
      key: `db${q.id}`,
      monto: q.monto == null ? "" : String(q.monto),
      fechaVencimiento: q.fecha_vencimiento ?? "",
      fechaPago: q.fecha_pago ?? "",
    }));
    setFormCuotas(cs);
    setAbierto(true);
  }

  function agregarCuota() {
    setFormCuotas((cs) => [...cs, { key: nuevaCuotaKey(), monto: "", fechaVencimiento: "", fechaPago: "" }]);
  }

  function guardar() {
    if (!clienteId) {
      toast.error("Elige la empresa.");
      return;
    }
    const cuotasInput: CuotaInput[] = formCuotas.map((c, i) => ({
      nCuota: i + 1,
      monto: c.monto.trim() || null,
      fechaVencimiento: c.fechaVencimiento || null,
      fechaPago: c.fechaPago || null,
    }));
    startGuardar(async () => {
      const res = await guardarConvenio({
        id: editando?.id ?? null,
        clienteId,
        tipo,
        organismo,
        folio: folio.trim() || null,
        concepto: concepto.trim() || null,
        montoTotal: montoTotal.trim() || null,
        fechaSuscripcion: fechaSuscripcion || null,
        caido,
        observaciones: observaciones.trim() || null,
        responsableId: responsableId || null,
        cuotas: cuotasInput,
        periodosF29: periodos.split(/[,\s]+/).filter(Boolean),
      });
      if (res.ok) {
        toast.success(editando ? "Convenio actualizado" : "Convenio creado");
        setAbierto(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al guardar");
      }
    });
  }

  function togglePago(cuota: CuotaRow) {
    const hoy = new Date().toISOString().slice(0, 10);
    const nueva = cuota.fecha_pago ? null : hoy;
    startCuota(async () => {
      const res = await marcarCuotaPagada(cuota.id, nueva);
      if (res.ok) router.refresh();
      else toast.error(res.error ?? "Error");
    });
  }

  function eliminar() {
    if (!editando) return;
    if (!confirm("¿Borrar este convenio y sus cuotas? No se puede deshacer.")) return;
    startGuardar(async () => {
      const res = await borrarConvenio(editando.id);
      if (res.ok) {
        toast.success("Convenio borrado");
        setAbierto(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al borrar (¿tienes permiso de admin?)");
      }
    });
  }

  const filtradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    const out = convenios.filter((c) => {
      if (q) {
        const t = `${c.razon_social} ${c.rut_empresa ?? ""} ${c.folio ?? ""} ${c.concepto ?? ""}`.toLowerCase();
        if (!t.includes(q)) return false;
      }
      if (tipoF && c.tipo !== tipoF) return false;
      if (estadoF && c.estado !== estadoF) return false;
      return true;
    });
    // Orden por defecto = prioridad de cartera (A.1 → D.45), con la razón
    // social como desempate. Sin grupo queda al final.
    if (!orden)
      return ordenarPorGrupo(
        out,
        (c) => c.grupo_codigo,
        (c) => c.razon_social,
      );
    const val = (c: ConvenioRow): unknown => {
      switch (orden.col) {
        case "empresa":
          return c.razon_social;
        case "tipo":
          return TIPO_LABEL[c.tipo];
        case "organismo":
          return ORGANISMO_LABEL[c.organismo];
        case "folio":
          return c.folio;
        case "monto":
          return c.monto_total == null ? null : Number(c.monto_total);
        case "cuotas":
          return c.n_cuotas || null;
        case "vencimiento":
          return c.proximo_vencimiento;
        case "estado":
          return c.estado;
        default:
          return null;
      }
    };
    return [...out].sort((a, b) => comparar(val(a), val(b), orden.dir));
  }, [convenios, buscar, tipoF, estadoF, orden]);

  const resumen = [
    { label: "Total", valor: convenios.length },
    { label: "Vigentes", valor: convenios.filter((c) => c.estado === "Vigente").length },
    { label: "Pagados", valor: convenios.filter((c) => c.estado === "Pagado").length },
    {
      label: "Vencen ≤ 15 días",
      valor: convenios.filter((c) => {
        if (c.estado !== "Vigente") return false;
        const d = diasHasta(c.proximo_vencimiento);
        return d !== null && d <= 15;
      }).length,
    },
  ];

  return (
    <div className="flex flex-col gap-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl">Convenios y multas</h1>
          <p className="text-sm text-muted-foreground">
            Convenios de pago y multas por empresa, con sus cuotas: vencimientos, pagos y estado.
          </p>
        </div>
        <Button onClick={abrirNuevo}>
          <Plus className="size-4" /> Nuevo convenio / multa
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {resumen.map((r) => (
          <div key={r.label} className="rounded-xl border border-border bg-card px-4 py-3">
            <div className="text-xs text-muted-foreground">{r.label}</div>
            <div className="text-2xl font-semibold tabular-nums">{r.valor}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-56">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar empresa, N° o concepto…"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            className="pl-8"
          />
        </div>
        <select className={selectCls} value={tipoF} onChange={(e) => setTipoF(e.target.value)}>
          <option value="">Todos los tipos</option>
          <option value="convenio">Convenios de pago</option>
          <option value="multa">Multas</option>
        </select>
        <select className={selectCls} value={estadoF} onChange={(e) => setEstadoF(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="Vigente">Vigente</option>
          <option value="Pagado">Pagado</option>
          <option value="Caído">Caído</option>
        </select>
      </div>

      {errorCarga ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Error al cargar: {errorCarga}
        </div>
      ) : null}

      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <ThSort col="empresa" orden={orden} setOrden={setOrden}>Empresa</ThSort>
              <ThSort col="tipo" orden={orden} setOrden={setOrden}>Tipo</ThSort>
              <ThSort col="organismo" orden={orden} setOrden={setOrden}>Organismo</ThSort>
              <ThSort col="folio" orden={orden} setOrden={setOrden}>N°</ThSort>
              <ThSort col="monto" orden={orden} setOrden={setOrden} className="text-right">Pagado / Total</ThSort>
              <ThSort col="cuotas" orden={orden} setOrden={setOrden}>Cuotas</ThSort>
              <ThSort col="vencimiento" orden={orden} setOrden={setOrden}>Próximo venc.</ThSort>
              <ThSort col="estado" orden={orden} setOrden={setOrden}>Estado</ThSort>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                  Sin convenios ni multas registrados todavía.
                </TableCell>
              </TableRow>
            ) : (
              filtradas.map((c) => {
                const d = diasHasta(c.proximo_vencimiento);
                const urgente = c.estado === "Vigente" && d !== null && d <= 15;
                return (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer"
                    onClick={() => abrirEdicion(c)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {c.grupo_codigo ? (
                          <Badge variant="outline" className="shrink-0 text-[10px]">
                            {c.grupo_codigo}
                          </Badge>
                        ) : null}
                        <span className="font-medium">{c.razon_social}</span>
                      </div>
                    </TableCell>
                    <TableCell>{TIPO_LABEL[c.tipo]}</TableCell>
                    <TableCell>{ORGANISMO_LABEL[c.organismo]}</TableCell>
                    <TableCell className="tabular-nums">{c.folio ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMonto(c.monto_pagado)} / {formatMonto(c.monto_total)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {c.n_cuotas ? `${c.cuotas_pagadas}/${c.n_cuotas}` : "—"}
                    </TableCell>
                    <TableCell className={urgente ? "font-medium text-red-600" : ""}>
                      {c.proximo_vencimiento ? (
                        <span className="inline-flex items-center gap-1">
                          {urgente ? <CalendarClock className="size-3.5" /> : null}
                          {formatFecha(c.proximo_vencimiento)}
                          {d !== null ? (
                            <span className="text-xs text-muted-foreground">
                              ({d < 0 ? `${-d}d vencida` : `${d}d`})
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={claseEstadoConvenio(c.estado)}>
                        {c.estado}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={abierto} onOpenChange={soloCerrarConX(() => setAbierto(false))}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar" : "Nuevo"} convenio / multa</DialogTitle>
            <DialogDescription>
              Se ingresa una vez; el control de vencimientos y pagos se lleva con las cuotas.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="cv_empresa">Empresa</Label>
              <select
                id="cv_empresa"
                className={selectCls}
                value={clienteId}
                onChange={(e) => setClienteId(e.target.value)}
                disabled={!!editando}
              >
                <option value="">Elige la empresa…</option>
                {empresas.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.razon_social}
                    {e.rut_empresa ? ` · ${e.rut_empresa}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cv_tipo">Tipo</Label>
              <select
                id="cv_tipo"
                className={selectCls}
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoConvenio)}
              >
                <option value="convenio">Convenio de pago</option>
                <option value="multa">Multa</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cv_org">Organismo</Label>
              <select
                id="cv_org"
                className={selectCls}
                value={organismo}
                onChange={(e) => setOrganismo(e.target.value as Organismo)}
              >
                <option value="tesoreria">Tesorería</option>
                <option value="sii">SII</option>
                <option value="dt">Dirección del Trabajo</option>
                <option value="otro">Otro</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cv_folio">N° {tipo === "multa" ? "resolución" : "convenio"}</Label>
              <Input id="cv_folio" value={folio} onChange={(e) => setFolio(e.target.value)} placeholder="—" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cv_fecha">Fecha de {tipo === "multa" ? "emisión" : "suscripción"}</Label>
              <Input
                id="cv_fecha"
                type="date"
                value={fechaSuscripcion}
                onChange={(e) => setFechaSuscripcion(e.target.value)}
              />
            </div>

            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="cv_concepto">Concepto — qué cubre</Label>
              <Input
                id="cv_concepto"
                value={concepto}
                onChange={(e) => setConcepto(e.target.value)}
                placeholder="Ej.: F29 feb–may 2026; multa por atraso…"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cv_monto">Monto total ($)</Label>
              <Input
                id="cv_monto"
                type="number"
                inputMode="numeric"
                value={montoTotal}
                onChange={(e) => setMontoTotal(e.target.value)}
                placeholder="—"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cv_resp">Responsable</Label>
              <select
                id="cv_resp"
                className={selectCls}
                value={responsableId}
                onChange={(e) => setResponsableId(e.target.value)}
              >
                <option value="">Sin asignar</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre}
                  </option>
                ))}
              </select>
            </div>

            {/* Cuotas: el control de vencimientos y pagos. */}
            <div className="col-span-2 flex flex-col gap-2 rounded-lg border border-border bg-muted/20 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">
                  Cuotas — cada una con su vencimiento; marca la fecha de pago cuando se pague.
                </span>
                <Button type="button" variant="outline" size="sm" onClick={agregarCuota}>
                  <Plus className="size-3.5" /> Cuota
                </Button>
              </div>
              {formCuotas.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Sin cuotas. Para un pago único agrega una sola cuota.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-[2rem_1fr_1fr_1fr_2rem] items-center gap-2 text-[11px] font-medium text-muted-foreground">
                    <span>#</span>
                    <span>Monto</span>
                    <span>Vence</span>
                    <span>Pagada</span>
                    <span />
                  </div>
                  {formCuotas.map((c, i) => (
                    <div key={c.key} className="grid grid-cols-[2rem_1fr_1fr_1fr_2rem] items-center gap-2">
                      <span className="text-sm tabular-nums text-muted-foreground">{i + 1}</span>
                      <Input
                        type="number"
                        inputMode="numeric"
                        placeholder="$"
                        value={c.monto}
                        onChange={(e) =>
                          setFormCuotas((cs) =>
                            cs.map((x) => (x.key === c.key ? { ...x, monto: e.target.value } : x)),
                          )
                        }
                      />
                      <Input
                        type="date"
                        value={c.fechaVencimiento}
                        onChange={(e) =>
                          setFormCuotas((cs) =>
                            cs.map((x) => (x.key === c.key ? { ...x, fechaVencimiento: e.target.value } : x)),
                          )
                        }
                      />
                      <Input
                        type="date"
                        value={c.fechaPago}
                        onChange={(e) =>
                          setFormCuotas((cs) =>
                            cs.map((x) => (x.key === c.key ? { ...x, fechaPago: e.target.value } : x)),
                          )
                        }
                      />
                      <button
                        type="button"
                        className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-red-600"
                        onClick={() => setFormCuotas((cs) => cs.filter((x) => x.key !== c.key))}
                        aria-label="Quitar cuota"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="cv_periodos">Períodos F29 que cubre (opcional)</Label>
              <Input
                id="cv_periodos"
                value={periodos}
                onChange={(e) => setPeriodos(e.target.value)}
                placeholder="Ej.: 2026-02, 2026-03, 2026-04"
              />
              <span className="text-xs text-muted-foreground">
                Formato AAAA-MM separado por comas. El portal del cliente mostrará esos F29 como
                &quot;en convenio&quot;.
              </span>
            </div>

            <label className="col-span-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-red-600"
                checked={caido}
                onChange={(e) => setCaido(e.target.checked)}
              />
              Convenio caído (incumplido)
            </label>

            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="cv_obs">Observaciones</Label>
              <Textarea
                id="cv_obs"
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
            <div>
              {editando ? (
                <Button type="button" variant="ghost" onClick={eliminar} disabled={guardando}>
                  <Trash2 className="size-4" /> Borrar
                </Button>
              ) : null}
            </div>
            <Button type="button" onClick={guardar} disabled={guardando}>
              {guardando ? "Guardando…" : editando ? "Guardar cambios" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
