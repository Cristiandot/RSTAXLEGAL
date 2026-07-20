"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Loader2, Download, FileText, FileSignature, Stethoscope, ShieldAlert,
  CalendarClock, FileX, Receipt, Send, Briefcase, Award,
} from "lucide-react";
import {
  cargarFichaTrabajador,
  descargarDocumentoTrabajador,
  generarCertificadoAntiguedad,
  type FichaTrabajador as Ficha,
  type FichaSolicitud,
} from "./portal-actions";
import { formatFecha, formatMonto } from "@/lib/format";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
function nombrePeriodo(p: string): string {
  const [y, m] = p.split("-").map(Number);
  return `${MESES[(m ?? 1) - 1] ?? "?"} ${y}`;
}

function tipoContratoLabel(t: string | null): string {
  if (t === "plazo_fijo") return "Plazo fijo";
  if (t === "indefinido") return "Indefinido";
  return t ?? "—";
}

/** Antigüedad legible desde la fecha de ingreso. */
function antiguedad(fechaIngreso?: string | null): string | null {
  if (!fechaIngreso) return null;
  const ing = new Date(`${fechaIngreso}T00:00:00`);
  if (Number.isNaN(ing.getTime())) return null;
  const meses = Math.max(0, Math.round((Date.now() - ing.getTime()) / (1000 * 60 * 60 * 24 * 30.4375)));
  const a = Math.floor(meses / 12);
  const m = meses % 12;
  if (a <= 0) return `${m} mes${m === 1 ? "" : "es"}`;
  return `${a} año${a === 1 ? "" : "s"}${m > 0 ? ` ${m} mes${m === 1 ? "" : "es"}` : ""}`;
}

/** Feriado legal devengado a la fecha (15 días hábiles/año, Art. 67 CT), sin descontar tomados. */
function vacDevengadas(fechaIngreso?: string | null): number | null {
  if (!fechaIngreso) return null;
  const ing = new Date(`${fechaIngreso}T00:00:00`);
  if (Number.isNaN(ing.getTime())) return null;
  const meses = (Date.now() - ing.getTime()) / (1000 * 60 * 60 * 24 * 30.4375);
  if (meses <= 0) return 0;
  return Math.round(meses * 1.25 * 10) / 10;
}

function Dato({ label, valor }: { label: string; valor: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium text-foreground">{valor ?? "—"}</p>
    </div>
  );
}

function EstadoBadge({ estado }: { estado: string | null }) {
  if (!estado) return null;
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium capitalize text-muted-foreground">
      {estado.replace(/_/g, " ")}
    </span>
  );
}

