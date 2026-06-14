"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Users, UserPlus, FileText, Stethoscope, Banknote,
  ArrowLeft, ArrowRight, ClipboardType, Table2,
} from "lucide-react";
import { cargarRrhh, type RrhhInfo } from "./portal-actions";
import { BarrasDotacion } from "./mini-charts";
import { DocumentosSolicitar, type TipoDoc } from "./documentos";
import { SolicitudForm, type InfoEmpresa } from "./solicitud-form";
import { DetalleRemuneraciones } from "./remuneraciones";
import { formatFecha, formatMonto } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const DOCS_RRHH: TipoDoc[] = [
  { tipo: "Certificado de antigüedad", desc: "Para un trabajador que indiques." },
  { tipo: "Libro de remuneraciones", desc: "Detalle mensual de la nómina." },
  { tipo: "Liquidaciones del mes", desc: "Liquidaciones de sueldo del período." },
];

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

export function RecursosHumanos({ token, empresa }: { token: string; empresa: InfoEmpresa }) {
  const [periodo, setPeriodo] = useState(periodoPorDefecto());
  const [info, setInfo] = useState<RrhhInfo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [subvista, setSubvista] = useState<"panel" | "remuneraciones" | "solicitudes">("panel");

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

  const periodosDoc = useMemo(() => ultimosPeriodos(6), []);

  if (subvista !== "panel") {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setSubvista("panel")}
          className="inline-flex items-center gap-1 text-sm text-[var(--brand-teal)]"
        >
          <ArrowLeft className="size-4" /> Volver a recursos humanos
        </button>
        {subvista === "remuneraciones" ? (
          <DetalleRemuneraciones token={token} empresa={empresa} />
        ) : (
          <SolicitudForm token={token} empresa={empresa} />
        )}
      </div>
    );
  }

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

      {/* Accesos: novedades del mes y solicitudes laborales */}
      <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" onClick={() => setSubvista("remuneraciones")} className="block w-full text-left">
          <Card className="card-soft border-transparent transition-shadow hover:shadow-md">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-teal)]/10 text-[var(--brand-teal)]">
                    <Table2 className="size-5" />
                  </span>
                  <div>
                    <CardTitle className="text-base">Detalle remuneraciones</CardTitle>
                    <CardDescription className="mt-1">
                      Novedades del mes para las liquidaciones: horas extra, turnos, anticipos y bonos.
                    </CardDescription>
                  </div>
                </div>
                <ArrowRight className="mt-1 size-5 shrink-0 text-muted-foreground" />
              </div>
            </CardHeader>
          </Card>
        </button>
        <button type="button" onClick={() => setSubvista("solicitudes")} className="block w-full text-left">
          <Card className="card-soft border-transparent transition-shadow hover:shadow-md">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-teal)]/10 text-[var(--brand-teal)]">
                    <ClipboardType className="size-5" />
                  </span>
                  <div>
                    <CardTitle className="text-base">Solicitudes laborales</CardTitle>
                    <CardDescription className="mt-1">
                      Contratos, anexos, amonestaciones, finiquitos, papeletas de vacaciones y permisos.
                    </CardDescription>
                  </div>
                </div>
                <ArrowRight className="mt-1 size-5 shrink-0 text-muted-foreground" />
              </div>
            </CardHeader>
          </Card>
        </button>
      </div>

      {cargando ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
      ) : info ? (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
            <Kpi feat icon={<Users className="size-3.5" />} label="Nómina activa" valor={String(info.nomina_activa)} />
            <Kpi icon={<UserPlus className="size-3.5" />} label="Contratos nuevos" valor={String(info.contratos_nuevos)} />
            <Kpi icon={<FileText className="size-3.5" />} label="Anexos nuevos" valor={String(info.anexos_nuevos)} />
            <Kpi icon={<Stethoscope className="size-3.5" />} label="Licencias vig." valor={String(info.licencias_vigentes)} alerta={info.licencias_vigentes > 0} />
            <Kpi feat icon={<Banknote className="size-3.5" />} label="Costo remun." valor={info.costo_remuneraciones > 0 ? formatMonto(info.costo_remuneraciones) : "—"} />
          </div>

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
              <CardTitle className="text-base">Nómina activa</CardTitle>
            </CardHeader>
            <CardContent>
              {info.trabajadores && info.trabajadores.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="py-2 pr-2 font-medium">Trabajador</th>
                        <th className="py-2 pr-2 font-medium">Cargo</th>
                        <th className="py-2 pr-2 font-medium">Contrato</th>
                        <th className="py-2 font-medium">Desde</th>
                      </tr>
                    </thead>
                    <tbody>
                      {info.trabajadores.map((t, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-2 pr-2">
                            {t.nombre}
                            {t.nuevo ? (
                              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">Nuevo</span>
                            ) : null}
                          </td>
                          <td className="py-2 pr-2">{t.cargo ?? "—"}</td>
                          <td className="py-2 pr-2">
                            {t.tipo_contrato === "plazo_fijo" ? "Plazo fijo" : t.tipo_contrato === "indefinido" ? "Indefinido" : (t.tipo_contrato ?? "—")}
                          </td>
                          <td className="py-2 tabular-nums">{formatFecha(t.fecha_ingreso)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Aún no hay trabajadores cargados con RS Tax &amp; Legal para esta empresa.
                </p>
              )}
            </CardContent>
          </Card>

          {info.licencias && info.licencias.length > 0 ? (
            <Card className="card-soft border-transparent">
              <CardHeader>
                <CardTitle className="text-base">Licencias vigentes</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5 text-sm">
                  {info.licencias.map((l, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">{l.trabajador ?? "—"}</span>
                      <span className="text-xs text-muted-foreground">
                        {l.dias ? `${l.dias} días · ` : ""}
                        {formatFecha(l.fecha_inicio)} al {formatFecha(l.fecha_termino)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          <DocumentosSolicitar token={token} area="rrhh" titulo="Documentos de personal" docs={DOCS_RRHH} periodos={periodosDoc} />
        </>
      ) : null}

      <p className="text-center text-[11px] text-muted-foreground">
        Período de movimientos: {nombrePeriodo(periodo)}.
      </p>
    </div>
  );
}
