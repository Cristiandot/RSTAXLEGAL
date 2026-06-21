"use client";

import Link from "next/link";

type TabKey = "general" | "rcv" | "balance" | "documentos";

const TABS: { key: TabKey; label: string; ruta: (id: string) => string }[] = [
  { key: "general", label: "General", ruta: (id) => `/contabilidad/${id}` },
  { key: "rcv", label: "Libro C/V", ruta: (id) => `/contabilidad/${id}/rcv` },
  {
    key: "balance",
    label: "Contabilidad y Balance",
    ruta: (id) => `/contabilidad/${id}/balance`,
  },
  {
    key: "documentos",
    label: "Carga de documentos",
    ruta: (id) => `/contabilidad/${id}/documentos`,
  },
];

/** Barra de pestañas del workspace de contabilidad de un cliente. */
export function ContabilidadTabs({
  clienteId,
  periodo,
  active,
}: {
  clienteId: string;
  periodo: string;
  active: TabKey;
}) {
  return (
    <nav className="flex flex-wrap gap-1 border-b border-border/60">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={`${t.ruta(clienteId)}?periodo=${periodo}`}
          className={`rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            active === t.key
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
