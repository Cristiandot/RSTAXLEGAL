"use client";

import { toast } from "sonner";

/**
 * RUT que se copia al portapapeles con un click (para pegarlo en Previred,
 * SII, etc.). Detiene la propagación para no activar el click de la fila.
 */
export function RutCopiable({ rut }: { rut: string | null | undefined }) {
  if (!rut) return <>—</>;
  return (
    <button
      type="button"
      className="-mx-1 cursor-copy rounded px-1 text-left hover:bg-sky-50 hover:text-sky-700"
      title="Click para copiar el RUT"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(rut);
        toast.success(`RUT ${rut} copiado`);
      }}
    >
      {rut}
    </button>
  );
}
