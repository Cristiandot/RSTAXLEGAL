"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Paperclip, Plus, Trash2 } from "lucide-react";
import { formatFecha, formatMonto } from "@/lib/format";
import {
  anularGastoMenor,
  crearGastoMenorConArchivo,
  listarGastosMenores,
  type GastoMenorPortal,
} from "./gastos-actions";
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

export function GastosMenores({
  token,
  empresa,
}: {
  token: string;
  empresa: InfoEmpresa;
}) {
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [gastos, setGastos] = useState<GastoMenorPortal[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ocupado, startAccion] = useTransition();

  const recargar = useCallback(
    async (a: number) => {
      setCargando(true);
      const res = await listarGastosMenores(token, a);
      if (res.ok && res.gastos) setGastos(res.gastos);
      else toast.error(res.error ?? "No se pudieron cargar los registros.");
      setCargando(false);
    },
    [token],
  );

  useEffect(() => {
    void recargar(anio);
  }, [anio, recargar]);

  // formulario
  const [fecha, setFecha] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [monto, setMonto] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);

  function agregar() {
    startAccion(async () => {
      const fd = new FormData();
      fd.set("tipo", "compra");
      fd.set("fecha", fecha);
      fd.set("descripcion", descripcion);
      fd.set("monto", monto);
      if (archivo) fd.set("archivo", archivo);
      const res = await crearGastoMenorConArchivo(token, fd);
      if (res.ok) {
        toast.success("Movimiento registrado");
        setFecha("");
        setDescripcion("");
        setMonto("");
        setArchivo(null);
        setInputKey((k) => k + 1);
        await recargar(anio);
      } else {
        toast.error(res.error ?? "No se pudo registrar.");
      }
    });
  }

  function eliminar(id: string) {
    if (!window.confirm("¿Eliminar este registro?")) return;
    startAccion(async () => {
      const res = await anularGastoMenor(token, id);
      if (res.ok) {
        toast.success("Registro eliminado");
        await recargar(anio);
      } else {
        toast.error(res.error ?? "No se pudo eliminar.");
      }
    });
  }

  const compras = gastos.filter((g) => g.tipo === "compra");
  const totalCompras = compras.reduce((a, g) => a + g.monto, 0);

  return (
    <div className="space-y-4">
      <Card className="card-soft border-transparent">
        <CardHeader>
          <CardTitle className="text-base">
            Gastos menores · {empresa.razon_social}
          </CardTitle>
          <CardDescription>
            Registra acá las compras con boleta que no pasan por las facturas de
            la empresa — gastos menores, compras de bolsillo. No se declaran mes a
            mes en el SII, pero el equipo las usa en tu Operación Renta anual.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gm-fecha">Fecha</Label>
              <Input
                id="gm-fecha"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gm-desc">¿Qué fue?</Label>
              <Input
                id="gm-desc"
                placeholder="Ej.: materiales de aseo, bencina, café oficina…"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gm-monto">Monto total ($)</Label>
              <Input
                id="gm-monto"
                inputMode="numeric"
                placeholder="Ej.: 25000"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="gm-archivo">Boleta o comprobante (opcional)</Label>
              <Input
                key={inputKey}
                id="gm-archivo"
                type="file"
                accept="image/*,application/pdf"
                className="file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1 file:text-sm"
                onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">
                Si quieres, adjunta una foto o PDF de la boleta — imagen o PDF, hasta 5 MB.
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={agregar} disabled={ocupado}>
              <Plus className="size-4" />
              {ocupado ? "Guardando…" : "Agregar movimiento"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="card-soft border-transparent">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">Registrado en {anio}</CardTitle>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setAnio((a) => a - 1)}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="text-sm font-medium tabular-nums">{anio}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={anio >= new Date().getFullYear()}
                onClick={() => setAnio((a) => a + 1)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
          <CardDescription>
            Gastos: <strong>{formatMonto(totalCompras)}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {cargando ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Cargando…
            </p>
          ) : compras.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground italic">
              Aún no registras gastos este año.
            </p>
          ) : (
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {compras.map((g) => (
                <div
                  key={g.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2.5 py-1.5 text-sm"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatFecha(g.fecha)}
                    </span>
                    <span className="truncate" title={g.descripcion}>
                      {g.descripcion}
                    </span>
                    {g.documento_path ? (
                      <Paperclip
                        className="size-3.5 shrink-0 text-[var(--brand-teal)]"
                        aria-label="Con comprobante adjunto"
                      />
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="font-medium tabular-nums">
                      {formatMonto(g.monto)}
                    </span>
                    <button
                      type="button"
                      onClick={() => eliminar(g.id)}
                      className="rounded p-1 text-red-600 hover:bg-red-50"
                      title="Eliminar registro"
                      disabled={ocupado}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
