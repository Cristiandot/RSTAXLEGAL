"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Award, BookText, ReceiptText, Send, ClipboardCheck, CheckCircle2,
  ShieldAlert, ShieldCheck, Upload, Download,
} from "lucide-react";
import {
  listarSolicitudesDocumento,
  solicitarDocumento,
  cargarReglamento,
  subirReglamento,
  generarCertificadoAntiguedad,
  type SolicitudDocRow,
  type Reglamento,
} from "./portal-actions";
import { formatFecha } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const selectCls =
  "h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

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
  solicitada: { txt: "Solicitada", cls: "bg-amber-100 text-amber-800" },
  en_revision: { txt: "En revisión", cls: "bg-amber-100 text-amber-800" },
  enviada: { txt: "Enviada", cls: "bg-emerald-100 text-emerald-700" },
  rechazada: { txt: "Rechazada", cls: "bg-red-100 text-red-700" },
};

export type TrabSimple = {
  nombre: string;
  rut: string | null;
  cargo?: string | null;
  fechaIngreso?: string | null;
};

/** Quita puntos/guiones para comparar RUT. */
function soloDigitos(s: string): string {
  return s.replace(/[^0-9kK]/g, "").toLowerCase();
}

/** Selector de trabajador con buscador por nombre o RUT (para nóminas grandes). */
function SelectorTrabajador({
  trabajadores,
  valor,
  onChange,
  id,
}: {
  trabajadores: TrabSimple[];
  valor: string;
  onChange: (v: string) => void;
  id: string;
}) {
  const [busca, setBusca] = useState("");
  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return trabajadores;
    const td = soloDigitos(t);
    return trabajadores.filter(
      (w) =>
        w.nombre.toLowerCase().includes(t) ||
        (td && w.rut && soloDigitos(w.rut).includes(td)),
    );
  }, [busca, trabajadores]);

  return (
    <div className="flex flex-col gap-2">
      <Input
        id={`${id}-busca`}
        placeholder="Buscar por nombre o RUT…"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />
      <select className={selectCls} value={valor} onChange={(e) => onChange(e.target.value)}>
        <option value="">— Selecciona al trabajador —</option>
        {filtrados.map((w) => {
          const v = w.rut ? `${w.nombre} · ${w.rut}` : w.nombre;
          return (
            <option key={v} value={v}>{v}</option>
          );
        })}
      </select>
      {filtrados.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin coincidencias para “{busca}”.</p>
      ) : null}
    </div>
  );
}

/**
 * Documentos de personal del portal (RRHH): certificado de antigüedad (con
 * buscador de trabajador), libro de remuneraciones (con período), liquidaciones
 * de sueldo (por trabajador y período). Todo se solicita; el equipo lo revisa y
 * lo envía durante el día (no es inmediato).
 */
