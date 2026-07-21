import { formatFecha } from "@/lib/format";

/** Valor para <input type="datetime-local"> a partir de fecha (YYYY-MM-DD) y hora (HH:mm). */
export function dtLocal(fecha: string | null, hora: string | null): string {
  if (!fecha) return "";
  return `${fecha}T${(hora ?? "").slice(0, 5) || "00:00"}`;
}

/** Separa el valor de un datetime-local en { fecha, hora }. */
export function splitDT(v: string): { fecha: string | null; hora: string | null } {
  if (!v) return { fecha: null, hora: null };
  return { fecha: v.slice(0, 10), hora: v.length >= 16 ? v.slice(11, 16) : null };
}

/** Muestra "DD-MM-AAAA HH:mm" (o solo la fecha si no hay hora). */
export function fmtFechaHora(fecha: string | null, hora: string | null): string {
  if (!fecha) return "—";
  return hora ? `${formatFecha(fecha)} ${hora}` : formatFecha(fecha);
}
