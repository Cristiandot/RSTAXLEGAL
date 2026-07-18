"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Navegación por pestañas de la sección Tesorería (estilo Chipax: Vista general /
 * Banco / Por cobrar / Por pagar / Flujo). Preserva la empresa seleccionada
 * (?cliente=) al moverse entre pantallas.
 */
export function TesoreriaNav({ cliente }: { cliente?: string | null }) {
  const pathname = usePathname();
  const q = cliente ? `?cliente=${cliente}` : "";
  const tabs = [
    { href: `/tesoreria/general${q}`, label: "Vista general", match: "/tesoreria/general" },
    { href: `/tesoreria${cliente ? `?cliente=${cliente}` : ""}`, label: "Banco / conciliación", match: "/tesoreria", exact: true },
    { href: `/tesoreria/cuentas?tipo=cobrar${cliente ? `&cliente=${cliente}` : ""}`, label: "Por cobrar", match: "/tesoreria/cuentas" },
    { href: `/tesoreria/flujo${q}`, label: "Flujo de caja", match: "/tesoreria/flujo" },
  ];
  return (
    <nav className="mt-4 flex flex-wrap gap-1 border-b border-border">
      {tabs.map((t) => {
        const activo = t.exact ? pathname === t.match : pathname.startsWith(t.match);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
              activo
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
