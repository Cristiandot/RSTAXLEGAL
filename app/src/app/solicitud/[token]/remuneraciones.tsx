"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Lock, Plus, Trash2 } from "lucide-react";
import {
  cargarRemuneraciones,
  guardarNovedad,
  eliminarNovedad,
  cerrarPeriodoRemuneraciones,
  type RemuneracionesInfo,
} from "./actions";
import { TIPOS_NOVEDAD, TIPO_NOVEDAD_LABEL, resumenGestionMes } from "@/lib/novedades";
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
  const def = useMemo(
    () => TIPOS_NOVEDAD.find((t) => t.value === tipo) ?? TIPOS_NOVEDAD[0],
    [tipo],
  );

  const cerrado = info?.estado === "cerrado";

  function agregar() {
    startAccion(async () => {
      const res = await guardarNovedad(token, {
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
        toast.success("Novedad agregada");
        setFecha(""); setFechaHasta(""); setCantidad(""); setMonto(""); setComentario("");
        await recargar(periodo);
      } else toast.error(res.error ?? "No se pudo guardar.");
    });
  }

  function borrar(id: string) {
    startAccion(async () => {
      const res = await eliminarNovedad(token, id);
      if (res.ok) {
        toast.success("Novedad eliminada");
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

      {/* Selector de período */}
      <div className="flex items-center justify-center gap-2">
        <Button variant="outline" size="icon-sm" onClick={() => setPeriodo(moverPeriodo(periodo, -1))}>
          <ChevronLeft className="size-4" />
        </Button>
        <span className="min-w-40 text-center text-sm font-medium capitalize">
          {nombrePeriodo(periodo)}
        </span>
        <Button variant="outline" size="icon-sm" onClick={() => setPeriodo(moverPeriodo(periodo, 1))}>
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

          {/* Novedades cargadas */}
          <Card className="card-soft border-transparent">
            <CardHeader>
              <CardTitle className="text-base">Novedades de {nombrePeriodo(periodo)}</CardTitle>
              <CardDescription>
                Horas extra, turnos en feriado/domingo, licencias médicas,
                anticipos, bonos y descuentos.
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
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={ocupado}
                          onClick={() => borrar(n.id)}
                          aria-label="Eliminar novedad"
                        >
                          <Trash2 className="size-4 text-muted-foreground" />
                        </Button>
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

          {/* Agregar novedad */}
          {!cerrado ? (
            <Card className="card-soft border-transparent">
              <CardHeader>
                <CardTitle className="text-base">Agregar novedad</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
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
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Tipo de novedad</Label>
                  <select className={selectCls} value={tipo} onChange={(e) => setTipo(e.target.value)}>
                    {TIPOS_NOVEDAD.map((t) => (
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
                <div className="sm:col-span-2">
                  <Button onClick={agregar} disabled={ocupado}>
                    <Plus className="size-4" />
                    Agregar novedad
                  </Button>
                </div>
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
    </div>
  );
}
