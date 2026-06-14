"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { MapPin, Plus, Save, Trash2 } from "lucide-react";
import {
  cargarSucursales, guardarSucursal, eliminarSucursal, type Sucursal,
} from "./portal-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const VACIA: Sucursal = { id: null, nombre: "", direccion: "", comuna: "", ciudad: "", telefono: "" };

/**
 * Gestión de sucursales del cliente desde el portal: agregar, editar y eliminar
 * (varias direcciones/locales). Todo por RPC de token.
 */
export function Sucursales({ token }: { token: string }) {
  const [rows, setRows] = useState<Sucursal[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ocupado, startAccion] = useTransition();

  const recargar = useCallback(async () => {
    setCargando(true);
    const r = await cargarSucursales(token);
    if (r.ok && r.sucursales) setRows(r.sucursales);
    setCargando(false);
  }, [token]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  function set(idx: number, k: keyof Sucursal, v: string) {
    setRows((prev) => prev.map((s, i) => (i === idx ? { ...s, [k]: v } : s)));
  }

  function agregar() {
    setRows((prev) => [...prev, { ...VACIA }]);
  }

  function guardar(idx: number) {
    const s = rows[idx];
    startAccion(async () => {
      const r = await guardarSucursal(token, s);
      if (r.ok) {
        toast.success("Sucursal guardada");
        await recargar();
      } else {
        toast.error(r.error ?? "No se pudo guardar la sucursal.");
      }
    });
  }

  function eliminar(idx: number) {
    const s = rows[idx];
    if (!s.id) {
      // fila nueva sin guardar: solo la quito de la vista
      setRows((prev) => prev.filter((_, i) => i !== idx));
      return;
    }
    if (!window.confirm(`¿Eliminar la sucursal "${s.nombre || "sin nombre"}"?`)) return;
    startAccion(async () => {
      const r = await eliminarSucursal(token, s.id!);
      if (r.ok) {
        toast.success("Sucursal eliminada");
        await recargar();
      } else {
        toast.error(r.error ?? "No se pudo eliminar.");
      }
    });
  }

  return (
    <Card className="card-soft border-transparent">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="size-4 text-[var(--brand-teal)]" />
            Sucursales
          </CardTitle>
          <Button type="button" size="sm" variant="outline" onClick={agregar}>
            <Plus className="size-3.5" /> Agregar sucursal
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Si tu empresa tiene más de una dirección o local, agrégalos aquí.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {cargando ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no hay sucursales registradas. Usa &quot;Agregar sucursal&quot; para sumar la primera.
          </p>
        ) : (
          rows.map((s, idx) => (
            <div key={s.id ?? `nueva-${idx}`} className="rounded-lg border border-input p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label className="text-xs">Nombre de la sucursal</Label>
                  <Input
                    value={s.nombre}
                    onChange={(e) => set(idx, "nombre", e.target.value)}
                    placeholder="ej. Casa matriz, Local Concón, Bodega…"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Dirección</Label>
                  <Input value={s.direccion ?? ""} onChange={(e) => set(idx, "direccion", e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Teléfono</Label>
                  <Input value={s.telefono ?? ""} onChange={(e) => set(idx, "telefono", e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Comuna</Label>
                  <Input value={s.comuna ?? ""} onChange={(e) => set(idx, "comuna", e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Ciudad</Label>
                  <Input value={s.ciudad ?? ""} onChange={(e) => set(idx, "ciudad", e.target.value)} />
                </div>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" disabled={ocupado} onClick={() => eliminar(idx)}>
                  <Trash2 className="size-3.5" /> Eliminar
                </Button>
                <Button type="button" size="sm" disabled={ocupado} onClick={() => guardar(idx)}>
                  <Save className="size-3.5" /> Guardar
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