export function DocumentosRrhh({
  token,
  trabajadores,
  periodos,
}: {
  token: string;
  trabajadores: TrabSimple[];
  periodos: { value: string; label: string }[];
}) {
  const [rows, setRows] = useState<SolicitudDocRow[]>([]);
  const [enviando, startEnviar] = useTransition();

  const [certSel, setCertSel] = useState("");
  const [libroPeriodo, setLibroPeriodo] = useState(periodos[0]?.value ?? "");
  const [liqSel, setLiqSel] = useState("");
  const [liqPeriodo, setLiqPeriodo] = useState(periodos[0]?.value ?? "");

  const [reglamento, setReglamento] = useState<Reglamento | null>(null);
  const [regTipo, setRegTipo] = useState<"RIHS" | "RIOHS">("RIOHS");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);

  const recargar = useCallback(async () => {
    const r = await listarSolicitudesDocumento(token);
    if (r.ok && r.rows) setRows(r.rows.filter((x) => x.area === "rrhh"));
  }, [token]);

  const recargarReglamento = useCallback(async () => {
    const r = await cargarReglamento(token);
    if (r.ok && r.reglamento) setReglamento(r.reglamento);
  }, [token]);

  useEffect(() => {
    void recargar();
    void recargarReglamento();
  }, [recargar, recargarReglamento]);

  function subirReg() {
    if (!archivo) return;
    startEnviar(async () => {
      const fd = new FormData();
      fd.set("tipo", regTipo);
      fd.set("archivo", archivo);
      const r = await subirReglamento(token, fd);
      if (r.ok) {
        toast.success("Reglamento cargado");
        setArchivo(null);
        setInputKey((k) => k + 1);
        await recargarReglamento();
      } else {
        toast.error(r.error ?? "No se pudo subir el reglamento.");
      }
    });
  }

  function descargarCertificado() {
    const w = trabajadores.find((x) => (x.rut ? `${x.nombre} · ${x.rut}` : x.nombre) === certSel);
    if (!w) return;
    startEnviar(async () => {
      const r = await generarCertificadoAntiguedad(token, {
        nombre: w.nombre,
        rut: w.rut,
        cargo: w.cargo ?? null,
        fechaIngreso: w.fechaIngreso ?? null,
      });
      if (r.ok && r.base64 && r.filename) {
        const bin = atob(r.base64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        const blob = new Blob([arr], {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = r.filename;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Certificado descargado");
      } else {
        toast.error(r.error ?? "No se pudo generar el certificado.");
      }
    });
  }

  function pedir(tipo: string, p: { periodo?: string; detalle?: string }) {
    startEnviar(async () => {
      const r = await solicitarDocumento(token, {
        area: "rrhh",
        tipo_documento: tipo,
        periodo: p.periodo,
        detalle: p.detalle,
      });
      if (r.ok) {
        toast.success("Solicitud enviada — la revisamos y te la enviamos durante el día");
        await recargar();
      } else {
        toast.error(r.error ?? "No se pudo enviar la solicitud.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <FileTextIcon />
        <h3 className="font-heading text-lg font-semibold">Documentos de personal</h3>
      </div>
      <p className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800">
        Lo que solicitas, el equipo de RS Tax &amp; Legal lo revisa y te lo envía por correo;{" "}
        <strong className="font-semibold">el documento estará disponible entre 24 y 48 horas</strong>.
      </p>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Certificado de antigüedad */}
        <Card className="card-soft border-transparent">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Award className="size-4 text-[var(--brand-teal)]" /> Certificado de antigüedad
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label className="text-xs">Trabajador</Label>
            <SelectorTrabajador id="cert" trabajadores={trabajadores} valor={certSel} onChange={setCertSel} />
            <Button
              size="sm" className="w-full" disabled={enviando || !certSel}
              onClick={descargarCertificado}
            >
              <Download className="size-3.5" /> Descargar certificado
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Formato estándar — se descarga al instante con los datos del trabajador.
            </p>
          </CardContent>
        </Card>

        {/* Libro de remuneraciones */}
        <Card className="card-soft border-transparent">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <BookText className="size-4 text-[var(--brand-teal)]" /> Libro de remuneraciones
              </CardTitle>
              <select className="h-8 rounded-md border border-input bg-card px-2 text-xs" value={libroPeriodo} onChange={(e) => setLibroPeriodo(e.target.value)}>
                {periodos.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">Detalle mensual de la nómina del período elegido.</p>
            <Button
              size="sm" className="w-full" disabled={enviando}
              onClick={() => pedir("Libro de remuneraciones", { periodo: libroPeriodo })}
            >
              <Send className="size-3.5" /> Solicitar
            </Button>
          </CardContent>
        </Card>

        {/* Liquidaciones de sueldo */}
        <Card className="card-soft border-transparent">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ReceiptText className="size-4 text-[var(--brand-teal)]" /> Liquidaciones de sueldo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label className="text-xs">Trabajador</Label>
            <SelectorTrabajador id="liq" trabajadores={trabajadores} valor={liqSel} onChange={setLiqSel} />
            <div className="grid grid-cols-3 gap-2">
              <Button
                size="sm" variant="outline" disabled={enviando || !liqSel}
                onClick={() => pedir("Liquidaciones de sueldo (últimas 3)", { detalle: liqSel })}
              >
                Últimas 3
              </Button>
              <Button
                size="sm" variant="outline" disabled={enviando || !liqSel}
                onClick={() => pedir("Liquidaciones de sueldo (últimas 6)", { detalle: liqSel })}
              >
                Últimas 6
              </Button>
              <Button
                size="sm" variant="outline" disabled={enviando || !liqSel}
                onClick={() => pedir("Liquidaciones de sueldo (últimas 12)", { detalle: liqSel })}
              >
                Últimas 12
              </Button>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label className="text-xs">O un mes puntual</Label>
                <select className={selectCls} value={liqPeriodo} onChange={(e) => setLiqPeriodo(e.target.value)}>
                  {periodos.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
              <Button
                size="sm" disabled={enviando || !liqSel}
                onClick={() => pedir("Liquidaciones de sueldo", { periodo: liqPeriodo, detalle: liqSel })}
              >
                <Send className="size-3.5" /> Solicitar
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Las liquidaciones quedan guardadas mes a mes; pronto podrás descargarlas directo desde aquí.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Reglamento interno RIHS / RIOHS */}
      <Card className="card-soft border-transparent">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4 text-[var(--brand-teal)]" /> Reglamento interno (RIHS / RIOHS)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {reglamento?.tiene ? (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              <span>
                Tienes cargado tu <strong>{reglamento.tipo}</strong>
                {reglamento.actualizado ? ` · actualizado el ${formatFecha(reglamento.actualizado)}` : ""}. Si tienes una
                versión nueva, puedes reemplazarlo.
              </span>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                Aún no tienes cargado tu RIHS/RIOHS. Es importante <strong>coordinarlo con tu prevencionista de
                riesgos</strong>, mantenerlo al día y entregar copia a cada trabajador. Cárgalo aquí para que el equipo
                lo tenga.
              </span>
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Tipo</Label>
              <select className={selectCls} value={regTipo} onChange={(e) => setRegTipo(e.target.value as "RIHS" | "RIOHS")}>
                <option value="RIOHS">RIOHS (≥10 trabajadores)</option>
                <option value="RIHS">RIHS</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label className="text-xs">Documento (PDF o imagen, hasta 10 MB)</Label>
              <Input
                key={inputKey}
                type="file"
                accept="application/pdf,image/*"
                className="file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1 file:text-sm"
                onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              size="sm" variant="outline" disabled={enviando}
              onClick={() => pedir(`Formato de reglamento (${regTipo})`, { detalle: `El cliente no tiene ${regTipo} y solicita el formato/plantilla para confeccionarlo.` })}
            >
              <Send className="size-3.5" /> No lo tengo — solicitar formato
            </Button>
            <Button size="sm" disabled={enviando || !archivo} onClick={subirReg}>
              <Upload className="size-3.5" /> {reglamento?.tiene ? "Reemplazar reglamento" : "Cargar reglamento"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="card-soft border-transparent">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardCheck className="size-4 text-[var(--brand-teal)]" /> Mis solicitudes
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
                      {r.periodo ? <span className="text-muted-foreground"> · {nombrePeriodo(r.periodo)}</span> : null}
                      <span className="text-xs text-muted-foreground"> · {formatFecha(r.created_at.slice(0, 10))}</span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${e.cls}`}>{e.txt}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4" /> Aún no has solicitado documentos por aquí.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FileTextIcon() {
  return <BookText className="size-4 text-[var(--brand-teal)]" aria-hidden="true" />;
}
