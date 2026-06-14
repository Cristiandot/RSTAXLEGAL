"use client";

import { useEffect, useState } from "react";
import { Coins, Receipt, CalendarClock, Banknote, LineChart } from "lucide-react";
import { cargarIndicadores, type IndicadoresPortal } from "./portal-actions";

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function nombrePeriodo(p?: string): string {
  if (!p) return "";
  const [y, m] = p.split("-").map(Number);
  return `${MESES[m - 1] ?? "?"} ${y}`;
}

function clp(n?: number | null): string {
  if (n === null || n === undefined) return "—";
  return "$" + Math.round(n).toLocaleString("es-CL");
}

function Chip({ icon, label, valor }: { icon: React.ReactNode; label: string; valor: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-transparent bg-card px-3 py-1.5 text-xs card-soft">
      <span className="text-[var(--brand-teal)]">{icon}</span>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{valor}</span>
    </span>
  );
}

export function FranjaIndicadores({ token }: { token: string }) {
  const [ind, setInd] = useState<IndicadoresPortal | null>(null);

  useEffect(() => {
    void cargarIndicadores(token).then((r) => {
      if (r.ok && r.ind) setInd(r.ind);
    });
  }, [token]);

  if (!ind || !ind.disponible) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap justify-center gap-2">
        <Chip icon={<Coins className="size-3.5" />} label="UF" valor={clp(ind.uf)} />
        <Chip icon={<Receipt className="size-3.5" />} label="UTM" valor={clp(ind.utm)} />
        <Chip icon={<CalendarClock className="size-3.5" />} label="UTA" valor={clp(ind.uta)} />
        <Chip icon={<Banknote className="size-3.5" />} label="Sueldo mínimo" valor={clp(ind.imm)} />
        <Chip
          icon={<LineChart className="size-3.5" />}
          label="Tope imponible AFP"
          valor={ind.tope_afp_uf ? `${ind.tope_afp_uf} UF` : "—"}
        />
      </div>
      <p className="text-center text-[11px] text-muted-foreground">
        Indicadores Previred · período {nombrePeriodo(ind.periodo)}
      </p>
    </div>
  );
}
