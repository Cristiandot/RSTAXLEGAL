"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Save } from "lucide-react";
import { formatFecha, formatMonto } from "@/lib/format";
import {
  CAUSALES_FINIQUITO,
  calcularFiniquito,
  gratificacionLegalMensual,
  type EntradaFiniquito,
} from "@/lib/finiquito";
import { guardarCalculoFiniquito, type ResumenCalculo } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export type GestionFiniquito = {
  id: string;
  trabajador: string;
  rut: string;
  empresa: string;
  estado: string;
  observaciones: string | null;
  causalCodigo: string;
  fechaAviso: string | null;
  fechaTermino: string | null;
  avisoModalidad: string | null;
  fechaIngreso: string | null;
  sueldoBase: number | null;
  otrasRemuneraciones: number | null;
  diasTomados: number | null;
  licenciaVigente: string | null;
  fuero: string | null;
  calculoGuardado: {
    entrada?: Partial<EntradaFiniquito>;
    resumen?: { total?: number };
    calculado_en?: string;
  } | null;
};

export type IndicadorUf = {
  periodo: string; // YYYY-MM
  uf_ultimo_dia: number | null;
  rmi_general: number | null;
};

const selectCls =
  "h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** "2026-06-15" → período del mes anterior "2026-05" (UF del Art. 172). */
