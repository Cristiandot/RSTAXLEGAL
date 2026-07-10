"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Deep-link desde la bandeja de Inicio: `?gestion=<uuid>` en la URL del módulo.
 * Devuelve el id destacado (para pintar la fila) y, si la fila existe y se
 * entrega `onAbrir`, abre su detalle una sola vez. También hace scroll a la
 * fila, que debe renderizarse con `id={`gestion-${fila.id}`}`.
 */
export function useGestionUrl<T extends { id: string }>(
  filas: T[],
  onAbrir?: (fila: T) => void,
): string | null {
  const searchParams = useSearchParams();
  const gestionId = searchParams.get("gestion");
  const hecho = useRef(false);

  useEffect(() => {
    if (!gestionId || hecho.current || filas.length === 0) return;
    hecho.current = true;
    const fila = filas.find((f) => f.id === gestionId);
    if (fila && onAbrir) onAbrir(fila);
    requestAnimationFrame(() => {
      document
        .getElementById(`gestion-${gestionId}`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }, [gestionId, filas, onAbrir]);

  return gestionId;
}

/** Clase para destacar la fila deep-linkeada desde la bandeja del Inicio. */
export const CLASE_FILA_DESTACADA =
  "bg-cyan-50/80 shadow-[inset_3px_0_0_0_var(--brand-teal,#17A2B8)]";
