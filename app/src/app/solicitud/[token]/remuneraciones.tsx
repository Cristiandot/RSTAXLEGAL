"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Eye, Info, Lock, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  cargarRemuneraciones,
  guardarNovedad,
  actualizarNovedad,
  eliminarNovedad,
  cerrarPeriodoRemuneraciones,
  guardarHorasDia,
  type RemuneracionesInfo,
  type NovedadRow,
} from "./actions";
import {
  cargarRemuneracionNomina,
  type RemuneracionNomina,
  type TrabajadorNomina,
} from "./portal-actions";
import { TIPOS_NOVEDAD, resumenGestionMes } from "@/lib/novedades";
import { feriadosDelMes } from "@/lib/feriados";
import { formatFecha, formatMonto } from "@/lib/format";
import { calcularLiquidacionEjemplo, type LiquidacionEjemplo } from "@/lib/liquidacion-ejemplo";
import { type InfoEmpresa } from "./solicitud-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const selectCls =
  "h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function periodoActual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function moverPeriodo(p: string, delta: number): string {
  const [y, m] = p.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function nombrePeriodo(p: string): string {
  const [y, m] = p.split("-").map(Number);
  return `${MESES[m - 1] ?? "?"} ${y}`;
}

/**
 * Calendario del mes con los feriados legales de Chile: rojos los
 * irrenunciables del comercio (Ley 19.973), celestes los demás.
 */
