"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  PLACEHOLDER_LINEAS,
  claseFuente,
  tipoCampo,
  type Catalogos,
  type CatalogoOpcion,
  type FaltanteRow,
} from "@/lib/onboarding";
import { guardarCampo } from "@/app/(app)/onboarding/actions";

const selectCls =
  "h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Input inline para llenar un campo faltante y guardarlo directo a la ficha. */
export function EditorCampo({
  item,
  selector,
  opciones,
  onSaved,
}: {
  item: FaltanteRow;
  selector: string | null;
  opciones?: CatalogoOpcion[];
  onSaved: () => void;
}) {
  const [valor, setValor] = useState("");
  const [saving, startSave] = useTransition();
  const tipo = tipoCampo(item.campo);

  function guardar() {
    if (!valor.trim() || saving) return;
    startSave(async () => {
      const res = await guardarCampo(
        item.entidad,
        item.registro_id,
        item.campo,
        valor,
      );
      if (res.ok) {
        toast.success(`${item.etiqueta}: guardado`);
        onSaved();
      } else toast.error(res.error ?? "Error al guardar");
    });
  }

  return (
    <div className="flex w-full items-start gap-1.5">
      {selector ? (
        <select
          aria-label={item.etiqueta}
          className={`${selectCls} h-8 w-full min-w-0`}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
        >
          <option value="">— Elegir —</option>
          {(opciones ?? []).map((o) => (
            <option key={o.codigo} value={o.codigo}>
              {o.etiqueta}
            </option>
          ))}
        </select>
      ) : tipo === "lineas" ? (
        <Textarea
          rows={2}
          className="min-w-0 flex-1 bg-card text-sm"
          placeholder={PLACEHOLDER_LINEAS[item.campo] ?? ""}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
        />
      ) : (
        <Input
          type={
            tipo === "fecha" ? "date" : tipo === "numero" ? "number" : "text"
          }
          className="h-8 w-full min-w-0 bg-card text-sm"
          placeholder={
            tipo === "rut"
              ? "12.345.678-9"
              : tipo === "correo"
                ? "correo@dominio.cl"
                : item.etiqueta
          }
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") guardar();
          }}
        />
      )}
      <Button
        size="sm"
        variant="outline"
        className="h-8 shrink-0 px-2"
        title="Guardar"
        disabled={saving || !valor.trim()}
        onClick={guardar}
      >
        <Check className="size-4" />
      </Button>
    </div>
  );
}

/** Campos faltantes agrupados, cada uno editable en línea. */
export function CamposEditables({
  items,
  catalogos,
  selectores,
  onSaved,
}: {
  items: FaltanteRow[];
  catalogos: Catalogos;
  selectores: Record<string, string | null>;
  onSaved: (f: FaltanteRow) => void;
}) {
  const porGrupo = useMemo(() => {
    const m = new Map<string, FaltanteRow[]>();
    for (const it of items) {
      const arr = m.get(it.grupo) ?? [];
      arr.push(it);
      m.set(it.grupo, arr);
    }
    return [...m.entries()];
  }, [items]);

  if (!items.length)
    return <p className="text-sm text-emerald-600">Sin campos faltantes. ✓</p>;

  return (
    <div className="space-y-3">
      {porGrupo.map(([grupo, arr]) => (
        <div key={grupo}>
          <div className="text-xs font-medium text-muted-foreground">
            {grupo}
          </div>
          <div className="mt-1.5 space-y-1.5">
            {arr.map((c) => {
              const sel = selectores[`${c.entidad}:${c.campo}`] ?? null;
              return (
                <div
                  key={`${c.registro_id}:${c.campo}`}
                  className="grid grid-cols-[10rem_minmax(0,1fr)] items-start gap-2"
                >
                  <Badge
                    variant="outline"
                    className={`${claseFuente(c.fuente)} mt-1 max-w-full justify-start`}
                    title={`${c.etiqueta} · Fuente: ${c.fuente}`}
                  >
                    <span className="truncate">{c.etiqueta}</span>
                  </Badge>
                  <EditorCampo
                    item={c}
                    selector={sel}
                    opciones={sel ? catalogos[sel] : undefined}
                    onSaved={() => onSaved(c)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
