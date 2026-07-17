"use client";

import { useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export type EmpresaControl = {
  id: string;
  razon_social: string;
  rut_empresa: string;
  tieneClave: boolean;
  contabilidad: boolean;
};

export type DescargaRcv = {
  cliente_id: string;
  periodo: string;
  ventas_docs: number;
  compras_docs: number;
  ventas_docs_sii: number | null;
  compras_docs_sii: number | null;
  alto_volumen: boolean;
  ultima_descarga: string;
};

type Props = {
  periodos: string[];
  etiquetas: string[];
  empresas: EmpresaControl[];
  descargas: DescargaRcv[];
  errorCarga: string | null;
};

/** Estado de un mes concreto de una empresa. */
type EstadoCelda = "sin-clave" | "falta" | "parcial" | "sin-verificar" | "cuadra" | "revisar";

function estadoDeCelda(d: DescargaRcv | null, tieneClave: boolean): EstadoCelda {
  if (!tieneClave) return "sin-clave";
  if (!d) return "falta";
  if (d.alto_volumen) return "parcial";
  if (d.ventas_docs_sii === null || d.compras_docs_sii === null) return "sin-verificar";
  return d.ventas_docs === d.ventas_docs_sii && d.compras_docs === d.compras_docs_sii ? "cuadra" : "revisar";
}

const ESTILO_CELDA: Record<EstadoCelda, { clase: string; glifo: string }> = {
  "cuadra": { clase: "border-emerald-200 bg-emerald-50 text-emerald-700", glifo: "✓" },
  "revisar": { clase: "border-amber-200 bg-amber-50 text-amber-700", glifo: "≠" },
  "parcial": { clase: "border-violet-200 bg-violet-50 text-violet-700", glifo: "≈" },
  "sin-verificar": { clase: "border-sky-200 bg-sky-50 text-sky-700", glifo: "•" },
  "falta": { clase: "border-red-200 bg-red-50 text-red-600", glifo: "falta" },
  "sin-clave": { clase: "border-transparent text-slate-300", glifo: "·" },
};

function ResumenCard({ label, valor, tono }: { label: string; valor: number; tono?: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <div className={cn("text-2xl font-semibold tabular-nums", tono)}>{valor}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export function ControlRcvClient({ periodos, etiquetas, empresas, descargas, errorCarga }: Props) {
  const [buscar, setBuscar] = useState("");
  const [soloPendientes, setSoloPendientes] = useState(false);

  const mapa = useMemo(() => {
    const m = new Map<string, DescargaRcv>();
    for (const d of descargas) m.set(`${d.cliente_id}|${d.periodo}`, d);
    return m;
  }, [descargas]);

  const filas = useMemo(() => {
    return empresas.map((e) => {
      const celdas = periodos.map((p) => {
        const d = mapa.get(`${e.id}|${p}`) ?? null;
        return { d, estado: estadoDeCelda(d, e.tieneClave) };
      });
      const descargados = celdas.filter((c) => c.d !== null).length;
      const faltanMeses = e.tieneClave && descargados < periodos.length;
      const hayRevisar = celdas.some((c) => c.estado === "revisar" || c.estado === "parcial");
      const haySinVerificar = celdas.some((c) => c.estado === "sin-verificar");
      // "Al día" = con clave, todos los meses descargados y todos cuadran (verificados).
      const alDia = e.tieneClave && !faltanMeses && !hayRevisar && !haySinVerificar;
      return { empresa: e, celdas, descargados, faltanMeses, hayRevisar, haySinVerificar, alDia };
    });
  }, [empresas, periodos, mapa]);

  const filtradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return filas.filter((f) => {
      if (q && !`${f.empresa.razon_social} ${f.empresa.rut_empresa}`.toLowerCase().includes(q)) return false;
      if (soloPendientes && f.alDia) return false;
      return true;
    });
  }, [filas, buscar, soloPendientes]);

  const resumen = useMemo(() => {
    let alDia = 0, porRevisar = 0, conFaltantes = 0, sinClave = 0;
    for (const f of filas) {
      if (!f.empresa.tieneClave) { sinClave++; continue; }
      if (f.faltanMeses) conFaltantes++;
      else if (f.hayRevisar) porRevisar++;
      else if (f.alDia) alDia++;
    }
    return { total: filas.length, alDia, porRevisar, conFaltantes, sinClave };
  }, [filas]);

  return (
    <div className="space-y-4 py-4">
      <div>
        <h1 className="text-xl font-semibold">Control de descargas RCV</h1>
        <p className="text-sm text-muted-foreground">
          Por empresa y mes: si el Registro de Compras y Ventas está descargado del SII y si los
          documentos cuadran con lo que el SII declara. Pasa el cursor por una celda para ver el
          detalle (nuestros documentos vs. los del SII).
        </p>
      </div>

      {errorCarga && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          Error al cargar: {errorCarga}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <ResumenCard label="Empresas" valor={resumen.total} />
        <ResumenCard label="Al día (descargado y cuadra)" valor={resumen.alDia} tono="text-emerald-600" />
        <ResumenCard label="Por revisar (no cuadra)" valor={resumen.porRevisar} tono="text-amber-600" />
        <ResumenCard label="Con meses faltantes" valor={resumen.conFaltantes} tono="text-red-600" />
        <ResumenCard label="Sin clave SII" valor={resumen.sinClave} tono="text-slate-500" />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Input
          placeholder="Buscar empresa o RUT…"
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          className="max-w-xs"
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={soloPendientes} onCheckedChange={(v) => setSoloPendientes(Boolean(v))} />
          Solo con pendientes
        </label>
        <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <LeyendaItem clase="bg-emerald-500" texto="cuadra" />
          <LeyendaItem clase="bg-amber-500" texto="revisar" />
          <LeyendaItem clase="bg-sky-500" texto="descargado sin verificar" />
          <LeyendaItem clase="bg-violet-500" texto="alto volumen" />
          <LeyendaItem clase="bg-red-400" texto="falta" />
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        <Table stickyHeader>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[240px]">Empresa</TableHead>
              {etiquetas.map((et, i) => (
                <TableHead key={periodos[i]} className="text-center">{et}</TableHead>
              ))}
              <TableHead className="text-center">Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.map((f) => (
              <TableRow key={f.empresa.id}>
                <TableCell>
                  <div className="font-medium leading-tight">{f.empresa.razon_social}</div>
                  <div className="text-xs text-muted-foreground">{f.empresa.rut_empresa}</div>
                </TableCell>

                {f.celdas.map((c, i) => (
                  <TableCell key={periodos[i]} className="text-center">
                    <CeldaEstado estado={c.estado} d={c.d} />
                  </TableCell>
                ))}

                <TableCell className="text-center">
                  <EstadoEmpresa fila={f} totalMeses={periodos.length} />
                </TableCell>
              </TableRow>
            ))}
            {filtradas.length === 0 && (
              <TableRow>
                <TableCell colSpan={periodos.length + 2} className="py-8 text-center text-muted-foreground">
                  Sin empresas para el filtro.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function LeyendaItem({ clase, texto }: { clase: string; texto: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn("inline-block h-2.5 w-2.5 rounded-full", clase)} />
      {texto}
    </span>
  );
}

/** Celda por (empresa, período): estado de descarga + cuadratura, con el detalle en el tooltip. */
function CeldaEstado({ estado, d }: { estado: EstadoCelda; d: DescargaRcv | null }) {
  const { clase, glifo } = ESTILO_CELDA[estado];
  if (estado === "sin-clave") return <span className="text-slate-300">·</span>;

  const nuestros = d ? `${d.ventas_docs} ventas / ${d.compras_docs} compras` : "—";
  const sii =
    d && d.ventas_docs_sii !== null
      ? `${d.ventas_docs_sii} ventas / ${d.compras_docs_sii} compras`
      : "sin verificar";
  const titulo =
    estado === "falta"
      ? "No descargado"
      : `Descargado: ${nuestros}\nSegún SII: ${sii}` +
        (estado === "parcial" ? "\nAlto volumen: falta descarga asíncrona" : "") +
        (estado === "revisar" ? "\n⚠ No cuadra con el SII" : "") +
        (d?.ultima_descarga ? `\nDescargado el ${new Date(d.ultima_descarga).toLocaleDateString("es-CL")}` : "");

  return (
    <span
      className={cn("inline-flex min-w-[2.2rem] items-center justify-center rounded-md border px-1.5 py-0.5 text-xs font-medium", clase)}
      title={titulo}
    >
      {glifo}
    </span>
  );
}

/** Estado global de la empresa en el rango. */
function EstadoEmpresa({
  fila,
  totalMeses,
}: {
  fila: { empresa: EmpresaControl; descargados: number; faltanMeses: boolean; hayRevisar: boolean; haySinVerificar: boolean; alDia: boolean };
  totalMeses: number;
}) {
  if (!fila.empresa.tieneClave)
    return <Badge variant="outline" className="border-slate-200 bg-slate-100 text-slate-500">sin clave</Badge>;
  if (fila.faltanMeses)
    return <Badge variant="outline" className="border-red-200 bg-red-50 text-red-600">faltan {totalMeses - fila.descargados}</Badge>;
  if (fila.hayRevisar)
    return <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">revisar</Badge>;
  if (fila.haySinVerificar)
    return <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">sin verificar</Badge>;
  return <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">al día</Badge>;
}