function periodoAnteriorA(fechaIso: string | null): string | null {
  if (!fechaIso || !/^\d{4}-\d{2}/.test(fechaIso)) return null;
  const [y, m] = fechaIso.split("-").map(Number);
  const d = new Date(y, m - 1 - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function diasEntre(aIso: string, bIso: string): number | null {
  const a = Date.parse(aIso);
  const b = Date.parse(bIso);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

function fmtDias(n: number): string {
  return n.toLocaleString("es-CL", { maximumFractionDigits: 2 });
}

function SeccionCard({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="card-soft rounded-xl bg-card p-4">
      <h3 className="mb-3 font-heading text-sm font-semibold">{titulo}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Linea({ label, valor, fuerte }: { label: string; valor: string; fuerte?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1.5 text-sm last:border-0">
      <span className={fuerte ? "font-medium" : "text-muted-foreground"}>{label}</span>
      <span className={`tabular-nums ${fuerte ? "font-semibold" : "font-medium"}`}>{valor}</span>
    </div>
  );
}

export function CalculadoraClient({
  gestion,
  indicadores,
  errorCarga,
}: {
  gestion: GestionFiniquito | null;
  indicadores: IndicadorUf[];
  errorCarga: string | null;
}) {
  const router = useRouter();
  const [guardando, startGuardar] = useTransition();

  const guardado = gestion?.calculoGuardado?.entrada ?? null;

  // ¿Se avisó con 30 días? — del portal, o derivado de las fechas
  const avisoInicial = (() => {
    if (typeof guardado?.avisoCon30Dias === "boolean") return guardado.avisoCon30Dias;
    if (gestion?.avisoModalidad === "avisar_30") return true;
    if (gestion?.avisoModalidad === "pagar_mes") return false;
    if (gestion?.fechaAviso && gestion?.fechaTermino) {
      const d = diasEntre(gestion.fechaAviso, gestion.fechaTermino);
      if (d !== null) return d >= 30;
    }
    return false;
  })();

  const [causal, setCausal] = useState(guardado?.causal ?? gestion?.causalCodigo ?? "161-1");
  const [fechaInicio, setFechaInicio] = useState(guardado?.fechaInicio ?? gestion?.fechaIngreso ?? "");
  const [fechaTermino, setFechaTermino] = useState(guardado?.fechaTermino ?? gestion?.fechaTermino ?? "");
  const [avisoCon30, setAvisoCon30] = useState(avisoInicial);
  const [sueldoBase, setSueldoBase] = useState(guardado?.sueldoBase ?? gestion?.sueldoBase ?? 0);
  const [otras, setOtras] = useState(guardado?.otrasImponibles ?? gestion?.otrasRemuneraciones ?? 0);
  const [colacion, setColacion] = useState(guardado?.colacion ?? 0);
  const [movilizacion, setMovilizacion] = useState(guardado?.movilizacion ?? 0);
  const [incluirNoImp, setIncluirNoImp] = useState(guardado?.incluirNoImponiblesEnBase ?? true);
  const [gratEnVac, setGratEnVac] = useState(guardado?.incluirGratificacionEnVacaciones ?? false);
  const [gratMode, setGratMode] = useState<"sin" | "legal" | "manual">(
    guardado ? (guardado.gratificacion === 0 ? "sin" : "manual") : "legal",
  );
  const [gratManual, setGratManual] = useState(guardado?.gratificacion ?? 0);
  const [zonaExtrema, setZonaExtrema] = useState(guardado?.zonaExtrema ?? false);
  const [diasTomados, setDiasTomados] = useState(guardado?.diasTomados ?? gestion?.diasTomados ?? 0);
  const [obtenidosManual, setObtenidosManual] = useState<number | null>(
    guardado?.diasObtenidosManual ?? null,
  );
  const [remPendiente, setRemPendiente] = useState(guardado?.remuneracionPendiente ?? 0);
  const [descuentoAfc, setDescuentoAfc] = useState(guardado?.descuentoAfc ?? 0);
  const [ufManual, setUfManual] = useState<number | null>(null);

  // UF e IMM del período: indicadores Previred del mes ANTERIOR al término
  // (Art. 172: UF del último día del mes anterior). Fallback: el más reciente
  // disponible anterior o igual a ese mes.
  const indicadorPeriodo = useMemo(() => {
    const objetivo = periodoAnteriorA(fechaTermino);
    if (!objetivo || indicadores.length === 0) return indicadores[0] ?? null;
    return (
      indicadores.find((i) => i.periodo === objetivo) ??
      indicadores.find((i) => i.periodo < objetivo) ??
      indicadores[0]
    );
  }, [indicadores, fechaTermino]);

  const ufValor = ufManual ?? indicadorPeriodo?.uf_ultimo_dia ?? null;
  const imm = indicadorPeriodo?.rmi_general ?? null;

  const gratificacion =
    gratMode === "sin"
      ? 0
      : gratMode === "legal"
        ? gratificacionLegalMensual(sueldoBase, otras, imm)
        : gratManual;

  const entrada: EntradaFiniquito = useMemo(
    () => ({
      causal,
      fechaInicio: fechaInicio || null,
      fechaTermino: fechaTermino || null,
      avisoCon30Dias: avisoCon30,
      sueldoBase,
      gratificacion,
      otrasImponibles: otras,
      colacion,
      movilizacion,
      incluirNoImponiblesEnBase: incluirNoImp,
      incluirGratificacionEnVacaciones: gratEnVac,
      ufValor,
      zonaExtrema,
      diasTomados,
      diasObtenidosManual: obtenidosManual,
      remuneracionPendiente: remPendiente,
      descuentoAfc,
    }),
    [causal, fechaInicio, fechaTermino, avisoCon30, sueldoBase, gratificacion, otras, colacion, movilizacion, incluirNoImp, gratEnVac, ufValor, zonaExtrema, diasTomados, obtenidosManual, remPendiente, descuentoAfc],
  );

  const r = useMemo(() => calcularFiniquito(entrada), [entrada]);

  const causalSel = CAUSALES_FINIQUITO.find((c) => c.codigo === causal);

  function guardar() {
    if (!gestion) return;
    const resumen: ResumenCalculo = {
      total: r.total,
      remuneracionPendiente: r.remuneracionPendiente,
      indemAviso: r.indemAviso,
      indemAnios: r.indemAnios,
      vacacionesMonto: r.vacaciones.monto,
      vacacionesDias: Math.round(r.vacaciones.diasCorridosPago * 100) / 100,
      descuentoAfc: r.descuentoAfc,
      baseIndemnizatoria: r.baseIndemnizatoria,
      aniosComputables: r.aniosComputables,
      ufValor,
      periodoUf: indicadorPeriodo?.periodo ?? null,
    };
    startGuardar(async () => {
      const res = await guardarCalculoFiniquito(gestion.id, entrada, resumen);
      if (res.ok) {
        toast.success("Cálculo guardado en la solicitud");
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al guardar");
      }
    });
  }

  const numInput = (valor: number, setear: (n: number) => void) => (
    <Input
      type="number"
      inputMode="numeric"
      min={0}
      value={valor === 0 ? "" : valor}
      placeholder="0"
      onChange={(e) => setear(e.target.value === "" ? 0 : Number(e.target.value))}
    />
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" className="-ml-2 mb-1" render={<Link href="/finiquitos" />}>
            <ArrowLeft className="size-4" />
            Volver a finiquitos
          </Button>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {gestion ? `Finiquito · ${gestion.trabajador}` : "Calculadora de finiquito"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {gestion
              ? `${gestion.empresa} · RUT ${gestion.rut} · solicitud ${gestion.estado}`
              : "Cálculo libre — sin solicitud asociada, no se guarda."}
          </p>
        </div>
        {gestion ? (
          <Button onClick={guardar} disabled={guardando}>
            <Save className="size-4" />
            {guardando ? "Guardando…" : "Guardar cálculo en la solicitud"}
          </Button>
        ) : null}
      </div>

      {errorCarga ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {errorCarga}
        </div>
      ) : null}

      {gestion?.fuero && gestion.fuero !== "no" ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">
          <AlertTriangle className="size-4 shrink-0" />
          El cliente declaró un posible fuero ({gestion.fuero}). Con fuero vigente el
          despido requiere desafuero judicial previo — revisar antes de cualquier paso.
        </div>
      ) : null}
      {gestion?.licenciaVigente === "si" ? (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-sm text-amber-700">
          <AlertTriangle className="size-4 shrink-0" />
          Licencia médica vigente: no se puede despedir por Art. 161 durante la licencia
          (Art. 161 inc. final CT).
        </div>
      ) : null}
      {gestion?.observaciones ? (
        <div className="rounded-lg border border-border bg-muted/30 p-2.5 text-sm">
          <span className="text-muted-foreground">Observaciones del cliente: </span>
          {gestion.observaciones}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <SeccionCard titulo="Causal y fechas">
            <Campo label="Causal de término">
              <select className={selectCls} value={causal} onChange={(e) => setCausal(e.target.value)}>
                <option value="">Selecciona…</option>
                {CAUSALES_FINIQUITO.map((c) => (
                  <option key={c.codigo} value={c.codigo}>{c.label}</option>
                ))}
              </select>
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Fecha inicio contrato">
                <Input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
              </Campo>
              <Campo label="Fecha término relación laboral">
                <Input type="date" value={fechaTermino} onChange={(e) => setFechaTermino(e.target.value)} />
              </Campo>
            </div>
            {r.servicio ? (
              <p className="text-sm text-muted-foreground">
                Período de servicio: <span className="font-medium text-foreground">
                  {r.servicio.anios} año{r.servicio.anios === 1 ? "" : "s"}, {r.servicio.meses} mes{r.servicio.meses === 1 ? "" : "es"} y {r.servicio.dias} día{r.servicio.dias === 1 ? "" : "s"}
                </span>
                {r.tieneIndemnizacion ? (
                  <> · años computables para indemnización: <span className="font-medium text-foreground">{r.aniosComputables}</span></>
                ) : null}
              </p>
            ) : null}
            {causalSel?.indemnizacion ? (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={avisoCon30} onCheckedChange={(v) => setAvisoCon30(v === true)} />
                Se avisó por escrito con 30 días de anticipación (no se paga el mes de aviso)
              </label>
            ) : null}
            {gestion?.fechaAviso ? (
              <p className="text-xs text-muted-foreground">
                Fecha de aviso informada por el cliente: {formatFecha(gestion.fechaAviso)}
              </p>
            ) : null}
          </SeccionCard>

          <SeccionCard titulo="Remuneración mensual">
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Sueldo base (si es variable: promedio últimos 3 meses)">
                {numInput(sueldoBase, setSueldoBase)}
              </Campo>
              <Campo label="Otras imponibles mensuales (bonos, comisiones)">
                {numInput(otras, setOtras)}
              </Campo>
              <Campo label="Gratificación">
                <select
                  className={selectCls}
                  value={gratMode}
                  onChange={(e) => setGratMode(e.target.value as typeof gratMode)}
                >
                  <option value="sin">Sin gratificación</option>
                  <option value="legal">25% con tope 4,75 IMM (auto)</option>
                  <option value="manual">Monto manual</option>
                </select>
              </Campo>
              <Campo label={gratMode === "manual" ? "Monto gratificación" : "Gratificación calculada"}>
                {gratMode === "manual" ? (
                  numInput(gratManual, setGratManual)
                ) : (
                  <Input value={formatMonto(gratificacion)} readOnly className="bg-muted/40" />
                )}
              </Campo>
              <Campo label="Colación mensual">{numInput(colacion, setColacion)}</Campo>
              <Campo label="Movilización mensual">{numInput(movilizacion, setMovilizacion)}</Campo>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={incluirNoImp} onCheckedChange={(v) => setIncluirNoImp(v === true)} />
              Incluir colación y movilización en la base indemnizatoria (criterio CS)
            </label>
            <p className="text-xs text-muted-foreground">
              Base de cálculo Art. 172: <span className="font-medium text-foreground">{formatMonto(r.baseMensual)}</span>
              {r.tope90Uf !== null ? (
                <> · tope 90 UF: <span className="font-medium text-foreground">{formatMonto(r.tope90Uf)}</span>{r.topeUfAplicado ? " (APLICADO)" : ""}</>
              ) : null}
            </p>
          </SeccionCard>

          <SeccionCard titulo="Vacaciones">
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Zona extrema (20 días hábiles/año)">
                <select
                  className={selectCls}
                  value={zonaExtrema ? "si" : "no"}
                  onChange={(e) => setZonaExtrema(e.target.value === "si")}
                >
                  <option value="no">No (15 días hábiles/año)</option>
                  <option value="si">Sí — Aysén, Magallanes, Palena</option>
                </select>
              </Campo>
              <Campo label="Días hábiles ya tomados">{numInput(diasTomados, setDiasTomados)}</Campo>
              <Campo label="Días obtenidos (vacío = automático por años completos)">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={obtenidosManual ?? ""}
                  placeholder={`auto: ${fmtDias(r.vacaciones.obtenidos)}`}
                  onChange={(e) =>
                    setObtenidosManual(e.target.value === "" ? null : Number(e.target.value))
                  }
                />
              </Campo>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={gratEnVac} onCheckedChange={(v) => setGratEnVac(v === true)} />
              Incluir gratificación en la base del feriado (criterio estándar: solo sueldo
              fijo + variables, Art. 71)
            </label>
            <div className="grid grid-cols-2 gap-x-6 text-sm sm:grid-cols-4">
              <Linea label="Pendientes" valor={fmtDias(Math.max(0, r.vacaciones.obtenidos - r.vacaciones.tomados))} />
              <Linea label="Proporcionales" valor={fmtDias(r.vacaciones.proporcionales)} />
              <Linea label="Días inhábiles" valor={fmtDias(r.vacaciones.diasInhabiles)} />
              <Linea label="Total a pagar (corridos)" valor={fmtDias(r.vacaciones.diasCorridosPago)} fuerte />
            </div>
            <p className="text-xs text-muted-foreground">
              Valor día feriado: <span className="font-medium text-foreground">{formatMonto(Math.round(r.vacaciones.valorDia))}</span>
            </p>
          </SeccionCard>

          <SeccionCard titulo="Otros montos">
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Remuneración pendiente (días trabajados del último mes)">
                {numInput(remPendiente, setRemPendiente)}
              </Campo>
              <Campo label="Descuento aporte empleador AFC (Art. 13 Ley 19.728)">
                {numInput(descuentoAfc, setDescuentoAfc)}
              </Campo>
            </div>
          </SeccionCard>
        </div>

        {/* ── Resultado ── */}
        <div className="space-y-4">
          <div className="card-soft rounded-xl bg-card p-4 lg:sticky lg:top-4">
            <h3 className="mb-3 font-heading text-sm font-semibold">Finiquito</h3>
            <Linea label="Remuneración pendiente" valor={formatMonto(r.remuneracionPendiente)} />
            <Linea label="Indem. sustitutiva aviso previo" valor={formatMonto(r.indemAviso)} />
            <Linea
              label={`Indem. años de servicio${r.aniosComputables ? ` (${r.aniosComputables} año${r.aniosComputables === 1 ? "" : "s"})` : ""}`}
              valor={formatMonto(r.indemAnios)}
            />
            <Linea
              label={`Vacaciones (${fmtDias(r.vacaciones.diasCorridosPago)} días corridos)`}
              valor={formatMonto(r.vacaciones.monto)}
            />
            {r.descuentoAfc > 0 ? (
              <Linea label="Descuento aporte AFC" valor={`− ${formatMonto(r.descuentoAfc)}`} />
            ) : null}
            <div className="mt-2 flex items-baseline justify-between rounded-lg bg-primary/5 px-3 py-2">
              <span className="font-heading font-semibold">Total finiquito</span>
              <span className="text-xl font-bold tabular-nums">{formatMonto(r.total)}</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              UF utilizada:{" "}
              {ufValor !== null
                ? `$${ufValor.toLocaleString("es-CL", { minimumFractionDigits: 2 })}`
                : "—"}
              {!ufManual && indicadorPeriodo
                ? ` (Indicadores Previred ${indicadorPeriodo.periodo})`
                : ufManual
                  ? " (manual)"
                  : ""}
            </p>
            <Campo label="UF manual (vacío = automática del período)">
              <Input
                type="number"
                step="0.01"
                min={0}
                value={ufManual ?? ""}
                placeholder={indicadorPeriodo?.uf_ultimo_dia?.toString() ?? "valor UF"}
                onChange={(e) => setUfManual(e.target.value === "" ? null : Number(e.target.value))}
              />
            </Campo>
            <p className="mt-3 text-xs text-muted-foreground">
              El finiquito debe ratificarse ante ministro de fe y ponerse a disposición
              dentro de 10 días hábiles desde la separación (Art. 177 CT).
            </p>
          </div>

          {r.notas.length > 0 ? (
            <div className="card-soft space-y-2 rounded-xl bg-card p-4">
              <h3 className="font-heading text-sm font-semibold">Notas legales</h3>
              {r.notas.map((n) => (
                <p key={n} className="flex gap-2 text-xs text-muted-foreground">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                  {n}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
