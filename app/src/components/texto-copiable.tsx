"use client";

import { toast } from "sonner";

/**
 * Texto que se copia al portapapeles con un click (correos, teléfonos, etc.).
 * Detiene la propagación para no activar el click de la fila.
 */
export function TextoCopiable({
  texto,
  etiqueta = "Texto",
  className = "",
}: {
  texto: string | null | undefined;
  etiqueta?: string;
  className?: string;
}) {
  if (!texto) return <>—</>;
  return (
    <button
      type="button"
      className={`-mx-1 cursor-copy truncate rounded px-1 text-left hover:bg-sky-50 hover:text-sky-700 ${className}`}
      title={`Click para copiar: ${texto}`}
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(texto);
        toast.success(`${etiqueta} copiado`);
      }}
    >
      {texto}
    </button>
  );
}
