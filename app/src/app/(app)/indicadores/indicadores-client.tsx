"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, FileDown, Pencil, Upload } from "lucide-react";
import { etiquetaPeriodo } from "@/lib/periodos";
import { formatFecha, formatMonto } from "@/lib/format";
import { comparar, type Orden } from "@/lib/ordenar";
import { ThSort } from "@/components/th-sort";
import type { IndicadoresPrevired, IndicadoresRow } from "@/lib/previred";
import {
  cargarPdfPrevired,
  guardarIndicadores,
  urlPdfIndicadores,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
} from "@/components/ui/dialog";

const selectCls =
  "h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

// Filas de las tablas leídas de la hoja Previred (para tipar el ordenamiento).
type FilaAfp = IndicadoresPrevired["afp"][number];
type FilaAfc = IndicadoresPrevired["afc"][number];
type FilaPesado = IndicadoresPrevired["trabajos_pesados"][number];
type FilaAsig = IndicadoresPrevired["asignacion_familiar"][number];

/** Valor por columna para ordenar cada tabla (tasas y montos como número). */
const VALOR_AFP: Record<string, (a: FilaAfp) => unknown> = {
  afp: (a) => a.nombre,
  trabajador: (a) => a.tasa_trabajador,
  empleador: (a) => a.tasa_empleador,
  total: (a) => a.tasa_total,
  independiente: (a) => a.tasa_independiente,
};
const VALOR_AFC: Record<string, (a: FilaAfc) => unknown> = {
  contrato: (a) => a.contrato,
  empleador: (a) => a.empleador,
  trabajador: (a) => a.trabajador,
};
const VALOR_PESADOS: Record<string, (t: FilaPesado) => unknown> = {
  calificacion: (t) => t.calificacion,
  total: (t) => t.total,
  empleador: (t) => t.empleador,
  trabajador: (t) => t.trabajador,
};
const VALOR_ASIG: Record<string, (t: FilaAsig) => unknown> = {
  tramo: (t) => t.tramo,
  monto: (t) => t.monto,
  requisito: (t) => t.glosa,
};

