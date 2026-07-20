"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Users, UserPlus, FileText, Stethoscope, Banknote, FileX,
  ArrowUp, ArrowDown, ArrowUpDown,
} from "lucide-react";
import { cargarRrhh, type RrhhInfo, type TrabajadorRrhh } from "./portal-actions";
import { BarrasDotacion } from "./mini-charts";
import { FichaTrabajador } from "./ficha-trabajador";
import { formatFecha, formatMonto } from "@/lib/format";
import { comparar, siguienteOrden, type Orden } from "@/lib/ordenar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** Mes anterior al actual, como YYYY-MM (mismo criterio del panel interno). */
function periodoPorDefecto(): string {
  const d = new Date();
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth() - 1, 1));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}`;
}

function ultimosPeriodos(n: number): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const d = new Date();
  for (let i = 1; i <= n; i++) {
    const x = new Date(Date.UTC(d.getFullYear(), d.getMonth() - i, 1));
    const p = `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}`;
    out.push({ value: p, label: `${MESES[x.getUTCMonth()]} ${x.getUTCFullYear()}` });
  }
  return out;
}

function nombrePeriodo(p: string): string {
  const [y, m] = p.split("-").map(Number);
  return `${MESES[m - 1] ?? "?"} ${y}`;
}

/**
 * Feriado legal devengado a la fecha desde el ingreso (15 días hábiles/año =
 * 1,25 días hábiles por mes, Art. 67 CT). Estimación: NO descuenta los días ya
 * tomados — ese control lo lleva la empresa.
 */
function vacDevengadas(fechaIngreso?: string | null): number | null {
  if (!fechaIngreso) return null;
  const ing = new Date(`${fechaIngreso}T00:00:00`);
  if (Number.isNaN(ing.getTime())) return null;
  const meses = (Date.now() - ing.getTime()) / (1000 * 60 * 60 * 24 * 30.4375);
  if (meses <= 0) return 0;
  return Math.round(meses * 1.25 * 10) / 10;
}

function Kpi({
  icon, label, valor, feat = false, alerta = false,
}: { icon: React.ReactNode; label: string; valor: string; feat?: boolean; alerta?: boolean }) {
  return (
    <div className={`rounded-xl p-3 ${feat ? "bg-[var(--brand-navy)] text-white" : "border border-input bg-card"}`}>
      <p className={`flex items-center gap-1.5 text-xs ${feat ? "text-white/70" : "text-muted-foreground"}`}>
        <span className={alerta ? "text-red-500" : "text-[var(--brand-teal)]"}>{icon}</span>
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{valor}</p>
    </div>
  );
}

/** Valor por columna para ordenar la nómina (números como números). */
function valorOrden(t: TrabajadorRrhh, col: string): string | number | null {
  switch (col) {
    case "nombre": return t.nombre;
    case "cargo": return t.cargo;
    case "contrato": return t.tipo_contrato;
    case "desde": return t.fecha_ingreso;
    case "saldo": return vacDevengadas(t.fecha_ingreso);
    default: return null;
  }
}

/** Encabezado ordenable de la nómina (tabla simple): clic alterna asc → desc → sin orden. */
function ThOrd({
  col, orden, setOrden, children, className,
}: {
  col: string;
  orden: Orden;
  setOrden: (o: Orden) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const activo = orden?.col === col;
  return (
    <th className={`font-medium ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOrden(siguienteOrden(orden, col))}
        className={`inline-flex items-center gap-1 transition-colors hover:text-foreground ${activo ? "text-foreground" : ""}`}
        title="Ordenar"
      >
        {children}
        {activo ? (
          orden!.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
        ) : (
          <ArrowUpDown className="size-3 opacity-35" />
        )}
      </button>
    </th>
  );
}