function CalendarioMes({ periodo }: { periodo: string }) {
  const [anio, mes] = periodo.split("-").map(Number);
  const feriados = feriadosDelMes(periodo);
  const feriadoPorDia = new Map(feriados.map((f) => [f.dia, f]));
  const diasEnMes = new Date(anio, mes, 0).getDate();
  // columna inicial con semana lunes-domingo
  const offset = (new Date(Date.UTC(anio, mes - 1, 1)).getUTCDay() + 6) % 7;
  const celdas: (number | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: diasEnMes }, (_, i) => i + 1),
  ];

  return (
    <div className="card-soft mx-auto w-full max-w-xs rounded-xl bg-card p-3">
      <div className="grid grid-cols-7 gap-1 text-center">
        {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
          <span key={i} className="text-[11px] font-semibold text-muted-foreground">
            {d}
          </span>
        ))}
        {celdas.map((dia, i) => {
          if (dia === null) return <span key={`v${i}`} />;
          const feriado = feriadoPorDia.get(dia);
          const esDomingo = (i % 7) === 6;
          const clase = feriado
            ? feriado.irrenunciable
              ? "bg-red-100 font-semibold text-red-700 ring-1 ring-red-300"
              : "bg-sky-100 font-semibold text-sky-700"
            : esDomingo
              ? "text-red-400"
              : "";
          return (
            <span
              key={dia}
              title={feriado ? `${feriado.nombre}${feriado.irrenunciable ? " (irrenunciable)" : ""}` : undefined}
              className={`mx-auto flex size-7 items-center justify-center rounded-full text-xs tabular-nums ${clase}`}
            >
              {dia}
            </span>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="size-2.5 rounded-full bg-sky-200" /> Feriado
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2.5 rounded-full bg-red-300" /> Irrenunciable (comercio)
        </span>
      </div>
      {feriados.length > 0 ? (
        <ul className="mt-2 space-y-0.5 border-t pt-2 text-xs text-muted-foreground">
          {feriados.map((f) => (
            <li key={f.fecha}>
              <span className={`font-medium ${f.irrenunciable ? "text-red-600" : "text-sky-700"}`}>
                {String(f.dia).padStart(2, "0")}
              </span>{" "}
              — {f.nombre}
              {f.irrenunciable ? " · irrenunciable" : ""}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 border-t pt-2 text-center text-xs text-muted-foreground">
          Este mes no tiene feriados legales.
        </p>
      )}
    </div>
  );
}


export function DetalleRemuneraciones({
  token,
  empresa,
}: {
  token: string;
  empresa: InfoEmpresa;
}) {
  const [periodo, setPeriodo] = useState(periodoActual());
  const [info, setInfo] = useState<RemuneracionesInfo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [ocupado, startAccion] = useTransition();

  const recargar = useCallback(async (p: string) => {
    setCargando(true);
    const res = await cargarRemuneraciones(token, p);
    if (res.ok && res.info) setInfo(res.info);
    else toast.error(res.error ?? "No se pudo cargar el período.");
    setCargando(false);
  }, [token]);

  useEffect(() => {
    void recargar(periodo);
  }, [periodo, recargar]);

  // --- formulario de nueva novedad ---
  const [trabajadorId, setTrabajadorId] = useState("");
  const [tipo, setTipo] = useState("hora_extra");
  const [fecha, setFecha] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [monto, setMonto] = useState("");
  const [comentario, setComentario] = useState("");
  const [editando, setEditando] = useState<NovedadRow | null>(null);
  const def = useMemo(
    () => TIPOS_NOVEDAD.find((t) => t.value === tipo) ?? TIPOS_NOVEDAD[0],
    [tipo],
  );
  // Licencia médica ya no se informa por el portal (la trae la empresa por
  // otros canales); el catálogo completo se mantiene para mostrar historial.
  const tiposPortal = TIPOS_NOVEDAD.filter((t) => t.enPortal !== false);
  // En el formulario genérico ya no se ofrecen domingo/feriado: se cargan en su
  // propio módulo. Siguen disponibles para EDITAR registros antiguos.
  const tiposForm = tiposPortal.filter((t) => t.value !== "feriado" && t.value !== "domingo");

  const cerrado = info?.estado === "cerrado";

  function limpiarFormulario() {
    setEditando(null);
    setFecha(""); setFechaHasta(""); setCantidad(""); setMonto(""); setComentario("");
  }

  function agregar() {
    startAccion(async () => {
      const res = editando
        ? await actualizarNovedad(token, editando.id, {
            tipo,
            fecha,
            fecha_hasta: fechaHasta,
            cantidad,
            monto,
            comentario,
          })
        : await guardarNovedad(token, {
            trabajador_id: trabajadorId,
            periodo,
            tipo,
            fecha,
            fecha_hasta: fechaHasta,
            cantidad,
            monto,
            comentario,
          });
      if (res.ok) {
        toast.success(editando ? "Novedad corregida" : "Novedad agregada");
        limpiarFormulario();
        await recargar(periodo);
      } else toast.error(res.error ?? "No se pudo guardar.");
    });
  }

  function borrar(id: string) {
    startAccion(async () => {
      const res = await eliminarNovedad(token, id);
      if (res.ok) {
        toast.success("Novedad eliminada");
        if (editando?.id === id) limpiarFormulario();
        await recargar(periodo);
      } else toast.error(res.error ?? "No se pudo eliminar.");
    });
  }

  function cerrarMes() {
    if (!window.confirm(
      `¿Cerrar el mes de ${nombrePeriodo(periodo)} y enviarlo a RS Tax & Legal? Después del cierre no podrás agregar ni eliminar novedades.`,
    )) return;
    startAccion(async () => {
      const res = await cerrarPeriodoRemuneraciones(token, periodo);
      if (res.ok) {
        toast.success("Mes cerrado — el equipo de RS Tax & Legal procesará las remuneraciones");
        await recargar(periodo);
      } else toast.error(res.error ?? "No se pudo cerrar el mes.");
    });
  }

  // --- nómina con remuneración (liquidación + anticipos/bonos por trabajador) ---
  const [nomina, setNomina] = useState<RemuneracionNomina | null>(null);
  useEffect(() => {
    void cargarRemuneracionNomina(token).then((r) => {
      if (r.ok && r.data) setNomina(r.data);
    });
  }, [token]);

  const [detalleDe, setDetalleDe] = useState<TrabajadorNomina | null>(null);
  const [dlgTipo, setDlgTipo] = useState<"anticipo" | "bono">("anticipo");
  const [dlgMonto, setDlgMonto] = useState("");
  const [dlgComentario, setDlgComentario] = useState("");

  function abrirDetalle(t: TrabajadorNomina) {
    setDlgTipo("anticipo");
    setDlgMonto("");
    setDlgComentario("");
    setDetalleDe(t);
  }

  function sumaNovedad(trabajadorId: string, t: string): number {
    return (info?.novedades ?? [])
      .filter((n) => n.trabajador_id === trabajadorId && n.tipo === t && n.monto != null)
      .reduce((a, n) => a + (n.monto ?? 0), 0);
  }

  function novedadesDe(trabajadorId: string): NovedadRow[] {
    return (info?.novedades ?? []).filter(
      (n) => n.trabajador_id === trabajadorId && (n.tipo === "anticipo" || n.tipo === "bono"),
    );
  }

  function agregarMontoNovedad() {
    if (!detalleDe) return;
    startAccion(async () => {
      const res = await guardarNovedad(token, {
        trabajador_id: detalleDe.id,
        periodo,
        tipo: dlgTipo,
        fecha: "",
        fecha_hasta: "",
        cantidad: "",
        monto: dlgMonto,
        comentario: dlgComentario,
      });
      if (res.ok) {
        toast.success(dlgTipo === "anticipo" ? "Anticipo agregado" : "Bono agregado");
        setDlgMonto("");
        setDlgComentario("");
        await recargar(periodo);
      } else toast.error(res.error ?? "No se pudo guardar.");
    });
  }

  // --- carga masiva de horas en domingo/feriado ---
  const [hdFecha, setHdFecha] = useState("");
  const [hdHoras, setHdHoras] = useState<Record<string, string>>({});

  // --- carga masiva de bonos del mes ---
  const [bonoNombre, setBonoNombre] = useState("");
  const [bonoMontos, setBonoMontos] = useState<Record<string, string>>({});

  const diasEspeciales = useMemo(() => {
    const [y, m] = periodo.split("-").map(Number);
    const fer = feriadosDelMes(periodo);
    const ferDias = new Set(fer.map((f) => f.dia));
    const out: { fecha: string; label: string; tipo: "domingo" | "feriado" }[] = [];
    for (const f of fer) {
      out.push({
        fecha: f.fecha,
        label: `Feriado ${String(f.dia).padStart(2, "0")} · ${f.nombre}`,
        tipo: "feriado",
      });
    }
    const dim = new Date(y, m, 0).getDate();
    for (let d = 1; d <= dim; d++) {
      const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      if (dow === 0 && !ferDias.has(d)) {
        out.push({
          fecha: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
          label: `Domingo ${String(d).padStart(2, "0")}`,
          tipo: "domingo",
        });
      }
    }
    out.sort((a, b) => a.fecha.localeCompare(b.fecha));
    return out;
  }, [periodo]);

  const diaSel = diasEspeciales.find((d) => d.fecha === hdFecha) ?? null;

  function agregarHorasDia() {
    if (!diaSel) { toast.error("Elige el día (domingo o feriado)."); return; }
    const entradas = empresa.trabajadores
      .map((t) => ({ trabajadorId: t.id, horas: Number(hdHoras[t.id]) }))
      .filter((e) => Number.isFinite(e.horas) && e.horas > 0);
    if (entradas.length === 0) { toast.error("Pon las horas a al menos un trabajador."); return; }
    startAccion(async () => {
      const res = await guardarHorasDia(token, {
        entradas,
        periodo,
        tipo: diaSel.tipo,
        fecha: diaSel.fecha,
      });
      if (res.ok) {
        toast.success(`Horas agregadas a ${res.agregados} trabajador${res.agregados === 1 ? "" : "es"}`);
        setHdHoras({});
        await recargar(periodo);
      } else toast.error(res.error ?? "No se pudo guardar.");
    });
  }

  function agregarBonosMes() {
    const nombre = bonoNombre.trim();
    if (!nombre) { toast.error("Ponle nombre al bono."); return; }
    const entradas = empresa.trabajadores
      .map((t) => ({ id: t.id, monto: Number(bonoMontos[t.id]) }))
      .filter((e) => Number.isFinite(e.monto) && e.monto > 0);
    if (entradas.length === 0) { toast.error("Pon el monto a al menos un trabajador."); return; }
    startAccion(async () => {
      let ok = 0;
      for (const e of entradas) {
        const res = await guardarNovedad(token, {
          trabajador_id: e.id,
          periodo,
          tipo: "bono",
          fecha: "",
          fecha_hasta: "",
          cantidad: "",
          monto: String(e.monto),
          comentario: nombre,
        });
        if (res.ok) ok++;
      }
      if (ok > 0) {
        toast.success(`Bono "${nombre}" agregado a ${ok} trabajador${ok === 1 ? "" : "es"}`);
        setBonoNombre("");
        setBonoMontos({});
        await recargar(periodo);
      } else {
        toast.error("No se pudo guardar el bono.");
      }
    });
  }

  function liquidacionDe(t: TrabajadorNomina): LiquidacionEjemplo | null {
    const ind = nomina?.indicadores;
    if (!ind) return null;
    const r = t.remuneracion ?? {};
    const sueldoBase =
      Number(r.sueldo_base ?? 0) ||
      Number(t.sueldo_base_t ?? 0) ||
      (r.valor_dia ? Number(r.valor_dia) * 30 : 0);
    if (!sueldoBase) return null;
    const gtipo = r.gratificacion_tipo === "art50" ? "25" : (r.gratificacion_tipo ?? "25");
    return calcularLiquidacionEjemplo({
      sueldoBase,
      gratificacionTipo: gtipo,
      gratificacionMonto: Number(r.gratificacion_monto ?? 0),
      colacion: Number(r.colacion ?? 0),
      movilizacion: Number(r.movilizacion ?? 0),
      afp: t.afp,
      salud: t.salud,
      tipoContrato: t.tipo_contrato ?? "indefinido",
      imm: ind.imm,
      utm: ind.utm,
      tasasAfp: ind.tasas_afp.map((a) => ({ nombre: a.nombre, tasa_trabajador: a.tasa_trabajador })),
    });
  }

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h2 className="font-heading text-xl font-semibold tracking-tight">
          Detalle remuneraciones
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Novedades del mes para las liquidaciones de sueldo.
        </p>
      </div>

      {/* Selector de período + calendario del mes */}
      <div className="flex items-center justify-center gap-2">
        <Button variant="outline" size="icon-sm" onClick={() => { limpiarFormulario(); setPeriodo(moverPeriodo(periodo, -1)); }}>
          <ChevronLeft className="size-4" />
        </Button>
        <span className="min-w-40 text-center text-sm font-medium capitalize">
          {nombrePeriodo(periodo)}
        </span>
        <Button variant="outline" size="icon-sm" onClick={() => { limpiarFormulario(); setPeriodo(moverPeriodo(periodo, 1)); }}>
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {cerrado ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <Lock className="size-4 shrink-0" />
          Este mes ya fue cerrado y enviado a RS Tax &amp; Legal. Si necesitas
          corregir algo, contacta a tu ejecutivo.
        </div>
      ) : null}

      {cargando ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <>
          {/* Recordatorio destacado: no duplicar inasistencias ya pedidas */}
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <div className="min-w-0">
                <p className="font-semibold">No dupliques las inasistencias del mes</p>
                <p className="text-amber-800">
                  Permisos, vacaciones y finiquitos ya pedidos en{" "}
                  <strong>Solicitudes laborales</strong> entran solos a la
                  liquidación — no los cargues de nuevo aquí.
                </p>
                {info && info.gestiones.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {info.gestiones.map((g) => (
                      <li key={g.id} className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-medium">{g.trabajador}</span>
                        <span className="text-amber-800">{resumenGestionMes(g.tipo, g.datos)}</span>
                        <span className="text-xs text-amber-700">({g.estado})</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-amber-700">
                    Este mes aún no hay ninguna registrada por el panel.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Calendario del mes + agregar/editar novedad, lado a lado */}
          <div className="grid items-start gap-5 lg:grid-cols-2">
            <CalendarioMes periodo={periodo} />
          {!cerrado ? (
            <Card className={`card-soft border-transparent ${editando ? "ring-2 ring-amber-300" : ""}`}>
              <CardHeader>
                <CardTitle className="text-base">
                  {editando ? `Corregir novedad de ${editando.trabajador}` : "Agregar novedad"}
                </CardTitle>
                {editando ? (
                  <CardDescription>
                    Estás editando un registro ya cargado. Para cambiar al
                    trabajador, elimínalo y créalo de nuevo.
                  </CardDescription>
                ) : null}
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {!editando ? (
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Trabajador</Label>
                    <select
                      className={selectCls}
                      value={trabajadorId}
                      onChange={(e) => setTrabajadorId(e.target.value)}
                    >
                      <option value="">— Selecciona —</option>
                      {empresa.trabajadores.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.apellidos} {t.nombres}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Trabajador</Label>
                    <Input value={editando.trabajador} readOnly className="bg-muted/40" />
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Tipo de novedad</Label>
                  <select className={selectCls} value={tipo} onChange={(e) => setTipo(e.target.value)}>
                    {(editando && !tiposForm.some((t) => t.value === tipo)
                      ? TIPOS_NOVEDAD
                      : tiposForm
                    ).map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  {def.hint ? (
                    <p className="text-xs text-muted-foreground">{def.hint}</p>
                  ) : null}
                </div>
                {def.campos === "horas" ? (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs">Fecha</Label>
                      <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs">Horas</Label>
                      <Input
                        type="number" min={0.5} max={24} step={0.5} placeholder="ej. 2"
                        value={cantidad} onChange={(e) => setCantidad(e.target.value)}
                      />
                    </div>
                  </>
                ) : null}
                {def.campos === "rango" ? (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs">Primer día</Label>
                      <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs">Último día</Label>
                      <Input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
                    </div>
                  </>
                ) : null}
                {def.campos === "monto" ? (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs">Monto ($)</Label>
                      <Input
                        type="number" min={1} placeholder="ej. 50000"
                        value={monto} onChange={(e) => setMonto(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs">Fecha (opcional)</Label>
                      <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
                    </div>
                  </>
                ) : null}
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label className="text-xs">Comentario {tipo === "bono" ? "(qué bono es)" : "(opcional)"}</Label>
                  <Input
                    value={comentario} onChange={(e) => setComentario(e.target.value)}
                    placeholder={tipo === "bono" ? "ej. Bono cliente incógnito abril" : "detalle si aplica"}
                  />
                </div>
                <div className="flex gap-2 sm:col-span-2">
                  <Button onClick={agregar} disabled={ocupado}>
                    {editando ? <Pencil className="size-4" /> : <Plus className="size-4" />}
                    {editando ? "Guardar corrección" : "Agregar novedad"}
                  </Button>
                  {editando ? (
                    <Button variant="outline" onClick={limpiarFormulario} disabled={ocupado}>
                      <X className="size-4" />
                      Cancelar
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="card-soft flex items-center justify-center rounded-xl bg-card p-6 text-center text-sm text-muted-foreground">
              Este mes ya fue cerrado — no se cargan novedades.
            </div>
          )}
          </div>

          {/* Módulo: bonos del mes (carga masiva por trabajador) */}
          {!cerrado ? (
            <Card className="card-soft border-transparent">
              <CardHeader>
                <CardTitle className="text-base">Bonos del mes</CardTitle>
                <CardDescription>
                  Ponle nombre al bono y el monto por trabajador — se cargan a todos de una vez. Cada
                  bono queda como una novedad del mes (su nombre identifica la columna del período en
                  las remuneraciones).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-col gap-1.5 sm:max-w-sm">
                  <Label className="text-xs">Nombre del bono</Label>
                  <Input
                    placeholder="ej. Bono producción, Bono fiestas patrias"
                    value={bonoNombre}
                    onChange={(e) => setBonoNombre(e.target.value)}
                  />
                </div>

                {empresa.trabajadores.length > 0 ? (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Pon el monto del bono a cada trabajador (deja en blanco a quien no lo recibe).
                    </p>
                    <div className="grid max-h-64 gap-1.5 overflow-y-auto sm:grid-cols-2">
                      {empresa.trabajadores.map((t) => (
                        <div key={t.id} className="flex items-center gap-2 rounded-md border border-input px-2.5 py-1.5">
                          <span className="min-w-0 flex-1 truncate text-sm">{t.apellidos} {t.nombres}</span>
                          <Input
                            type="number" min={0} step={1000} placeholder="$"
                            className="h-8 w-28"
                            value={bonoMontos[t.id] ?? ""}
                            onChange={(e) => setBonoMontos((prev) => ({ ...prev, [t.id]: e.target.value }))}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-end">
                      <Button onClick={agregarBonosMes} disabled={ocupado || !bonoNombre.trim()}>
                        <Plus className="size-4" /> Agregar bono
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No hay trabajadores registrados para esta empresa.</p>
                )}
              </CardContent>
            </Card>
          ) : null}

          {/* Nómina activa: anticipos/bonos del mes + detalle de liquidación */}
          <Card className="card-soft border-transparent">
            <CardHeader>
              <CardTitle className="text-base">Nómina activa</CardTitle>
              <CardDescription>
                Tus trabajadores activos. Abre el <strong>Detalle</strong> para ver la liquidación
                (sueldo base, gratificación, colación, movilización y otras consideraciones) y para
                agregar los anticipos y bonos del mes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {nomina && nomina.trabajadores.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="py-2 pr-2 font-medium">Trabajador</th>
                        <th className="py-2 pr-2 font-medium">Contrato</th>
                        <th className="py-2 pr-2 text-right font-medium">Anticipos</th>
                        <th className="py-2 pr-2 text-right font-medium">Bonos</th>
                        <th className="py-2 font-medium" />
                      </tr>
                    </thead>
                    <tbody>
                      {nomina.trabajadores.map((t) => {
                        const ant = sumaNovedad(t.id, "anticipo");
                        const bon = sumaNovedad(t.id, "bono");
                        return (
                          <tr key={t.id} className="border-b last:border-0">
                            <td className="py-2 pr-2">{t.nombre}</td>
                            <td className="py-2 pr-2">
                              <span className={`rounded-full px-2 py-0.5 text-xs ${t.tipo_contrato === "plazo_fijo" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700"}`}>
                                {t.tipo_contrato === "plazo_fijo" ? "Plazo fijo" : t.tipo_contrato === "indefinido" ? "Indefinido" : "—"}
                              </span>
                              {t.tipo_contrato === "plazo_fijo" && t.fecha_termino ? (
                                <span className="block text-[11px] text-muted-foreground">vence {formatFecha(t.fecha_termino)}</span>
                              ) : (
                                <span className="block text-[11px] text-muted-foreground">desde {formatFecha(t.fecha_ingreso)}</span>
                              )}
                            </td>
                            <td className="py-2 pr-2 text-right tabular-nums">{ant > 0 ? formatMonto(ant) : "—"}</td>
                            <td className="py-2 pr-2 text-right tabular-nums">{bon > 0 ? formatMonto(bon) : "—"}</td>
                            <td className="py-2 text-right">
                              <Button variant="outline" size="sm" onClick={() => abrirDetalle(t)}>
                                <Eye className="size-3.5" /> Detalle
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Aún no hay trabajadores activos cargados con RS Tax &amp; Legal para esta empresa.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Módulo: horas en domingo y feriado (carga masiva por día) — al final */}
          {!cerrado ? (
            <Card className="card-soft border-transparent">
              <CardHeader>
                <CardTitle className="text-base">Horas en domingo y feriado</CardTitle>
                <CardDescription>
                  Elige el día, marca a los trabajadores que trabajaron y pon las horas — se cargan a
                  todos de una vez. (El recargo lo valida el equipo según el contrato de cada uno.)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-col gap-1.5 sm:max-w-sm">
                  <Label className="text-xs">Día (domingo o feriado del mes)</Label>
                  <select className={selectCls} value={hdFecha} onChange={(e) => setHdFecha(e.target.value)}>
                    <option value="">— Elige el día —</option>
                    {diasEspeciales.map((d) => (
                      <option key={d.fecha} value={d.fecha}>{d.label}</option>
                    ))}
                  </select>
                </div>

                {empresa.trabajadores.length > 0 ? (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Pon las horas trabajadas ese día a cada trabajador (deja en blanco a quien no trabajó).
                    </p>
                    <div className="grid max-h-64 gap-1.5 overflow-y-auto sm:grid-cols-2">
                      {empresa.trabajadores.map((t) => (
                        <div key={t.id} className="flex items-center gap-2 rounded-md border border-input px-2.5 py-1.5">
                          <span className="min-w-0 flex-1 truncate text-sm">{t.apellidos} {t.nombres}</span>
                          <Input
                            type="number" min={0} max={24} step={0.5} placeholder="hrs"
                            className="h-8 w-20"
                            value={hdHoras[t.id] ?? ""}
                            onChange={(e) => setHdHoras((prev) => ({ ...prev, [t.id]: e.target.value }))}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-end">
                      <Button onClick={agregarHorasDia} disabled={ocupado || !hdFecha}>
                        <Plus className="size-4" /> Agregar horas
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No hay trabajadores registrados para esta empresa.</p>
                )}
              </CardContent>
            </Card>
          ) : null}

          {!cerrado ? (
            <div className="flex justify-end">
              <Button size="lg" disabled={ocupado || cargando} onClick={cerrarMes}>
                <Lock className="size-4" />
                Cerrar {nombrePeriodo(periodo)} y enviar a RS Tax &amp; Legal
              </Button>
            </div>
          ) : null}
        </>
      )}

      {/* Detalle por trabajador: liquidación referencial + anticipos/bonos */}
      <Dialog open={detalleDe !== null} onOpenChange={(o) => { if (!o) setDetalleDe(null); }}>
        {detalleDe ? (() => {
          const t = detalleDe;
          const liq = liquidacionDe(t);
          const r = t.remuneracion ?? {};
          const movs = novedadesDe(t.id);
          return (
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="font-heading">Liquidación · {t.nombre}</DialogTitle>
                <DialogDescription>
                  Mes de referencia con los indicadores Previred de {nomina?.indicadores?.periodo ?? "—"}.
                  Referencial — la liquidación real depende de las novedades del mes.
                </DialogDescription>
              </DialogHeader>

              {liq ? (
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between"><span>Sueldo base</span><span className="tabular-nums">{formatMonto(liq.sueldoBase)}</span></div>
                  <div className="flex justify-between"><span>Gratificación legal</span><span className="tabular-nums">{formatMonto(liq.gratificacion)}</span></div>
                  <div className="flex justify-between border-t pt-1.5 font-medium"><span>Total imponible</span><span className="tabular-nums">{formatMonto(liq.totalImponible)}</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>AFP {liq.afpNombre ?? "—"}{liq.afpTasa !== null ? ` (${liq.afpTasa.toLocaleString("es-CL")}%)` : ""}</span><span className="tabular-nums">−{formatMonto(liq.afpMonto)}</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>Salud 7%</span><span className="tabular-nums">−{formatMonto(liq.saludMonto)}</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>Seguro cesantía AFC{liq.afcMonto > 0 ? " 0,6%" : ""}</span><span className="tabular-nums">−{formatMonto(liq.afcMonto)}</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>Impuesto único</span><span className="tabular-nums">−{formatMonto(liq.impuestoUnico)}</span></div>
                  {liq.colacion > 0 ? <div className="flex justify-between"><span>Colación (no imponible)</span><span className="tabular-nums">+{formatMonto(liq.colacion)}</span></div> : null}
                  {liq.movilizacion > 0 ? <div className="flex justify-between"><span>Movilización (no imponible)</span><span className="tabular-nums">+{formatMonto(liq.movilizacion)}</span></div> : null}
                  <div className="flex justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-base font-semibold text-emerald-800"><span>LÍQUIDO REFERENCIAL</span><span className="tabular-nums">{formatMonto(liq.liquido)}</span></div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No tenemos el sueldo de este trabajador cargado para estimar la liquidación.
                </p>
              )}

              {(Number(r.perdida_caja ?? 0) > 0 || r.observaciones) ? (
                <div className="rounded-lg border border-sky-200 bg-sky-50 p-2.5 text-xs text-sky-800">
                  <strong>Otras consideraciones:</strong>
                  {Number(r.perdida_caja ?? 0) > 0 ? <span> asignación de pérdida de caja {formatMonto(Number(r.perdida_caja))}.</span> : null}
                  {r.observaciones ? <span> {r.observaciones}</span> : null}
                </div>
              ) : null}

              <div className="space-y-2 border-t pt-3">
                <p className="text-sm font-medium">Anticipos y bonos de {nombrePeriodo(periodo)}</p>
                {movs.length > 0 ? (
                  <ul className="space-y-1 text-sm">
                    {movs.map((n) => (
                      <li key={n.id} className="flex items-center justify-between gap-2">
                        <span>
                          <span className={`rounded-full px-2 py-0.5 text-xs ${n.tipo === "anticipo" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700"}`}>{n.tipo === "anticipo" ? "Anticipo" : "Bono"}</span>
                          <span className="ml-2 tabular-nums">{formatMonto(n.monto)}</span>
                          {n.comentario ? <span className="text-muted-foreground"> · {n.comentario}</span> : null}
                        </span>
                        {!cerrado && n.origen === "cliente" ? (
                          <Button variant="ghost" size="icon-sm" disabled={ocupado} onClick={() => borrar(n.id)} aria-label="Eliminar">
                            <Trash2 className="size-4 text-muted-foreground" />
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">Sin anticipos ni bonos este mes.</p>
                )}
                {!cerrado ? (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <select className={selectCls} value={dlgTipo} onChange={(e) => setDlgTipo(e.target.value as "anticipo" | "bono")}>
                      <option value="anticipo">Anticipo</option>
                      <option value="bono">Bono</option>
                    </select>
                    <Input type="number" min={1} placeholder="Monto $" value={dlgMonto} onChange={(e) => setDlgMonto(e.target.value)} />
                    <Input placeholder="Comentario" value={dlgComentario} onChange={(e) => setDlgComentario(e.target.value)} />
                    <Button onClick={agregarMontoNovedad} disabled={ocupado}><Plus className="size-4" /> Agregar</Button>
                  </div>
                ) : null}
              </div>
            </DialogContent>
          );
        })() : null}
      </Dialog>
    </div>
  );
}
