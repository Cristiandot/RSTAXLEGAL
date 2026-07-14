"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ClipboardCopy, Eye, EyeOff, KeyRound } from "lucide-react";
import { revelarClaveOficina } from "@/app/(app)/credenciales/actions";
import { RutCopiable } from "@/components/rut-copiable";
import { Button } from "@/components/ui/button";

export type CuentaOficina = {
  id: string;
  etiqueta: string;
  rut: string | null;
  tieneClave: boolean;
};

/**
 * Tarjeta con las cuentas de la oficina (credenciales_oficina), p. ej. la
 * cuenta Previred del contador con la que se opera la cartera. La clave se
 * muestra con puntitos y se revela/copia vía server action auditada — nunca
 * viene en el HTML inicial.
 */
export function CuentaPreviredOficina({ cuentas }: { cuentas: CuentaOficina[] }) {
  if (cuentas.length === 0) return null;
  return (
    <div className="card-soft flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl bg-card px-4 py-3">
      {cuentas.map((c) => (
        <CuentaFila key={c.id} cuenta={c} />
      ))}
    </div>
  );
}

function CuentaFila({ cuenta }: { cuenta: CuentaOficina }) {
  const [valor, setValor] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  async function traer(accion: "revelar" | "copiar"): Promise<string | null> {
    if (valor !== null) return valor;
    const res = await revelarClaveOficina(cuenta.id, accion);
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
    if (!v) return;
    navigator.clipboard.writeText(v);
    toast.success("Clave copiada");
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      <span className="flex items-center gap-1.5 font-medium">
        <KeyRound className="size-4 text-muted-foreground" />
        {cuenta.etiqueta}
      </span>
      {cuenta.rut ? (
        <span className="flex items-center gap-1 text-muted-foreground">
          RUT
          <RutCopiable rut={cuenta.rut} />
        </span>
      ) : null}
      {cuenta.tieneClave ? (
        <span className="flex items-center gap-0.5 text-muted-foreground">
          Clave
          <span
            className="ml-1 font-mono text-xs tracking-wider select-all"
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
        </span>
      ) : null}
    </div>
  );
}
