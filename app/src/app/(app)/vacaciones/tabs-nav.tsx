import Link from "next/link";

/**
 * Pestañas de la sección Vacaciones: bandeja de solicitudes del portal
 * (todos los clientes) y control de saldos Red Barrera.
 */
export function VacacionesTabs({ activa }: { activa: "solicitudes" | "control" }) {
  const base = "rounded-md px-3 py-1.5 text-sm font-medium transition-colors";
  const on = "bg-primary text-primary-foreground shadow-sm";
  const off = "text-muted-foreground hover:bg-muted hover:text-foreground";
  return (
    <nav className="mb-4 flex w-fit gap-1 rounded-lg border bg-card p-1">
      <Link href="/vacaciones" className={`${base} ${activa === "solicitudes" ? on : off}`}>
        Solicitudes del portal
      </Link>
      <Link href="/vacaciones/control" className={`${base} ${activa === "control" ? on : off}`}>
        Control Red Barrera
      </Link>
    </nav>
  );
}