/** Botón de descarga de un documento guardado (bucket contratos, URL firmada). */
function DescargaDoc({
  token, trabajadorId, path, nombre, label,
}: {
  token: string; trabajadorId: string; path: string | null; nombre: string; label?: string;
}) {
  const [cargando, start] = useTransition();
  if (!path) return null;
  return (
    <button
      type="button"
      disabled={cargando}
      onClick={() =>
        start(async () => {
          const r = await descargarDocumentoTrabajador(token, trabajadorId, path, nombre);
          if (r.ok && r.url) {
            const a = document.createElement("a");
            a.href = r.url;
            a.rel = "noopener";
            a.click();
          } else {
            toast.error(r.error ?? "No se pudo descargar.");
          }
        })
      }
      className="inline-flex items-center gap-1 text-xs font-medium text-[var(--brand-teal)] disabled:opacity-50"
    >
      {cargando ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
      {label ?? "Descargar"}
    </button>
  );
}

function SeccionSolicitudes({
  titulo, icon, items, token, trabajadorId, nombreDoc, vacio,
}: {
  titulo: string;
  icon: React.ReactNode;
  items: FichaSolicitud[];
  token: string;
  trabajadorId: string;
  nombreDoc: string;
  vacio: string;
}) {
  return (
    <div className="rounded-xl border border-input bg-card p-4">
      <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <span className="text-[var(--brand-teal)]">{icon}</span> {titulo}
        {items.length > 0 ? <span className="text-xs font-normal text-muted-foreground">· {items.length}</span> : null}
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{vacio}</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((s) => (
            <li key={s.id} className="flex items-start justify-between gap-2 text-sm">
              <span className="min-w-0">
                <span className="tabular-nums text-muted-foreground">{formatFecha(s.fecha)}</span>
                {s.detalle ? <span className="block truncate text-xs text-muted-foreground">{s.detalle}</span> : null}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <EstadoBadge estado={s.estado} />
                <DescargaDoc token={token} trabajadorId={trabajadorId} path={s.documento_path} nombre={`${nombreDoc}.docx`} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function FichaTrabajador({
  token,
  trabajadorId,
  open,
  onOpenChange,
  onSolicitarGestion,
}: {
  token: string;
  trabajadorId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSolicitarGestion?: (trabajadorId: string) => void;
}) {
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [genCert, startCert] = useTransition();

  useEffect(() => {
    if (!open || !trabajadorId) return;
    let vivo = true;
    setCargando(true);
    setError(null);
    setFicha(null);
    cargarFichaTrabajador(token, trabajadorId).then((r) => {
      if (!vivo) return;
      if (r.ok && r.ficha) setFicha(r.ficha);
      else setError(r.error ?? "No se pudo cargar la ficha.");
      setCargando(false);
    });
    return () => {
      vivo = false;
    };
  }, [open, trabajadorId, token]);

  const t = ficha?.trabajador;
  const saldoVac = ficha?.vacaciones_saldo ?? vacDevengadas(t?.fecha_ingreso);
  const saldoEsAprox = ficha != null && ficha.vacaciones_saldo == null;

  function descargarCertificado() {
    if (!t) return;
    startCert(async () => {
      const r = await generarCertificadoAntiguedad(token, {
        nombre: t.nombre ?? "",
        rut: t.rut,
        cargo: t.cargo,
        fechaIngreso: t.fecha_ingreso,
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:!max-w-xl">
        <SheetHeader className="border-b border-border">
          <SheetTitle className="font-heading text-lg">
            {t?.nombre ?? "Ficha del trabajador"}
          </SheetTitle>
          <SheetDescription>
            {t ? (
              <span className="flex flex-wrap items-center gap-2">
                {t.rut ? <span className="tabular-nums">{t.rut}</span> : null}
                {t.cargo ? <span>· {t.cargo}</span> : null}
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">
                  {tipoContratoLabel(t.tipo_contrato)}
                </span>
                {t.tipo_contrato === "plazo_fijo" && t.fecha_termino ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                    vence {formatFecha(t.fecha_termino)}
                  </span>
                ) : null}
                {t.activo === false ? (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">
                    inactivo
                  </span>
                ) : null}
              </span>
            ) : (
              "Datos, documentos y liquidaciones"
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-5">
          {cargando ? (
            <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Cargando ficha…
            </p>
          ) : error ? (
            <p className="py-10 text-sm text-red-600">{error}</p>
          ) : ficha && t ? (
            <>
              {/* Datos laborales */}
              <section className="rounded-xl border border-input bg-card p-4">
                <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
                  <Briefcase className="size-4 text-[var(--brand-teal)]" /> Datos laborales
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Dato label="Ingreso" valor={formatFecha(t.fecha_ingreso)} />
                  <Dato label="Antigüedad" valor={antiguedad(t.fecha_ingreso)} />
                  <Dato label="Área / sucursal" valor={t.sucursal} />
                  <Dato
                    label="Jornada"
                    valor={t.horas_semanales ? `${t.horas_semanales} h/sem` : t.jornada_tipo}
                  />
                  <Dato label="Sueldo base" valor={t.sueldo_base ? formatMonto(t.sueldo_base) : "—"} />
                  <Dato label="AFP" valor={t.afp} />
                  <Dato label="Salud" valor={t.salud} />
                  <Dato label="Correo" valor={t.correo} />
                  {t.fono ? <Dato label="Teléfono" valor={t.fono} /> : null}
                  {t.comuna ? <Dato label="Comuna" valor={t.comuna} /> : null}
                </div>
              </section>

              {/* Vacaciones */}
              <section className="rounded-xl border border-input bg-card p-4">
                <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
                  <CalendarClock className="size-4 text-[var(--brand-teal)]" /> Vacaciones
                </p>
                <p className="text-2xl font-semibold tabular-nums">
                  {saldoVac != null ? `${saldoVac.toLocaleString("es-CL")} días` : "—"}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {saldoEsAprox
                    ? "Saldo aproximado: feriado legal devengado a la fecha (15 días hábiles/año, Art. 67 CT), sin descontar los días ya tomados — ese control lo lleva la empresa."
                    : "Saldo registrado en el control de vacaciones."}
                </p>
              </section>

              {/* Documentos */}
              <section className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Documentos
                </p>

                {/* Contrato + anexos */}
                <div className="rounded-xl border border-input bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-sm font-semibold">
                      <FileSignature className="size-4 text-[var(--brand-teal)]" /> Contrato vigente
                    </p>
                    {ficha.contrato ? (
                      <DescargaDoc
                        token={token} trabajadorId={t.id}
                        path={ficha.contrato.documento_path}
                        nombre={`Contrato - ${t.nombre}.docx`}
                      />
                    ) : null}
                  </div>
                  {ficha.contrato ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {tipoContratoLabel(ficha.contrato.tipo_contrato)}
                      {ficha.contrato.fecha_inicio ? ` · desde ${formatFecha(ficha.contrato.fecha_inicio)}` : ""}
                      {ficha.contrato.documento_path ? "" : " · documento no cargado"}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Aún no hay contrato cargado con RS Tax &amp; Legal para este trabajador.
                    </p>
                  )}

                  {ficha.anexos.length > 0 ? (
                    <ul className="mt-3 space-y-1.5 border-t border-border pt-3">
                      {ficha.anexos.map((a) => (
                        <li key={a.id} className="flex items-start justify-between gap-2 text-sm">
                          <span className="min-w-0">
                            <span className="font-medium">Anexo</span>
                            {a.anexo_tipo ? <span className="text-muted-foreground"> · {a.anexo_tipo.replace(/_/g, " ")}</span> : null}
                            <span className="block text-xs text-muted-foreground tabular-nums">{formatFecha(a.fecha)}</span>
                          </span>
                          <DescargaDoc token={token} trabajadorId={t.id} path={a.documento_path} nombre={`Anexo - ${t.nombre}.docx`} />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                {/* Certificado de antigüedad (al vuelo) */}
                <div className="flex items-center justify-between rounded-xl border border-input bg-card p-4">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <Award className="size-4 text-[var(--brand-teal)]" /> Certificado de antigüedad
                  </p>
                  <button
                    type="button"
                    onClick={descargarCertificado}
                    disabled={genCert || !t.fecha_ingreso}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[var(--brand-teal)] disabled:opacity-50"
                    title={t.fecha_ingreso ? undefined : "Falta la fecha de ingreso"}
                  >
                    {genCert ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                    Generar
                  </button>
                </div>

                {/* Licencias */}
                <div className="rounded-xl border border-input bg-card p-4">
                  <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                    <Stethoscope className="size-4 text-[var(--brand-teal)]" /> Licencias médicas
                    {ficha.licencias.length > 0 ? <span className="text-xs font-normal text-muted-foreground">· {ficha.licencias.length}</span> : null}
                  </p>
                  {ficha.licencias.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Sin licencias registradas.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {ficha.licencias.map((l) => (
                        <li key={l.id} className="flex items-baseline justify-between gap-2 text-sm">
                          <span>
                            {l.dias ? `${l.dias} días` : "Licencia"}
                            <span className="text-muted-foreground"> · {formatFecha(l.fecha_inicio)} al {formatFecha(l.fecha_termino)}</span>
                          </span>
                          <EstadoBadge estado={l.estado} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <SeccionSolicitudes
                  titulo="Amonestaciones" icon={<ShieldAlert className="size-4" />}
                  items={ficha.amonestaciones} token={token} trabajadorId={t.id}
                  nombreDoc={`Amonestacion - ${t.nombre}`} vacio="Sin amonestaciones."
                />
                <SeccionSolicitudes
                  titulo="Permisos" icon={<CalendarClock className="size-4" />}
                  items={ficha.permisos} token={token} trabajadorId={t.id}
                  nombreDoc={`Permiso - ${t.nombre}`} vacio="Sin permisos registrados."
                />
                <SeccionSolicitudes
                  titulo="Finiquitos" icon={<FileX className="size-4" />}
                  items={ficha.finiquitos} token={token} trabajadorId={t.id}
                  nombreDoc={`Finiquito - ${t.nombre}`} vacio="Sin finiquitos."
                />
              </section>

              {/* Liquidaciones */}
              <section className="rounded-xl border border-input bg-card p-4">
                <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                  <Receipt className="size-4 text-[var(--brand-teal)]" /> Liquidaciones recientes
                </p>
                {ficha.liquidaciones.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin liquidaciones registradas.</p>
                ) : (
                  <ul className="space-y-1">
                    {ficha.liquidaciones.map((l) => (
                      <li key={l.periodo} className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="capitalize">{nombrePeriodo(l.periodo)}</span>
                        <span className="tabular-nums font-medium">
                          {l.liquido != null ? formatMonto(l.liquido) : "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-[11px] text-muted-foreground">
                  El detalle y la descarga de liquidaciones está en la pestaña Remuneraciones.
                </p>
              </section>

              {/* Acción */}
              {onSolicitarGestion ? (
                <button
                  type="button"
                  onClick={() => {
                    onSolicitarGestion(t.id);
                    onOpenChange(false);
                  }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90"
                >
                  <Send className="size-4" /> Solicitar una gestión para {t.nombre?.split(" ")[0] ?? "este trabajador"}
                </button>
              ) : null}

              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <FileText className="size-3" /> Ficha consolidada de RS Tax &amp; Legal.
              </p>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
