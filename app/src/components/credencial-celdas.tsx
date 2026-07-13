"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ClipboardCopy, Eye, EyeOff, Pencil, Plus, X } from "lucide-react";
import {
  guardarCredencial,
  revelarCredencial,
  type CampoCredencial,
  type TipoClave,
} from "@/app/(app)/credenciales/actions";
import { RutCopiable } from "@/components/rut-copiable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Celda de clave (SII o Previred): muestra puntitos, y con botones se revela,
 * copia o edita. El valor real se pide al servidor recién al apretar un botón
 * (queda auditado); nunca viene en el HTML inicial. Se usa en /credenciales y
 * en la ficha de Empresas.
 */
export function ClaveCell({
  clienteId,
  campo,
  etiqueta,
  razonSocial,
  tiene,
}: {
  clienteId: string;
  campo: TipoClave;
  etiqueta: string; // "Clave SII" | "Clave Previred"
  razonSocial: string;
  tiene: boolean;
}) {
  const router = useRouter();
  const [valor, setValor] = useState<string | null>(null); // clave ya traída
  const [visible, setVisible] = useState(false);
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [guardada, setGuardada] = useState(false); // se agregó clave donde no había

  const hayClave = tiene || guardada || Boolean(valor);

  async function traer(accion: "revelar" | "copiar"): Promise<string | null> {
    if (valor !== null) return valor;
    const res = await revelarCredencial(clienteId, campo, accion);
    if (!res.ok) {
      toast.error(res.error ?? "No se pudo obtener la clave.");
      return null;
    }
    setValor(res.valor ?? "");
    return res.valor ?? "";
  }

  async function ver() {
    if (visible) {
      setVisible(false);
      return;
    }
    setOcupado(true);
    const v = await traer("revelar");
    setOcupado(false);
    if (v !== null) setVisible(true);
  }

  async function copiar() {
    setOcupado(true);
    const v = await traer("copiar");
    setOcupado(false);
    if (v === null) return;
    if (!v) {
      toast.info(`${razonSocial} no tiene ${etiqueta.toLowerCase()} guardada.`);
      return;
    }
    navigator.clipboard.writeText(v);
    toast.success(`${etiqueta} de ${razonSocial} copiada`);
  }

  async function editar() {
    setOcupado(true);
    const v = hayClave ? await traer("revelar") : "";
    setOcupado(false);
    if (v === null) return;
    setBorrador(v);
    setEditando(true);
  }

  async function guardar() {
    setOcupado(true);
    const res = await guardarCredencial(clienteId, campo, borrador);
    setOcupado(false);
    if (!res.ok) {
      toast.error(res.error ?? "No se pudo guardar.");
      return;
    }
    const limpio = borrador.trim();
    setValor(limpio || "");
    setGuardada(Boolean(limpio));
    setVisible(Boolean(limpio));
    setEditando(false);
    toast.success(
      limpio
        ? `${etiqueta} de ${razonSocial} actualizada`
        : `${etiqueta} de ${razonSocial} eliminada`,
    );
    router.refresh();
  }

  if (editando) {
    return (
      <div className="flex items-center gap-1">
        <Input
          autoFocus
          className="h-8 w-36 bg-card font-mono text-xs"
          value={borrador}
          onChange={(e) => setBorrador(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") guardar();
            if (e.key === "Escape") setEditando(false);
          }}
          aria-label={`${etiqueta} de ${razonSocial}`}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={ocupado}
          aria-label="Guardar"
          onClick={guardar}
        >
          <Check className="size-4 text-emerald-600" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={ocupado}
          aria-label="Cancelar"
          onClick={() => setEditando(false)}
        >
          <X className="size-4 text-muted-foreground" />
        </Button>
      </div>
    );
  }

  if (!hayClave) {
    return (
      <Button
        variant="ghost"
        size="sm"
        disabled={ocupado}
        className="h-7 px-2 text-xs text-muted-foreground"
        onClick={editar}
      >
        <Plus className="size-3.5" />
        Agregar
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-0.5">
      <span
        className="min-w-[90px] font-mono text-xs tracking-wider select-all"
        title={visible ? undefined : "Clave oculta"}
      >
        {visible && valor !== null ? valor : "••••••••"}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={ocupado}
        aria-label={visible ? "Ocultar clave" : "Ver clave"}
        onClick={ver}
      >
        {visible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={ocupado}
        aria-label="Copiar clave"
        onClick={copiar}
      >
        <ClipboardCopy className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={ocupado}
        aria-label="Editar clave"
        onClick={editar}
      >
        <Pencil className="size-3.5" />
      </Button>
    </div>
  );
}

/** RUT Previred: visible (no es secreto), copiable y editable en línea. */
export function RutPreviredCell({
  clienteId,
  valorInicial,
}: {
  clienteId: string;
  valorInicial: string | null;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState(valorInicial ?? "");
  const [ocupado, setOcupado] = useState(false);

  async function guardar() {
    setOcupado(true);
    const res = await guardarCredencial(
      clienteId,
      "previred_rut" as CampoCredencial,
      borrador,
    );
    setOcupado(false);
    if (!res.ok) {
      toast.error(res.error ?? "No se pudo guardar.");
      return;
    }
    setEditando(false);
    toast.success("RUT Previred actualizado");
    router.refresh();
  }

  if (editando) {
    return (
      <div className="flex items-center gap-1">
        <Input
          autoFocus
          className="h-8 w-32 bg-card text-xs"
          value={borrador}
          onChange={(e) => setBorrador(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") guardar();
            if (e.key === "Escape") setEditando(false);
          }}
          aria-label="RUT Previred"
        />
        <Button variant="ghost" size="icon-sm" disabled={ocupado} aria-label="Guardar" onClick={guardar}>
          <Check className="size-4 text-emerald-600" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={ocupado}
          aria-label="Cancelar"
          onClick={() => setEditando(false)}
        >
          <X className="size-4 text-muted-foreground" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-0.5">
      <RutCopiable rut={valorInicial} />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Editar RUT Previred"
        onClick={() => {
          setBorrador(valorInicial ?? "");
          setEditando(true);
        }}
      >
        <Pencil className="size-3.5" />
      </Button>
    </div>
  );
}
