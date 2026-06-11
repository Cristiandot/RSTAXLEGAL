"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Lock, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  cargarRemuneraciones,
  guardarNovedad,
  actualizarNovedad,
  eliminarNovedad,
  cerrarPeriodoRemuneraciones,
  type RemuneracionesInfo,
  type NovedadRow,
} from "./actions";
import { TIPOS_NOVEDAD, TIPO_NOVEDAD_LABEL, resumenGestionMes } from "@/lib/novedades";
import { feriadosDelMes } from "@/lib/feriados";
import { formatFecha, formatMonto } from "@/lib/format";
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

  const cerrado = info?.estado === "cerrado";

  function limpiarFormulario() {
    setEditando(null);
    setFecha(""); setFechaHasta(""); setCantidad(""); setMonto(""); setComentario("");
  }

  function editar(n: NovedadRow) {
    setEditando(n);
    setTipo(n.tipo);
    setFecha(n.fecha ?? "");
    setFechaHasta(n.fecha_hasta ?? "");
    setCantidad(n.cantidad != null ? String(n.cantidad) : "");
    setMonto(n.monto != null ? String(n.monto) : "");
    setComentario(n.comentario ?? "");
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
      <CalendarioMes periodo={periodo} />

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
          {/* Lo que ya entró por el panel de solicitudes */}
          <Card className="card-soft border-transparent">
            <CardHeader>
              <CardTitle className="text-base">Ya informado por el panel de solicitudes</CardTitle>
              <CardDescription>
                Permisos, vacaciones y finiquitos del mes solicitados por el
                panel — no los vuelvas a cargar acá.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {info && info.gestiones.length > 0 ? (
                <ul className="space-y-1.5 text-sm">
                  {info.gestiones.map((g) => (
                    <li key={g.id} className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium">{g.trabajador}</span>
                      <span className="text-muted-foreground">{resumenGestionMes(g.tipo, g.datos)}</span>
                      <span className="text-xs text-muted-foreground">({g.estado})</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Sin gestiones del panel en este mes.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Agregar / editar novedad */}
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
                    {(editando && !tiposPortal.some((t) => t.value === tipo)
                      ? TIPOS_NOVEDAD
                      : tiposPortal
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
          ) : null}

          {/* Historial del mes (editable mientras el mes esté abierto) */}
          <Card className="card-soft border-transparent">
            <CardHeader>
              <CardTitle className="text-base">
                Historial de {nombrePeriodo(periodo)}
              </CardTitle>
              <CardDescription>
                Todo lo informado este mes. Si te equivocaste, puedes corregir
                (lápiz) o eliminar (basurero) mientras el mes siga abierto.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {info && info.novedades.length > 0 ? (
                <ul className="divide-y">
                  {info.novedades.map((n) => (
                    <li key={n.id} className="flex items-center gap-2 py-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{n.trabajador}</p>
                        <p className="text-xs text-muted-foreground">
                          {TIPO_NOVEDAD_LABEL[n.tipo] ?? n.tipo}
                          {n.fecha ? ` · ${formatFecha(n.fecha)}` : ""}
                          {n.fecha_hasta ? ` al ${formatFecha(n.fecha_hasta)}` : ""}
                          {n.cantidad != null ? ` · ${n.cantidad} hrs` : ""}
                          {n.monto != null ? ` · ${formatMonto(n.monto)}` : ""}
                          {n.comentario ? ` · ${n.comentario}` : ""}
                        </p>
                      </div>
                      {!cerrado && n.origen === "cliente" ? (
                        <>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={ocupado}
                            onClick={() => editar(n)}
                            aria-label="Corregir novedad"
                            title="Corregir"
                          >
                            <Pencil className="size-4 text-muted-foreground" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={ocupado}
                            onClick={() => borrar(n.id)}
                            aria-label="Eliminar novedad"
                            title="Eliminar"
                          >
                            <Trash2 className="size-4 text-muted-foreground" />
                          </Button>
                        </>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Aún no hay novedades cargadas este mes.
                  {cerrado ? "" : " Si no hubo ninguna, puedes cerrar el mes directo."}
                </p>
              )}
            </CardContent>
          </Card>

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
    </div>
  );
}