export function RecursosHumanos({
  token,
  onSolicitarGestion,
}: {
  token: string;
  onSolicitarGestion?: (trabajadorId: string) => void;
}) {
  const [periodo, setPeriodo] = useState(periodoPorDefecto());
  const [info, setInfo] = useState<RrhhInfo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [fichaId, setFichaId] = useState<string | null>(null);
  const [fichaOpen, setFichaOpen] = useState(false);
  const [orden, setOrden] = useState<Orden>({ col: "nombre", dir: "asc" });

  const recargar = useCallback(async (p: string) => {
    setCargando(true);
    const r = await cargarRrhh(token, p);
    if (r.ok && r.info) setInfo(r.info);
    else toast.error(r.error ?? "No se pudo cargar recursos humanos.");
    setCargando(false);
  }, [token]);

  useEffect(() => {
    void recargar(periodo);
  }, [periodo, recargar]);

  const filas = useMemo(() => {
    const arr = info?.trabajadores ?? [];
    if (!orden) return arr;
    return [...arr].sort((a, b) =>
      comparar(valorOrden(a, orden.col), valorOrden(b, orden.col), orden.dir),
    );
  }, [info, orden]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-9 rounded-md border border-input bg-card px-3 text-sm capitalize"
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value)}
        >
          {ultimosPeriodos(6).map((p) => (
            <option key={p.value} value={p.value} className="capitalize">{p.label}</option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">Movimientos del período · nómina al día de hoy</span>
      </div>

      {cargando ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
      ) : info ? (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            <Kpi feat icon={<Users className="size-3.5" />} label="Nómina activa" valor={String(info.nomina_activa)} />
            <Kpi icon={<UserPlus className="size-3.5" />} label="Contratos nuevos" valor={String(info.contratos_nuevos)} />
            <Kpi icon={<FileText className="size-3.5" />} label="Anexos nuevos" valor={String(info.anexos_nuevos)} />
            <Kpi icon={<Stethoscope className="size-3.5" />} label="Licencias vig." valor={String(info.licencias_vigentes)} alerta={info.licencias_vigentes > 0} />
            <Kpi icon={<FileX className="size-3.5" />} label="Finiquitos activos" valor={String(info.finiquitos_activos)} alerta={info.finiquitos_activos > 0} />
            <Kpi feat icon={<Banknote className="size-3.5" />} label="Costo remun." valor={info.costo_remuneraciones > 0 ? formatMonto(info.costo_remuneraciones) : "—"} />
          </div>

          {info.finiquitos && info.finiquitos.length > 0 ? (
            <Card className="card-soft border-transparent">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileX className="size-4 text-red-600" /> Finiquitos en curso
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5 text-sm">
                  {info.finiquitos.map((f, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">{f.trabajador}</span>
                      <span className="text-xs text-muted-foreground">
                        {f.rut ? `${f.rut} · ` : ""}en proceso con RS Tax &amp; Legal
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {info.plazo_fijo_por_vencer > 0 ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <strong>{info.plazo_fijo_por_vencer}</strong> contrato{info.plazo_fijo_por_vencer === 1 ? "" : "s"} a plazo fijo
              {info.plazo_fijo_por_vencer === 1 ? " vence" : " vencen"} en los próximos 30 días — revisa si corresponde
              renovar (anexo) o no renovar.
            </p>
          ) : null}

          <p className="text-xs text-muted-foreground">
            Composición: {info.plazo_fijo} a plazo fijo · {info.indefinidos} indefinidos · {info.nomina_activa} en total.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="card-soft border-transparent">
              <CardHeader>
                <CardTitle className="text-base">Dotación por área</CardTitle>
              </CardHeader>
              <CardContent>
                <BarrasDotacion rows={info.dotacion ?? []} />
              </CardContent>
            </Card>
            <Card className="card-soft border-transparent">
              <CardHeader>
                <CardTitle className="text-base">Movimientos del período</CardTitle>
              </CardHeader>
              <CardContent>
                {info.movimientos && info.movimientos.length > 0 ? (
                  <ul className="space-y-1.5 text-sm">
                    {info.movimientos.slice(0, 8).map((m, i) => (
                      <li key={i} className="flex items-baseline justify-between gap-2">
                        <span>
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{m.tipo}</span>{" "}
                          <span className="font-medium">{m.trabajador}</span>
                          {m.detalle ? <span className="text-muted-foreground"> · {m.detalle}</span> : null}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">{formatFecha(m.fecha)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">Sin movimientos en los últimos meses.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="card-soft border-transparent">
            <CardHeader>
              <CardTitle className="flex flex-wrap items-baseline gap-2 text-base">
                Nómina activa
                <span className="text-xs font-normal text-muted-foreground">
                  toca un trabajador para ver su ficha
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {filas.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <ThOrd col="nombre" orden={orden} setOrden={setOrden} className="py-2 pr-2">Trabajador</ThOrd>
                        <ThOrd col="cargo" orden={orden} setOrden={setOrden} className="py-2 pr-2">Cargo</ThOrd>
                        <ThOrd col="contrato" orden={orden} setOrden={setOrden} className="py-2 pr-2">Contrato</ThOrd>
                        <ThOrd col="desde" orden={orden} setOrden={setOrden} className="py-2 pr-2">Desde</ThOrd>
                        <ThOrd col="saldo" orden={orden} setOrden={setOrden} className="py-2">Saldo vac. (aprox.)</ThOrd>
                      </tr>
                    </thead>
                    <tbody>
                      {filas.map((t) => (
                        <tr
                          key={t.id}
                          onClick={() => { setFichaId(t.id); setFichaOpen(true); }}
                          className="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/40"
                          title="Ver ficha del trabajador"
                        >
                          <td className="py-2 pr-2">
                            <span className="font-medium text-[var(--brand-teal)]">{t.nombre}</span>
                            {t.nuevo ? (
                              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">Nuevo</span>
                            ) : null}
                          </td>
                          <td className="py-2 pr-2">{t.cargo ?? "—"}</td>
                          <td className="py-2 pr-2">
                            {t.tipo_contrato === "plazo_fijo" ? "Plazo fijo" : t.tipo_contrato === "indefinido" ? "Indefinido" : (t.tipo_contrato ?? "—")}
                            {t.tipo_contrato === "plazo_fijo" && t.fecha_termino ? (
                              <span className="block text-xs text-muted-foreground">vence {formatFecha(t.fecha_termino)}</span>
                            ) : null}
                          </td>
                          <td className="py-2 pr-2 tabular-nums">{formatFecha(t.fecha_ingreso)}</td>
                          <td className="py-2 tabular-nums text-muted-foreground">
                            {(() => {
                              const v = vacDevengadas(t.fecha_ingreso);
                              return v != null ? `≈ ${v.toLocaleString("es-CL")} días` : "—";
                            })()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Saldo de vacaciones <strong>aproximado</strong>: feriado legal devengado a la
                    fecha (15 días hábiles por año, Art. 67 CT), <strong>sin descontar</strong> los
                    días ya tomados — ese control lo lleva la empresa.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Aún no hay trabajadores cargados con RS Tax &amp; Legal para esta empresa.
                </p>
              )}
            </CardContent>
          </Card>

        </>
      ) : null}

      <p className="text-center text-[11px] text-muted-foreground">
        Período de movimientos: {nombrePeriodo(periodo)}.
      </p>

      <FichaTrabajador
        token={token}
        trabajadorId={fichaId}
        open={fichaOpen}
        onOpenChange={setFichaOpen}
        onSolicitarGestion={onSolicitarGestion}
      />
    </div>
  );
}
