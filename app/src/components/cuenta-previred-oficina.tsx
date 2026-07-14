"use client";

import { KeyRound } from "lucide-react";
import { RutCopiable } from "@/components/rut-copiable";
import { ClaveCell } from "@/components/credencial-celdas";

export type CuentaOficina = {
  id: string; // clientes.id (registro con es_oficina = true)
  etiqueta: string;
  rut: string | null;
  tieneClave: boolean;
};

/**
 * Banner con las cuentas Previred de la oficina (registros de `clientes` con
 * es_oficina = true, p. ej. Danilo el contador, con cuya cuenta se operan
 * varias empresas de la cartera). Reutiliza ClaveCell: puntitos + revelar/
 * copiar auditado vía revelarCredencial — la clave nunca viaja en el HTML.
 */
export function CuentaPreviredOficina({ cuentas }: { cuentas: CuentaOficina[] }) {
  if (cuentas.length === 0) return null;
  return (
    <div className="card-soft flex flex-wrap items-center gap-x-8 gap-y-2 rounded-xl bg-card px-4 py-3">
      {cuentas.map((c) => (
        <div
          key={c.id}
          className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"
        >
          <span className="flex items-center gap-1.5 font-medium">
            <KeyRound className="size-4 text-muted-foreground" />
            Previred oficina · {c.etiqueta}
          </span>
          <span className="flex items-center gap-1 text-muted-foreground">
            RUT
            <RutCopiable rut={c.rut} />
          </span>
          <span className="flex items-center gap-1 text-muted-foreground">
            Clave
            <ClaveCell
              clienteId={c.id}
              campo="previred_clave"
              etiqueta="Clave Previred"
              razonSocial={c.etiqueta}
              tiene={c.tieneClave}
              compacto
            />
          </span>
        </div>
      ))}
    </div>
  );
}
