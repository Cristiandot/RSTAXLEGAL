"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { siguienteOrden, type Orden } from "@/lib/ordenar";

/** Encabezado de tabla ordenable: clic alterna asc → desc → sin orden. */
export function ThSort({
  col,
  orden,
  setOrden,
  children,
  className,
}: {
  col: string;
  orden: Orden;
  setOrden: (o: Orden) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const activo = orden?.col === col;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => setOrden(siguienteOrden(orden, col))}
        className={`inline-flex items-center gap-1 transition-colors hover:text-foreground ${activo ? "text-foreground" : ""}`}
        title="Ordenar"
      >
        {children}
        {activo ? (
          orden!.dir === "asc" ? (
            <ArrowUp className="size-3.5" />
          ) : (
            <ArrowDown className="size-3.5" />
          )
        ) : (
          <ArrowUpDown className="size-3.5 opacity-35" />
        )}
      </button>
    </TableHead>
  );
}
