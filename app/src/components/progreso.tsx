"use client";

import { claseCompletitud } from "@/lib/onboarding";

/** Barra de progreso simple de completitud (checklist). */
export function Progreso({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-20 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${
            pct >= 90 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-red-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-sm ${claseCompletitud(pct)}`}>{pct}%</span>
    </div>
  );
}
