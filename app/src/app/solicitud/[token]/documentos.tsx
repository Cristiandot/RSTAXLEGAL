"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle2, Send, FileText, ClipboardCheck } from "lucide-react";
import {
  listarSolicitudesDocumento,
  solicitarDocumento,
  type SolicitudDocRow,
} from "./portal-actions";
import { formatFecha } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function nombrePeriodo(p?: string | null): string {
  if (!p) return "";
  const [y, m] = p.split("-").map(Number);
  if (!y || !m) return p;
  return `${MESES[m - 1] ?? "?"} ${y}`;
}

const ESTADO_LABEL: Record<SolicitudDocRow["estado"], { txt: string; cls: string }> = {
  solicitada: { txt: "Enviada al equipo", cls: "bg-amber-100 text-amber-800" },
  en_revision: { txt: "En revisión", cls: "bg-amber-100 text-amber-800" },
  enviada: { txt: "Enviada", cls: "bg-emerald-100 text-emerald-700" },
  rechazada: { txt: "Rechazada", cls: "bg-red-100 text-red-700" },
};

export type TipoDoc = { tipo: string; desc: string };

/**
 * Bloque "Documentos" reutilizable (Contabilidad y RRHH). El cliente solicita un
 * documento → entra al sistema interno de RS Tax & Legal y el equipo lo prepara
 * y se lo envía por correo. Sin responsable nominado: cae en la bandeja común.
 */
export function DocumentosSolicitar({
  token,
  area,
  titulo,
  docs,
  periodos,
}: {
  token: string;
  area: "contabilidad" | "rrhh";
  titulo: string;
  docs: TipoDoc[];
  periodos: { value: string; label: string }[];
}) {
  const [rows, setRows] = useState<SolicitudDocRow[]>([]);
  const [periodo, setPeriodo] = useState(periodos[0]?.value ?? "");
  const [enviando, startEnviar] = useTransition();

  const recargar = useCallback(async () => {
    const r = await listarSolicitudesDocumento(token);
    if (r.ok && r.rows) setRows(r.rows.filter((x) => x.area === area));
  }, [token, area]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  function pedir(tipo: string) {
    startEnviar(async () => {
      const r = await solicitarDocumento(token, { area, tipo_documento: tipo, periodo });
      if (r.ok) {
        toast.success("Solicitud enviada — el equipo de RS Tax & Legal la prepara y te la envía");
        await recargar();
      } else {
        toast.error(r.error ?? "No se pudo enviar la solicitud.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <FileText className="size-4 text-[var(--brand-teal)]" />
        <h3 className="font-heading text-lg font-semibold">{titulo}</h3>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800">
        <span>
          Al solicitarlo, la petición entra al sistema interno de RS Tax &amp; Legal y{" "}
          <strong>el equipo lo prepara y te lo envía por correo</strong>. Período:
        </span>
        {periodos.length > 0 ? (
          <select
            className="h-8 rounded-md border border-input bg-card px-2 text-xs"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
          >
            {periodos.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {docs.map((d) => (
          <Card key={d.tipo} className="card-soft border-transparent">
            <CardContent className="flex h-full flex-col gap-2 pt-4">
              <div className="flex items-start gap-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-teal)]/10 text-[var(--brand-teal)]">
                  <FileText className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-medium">{d.tipo}</p>
                  <p className="text-xs text-muted-foreground">{d.desc}</p>
                </div>
              </div>
              <Button
                size="sm"
                className="mt-auto w-full"
                disabled={enviando}
                onClick={() => pedir(d.tipo)}
              >
                <Send className="size-3.5" />
                Solicitar
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="card-soft border-transparent">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardCheck className="size-4 text-[var(--brand-teal)]" />
            Mis solicitudes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length > 0 ? (
            <ul className="divide-y">
              {rows.map((r) => {
                const e = ESTADO_LABEL[r.estado];
                return (
                  <li key={r.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span>
                      <span className="font-medium">{r.tipo_documento}</span>
                      {r.periodo ? (
                        <span className="text-muted-foreground"> · {nombrePeriodo(r.periodo)}</span>
                      ) : null}
                      <span className="text-xs text-muted-foreground"> · {formatFecha(r.created_at.slice(0, 10))}</span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${e.cls}`}>{e.txt}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4" />
              Aún no has solicitado documentos por aquí.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
