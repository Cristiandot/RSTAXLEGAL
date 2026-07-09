"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Calculator, UserPlus, Download, Copy } from "lucide-react";
import { formatMonto } from "@/lib/format";
import { SelectorPeriodo } from "@/components/selector-periodo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MUTUALES,
  CAJAS_COMPENSACION,
  SEXOS,
  TIPOS_TRABAJADOR,
  REGIMENES_PREVISIONALES,
  JORNADAS,
  SALUD_OPCIONES,
  NATURALEZAS_CONCEPTO,
  COLUMNAS_LRE,
} from "@/lib/liquidaciones-kame";
import {
  guardarConfigEmpresa,
  guardarConcepto,
  eliminarConcepto,
  guardarFichaTrabajador,
  guardarLiquidacionDetalle,
  descargarLiquidaciones,
  descargarNominaPrevired,
  marcarConceptoPeriodo,
  type ConceptoInput,
  type FichaTrabajadorInput,
} from "./actions";

function descargarBase64Pdf(base64: string, filename: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const AFP_NOMBRES = ["Capital", "Cuprum", "Habitat", "PlanVital", "Provida", "Modelo", "Uno"];

const selectCls =
  "h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

// Tipos laxos de las filas que llegan de la BD.
type Cliente = {
  id: string;
  razon_social: string;
  rut_empresa: string | null;
  previred_rut: string | null;
  mutual_institucion: string | null;
  mutual_tasa: number | string | null;
  caja_compensacion: string | null;
  sabado_habil: boolean | null;
};
type Trabajador = Record<string, unknown> & {
  id: string;
  nombres: string;
  apellidos: string | null;
  rut: string | null;
};
type Concepto = {
  id: string;
  nombre: string;
  naturaleza: string;
  columna_lre: string | null;
  copia_mensual: boolean;
  proporcional: boolean;
  tributable: boolean;
  es_prestamo: boolean;
  orden: number;
};
type Liquidacion = {
  trabajador_id: string;
  liquido: number | null;
  total_haberes: number | null;
  total_descuentos: number | null;
  estado: string;
  kame_liquido: number | null;
  kame_cuadra: boolean | null;
  calculado_at: string | null;
  dias_trabajados: number | null;
  dias_vacaciones: number | null;
  dias_licencia: number | null;
  detalle: Record<string, unknown> | null;
};
type Novedad = {
  trabajador_id: string;
  tipo: string;
  cantidad: number | string | null;
  monto: number | string | null;
  concepto_id: string | null;
  origen: string;
};

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const numOrNull = (v: FormDataEntryValue | null): number | null =>
  v === null || v === "" ? null : Number(v);

function Seccion({ titulo, children, accion }: { titulo: string; children: React.ReactNode; accion?: React.ReactNode }) {
  return (
    <section className="card-soft rounded-xl bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-heading text-lg font-semibold">{titulo}</h2>
        {accion}
      </div>
      {children}
    </section>
  );
}

export function ClienteLiquidacionClient({
  periodo,
  cliente,
  trabajadores,
  conceptos,
  considerado,
  liquidaciones,
  novedades,
  ausencias,
  hayIndicadores,
}: {
  periodo: string;
  cliente: Cliente;
  trabajadores: Trabajador[];
  conceptos: Concepto[];
  considerado: Record<string, boolean>;
  liquidaciones: Liquidacion[];
  novedades: Novedad[];
  ausencias: Record<string, { vac: number; lic: number }>;
  hayIndicadores: boolean;
}) {
  const conceptosActivos = useMemo(
    () => conceptos.filter((c) => considerado[c.id] !== false),
    [conceptos, considerado],
  );
  const unidades = useMemo(
    () => Array.from(new Set(trabajadores.map((t) => str(t.sucursal)).filter(Boolean))).sort(),
    [trabajadores],
  );
  const [unidadPrevired, setUnidadPrevired] = useState("");
  const router = useRouter();
  const [guardando, startGuardar] = useTransition();
  const [fichaAbierta, setFichaAbierta] = useState<Trabajador | "nuevo" | null>(null);
  const [conceptoAbierto, setConceptoAbierto] = useState<Concepto | "nuevo" | null>(null);
  const [liqAbierta, setLiqAbierta] = useState<Trabajador | null>(null);

  const liqPorTrab = useMemo(
    () => new Map(liquidaciones.map((l) => [l.trabajador_id, l])),
    [liquidaciones],
  );

  // ---------- Config empresa ----------
  const [mutInst, setMutInst] = useState(cliente.mutual_institucion ?? "");
  const [mutTasa, setMutTasa] = useState(str(cliente.mutual_tasa));
  const [caja, setCaja] = useState(cliente.caja_compensacion ?? "");
  const [sabado, setSabado] = useState(cliente.sabado_habil === true);

  function guardarEmpresa() {
    startGuardar(async () => {
      const res = await guardarConfigEmpresa(cliente.id, {
        mutual_institucion: mutInst || null,
        mutual_tasa: mutTasa === "" ? null : Number(mutTasa),
        caja_compensacion: caja || null,
        sabado_habil: sabado,
      });
      if (res.ok) {
        toast.success("Configuración guardada");
        router.refresh();
      } else toast.error(res.error ?? "Error");
    });
  }

  function descargar(trabajadorId?: string) {
    startGuardar(async () => {
      const res = await descargarLiquidaciones(cliente.id, periodo, trabajadorId ?? null);
      if (res.ok && res.base64) descargarBase64Pdf(res.base64, res.filename ?? "liquidaciones.pdf");
      else toast.error(res.error ?? "Error al generar el PDF");
    });
  }

  function descargarPrevired() {
    startGuardar(async () => {
      const res = await descargarNominaPrevired(cliente.id, periodo, unidadPrevired || null);
      if (res.ok && res.base64) {
        const bytes = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes], { type: "text/plain;charset=latin1" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = res.filename ?? "previred.txt";
        a.click();
        URL.revokeObjectURL(url);
      } else toast.error(res.error ?? "Error al generar el archivo");
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Link href={`/liquidaciones?periodo=${periodo}`} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-5" />
        </Link>
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{cliente.razon_social}</h1>
          <p className="text-sm text-muted-foreground">
            {cliente.rut_empresa ?? ""} · Carga de liquidaciones del período
          </p>
          {cliente.previred_rut && (
            <button
              type="button"
              title="Copiar RUT de ingreso a Previred"
              onClick={() => {
                navigator.clipboard.writeText(cliente.previred_rut ?? "");
                toast.success(`RUT Previred copiado: ${cliente.previred_rut}`);
              }}
              className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-input bg-card px-2 py-1 text-xs text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground"
            >
              <Copy className="size-3" />
              RUT Previred:
              <span className="font-semibold text-foreground">{cliente.previred_rut}</span>
            </button>
          )}
        </div>
        <div className="ml-auto">
          <SelectorPeriodo periodo={periodo} onCambio={(p) => router.push(`/liquidaciones/${cliente.id}?periodo=${p}`)} />
        </div>
      </div>

      {!hayIndicadores ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          No hay indicadores Previred cargados para {periodo}. Súbelos en{" "}
          <Link href="/indicadores" className="underline">/indicadores</Link> para poder calcular.
        </div>
      ) : null}

      {/* CONFIGURACIÓN DE EMPRESA */}
      <Seccion titulo="Configuración de la empresa">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <Label>Mutual de seguridad</Label>
            <select className={selectCls} value={mutInst} onChange={(e) => setMutInst(e.target.value)}>
              <option value="">(Seleccione)</option>
              {MUTUALES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Tasa mutual (%)</Label>
            <Input type="number" step="0.01" value={mutTasa} onChange={(e) => setMutTasa(e.target.value)} placeholder="1.95" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Caja de compensación</Label>
            <select className={selectCls} value={caja} onChange={(e) => setCaja(e.target.value)}>
              <option value="">(Seleccione)</option>
              {CAJAS_COMPENSACION.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex items-end gap-2 pb-1">
            <Checkbox id="sabado" checked={sabado} onCheckedChange={(v) => setSabado(v === true)} />
            <Label htmlFor="sabado" className="cursor-pointer">Sábado hábil</Label>
          </div>
        </div>
        <div className="mt-3">
          <Button size="sm" onClick={guardarEmpresa} disabled={guardando}>Guardar configuración</Button>
        </div>
      </Seccion>

      {/* CONCEPTOS */}
      <Seccion
        titulo="Bonos y descuentos de la empresa"
        accion={
          <Button size="sm" variant="outline" onClick={() => setConceptoAbierto("nuevo")}>
            <Plus className="size-4" /> Agregar concepto
          </Button>
        }
      >
        {conceptos.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Sin conceptos configurados.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-center">Este mes</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Naturaleza</TableHead>
                <TableHead>Columna LRE</TableHead>
                <TableHead className="text-center">Copia mensual</TableHead>
                <TableHead className="text-center">Proporcional</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {conceptos.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => setConceptoAbierto(c)}>
                  <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={considerado[c.id] !== false}
                      disabled={guardando}
                      onCheckedChange={(v) =>
                        startGuardar(async () => {
                          const res = await marcarConceptoPeriodo(cliente.id, c.id, periodo, v === true);
                          if (res.ok) router.refresh();
                          else toast.error(res.error ?? "Error");
                        })
                      }
                      aria-label={`Considerar ${c.nombre} este mes`}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{c.nombre}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {NATURALEZAS_CONCEPTO.find((n) => n.value === c.naturaleza)?.label ?? c.naturaleza}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.columna_lre ?? "—"}</TableCell>
                  <TableCell className="text-center">{c.copia_mensual ? "✓" : ""}</TableCell>
                  <TableCell className="text-center">{c.proporcional ? "✓" : ""}</TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        startGuardar(async () => {
                          const res = await eliminarConcepto(cliente.id, c.id);
                          if (res.ok) router.refresh();
                          else toast.error(res.error ?? "Error");
                        })
                      }
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Seccion>

      {/* NÓMINA */}
      <Seccion
        titulo={`Nómina (${trabajadores.length})`}
        accion={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => descargar()} disabled={guardando}>
              <Download className="size-4" /> Descargar todas
            </Button>
            <Button size="sm" onClick={() => setFichaAbierta("nuevo")}>
              <UserPlus className="size-4" /> Carga de empleados para la empresa
            </Button>
          </div>
        }
      >
        {trabajadores.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Sin trabajadores. Usa “Carga de empleados para la empresa”.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trabajador</TableHead>
                <TableHead>RUT</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead className="text-right">Líquido calculado</TableHead>
                <TableHead className="text-center">vs KAME</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trabajadores.map((t) => {
                const liq = liqPorTrab.get(t.id);
                return (
                  <TableRow key={t.id}>
                    <TableCell className="cursor-pointer font-medium" onClick={() => setFichaAbierta(t)}>
                      {str(t.apellidos)}, {str(t.nombres)}
                    </TableCell>
                    <TableCell>{str(t.rut) || "—"}</TableCell>
                    <TableCell>{str(t.cargo) || "—"}</TableCell>
                    <TableCell className="text-right">{liq ? formatMonto(liq.liquido) : "—"}</TableCell>
                    <TableCell className="text-center">
                      {liq?.kame_cuadra === true ? (
                        <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">cuadra</Badge>
                      ) : liq?.kame_cuadra === false ? (
                        <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">difiere</Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" disabled={!hayIndicadores} onClick={() => setLiqAbierta(t)}>
                          <Calculator className="size-4" /> Liquidar
                        </Button>
                        {liq ? (
                          <Button size="sm" variant="outline" disabled={guardando} onClick={() => descargar(t.id)} aria-label="Descargar liquidación">
                            <Download className="size-4" />
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Seccion>

      {/* CARGA ELECTRÓNICA PREVIRED */}
      <Seccion titulo="Carga electrónica Previred">
        <p className="mb-3 text-sm text-muted-foreground">
          Genera el archivo de nómina (Formato Largo Variable, 105 campos) para subir a Previred.
          Elige la unidad de negocio (centro de costo) o todas.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Unidad de negocio</Label>
            <select className={selectCls} value={unidadPrevired} onChange={(e) => setUnidadPrevired(e.target.value)}>
              <option value="">Todas</option>
              {unidades.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <Button variant="outline" onClick={descargarPrevired} disabled={guardando || !hayIndicadores}>
            <Download className="size-4" /> Descargar archivo Previred
          </Button>
        </div>
      </Seccion>

      {conceptoAbierto ? (
        <ConceptoDialog
          clienteId={cliente.id}
          concepto={conceptoAbierto === "nuevo" ? null : conceptoAbierto}
          ordenSiguiente={conceptos.length}
          onClose={() => setConceptoAbierto(null)}
          onSaved={() => { setConceptoAbierto(null); router.refresh(); }}
        />
      ) : null}

      {fichaAbierta ? (
        <FichaDialog
          clienteId={cliente.id}
          trabajador={fichaAbierta === "nuevo" ? null : fichaAbierta}
          conceptos={conceptosActivos}
          onClose={() => setFichaAbierta(null)}
          onSaved={() => { setFichaAbierta(null); router.refresh(); }}
        />
      ) : null}

      {liqAbierta ? (
        <LiquidacionDialog
          clienteId={cliente.id}
          periodo={periodo}
          trabajador={liqAbierta}
          conceptos={conceptosActivos}
          novedades={novedades.filter((n) => n.trabajador_id === liqAbierta.id)}
          liquidacion={liqPorTrab.get(liqAbierta.id) ?? null}
          ausencia={ausencias[liqAbierta.id] ?? { vac: 0, lic: 0 }}
          onClose={() => setLiqAbierta(null)}
          onSaved={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}

// ---------------- Liquidación por trabajador (editor de montos + cálculo) ----------------
function LiquidacionDialog({
  clienteId,
  periodo,
  trabajador,
  conceptos,
  novedades,
  liquidacion,
  ausencia,
  onClose,
  onSaved,
}: {
  clienteId: string;
  periodo: string;
  trabajador: Trabajador;
  conceptos: Concepto[];
  novedades: Novedad[];
  liquidacion: Liquidacion | null;
  ausencia: { vac: number; lic: number };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [guardando, start] = useTransition();
  const prefill = (conceptoId: string): string => {
    const n = novedades.find((x) => x.concepto_id === conceptoId);
    return n?.monto != null ? String(n.monto) : "";
  };
  const licInicial = liquidacion?.dias_licencia ?? ausencia.lic ?? 0;
  // Días pagados = 30 − licencia (la licencia la cubre el subsidio; las vacaciones se pagan).
  const [dias, setDias] = useState(String(liquidacion?.dias_trabajados ?? Math.max(0, 30 - Number(licInicial))));
  const [diasVac, setDiasVac] = useState(String(liquidacion?.dias_vacaciones ?? ausencia.vac ?? 0));
  const [diasLic, setDiasLic] = useState(String(licInicial));
  const onLicencia = (v: string) => {
    setDiasLic(v);
    setDias(String(Math.max(0, 30 - (Number(v) || 0))));
  };
  const [montos, setMontos] = useState<Record<string, string>>(
    Object.fromEntries(conceptos.map((c) => [c.id, prefill(c.id)])),
  );
  const [horasExtra, setHorasExtra] = useState(
    String(novedades.find((n) => n.tipo === "hora_extra")?.cantidad ?? ""),
  );
  const [anticipo, setAnticipo] = useState(
    String(novedades.find((n) => n.tipo === "anticipo")?.monto ?? ""),
  );
  // Modalidad por hora / por día: la cantidad del mes define el sueldo (tarifa × cantidad).
  const modalidad = str(trabajador.sueldo_modalidad) || "mensual";
  const [horasNormales, setHorasNormales] = useState(
    String(novedades.find((n) => n.tipo === "horas_normales")?.cantidad ?? ""),
  );
  const [diasPagados, setDiasPagados] = useState(
    String(novedades.find((n) => n.tipo === "dias_pagados")?.cantidad ?? ""),
  );
  const [kameLiquido, setKameLiquido] = useState(String(liquidacion?.kame_liquido ?? ""));
  const [resultado, setResultado] = useState<Record<string, unknown> | null>(
    (liquidacion?.detalle as Record<string, unknown> | null) ?? null,
  );

  const porNaturaleza = (nat: string) => conceptos.filter((c) => c.naturaleza === nat);

  function calcular() {
    start(async () => {
      const res = await guardarLiquidacionDetalle(clienteId, trabajador.id, periodo, {
        diasTrabajados: Number(dias) || 30,
        diasVacaciones: Number(diasVac) || 0,
        diasLicencia: Number(diasLic) || 0,
        conceptos: conceptos.map((c) => ({ concepto_id: c.id, naturaleza: c.naturaleza, monto: Number(montos[c.id] || 0) })),
        horasExtra: Number(horasExtra) || 0,
        anticipo: Number(anticipo) || 0,
        kameLiquido: kameLiquido === "" ? null : Number(kameLiquido),
        horasNormales: modalidad === "hora" ? Number(horasNormales) || 0 : 0,
        diasPagados: modalidad === "dia" ? Number(diasPagados) || 0 : 0,
      });
      if (res.ok) {
        setResultado((res.detalle as Record<string, unknown>) ?? null);
        toast.success(`Líquido ${formatMonto(res.liquido ?? 0)}`);
        onSaved();
      } else toast.error(res.error ?? "Error al calcular");
    });
  }

  const r = resultado;
  const money = (k: string) => formatMonto((r?.[k] as number) ?? 0);
  const grupos: { nat: string; titulo: string }[] = [
    { nat: "haber_imponible", titulo: "Bonos imponibles" },
    { nat: "haber_no_imponible", titulo: "Bonos no imponibles" },
    { nat: "descuento", titulo: "Descuentos" },
  ];

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            Liquidación · {str(trabajador.apellidos)}, {str(trabajador.nombres)} · {periodo}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Entrada */}
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dias">Días trabajados</Label>
                <Input id="dias" type="number" value={dias} onChange={(e) => setDias(e.target.value)} className="w-24" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="diasVac">Días vacaciones</Label>
                <Input id="diasVac" type="number" value={diasVac} onChange={(e) => setDiasVac(e.target.value)} className="w-24" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="diasLic">Días lic. médica</Label>
                <Input id="diasLic" type="number" value={diasLic} onChange={(e) => onLicencia(e.target.value)} className="w-24" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Días pagados = 30 − licencia (la cubre el subsidio). Las vacaciones se pagan, no descuentan.</p>

            {modalidad === "hora" ? (
              <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-2">
                <span className="flex-1 text-sm font-medium">
                  Horas trabajadas del mes
                  <span className="block text-xs font-normal text-muted-foreground">
                    Pago por hora: {formatMonto(Number(trabajador.sueldo_base) || 0)}/hora × horas. Los días de arriba no prorratean el sueldo.
                  </span>
                </span>
                <Input type="number" step="0.5" className="w-32" value={horasNormales} onChange={(e) => setHorasNormales(e.target.value)} />
              </div>
            ) : null}
            {modalidad === "dia" ? (
              <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-2">
                <span className="flex-1 text-sm font-medium">
                  Días a pago del mes
                  <span className="block text-xs font-normal text-muted-foreground">
                    Pago por día: {formatMonto(Number(trabajador.sueldo_base) || 0)}/día × días. Los días de arriba no prorratean el sueldo.
                  </span>
                </span>
                <Input type="number" step="0.5" className="w-32" value={diasPagados} onChange={(e) => setDiasPagados(e.target.value)} />
              </div>
            ) : null}

            {grupos.map((g) =>
              porNaturaleza(g.nat).length > 0 ? (
                <div key={g.nat} className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">{g.titulo}</p>
                  {porNaturaleza(g.nat).map((c) => (
                    <div key={c.id} className="flex items-center gap-2">
                      <span className="flex-1 truncate text-sm" title={c.nombre}>{c.nombre}</span>
                      <Input
                        type="number"
                        className="w-32"
                        value={montos[c.id] ?? ""}
                        onChange={(e) => setMontos((m) => ({ ...m, [c.id]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              ) : null,
            )}

            <div className="flex items-center gap-2">
              <span className="flex-1 text-sm">Horas extra</span>
              <Input type="number" className="w-32" value={horasExtra} onChange={(e) => setHorasExtra(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <span className="flex-1 text-sm">Anticipo</span>
              <Input type="number" className="w-32" value={anticipo} onChange={(e) => setAnticipo(e.target.value)} />
            </div>
            <div className="flex items-center gap-2 border-t pt-2">
              <span className="flex-1 text-sm font-medium">Líquido KAME (para cuadrar)</span>
              <Input type="number" className="w-32" value={kameLiquido} onChange={(e) => setKameLiquido(e.target.value)} />
            </div>
            <Button onClick={calcular} disabled={guardando} className="w-full">
              {guardando ? "Calculando…" : "Calcular y guardar"}
            </Button>
          </div>

          {/* Resultado */}
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            {r ? (
              <dl className="space-y-1">
                <Row label="Sueldo base" val={money("sueldoBase")} />
                {Number(r.gratificacion) ? <Row label="Gratificación" val={money("gratificacion")} /> : null}
                {Number(r.horasExtras) ? <Row label="Horas extra" val={money("horasExtras")} /> : null}
                {Number(r.semanaCorrida) ? <Row label="Semana corrida" val={money("semanaCorrida")} /> : null}
                {(r.haberesImponibles as { glosa: string; monto: number }[] | undefined)?.map((h, i) => (
                  <Row key={`hi${i}`} label={h.glosa} val={formatMonto(h.monto)} />
                ))}
                <Row label="Total imponible" val={money("totalImponible")} bold />
                {(r.haberesNoImponibles as { glosa: string; monto: number }[] | undefined)?.map((h, i) => (
                  <Row key={`hn${i}`} label={h.glosa} val={formatMonto(h.monto)} />
                ))}
                {Number(r.asignacionFamiliar) ? <Row label="Asignación familiar" val={money("asignacionFamiliar")} /> : null}
                <Row label="AFP" val={`−${money("afpMonto")}`} />
                <Row label="Salud" val={`−${money("saludMonto")}`} />
                {Number(r.afcTrabajador) ? <Row label="AFC" val={`−${money("afcTrabajador")}`} /> : null}
                {Number(r.impuestoUnico) ? <Row label="Impuesto único" val={`−${money("impuestoUnico")}`} /> : null}
                {Number(r.anticipo) ? <Row label="Anticipo" val={`−${money("anticipo")}`} /> : null}
                {(r.descuentosVarios as { glosa: string; monto: number }[] | undefined)?.map((d, i) => (
                  <Row key={`dv${i}`} label={d.glosa} val={`−${formatMonto(d.monto)}`} />
                ))}
                <div className="border-t pt-1">
                  <Row label="Líquido" val={money("liquido")} bold />
                </div>
                {liquidacion?.kame_cuadra === true ? (
                  <p className="pt-1 text-emerald-600">✓ Cuadra con KAME</p>
                ) : liquidacion?.kame_cuadra === false ? (
                  <p className="pt-1 text-red-600">Difiere de KAME ({formatMonto(liquidacion.kame_liquido)})</p>
                ) : null}
              </dl>
            ) : (
              <p className="text-muted-foreground">Ingresa los montos y presiona “Calcular y guardar”.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, val, bold }: { label: string; val: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${bold ? "font-semibold" : ""}`}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{val}</dd>
    </div>
  );
}

// ---------------- Concepto dialog ----------------
function ConceptoDialog({
  clienteId,
  concepto,
  ordenSiguiente,
  onClose,
  onSaved,
}: {
  clienteId: string;
  concepto: Concepto | null;
  ordenSiguiente: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [guardando, start] = useTransition();
  const [naturaleza, setNaturaleza] = useState(concepto?.naturaleza ?? "haber_imponible");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const input: ConceptoInput = {
      id: concepto?.id ?? null,
      nombre: String(fd.get("nombre") ?? ""),
      naturaleza,
      columna_lre: String(fd.get("columna_lre") ?? "") || null,
      copia_mensual: fd.get("copia_mensual") === "on",
      proporcional: fd.get("proporcional") === "on",
      tributable: fd.get("tributable") === "on",
      es_prestamo: fd.get("es_prestamo") === "on",
      orden: concepto?.orden ?? ordenSiguiente,
    };
    start(async () => {
      const res = await guardarConcepto(clienteId, input);
      if (res.ok) { toast.success("Concepto guardado"); onSaved(); }
      else toast.error(res.error ?? "Error");
    });
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{concepto ? "Editar concepto" : "Nuevo concepto"}</DialogTitle></DialogHeader>
        <form id="form-concepto" onSubmit={onSubmit} className="grid gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nombre">Nombre</Label>
            <Input id="nombre" name="nombre" defaultValue={concepto?.nombre ?? ""} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Naturaleza</Label>
              <select className={selectCls} value={naturaleza} onChange={(e) => setNaturaleza(e.target.value)}>
                {NATURALEZAS_CONCEPTO.map((n) => <option key={n.value} value={n.value}>{n.label}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="columna_lre">Columna LRE</Label>
              <select id="columna_lre" name="columna_lre" className={selectCls} defaultValue={concepto?.columna_lre ?? ""}>
                <option value="">(Seleccione)</option>
                {(COLUMNAS_LRE[naturaleza] ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 pt-1">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="copia_mensual" defaultChecked={concepto?.copia_mensual} /> Copia mensual</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="proporcional" defaultChecked={concepto?.proporcional} /> Proporcional</label>
            {naturaleza === "haber_no_imponible" ? (
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="tributable" defaultChecked={concepto?.tributable} /> Tributable</label>
            ) : null}
            {naturaleza === "descuento" ? (
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="es_prestamo" defaultChecked={concepto?.es_prestamo} /> Préstamo (con cuotas)</label>
            ) : null}
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="form-concepto" disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Ficha de trabajador (carga de empleados) ----------------
function FichaDialog({
  clienteId,
  trabajador,
  conceptos,
  onClose,
  onSaved,
}: {
  clienteId: string;
  trabajador: Trabajador | null;
  conceptos: Concepto[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [guardando, start] = useTransition();
  const g = (k: string): string => str(trabajador?.[k]);
  const [salud, setSalud] = useState(g("salud") || "Fonasa");
  const esIsapre = salud !== "Fonasa" && salud !== "Sin Isapre" && salud !== "";
  const [gratTipo, setGratTipo] = useState(g("gratificacion_tipo") || "sin");
  const [modalidad, setModalidad] = useState(g("sueldo_modalidad") || "mensual");

  const fijosIni = (trabajador?.montos_fijos ?? {}) as { colacion?: number; movilizacion?: number; conceptos?: Record<string, number> };
  const [colacion, setColacion] = useState(fijosIni.colacion != null ? String(fijosIni.colacion) : "");
  const [movilizacion, setMovilizacion] = useState(fijosIni.movilizacion != null ? String(fijosIni.movilizacion) : "");
  const [montosFijos, setMontosFijos] = useState<Record<string, string>>(
    Object.fromEntries(conceptos.map((c) => [c.id, fijosIni.conceptos?.[c.id] != null ? String(fijosIni.conceptos[c.id]) : ""])),
  );

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const input: FichaTrabajadorInput = {
      id: trabajador?.id ?? null,
      nombres: String(fd.get("nombres") ?? ""),
      apellido_paterno: String(fd.get("apellido_paterno") ?? "") || null,
      apellido_materno: String(fd.get("apellido_materno") ?? "") || null,
      rut: String(fd.get("rut") ?? "") || null,
      sexo: String(fd.get("sexo") ?? "") || null,
      cargo: String(fd.get("cargo") ?? "") || null,
      sucursal: String(fd.get("sucursal") ?? "") || null,
      tipo_contrato: String(fd.get("tipo_contrato") ?? "") || null,
      tipo_trabajador: String(fd.get("tipo_trabajador") ?? "activo"),
      regimen_previsional: String(fd.get("regimen_previsional") ?? "afp"),
      jornada_tipo: String(fd.get("jornada_tipo") ?? "") || null,
      horas_semanales: numOrNull(fd.get("horas_semanales")),
      afp: String(fd.get("afp") ?? "") || null,
      salud: salud || null,
      salud_plan_valor: esIsapre ? numOrNull(fd.get("salud_plan_valor")) : null,
      salud_plan_unidad: esIsapre ? String(fd.get("salud_plan_unidad") ?? "UF") : null,
      sueldo_base: numOrNull(fd.get("sueldo_base")),
      sueldo_modalidad: modalidad || "mensual",
      gratificacion_tipo: gratTipo || null,
      gratificacion_monto: gratTipo === "manual" ? numOrNull(fd.get("gratificacion_monto")) : null,
      mas_11_anios: false,
      sueldo_empresarial: fd.get("sueldo_empresarial") === "on",
      montos_fijos: {
        colacion: Number(colacion) || 0,
        movilizacion: Number(movilizacion) || 0,
        conceptos: Object.fromEntries(
          Object.entries(montosFijos).map(([id, v]) => [id, Number(v) || 0]).filter(([, v]) => (v as number) !== 0),
        ),
      },
      cargas_simples: Number(fd.get("cargas_simples") ?? 0),
      cargas_maternales: Number(fd.get("cargas_maternales") ?? 0),
      cargas_invalidas: Number(fd.get("cargas_invalidas") ?? 0),
      tramo_asignacion: String(fd.get("tramo_asignacion") ?? "") || null,
      fecha_ingreso: String(fd.get("fecha_ingreso") ?? "") || null,
    };
    start(async () => {
      const res = await guardarFichaTrabajador(clienteId, input);
      if (res.ok) { toast.success("Ficha guardada"); onSaved(); }
      else toast.error(res.error ?? "Error");
    });
  }

  const campo = (label: string, name: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} defaultValue={g(name)} {...props} />
    </div>
  );

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle>{trabajador ? "Ficha del trabajador" : "Nuevo trabajador"}</DialogTitle></DialogHeader>
        <form id="form-ficha" onSubmit={onSubmit} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {campo("Nombres", "nombres", { required: true })}
          {campo("Apellido paterno", "apellido_paterno")}
          {campo("Apellido materno", "apellido_materno")}
          {campo("RUT", "rut")}
          <div className="flex flex-col gap-1.5">
            <Label>Sexo</Label>
            <select name="sexo" className={selectCls} defaultValue={g("sexo")}>
              <option value="">(Seleccione)</option>
              {SEXOS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          {campo("Cargo", "cargo")}
          {campo("Unidad de negocio", "sucursal")}
          <div className="flex flex-col gap-1.5">
            <Label>Tipo de contrato</Label>
            <select name="tipo_contrato" className={selectCls} defaultValue={g("tipo_contrato") || "indefinido"}>
              <option value="indefinido">Indefinido</option>
              <option value="plazo_fijo">Plazo fijo</option>
              <option value="casa_particular">Casa particular</option>
            </select>
          </div>
          {campo("Fecha ingreso (contrato original)", "fecha_ingreso", { type: "date" })}
          <div className="flex flex-col gap-1.5">
            <Label>Tipo de trabajador</Label>
            <select name="tipo_trabajador" className={selectCls} defaultValue={g("tipo_trabajador") || "activo"}>
              {TIPOS_TRABAJADOR.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Régimen previsional</Label>
            <select name="regimen_previsional" className={selectCls} defaultValue={g("regimen_previsional") || "afp"}>
              {REGIMENES_PREVISIONALES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>AFP</Label>
            <select name="afp" className={selectCls} defaultValue={g("afp")}>
              <option value="">(Seleccione)</option>
              {AFP_NOMBRES.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Salud</Label>
            <select name="salud" className={selectCls} value={salud} onChange={(e) => setSalud(e.target.value)}>
              {SALUD_OPCIONES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {esIsapre ? (
            <>
              {campo("Valor plan", "salud_plan_valor", { type: "number", step: "0.001" })}
              <div className="flex flex-col gap-1.5">
                <Label>Unidad plan</Label>
                <select name="salud_plan_unidad" className={selectCls} defaultValue={g("salud_plan_unidad") || "UF"}>
                  <option value="UF">UF</option>
                  <option value="$">$</option>
                </select>
              </div>
            </>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label>Jornada</Label>
            <select name="jornada_tipo" className={selectCls} defaultValue={g("jornada_tipo") || "completa"}>
              {JORNADAS.map((j) => <option key={j.value} value={j.value}>{j.label}</option>)}
            </select>
          </div>
          {campo("Horas semanales", "horas_semanales", { type: "number", step: "0.01", placeholder: "45" })}
          <div className="flex flex-col gap-1.5">
            <Label>Modalidad de sueldo</Label>
            <select name="sueldo_modalidad" className={selectCls} value={modalidad} onChange={(e) => setModalidad(e.target.value)}>
              <option value="mensual">Mensual</option>
              <option value="dia">Por día (tarifa diaria)</option>
              <option value="hora">Por hora (valor hora)</option>
            </select>
          </div>
          {campo(
            modalidad === "hora" ? "Valor hora" : modalidad === "dia" ? "Tarifa por día" : "Sueldo base",
            "sueldo_base",
            { type: "number", step: "0.01" },
          )}
          <div className="flex flex-col gap-1.5">
            <Label>Gratificación (si no hay contrato en el panel)</Label>
            <select name="gratificacion_tipo" className={selectCls} value={gratTipo} onChange={(e) => setGratTipo(e.target.value)}>
              <option value="sin">Sin gratificación convencional</option>
              <option value="25">25% mensual (tope 4,75 IMM/12)</option>
              <option value="tope">Tope 4,75 IMM/12</option>
              <option value="manual">Monto fijo mensual</option>
            </select>
          </div>
          {gratTipo === "manual"
            ? campo("Monto gratificación", "gratificacion_monto", { type: "number" })
            : null}
          {campo("Cargas simples", "cargas_simples", { type: "number", defaultValue: g("cargas_simples") || "0" })}
          {campo("Cargas maternales", "cargas_maternales", { type: "number", defaultValue: g("cargas_maternales") || "0" })}
          {campo("Cargas inválidas", "cargas_invalidas", { type: "number", defaultValue: g("cargas_invalidas") || "0" })}
          <div className="flex flex-col gap-1.5">
            <Label>Tramo asignación</Label>
            <select name="tramo_asignacion" className={selectCls} defaultValue={g("tramo_asignacion")}>
              <option value="">(Por renta)</option>
              {["A", "B", "C", "D"].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <label className="col-span-2 flex items-center gap-2 pt-2 text-sm sm:col-span-3">
            <input type="checkbox" name="sueldo_empresarial" defaultChecked={trabajador?.sueldo_empresarial === true} /> Sueldo empresarial (socio/dueño — sin gratificación ni AFC; SIS de su cargo junto a la AFP; sin mutual)
          </label>
          <p className="col-span-2 text-xs text-muted-foreground sm:col-span-3">
            Los 11 años de antigüedad se calculan solos desde la fecha de ingreso.
          </p>

          <div className="col-span-2 mt-2 border-t pt-3 sm:col-span-3">
            <p className="mb-2 text-sm font-semibold">Haberes y descuentos fijos del trabajador</p>
            <p className="mb-3 text-xs text-muted-foreground">
              Montos que se repiten cada mes. En “Liquidar” puedes sobrescribir un mes puntual.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label>Colación</Label>
                <Input type="number" value={colacion} onChange={(e) => setColacion(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Movilización</Label>
                <Input type="number" value={movilizacion} onChange={(e) => setMovilizacion(e.target.value)} />
              </div>
              {conceptos.map((c) => (
                <div key={c.id} className="flex flex-col gap-1.5">
                  <Label title={c.nombre}>
                    <span className="truncate">{c.nombre}</span>{" "}
                    <span className="text-xs text-muted-foreground">
                      ({NATURALEZAS_CONCEPTO.find((n) => n.value === c.naturaleza)?.label ?? c.naturaleza})
                    </span>
                  </Label>
                  <Input
                    type="number"
                    value={montosFijos[c.id] ?? ""}
                    onChange={(e) => setMontosFijos((m) => ({ ...m, [c.id]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            {conceptos.length === 0 ? (
              <p className="text-xs text-muted-foreground">Aún no hay bonos/descuentos configurados en la empresa.</p>
            ) : null}
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="form-ficha" disabled={guardando}>{guardando ? "Guardando…" : "Guardar ficha"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