/** "2026-05" → "2026-06" (mes en que se PAGAN las cotizaciones del período). */
function mesSiguiente(periodo: string): string {
  const [y, m] = periodo.split("-").map(Number);
  const d = new Date(y, m - 1 + 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmtUf(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return (
    "$" +
    n.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

function fmtPct(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("es-CL") + "%";
}

/** Reconstruye el shape del parser desde una fila de BD (para editar). */
function rowADatos(f: IndicadoresRow): IndicadoresPrevired {
  return {
    periodo: f.periodo,
    mes_pago: f.datos?.mes_pago ?? mesSiguiente(f.periodo),
    uf_ultimo_dia: f.uf_ultimo_dia,
    uf_ultimo_dia_anterior: f.uf_ultimo_dia_anterior,
    utm: f.utm,
    uta: f.uta,
    tope_imponible_afp: f.tope_imponible_afp,
    tope_imponible_ips: f.tope_imponible_ips,
    tope_imponible_afc: f.tope_imponible_afc,
    tope_uf_afp: f.tope_uf_afp,
    tope_uf_ips: f.tope_uf_ips,
    tope_uf_afc: f.tope_uf_afc,
    rmi_general: f.rmi_general,
    rmi_menores_mayores: f.rmi_menores_mayores,
    rmi_casa_particular: f.rmi_casa_particular,
    rmi_no_remuneracional: f.rmi_no_remuneracional,
    tasa_sis: f.tasa_sis,
    tasa_seguro_social: f.tasa_seguro_social,
    salud_ccaf: f.salud_ccaf,
    salud_fonasa_ccaf: f.salud_fonasa_ccaf,
    apv_tope_mensual: f.apv_tope_mensual,
    apv_tope_anual: f.apv_tope_anual,
    deposito_convenido_tope: f.deposito_convenido_tope,
    afp: f.afp ?? [],
    afc: f.afc ?? [],
    trabajos_pesados: f.trabajos_pesados ?? [],
    asignacion_familiar: f.asignacion_familiar ?? [],
    advertencias: [],
  };
}

type CampoNumerico = keyof Pick<
  IndicadoresPrevired,
  | "uf_ultimo_dia"
  | "uf_ultimo_dia_anterior"
  | "utm"
  | "uta"
  | "tope_imponible_afp"
  | "tope_imponible_ips"
  | "tope_imponible_afc"
  | "rmi_general"
  | "rmi_menores_mayores"
  | "rmi_casa_particular"
  | "rmi_no_remuneracional"
  | "tasa_sis"
  | "tasa_seguro_social"
  | "salud_ccaf"
  | "salud_fonasa_ccaf"
  | "apv_tope_mensual"
  | "apv_tope_anual"
  | "deposito_convenido_tope"
>;

function StatCard({ label, valor, detalle }: { label: string; valor: string; detalle?: string }) {
  return (
    <div className="card-soft rounded-xl bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold">{valor}</div>
      {detalle ? (
        <div className="mt-0.5 text-xs text-muted-foreground">{detalle}</div>
      ) : null}
    </div>
  );
}

function SeccionCard({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="card-soft rounded-xl bg-card p-4">
      <h3 className="mb-3 font-heading text-sm font-semibold">{titulo}</h3>
      {children}
    </div>
  );
}

function FilaDato({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{valor}</span>
    </div>
  );
}

export function IndicadoresClient({
  filas,
  errorCarga,
}: {
  filas: IndicadoresRow[];
  errorCarga: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [periodoSel, setPeriodoSel] = useState<string | null>(
    filas[0]?.periodo ?? null,
  );
  const [revision, setRevision] = useState<{
    datos: IndicadoresPrevired;
    pdfPath: string | null;
    existente: boolean;
  } | null>(null);
  const [observaciones, setObservaciones] = useState("");
  const [cargando, startCargar] = useTransition();
  const [guardando, startGuardar] = useTransition();

  const fila = filas.find((f) => f.periodo === periodoSel) ?? filas[0] ?? null;

  // Orden por tabla (clic en el encabezado); sin orden queda como viene del PDF.
  const [ordenAfp, setOrdenAfp] = useState<Orden>(null);
  const [ordenAfc, setOrdenAfc] = useState<Orden>(null);
  const [ordenPesados, setOrdenPesados] = useState<Orden>(null);
  const [ordenAsig, setOrdenAsig] = useState<Orden>(null);

  const afpOrdenadas = useMemo(() => {
    const lista = fila?.afp ?? [];
    if (!ordenAfp || !VALOR_AFP[ordenAfp.col]) return lista;
    const valor = VALOR_AFP[ordenAfp.col];
    return [...lista].sort((a, b) => comparar(valor(a), valor(b), ordenAfp.dir));
  }, [fila, ordenAfp]);

  const afcOrdenadas = useMemo(() => {
    const lista = fila?.afc ?? [];
    if (!ordenAfc || !VALOR_AFC[ordenAfc.col]) return lista;
    const valor = VALOR_AFC[ordenAfc.col];
    return [...lista].sort((a, b) => comparar(valor(a), valor(b), ordenAfc.dir));
  }, [fila, ordenAfc]);

  const pesadosOrdenados = useMemo(() => {
    const lista = fila?.trabajos_pesados ?? [];
    if (!ordenPesados || !VALOR_PESADOS[ordenPesados.col]) return lista;
    const valor = VALOR_PESADOS[ordenPesados.col];
    return [...lista].sort((a, b) => comparar(valor(a), valor(b), ordenPesados.dir));
  }, [fila, ordenPesados]);

  const asigOrdenados = useMemo(() => {
    const lista = fila?.asignacion_familiar ?? [];
    if (!ordenAsig || !VALOR_ASIG[ordenAsig.col]) return lista;
    const valor = VALOR_ASIG[ordenAsig.col];
    return [...lista].sort((a, b) => comparar(valor(a), valor(b), ordenAsig.dir));
  }, [fila, ordenAsig]);

  function onArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    const fd = new FormData();
    fd.append("archivo", archivo);
    startCargar(async () => {
      const res = await cargarPdfPrevired(fd);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setObservaciones(
        filas.find((f) => f.periodo === res.datos.periodo)?.observaciones ?? "",
      );
      setRevision({
        datos: res.datos,
        pdfPath: res.pdfPath,
        existente: res.periodoExistente,
      });
    });
  }

  function editarActual() {
    if (!fila) return;
    setObservaciones(fila.observaciones ?? "");
    setRevision({ datos: rowADatos(fila), pdfPath: fila.pdf_path, existente: true });
  }

  function setCampo(campo: CampoNumerico, texto: string) {
    setRevision((r) => {
      if (!r) return r;
      const v = texto === "" ? null : Number(texto);
      return {
        ...r,
        datos: { ...r.datos, [campo]: v === null || Number.isNaN(v) ? null : v },
      };
    });
  }

  function guardar() {
    if (!revision) return;
    startGuardar(async () => {
      const res = await guardarIndicadores({
        datos: revision.datos,
        pdfPath: revision.pdfPath,
        observaciones: observaciones.trim() || null,
      });
      if (res.ok) {
        toast.success(
          `Indicadores de ${etiquetaPeriodo(revision.datos.periodo)} guardados`,
        );
        setPeriodoSel(revision.datos.periodo);
        setRevision(null);
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al guardar");
      }
    });
  }

  function verPdf() {
    if (!fila?.pdf_path) return;
    const path = fila.pdf_path;
    const periodo = fila.periodo;
    startCargar(async () => {
      const res = await urlPdfIndicadores(path, periodo);
      if (res.ok && res.url) window.open(res.url, "_blank");
      else toast.error(res.error ?? "No se pudo abrir el PDF.");
    });
  }

  const d = revision?.datos ?? null;

  const campoNum = (
    label: string,
    campo: CampoNumerico,
    paso: string = "1",
  ) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={campo}>{label}</Label>
      <Input
        id={campo}
        type="number"
        step={paso}
        value={d?.[campo] ?? ""}
        onChange={(e) => setCampo(campo, e.target.value)}
      />
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Indicadores Previred
          </h1>
          <p className="text-sm text-muted-foreground">
            Hoja mensual de indicadores previsionales: UF, UTM, topes, tasas AFP/AFC
            y asignación familiar — base para liquidaciones y finiquitos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={onArchivo}
          />
          <Button onClick={() => inputRef.current?.click()} disabled={cargando}>
            <Upload className="size-4" />
            {cargando ? "Procesando…" : "Cargar PDF Previred"}
          </Button>
        </div>
      </div>

      {errorCarga ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Error al cargar: {errorCarga}
        </div>
      ) : null}

      {filas.length === 0 ? (
        <div className="card-soft rounded-xl bg-card p-10 text-center">
          <p className="font-heading text-lg font-semibold">
            Aún no hay indicadores cargados
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Descarga la hoja mensual &quot;Indicadores Previsionales&quot; desde
            previred.com y súbela acá. El sistema lee los valores automáticamente
            y te los muestra para revisión antes de guardar.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Período"
              className={selectCls}
              value={fila?.periodo ?? ""}
              onChange={(e) => setPeriodoSel(e.target.value)}
            >
              {filas.map((f) => (
                <option key={f.periodo} value={f.periodo}>
                  Remuneraciones {etiquetaPeriodo(f.periodo)}
                </option>
              ))}
            </select>
            {fila ? (
              <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
                Cotizaciones se pagan en {etiquetaPeriodo(mesSiguiente(fila.periodo))}
              </Badge>
            ) : null}
            <span className="ml-auto flex items-center gap-2">
              {fila?.pdf_path ? (
                <Button variant="outline" size="sm" onClick={verPdf} disabled={cargando}>
                  <FileDown className="size-4" />
                  PDF original
                </Button>
              ) : null}
              <Button variant="outline" size="sm" onClick={editarActual}>
                <Pencil className="size-4" />
                Editar valores
              </Button>
            </span>
          </div>

          {fila ? (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard
                  label={`UF al último día de ${etiquetaPeriodo(fila.periodo)}`}
                  valor={fmtUf(fila.uf_ultimo_dia)}
                  detalle={`Mes anterior: ${fmtUf(fila.uf_ultimo_dia_anterior)}`}
                />
                <StatCard label="UTM" valor={formatMonto(fila.utm)} detalle={`UTA: ${formatMonto(fila.uta)}`} />
                <StatCard
                  label="Sueldo mínimo (IMM)"
                  valor={formatMonto(fila.rmi_general)}
                  detalle="Trab. dependientes e independientes"
                />
                <StatCard
                  label="Tope imponible AFP"
                  valor={formatMonto(fila.tope_imponible_afp)}
                  detalle={`${fila.tope_uf_afp ?? 90} UF`}
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <SeccionCard titulo="Rentas topes imponibles">
                  <FilaDato
                    label={`Afiliados a una AFP (${fila.tope_uf_afp ?? "—"} UF)`}
                    valor={formatMonto(fila.tope_imponible_afp)}
                  />
                  <FilaDato
                    label={`Afiliados al INP/IPS (${fila.tope_uf_ips ?? "—"} UF)`}
                    valor={formatMonto(fila.tope_imponible_ips)}
                  />
                  <FilaDato
                    label={`Seguro de Cesantía (${fila.tope_uf_afc ?? "—"} UF)`}
                    valor={formatMonto(fila.tope_imponible_afc)}
                  />
                </SeccionCard>

                <SeccionCard titulo="Rentas mínimas imponibles">
                  <FilaDato label="Trab. dependientes e independientes" valor={formatMonto(fila.rmi_general)} />
                  <FilaDato label="Menores de 18 y mayores de 65" valor={formatMonto(fila.rmi_menores_mayores)} />
                  <FilaDato label="Trabajadores de casa particular" valor={formatMonto(fila.rmi_casa_particular)} />
                  <FilaDato label="Para fines no remuneracionales" valor={formatMonto(fila.rmi_no_remuneracional)} />
                </SeccionCard>

                <SeccionCard titulo="Tasas de cotización AFP">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <ThSort col="afp" orden={ordenAfp} setOrden={setOrdenAfp}>
                          AFP
                        </ThSort>
                        <ThSort col="trabajador" orden={ordenAfp} setOrden={setOrdenAfp} className="text-right">
                          Trabajador
                        </ThSort>
                        <ThSort col="empleador" orden={ordenAfp} setOrden={setOrdenAfp} className="text-right">
                          Empleador
                        </ThSort>
                        <ThSort col="total" orden={ordenAfp} setOrden={setOrdenAfp} className="text-right">
                          Total
                        </ThSort>
                        <ThSort col="independiente" orden={ordenAfp} setOrden={setOrdenAfp} className="text-right">
                          Independiente
                        </ThSort>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {afpOrdenadas.map((a) => (
                        <TableRow key={a.nombre} className="hover:bg-transparent">
                          <TableCell className="font-medium">{a.nombre}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtPct(a.tasa_trabajador)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtPct(a.tasa_empleador)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtPct(a.tasa_total)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtPct(a.tasa_independiente)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Total = tasa a pagar por trabajadores dependientes activos. La tasa
                    de independientes incluye SIS.
                  </p>
                </SeccionCard>

                <SeccionCard titulo="Seguros y salud">
                  <FilaDato label="Seguro de Invalidez y Sobrevivencia (SIS)" valor={fmtPct(fila.tasa_sis)} />
                  <FilaDato label="Seguro social — expectativa de vida" valor={fmtPct(fila.tasa_seguro_social)} />
                  <FilaDato label="Salud vía CCAF (del 7%)" valor={`${fmtPct(fila.salud_ccaf)} R.I.`} />
                  <FilaDato label="FONASA si hay CCAF (del 7%)" valor={`${fmtPct(fila.salud_fonasa_ccaf)} R.I.`} />
                  <p className="mt-2 text-xs text-muted-foreground">
                    La distribución 7% salud solo aplica a empleadores afiliados a una
                    Caja de Compensación; si no, se cotiza el 7% completo a Fonasa. SIS
                    no aplica a trabajadores pensionados.
                  </p>
                </SeccionCard>

                <SeccionCard titulo="Seguro de Cesantía (AFC)">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <ThSort col="contrato" orden={ordenAfc} setOrden={setOrdenAfc}>
                          Contrato
                        </ThSort>
                        <ThSort col="empleador" orden={ordenAfc} setOrden={setOrdenAfc} className="text-right">
                          Empleador
                        </ThSort>
                        <ThSort col="trabajador" orden={ordenAfc} setOrden={setOrdenAfc} className="text-right">
                          Trabajador
                        </ThSort>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {afcOrdenadas.map((a) => (
                        <TableRow key={a.contrato} className="hover:bg-transparent">
                          <TableCell>{a.contrato}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {a.empleador !== null ? `${fmtPct(a.empleador)} R.I.` : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {a.trabajador !== null ? `${fmtPct(a.trabajador)} R.I.` : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </SeccionCard>

                <SeccionCard titulo="Cotización para trabajos pesados">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <ThSort col="calificacion" orden={ordenPesados} setOrden={setOrdenPesados}>
                          Calificación
                        </ThSort>
                        <ThSort col="total" orden={ordenPesados} setOrden={setOrdenPesados} className="text-right">
                          Total
                        </ThSort>
                        <ThSort col="empleador" orden={ordenPesados} setOrden={setOrdenPesados} className="text-right">
                          Empleador
                        </ThSort>
                        <ThSort col="trabajador" orden={ordenPesados} setOrden={setOrdenPesados} className="text-right">
                          Trabajador
                        </ThSort>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pesadosOrdenados.map((t) => (
                        <TableRow key={t.calificacion} className="hover:bg-transparent">
                          <TableCell>{t.calificacion}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtPct(t.total)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {t.empleador !== null ? `${fmtPct(t.empleador)} R.I.` : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {t.trabajador !== null ? `${fmtPct(t.trabajador)} R.I.` : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </SeccionCard>

                <SeccionCard titulo="APV y depósito convenido">
                  <FilaDato label="APV tope mensual (50 UF)" valor={formatMonto(fila.apv_tope_mensual)} />
                  <FilaDato label="APV tope anual (600 UF)" valor={formatMonto(fila.apv_tope_anual)} />
                  <FilaDato label="Depósito convenido tope anual (900 UF)" valor={formatMonto(fila.deposito_convenido_tope)} />
                </SeccionCard>

                <SeccionCard titulo="Asignación familiar">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <ThSort col="tramo" orden={ordenAsig} setOrden={setOrdenAsig}>
                          Tramo
                        </ThSort>
                        <ThSort col="monto" orden={ordenAsig} setOrden={setOrdenAsig} className="text-right">
                          Monto
                        </ThSort>
                        <ThSort col="requisito" orden={ordenAsig} setOrden={setOrdenAsig}>
                          Requisito de renta
                        </ThSort>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {asigOrdenados.map((t) => (
                        <TableRow key={t.tramo} className="hover:bg-transparent">
                          <TableCell className="font-medium">{t.tramo}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatMonto(t.monto)}</TableCell>
                          <TableCell className="text-muted-foreground">{t.glosa}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </SeccionCard>
              </div>

              <p className="text-xs text-muted-foreground">
                Fuente: hoja &quot;Indicadores Previsionales&quot; de Previred
                {fila.observaciones ? ` · Observaciones: ${fila.observaciones}` : ""} ·
                Última actualización: {formatFecha(fila.updated_at?.slice(0, 10))}
              </p>
            </>
          ) : null}
        </>
      )}

      <Dialog
        open={revision !== null}
        onOpenChange={(o) => {
          if (!o) setRevision(null);
        }}
      >
        {revision && d ? (
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="font-heading">
                Revisar indicadores — Remuneraciones {etiquetaPeriodo(d.periodo)}
              </DialogTitle>
              <DialogDescription>
                Cotizaciones a pagar en {etiquetaPeriodo(d.mes_pago)}. Verifica los
                valores leídos del PDF antes de guardar.
              </DialogDescription>
            </DialogHeader>

            {revision.existente ? (
              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-sm text-amber-700">
                <AlertTriangle className="size-4 shrink-0" />
                Este período ya está cargado: al guardar se sobrescriben sus valores.
              </div>
            ) : null}

            {d.advertencias.length > 0 ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-sm text-destructive">
                No se pudieron leer del PDF (completar a mano):{" "}
                {d.advertencias.join(", ")}.
              </div>
            ) : null}

            <div className="space-y-4">
              <div>
                <h4 className="mb-2 text-sm font-semibold">Valores del mes</h4>
                <div className="grid grid-cols-2 gap-3">
                  {campoNum("UF último día del mes", "uf_ultimo_dia", "0.01")}
                  {campoNum("UF último día mes anterior", "uf_ultimo_dia_anterior", "0.01")}
                  {campoNum("UTM", "utm")}
                  {campoNum("UTA", "uta")}
                </div>
              </div>

              <div>
                <h4 className="mb-2 text-sm font-semibold">Topes imponibles ($)</h4>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {campoNum("AFP", "tope_imponible_afp")}
                  {campoNum("INP/IPS", "tope_imponible_ips")}
                  {campoNum("Seguro Cesantía", "tope_imponible_afc")}
                </div>
              </div>

              <div>
                <h4 className="mb-2 text-sm font-semibold">Rentas mínimas imponibles ($)</h4>
                <div className="grid grid-cols-2 gap-3">
                  {campoNum("Dependientes e independientes", "rmi_general")}
                  {campoNum("Menores de 18 / mayores de 65", "rmi_menores_mayores")}
                  {campoNum("Casa particular", "rmi_casa_particular")}
                  {campoNum("Fines no remuneracionales", "rmi_no_remuneracional")}
                </div>
              </div>

              <div>
                <h4 className="mb-2 text-sm font-semibold">Tasas (%)</h4>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {campoNum("SIS", "tasa_sis", "0.01")}
                  {campoNum("Seguro social EV", "tasa_seguro_social", "0.01")}
                  {campoNum("Salud CCAF", "salud_ccaf", "0.1")}
                  {campoNum("FONASA c/CCAF", "salud_fonasa_ccaf", "0.1")}
                </div>
              </div>

              <div>
                <h4 className="mb-2 text-sm font-semibold">APV y depósito convenido ($)</h4>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {campoNum("APV mensual", "apv_tope_mensual")}
                  {campoNum("APV anual", "apv_tope_anual")}
                  {campoNum("Dep. convenido anual", "deposito_convenido_tope")}
                </div>
              </div>

              <div>
                <h4 className="mb-2 text-sm font-semibold">
                  Tablas leídas del PDF
                </h4>
                <div className="space-y-1 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                  <p>
                    <span className="font-medium text-foreground">AFP ({d.afp.length}):</span>{" "}
                    {d.afp.map((a) => `${a.nombre} ${fmtPct(a.tasa_total)}`).join(" · ") || "—"}
                  </p>
                  <p>
                    <span className="font-medium text-foreground">AFC ({d.afc.length}):</span>{" "}
                    {d.afc
                      .map((a) => `${a.contrato} ${fmtPct(a.empleador)}${a.trabajador !== null ? ` + ${fmtPct(a.trabajador)} trab.` : ""}`)
                      .join(" · ") || "—"}
                  </p>
                  <p>
                    <span className="font-medium text-foreground">
                      Asignación familiar ({d.asignacion_familiar.length} tramos):
                    </span>{" "}
                    {d.asignacion_familiar.map((t) => `${t.tramo} ${formatMonto(t.monto)}`).join(" · ") || "—"}
                  </p>
                  <p>
                    Estas tablas se guardan tal como se leyeron; si alguna viene mal,
                    vuelve a cargar el PDF o avisa para corregirla en base de datos.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="observaciones">Observaciones</Label>
                <Textarea
                  id="observaciones"
                  rows={2}
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  placeholder="Ej.: valor corregido a mano, cambio normativo del mes, etc."
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRevision(null)}>
                Cancelar
              </Button>
              <Button type="button" onClick={guardar} disabled={guardando}>
                {guardando
                  ? "Guardando…"
                  : revision.existente
                    ? "Actualizar período"
                    : "Guardar indicadores"}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
