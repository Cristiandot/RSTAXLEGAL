"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Search,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  History,
  CalendarDays,
} from "lucide-react";
import { formatFecha } from "@/lib/format";
import {
  claseTipoGestion,
  diasDesde,
  TIPO_GESTION_HREF,
  TIPO_GESTION_LABEL,
  type GestionRow,
} from "@/lib/gestiones";
import type { UsuarioOpcion } from "@/lib/ciclos";
import { asignarGestion } from "./actions";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const selectCls =
  "h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const DIAS_SEMANA = ["L", "M", "M", "J", "V", "S", "D"];

/** "2026-07-10" local de un timestamptz ISO. */
function fechaLocal(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function hoyLocal(): string {
  return fechaLocal(new Date().toISOString());
}

/**
 * Calendario mensual compacto: muestra cuántas gestiones pendientes llegaron
 * cada día; al hacer clic en un día se filtra la bandeja.
 */
function CalendarioGestiones({
  gestiones,
  diaSel,
  onDia,
}: {
  gestiones: GestionRow[];
  diaSel: string | null;
  onDia: (dia: string | null) => void;
}) {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth()); // 0-11

  const porDia = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of gestiones) {
      const k = fechaLocal(g.created_at);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [gestiones]);

  function mover(delta: number) {
    const d = new Date(anio, mes + delta, 1);
    setAnio(d.getFullYear());
    setMes(d.getMonth());
  }

  const primerDia = new Date(anio, mes, 1);
  const diasEnMes = new Date(anio, mes + 1, 0).getDate();
  // Lunes = 0 … Domingo = 6 (semana laboral chilena).
  const offset = (primerDia.getDay() + 6) % 7;
  const celdas: (number | null)[] = [
    ...Array<null>(offset).fill(null),
    ...Array.from({ length: diasEnMes }, (_, i) => i + 1),
  ];
  const hoyIso = hoyLocal();

  return (
    <div className="card-soft rounded-xl bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 text-muted-foreground" />
          <span className="text-sm font-semibold">
            {MESES[mes]} {anio}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => mover(-1)} aria-label="Mes anterior">
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => mover(1)} aria-label="Mes siguiente">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {DIAS_SEMANA.map((d, i) => (
          <div key={i} className="py-1 text-[11px] font-medium text-muted-foreground">
            {d}
          </div>
        ))}
        {celdas.map((dia, i) => {
          if (dia === null) return <div key={`v-${i}`} />;
          const iso = `${anio}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
          const n = porDia.get(iso) ?? 0;
          const esHoy = iso === hoyIso;
          const sel = iso === diaSel;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onDia(sel ? null : iso)}
              title={n > 0 ? `${n} gestión(es) recibidas el ${formatFecha(iso)}` : formatFecha(iso)}
              className={`relative flex h-11 flex-col items-center justify-center rounded-md text-sm transition ${
                sel
                  ? "bg-[var(--brand-teal,#17A2B8)] font-semibold text-white"
                  : n > 0
                    ? "bg-accent font-medium hover:bg-accent/70"
                    : "hover:bg-muted"
              } ${esHoy && !sel ? "ring-1 ring-[var(--brand-teal,#17A2B8)]" : ""}`}
            >
              <span className="leading-none">{dia}</span>
              {n > 0 ? (
                <span
                  className={`mt-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none ${
                    sel ? "bg-white/25 text-white" : "bg-red-500 text-white"
                  }`}
                >
                  {n}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        El número indica gestiones pendientes recibidas ese día. Clic en un día
        filtra la bandeja; clic de nuevo la limpia.
      </p>
    </div>
  );
}

export function InicioClient({
  pendientes,
  historial,
  usuarios,
  errorCarga,
}: {
  pendientes: GestionRow[];
  historial: GestionRow[];
  usuarios: UsuarioOpcion[];
  errorCarga: string | null;
}) {
  const router = useRouter();
  const [buscar, setBuscar] = useState("");
  const [tipoF, setTipoF] = useState("");
  const [respF, setRespF] = useState("");
  const [diaSel, setDiaSel] = useState<string | null>(null);
  const [verHistorial, setVerHistorial] = useState(false);
  const [asignando, startAsignar] = useTransition();

  const tiposPresentes = useMemo(() => {
    const s = new Set(pendientes.map((g) => g.tipo));
    return Object.keys(TIPO_GESTION_LABEL).filter((t) => s.has(t));
  }, [pendientes]);

  const filtradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return pendientes.filter((g) => {
      if (tipoF && g.tipo !== tipoF) return false;
      if (respF === "sin" && g.responsable_id !== null) return false;
      if (respF && respF !== "sin" && g.responsable_id !== respF) return false;
      if (diaSel && fechaLocal(g.created_at) !== diaSel) return false;
      if (q) {
        const t = `${g.razon_social ?? ""} ${g.trabajador ?? ""} ${g.detalle ?? ""}`.toLowerCase();
        if (!t.includes(q)) return false;
      }
      return true;
    });
  }, [pendientes, buscar, tipoF, respF, diaSel]);

  const sinAsignar = pendientes.filter((g) => g.responsable_id === null).length;

  function asignar(g: GestionRow, responsableId: string | null) {
    startAsignar(async () => {
      const res = await asignarGestion(g.fuente, g.gestion_id, responsableId);
      if (res.ok) {
        toast.success(responsableId ? "Gestión asignada" : "Asignación quitada");
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al asignar");
      }
    });
  }

  function filaGestion(g: GestionRow, esHistorial: boolean) {
    const dias = diasDesde(g.created_at);
    return (
      <TableRow key={`${g.fuente}-${g.gestion_id}`}>
        <TableCell>
          <Badge variant="outline" className={claseTipoGestion(g.tipo)}>
            {TIPO_GESTION_LABEL[g.tipo] ?? g.tipo}
          </Badge>
        </TableCell>
        <TableCell className="font-medium">
          <span className="block max-w-[220px] truncate" title={g.razon_social ?? ""}>
            {g.razon_social ?? "—"}
          </span>
        </TableCell>
        <TableCell>
          <span className="block max-w-[240px] truncate" title={`${g.trabajador ?? ""} ${g.detalle ?? ""}`}>
            {g.trabajador ?? g.detalle ?? "—"}
            {g.trabajador && g.detalle ? (
              <span className="text-xs text-muted-foreground"> · {g.detalle}</span>
            ) : null}
          </span>
        </TableCell>
        <TableCell>
          <span className="text-sm">{formatFecha(fechaLocal(g.created_at))}</span>
          {!esHistorial ? (
            <span
              className={`ml-1.5 text-xs ${dias > 7 ? "font-semibold text-red-600" : dias > 3 ? "text-amber-600" : "text-muted-foreground"}`}
            >
              {dias === 0 ? "hoy" : `hace ${dias} d`}
            </span>
          ) : null}
        </TableCell>
        <TableCell>
          <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
            {g.estado}
          </Badge>
        </TableCell>
        <TableCell onClick={(e) => e.stopPropagation()}>
          {esHistorial ? (
            <span className="text-sm">{g.responsable ?? "—"}</span>
          ) : (
            <div className="flex flex-col gap-0.5">
              <select
                aria-label="Asignar responsable"
                className="h-8 rounded-md border border-input bg-card px-2 text-xs shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={g.responsable_id ?? ""}
                disabled={asignando}
                onChange={(e) => asignar(g, e.target.value || null)}
              >
                <option value="">Sin asignar</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre}
                  </option>
                ))}
              </select>
              {g.asignado_at ? (
                <span className="text-[11px] text-muted-foreground">
                  Asignada el {formatFecha(fechaLocal(g.asignado_at))}
                </span>
              ) : null}
            </div>
          )}
        </TableCell>
        <TableCell>
          <Link
            href={TIPO_GESTION_HREF[g.tipo] ?? "/"}
            className="inline-flex items-center gap-1 text-sm font-medium text-[var(--brand-teal,#17A2B8)] hover:underline"
          >
            Abrir
            <ExternalLink className="size-3.5" />
          </Link>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-heading text-xl font-semibold tracking-tight">
            Requerimientos de la oficina
          </h2>
          <p className="text-sm text-muted-foreground">
            {pendientes.length} gestiones pendientes
            {sinAsignar > 0 ? ` · ${sinAsignar} sin asignar` : ""} — todo lo que
            llega de los clientes, para asignar y trabajar.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {tiposPresentes.map((t) => {
            const n = pendientes.filter((g) => g.tipo === t).length;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTipoF(tipoF === t ? "" : t)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                  tipoF === t ? "ring-2 ring-ring" : ""
                } ${claseTipoGestion(t)}`}
              >
                {TIPO_GESTION_LABEL[t]} {n}
              </button>
            );
          })}
        </div>
      </div>

      {errorCarga ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Error al cargar: {errorCarga}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar cliente, trabajador o detalle…"
                className="h-9 w-64 bg-card pl-8"
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
              />
            </div>
            <select
              aria-label="Tipo de gestión"
              className={selectCls}
              value={tipoF}
              onChange={(e) => setTipoF(e.target.value)}
            >
              <option value="">Todos los tipos</option>
              {tiposPresentes.map((t) => (
                <option key={t} value={t}>
                  {TIPO_GESTION_LABEL[t]}
                </option>
              ))}
            </select>
            <select
              aria-label="Responsable"
              className={selectCls}
              value={respF}
              onChange={(e) => setRespF(e.target.value)}
            >
              <option value="">Todos los responsables</option>
              <option value="sin">Sin asignar</option>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </select>
            {diaSel ? (
              <Badge
                variant="outline"
                className="cursor-pointer border-[var(--brand-teal,#17A2B8)] text-[var(--brand-teal,#17A2B8)]"
                onClick={() => setDiaSel(null)}
              >
                Día {formatFecha(diaSel)} ✕
              </Badge>
            ) : null}
            <span className="ml-auto text-sm text-muted-foreground">
              {filtradas.length} de {pendientes.length}
            </span>
          </div>

          <div className="card-soft rounded-xl bg-card">
            <Table stickyHeader>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Tipo</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Trabajador / detalle</TableHead>
                  <TableHead>Recibida</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-[190px]">Responsable</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtradas.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-10 text-center text-muted-foreground"
                    >
                      {pendientes.length === 0
                        ? "Sin gestiones pendientes. La oficina está al día."
                        : "Sin resultados para estos filtros."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtradas.map((g) => filaGestion(g, false))
                )}
              </TableBody>
            </Table>
          </div>

          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setVerHistorial((v) => !v)}
            >
              <History className="size-4" />
              {verHistorial
                ? "Ocultar historial"
                : `Historial reciente (${historial.length})`}
            </Button>
            {verHistorial ? (
              <div className="card-soft mt-3 rounded-xl bg-card">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Tipo</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Trabajador / detalle</TableHead>
                      <TableHead>Recibida</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Responsable</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historial.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="py-8 text-center text-muted-foreground"
                        >
                          Sin gestiones terminadas recientes.
                        </TableCell>
                      </TableRow>
                    ) : (
                      historial.map((g) => filaGestion(g, true))
                    )}
                  </TableBody>
                </Table>
              </div>
            ) : null}
          </div>
        </div>

        <CalendarioGestiones
          gestiones={pendientes}
          diaSel={diaSel}
          onDia={setDiaSel}
        />
      </div>
    </div>
  );
}
