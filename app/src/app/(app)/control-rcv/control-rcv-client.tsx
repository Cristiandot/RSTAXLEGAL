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

  // Índice de descargas por "cliente|periodo".
  const mapa = useMemo(() => {
    const m = new Map<string, DescargaRcv>();
    for (const d of descargas) m.set(`${d.cliente_id}|${d.periodo}`, d);
    return m;
  }, [descargas]);

  const filas = useMemo(() => {
    return empresas.map((e) => {
      const celdas = periodos.map((p) => mapa.get(`${e.id}|${p}`) ?? null);
      const descargados = celdas.filter((c) => c !== null).length;
      const conAltoVol = celdas.some((c) => c?.alto_volumen);
      const completo = e.tieneClave && descargados === periodos.length && !conAltoVol;
      return { empresa: e, celdas, descargados, conAltoVol, completo };
    });
  }, [empresas, periodos, mapa]);

  const filtradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return filas.filter((f) => {
      if (q && !`${f.empresa.razon_social} ${f.empresa.rut_empresa}`.toLowerCase().includes(q)) return false;
      if (soloPendientes && f.completo) return false;
      return true;
    });
  }, [filas, buscar, soloPendientes]);

  const resumen = useMemo(() => {
    let completas = 0, conFaltantes = 0, altoVol = 0, sinClave = 0;
    for (const f of filas) {
      if (!f.empresa.tieneClave) sinClave++;
      if (f.conAltoVol) altoVol++;
      if (f.empresa.tieneClave && f.completo) completas++;
      else if (f.empresa.tieneClave && !f.completo) conFaltantes++;
    }
    return { total: filas.length, completas, conFaltantes, altoVol, sinClave };
  }, [filas]);

  return (
    <div className="space-y-4 py-4">
      <div>
        <h1 className="text-xl font-semibold">Control de descargas RCV</h1>
        <p className="text-sm text-muted-foreground">
          Estado del Registro de Compras y Ventas descargado del SII por empresa y período. Cada
          celda muestra <span className="font-medium">ventas / compras</span> descargadas. Se
          actualiza solo cuando corre la descarga.
        </p>
      </div>

      {errorCarga && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          Error al cargar: {errorCarga}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <ResumenCard label="Empresas" valor={resumen.total} />
        <ResumenCard label="Completas (todos los meses)" valor={resumen.completas} tono="text-emerald-600" />
        <ResumenCard label="Con meses faltantes" valor={resumen.conFaltantes} tono="text-amber-600" />
        <ResumenCard label="Con alto volumen pendiente" valor={resumen.altoVol} tono="text-violet-600" />
        <ResumenCard label="Sin clave SII" valor={resumen.sinClave} tono="text-slate-500" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
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
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" /> descargado</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-violet-500" /> alto volumen</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-red-400" /> falta</span>
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
                    <CeldaEstado d={c} tieneClave={f.empresa.tieneClave} />
                  </TableCell>
                ))}

                <TableCell className="text-center">
                  {!f.empresa.tieneClave ? (
                    <Badge variant="outline" className="border-slate-200 bg-slate-100 text-slate-500">sin clave</Badge>
                  ) : f.completo ? (
                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">{f.descargados}/{periodos.length}</Badge>
                  ) : (
                    <Badge variant="outline" className={cn(
                      "border-amber-200 bg-amber-50 text-amber-700",
                      f.conAltoVol && "border-violet-200 bg-violet-50 text-violet-700",
                    )}>{f.descargados}/{periodos.length}</Badge>
                  )}
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

/** Celda por (empresa, período): ventas/compras descargadas, alto volumen o falta. */
function CeldaEstado({ d, tieneClave }: { d: DescargaRcv | null; tieneClave: boolean }) {
  if (!tieneClave) return <span className="text-slate-300">·</span>;
  if (!d) {
    return (
      <Badge variant="outline" className="border-red-200 bg-red-50 text-red-600">falta</Badge>
    );
  }
  const clase = d.alto_volumen
    ? "border-violet-200 bg-violet-50 text-violet-700"
    : "border-emerald-200 bg-emerald-50 text-emerald-700";
  return (
    <span
      className={cn("inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-xs tabular-nums", clase)}
      title={
        `Ventas ${d.ventas_docs} · Compras ${d.compras_docs}` +
        (d.alto_volumen ? " · alto volumen: falta descarga asíncrona" : "") +
        (d.ultima_descarga ? ` · ${new Date(d.ultima_descarga).toLocaleDateString("es-CL")}` : "")
      }
    >
      {d.ventas_docs}/{d.compras_docs}{d.alto_volumen ? " ⚠" : ""}
    </span>
  );
}
