"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Pencil, X } from "lucide-react";
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
import {
  REGIONES_CHILE,
  comunaEnRegion,
  regionDeComunaNombre,
} from "@/lib/comunas-chile";
import { guardarCampo } from "@/app/(app)/onboarding/actions";

const selectCls =
  "h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Input inline para llenar un campo y guardarlo directo a la ficha.
 * Si `confirmarCambio` (edición de un valor existente), pide confirmación
 * antes de reemplazar.
 */
export function EditorCampo({
  item,
  selector,
  opciones,
  onSaved,
  inicial = "",
  confirmarCambio = false,
  valorAnterior,
  onCancel,
}: {
  item: FaltanteRow;
  selector: string | null;
  opciones?: CatalogoOpcion[];
  onSaved: () => void;
  /** Valor con el que parte el input (al editar un dato existente). */
  inicial?: string;
  /** Exigir confirmación antes de guardar (reemplazo de un valor). */
  confirmarCambio?: boolean;
  valorAnterior?: string | null;
  /** Si se entrega, muestra un botón para cancelar la edición. */
  onCancel?: () => void;
}) {
  // Nacionalidad: desplegable Chileno/Extranjero; si es extranjero se exige
  // especificar cuál. Se guarda siempre en `nacionalidad` como gentilicio
  // ("Chilena" o, p. ej., "Venezolana"). Un "Extranjero" a secas (dato antiguo
  // sin especificar) parte con el texto vacío para obligar a completarlo.
  const esNacionalidad = item.campo === "nacionalidad";
  const [tipoNac, setTipoNac] = useState<"" | "chilena" | "extranjera">(() => {
    if (!esNacionalidad || !inicial.trim()) return "";
    return /^chilen/i.test(inicial.trim()) ? "chilena" : "extranjera";
  });
  const [valor, setValor] = useState(() => {
    if (!esNacionalidad) return inicial;
    const t = inicial.trim();
    if (/^chilen/i.test(t)) return "Chilena";
    if (/^extranjer/i.test(t)) return "";
    return inicial;
  });
  const [confirmando, setConfirmando] = useState(false);
  const [saving, startSave] = useTransition();
  const tipo = tipoCampo(item.campo);

  // Selector de comuna: filtro EXCLUYENTE por región (romano + nombre) antes
  // de la comuna. Al editar un valor existente, parte en su región.
  const esComuna = selector === "comuna";
  const [region, setRegion] = useState<string>(() =>
    esComuna ? (regionDeComunaNombre(inicial) ?? "") : "",
  );
  const opcionesFiltradas = useMemo(() => {
    if (!esComuna || !region) return opciones ?? [];
    return (opciones ?? []).filter((o) => comunaEnRegion(o.codigo, region));
  }, [esComuna, region, opciones]);

  function guardar() {
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

  function intentarGuardar() {
    if (!valor.trim() || saving) return;
    if (confirmarCambio && !confirmando) {
      setConfirmando(true);
      return;
    }
    guardar();
  }

  return (
    <div className="w-full space-y-1.5">
      {esComuna ? (
        <select
          aria-label="Región"
          className={`${selectCls} h-8 w-full min-w-0`}
          value={region}
          onChange={(e) => {
            const r = e.target.value;
            setRegion(r);
            setConfirmando(false);
            // Filtro excluyente: si la comuna elegida no es de la región
            // nueva, se limpia para obligar a elegir una de la región.
            if (r && valor && !comunaEnRegion(valor, r)) setValor("");
          }}
        >
          <option value="">Región — todas</option>
          {REGIONES_CHILE.map((r) => (
            <option key={r.numero} value={r.numero}>
              {r.numero} — {r.nombre}
            </option>
          ))}
        </select>
      ) : null}
      <div className="flex w-full items-start gap-1.5">
        {esNacionalidad ? (
          <div className="flex w-full min-w-0 flex-col gap-1.5">
            <select
              aria-label={item.etiqueta}
              className={`${selectCls} h-8 w-full min-w-0`}
              value={tipoNac}
              onChange={(e) => {
                const t = e.target.value as "" | "chilena" | "extranjera";
                setTipoNac(t);
                setValor(t === "chilena" ? "Chilena" : "");
                setConfirmando(false);
              }}
            >
              <option value="">— Elegir —</option>
              <option value="chilena">Chileno</option>
              <option value="extranjera">Extranjero</option>
            </select>
            {tipoNac === "extranjera" ? (
              <Input
                className="h-8 w-full min-w-0 bg-card text-sm"
                placeholder="Especificar (ej: Venezolana)"
                value={valor}
                onChange={(e) => {
                  setValor(e.target.value);
                  setConfirmando(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") intentarGuardar();
                }}
              />
            ) : null}
          </div>
        ) : selector ? (
          <select
            aria-label={item.etiqueta}
            className={`${selectCls} h-8 w-full min-w-0`}
            value={valor}
            onChange={(e) => {
              setValor(e.target.value);
              setConfirmando(false);
            }}
          >
            <option value="">— Elegir —</option>
            {opcionesFiltradas.map((o) => (
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
            onChange={(e) => {
              setValor(e.target.value);
              setConfirmando(false);
            }}
          />
        ) : (
          <Input
            // "numero" va como texto con teclado decimal (no type="number"):
            // así se acepta la coma como separador decimal (ej. 22,25 horas).
            // El servidor (coercerValor) interpreta coma=decimal y punto=miles.
            type={tipo === "fecha" ? "date" : "text"}
            inputMode={tipo === "numero" ? "decimal" : undefined}
            className="h-8 w-full min-w-0 bg-card text-sm"
            placeholder={
              tipo === "rut"
                ? "12.345.678-9"
                : tipo === "correo"
                  ? "correo@dominio.cl"
                  : tipo === "numero"
                    ? "Ej: 45 o 22,25"
                    : item.etiqueta
            }
            value={valor}
            onChange={(e) => {
              setValor(e.target.value);
              setConfirmando(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") intentarGuardar();
            }}
          />
        )}
        <Button
          size="sm"
          variant="outline"
          className="h-8 shrink-0 px-2"
          title="Guardar"
          disabled={saving || !valor.trim()}
          onClick={intentarGuardar}
        >
          <Check className="size-4" />
        </Button>
        {onCancel ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 shrink-0 px-2"
            title="Cancelar edición"
            disabled={saving}
            onClick={onCancel}
          >
            <X className="size-4" />
          </Button>
        ) : null}
      </div>
      {confirmando ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
          <span className="min-w-0 flex-1">
            ¿Reemplazar{" "}
            <span className="font-semibold">
              &ldquo;{valorAnterior ?? "—"}&rdquo;
            </span>
            ?
          </span>
          <Button
            size="sm"
            className="h-6 px-2 text-xs"
            disabled={saving}
            onClick={guardar}
          >
            {saving ? "Guardando…" : "Confirmar"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-xs"
            disabled={saving}
            onClick={() => setConfirmando(false)}
          >
            Cancelar
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Campo de ficha con valor: si está vacío muestra el editor; si está lleno
 * muestra el valor con un lápiz para editarlo (con confirmación al
 * reemplazar). Los inmutables con valor no se editan.
 */
export function CampoConValor({
  item,
  selector,
  opciones,
  valor,
  textoMostrar,
  inmutable = false,
  onSaved,
}: {
  item: FaltanteRow;
  selector: string | null;
  opciones?: CatalogoOpcion[];
  /** Valor crudo almacenado (null = falta). */
  valor: string | null;
  /** Valor formateado para mostrar (por defecto, el crudo). */
  textoMostrar?: string;
  inmutable?: boolean;
  onSaved: () => void;
}) {
  const [editando, setEditando] = useState(false);

  if (valor !== null && !editando) {
    return (
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 text-sm">{textoMostrar ?? valor}</div>
        {!inmutable ? (
          <button
            type="button"
            className="shrink-0 rounded p-0.5 text-muted-foreground/50 hover:bg-muted hover:text-foreground"
            title={`Editar ${item.etiqueta}`}
            onClick={() => setEditando(true)}
          >
            <Pencil className="size-3.5" />
          </button>
        ) : null}
      </div>
    );
  }

  // Los jsonb por líneas se muestran unidos por " · "; al editar se separan.
  const inicial = editando
    ? tipoCampo(item.campo) === "lineas"
      ? (valor ?? "").split(" · ").join("\n")
      : (valor ?? "")
    : "";

  return (
    <EditorCampo
      key={editando ? "edit" : "nuevo"}
      item={item}
      selector={selector}
      opciones={opciones}
      inicial={inicial}
      confirmarCambio={editando}
      valorAnterior={textoMostrar ?? valor}
      onCancel={editando ? () => setEditando(false) : undefined}
      onSaved={() => {
        setEditando(false);
        onSaved();
      }}
    />
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
