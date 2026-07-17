"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Eye, EyeOff, Lock, Save, Loader2, CheckCircle2, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  cargarEmpresaDetalle,
  guardarDatosEmpresa,
  type EmpresaDetalle,
  type CampoEmpresa,
} from "./datos-actions";

const GRUPOS_VISIBLES = ["Identificación", "Tributario", "Domicilio", "Contacto"];
const CAMPOS_JSON = new Set(["actividades_sii", "socios"]);

function colorPct(pct: number): string {
  if (pct >= 100) return "text-emerald-600";
  if (pct >= 60) return "text-amber-600";
  return "text-red-600";
}
function barPct(pct: number): string {
  if (pct >= 100) return "bg-emerald-500";
  if (pct >= 60) return "bg-amber-500";
  return "bg-red-500";
}

const FECHA_RE = /^\d{4}-\d{2}-\d{2}/;
/** YYYY-MM-DD → DD-MM-AAAA (formato RSTL). */
function fmtFecha(v: string): string {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : v;
}

export function DatosEmpresa({ token }: { token: string }) {
  const [detalle, setDetalle] = useState<EmpresaDetalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [form, setForm] = useState<Record<string, string>>({});
  const [ver, setVer] = useState<Record<string, boolean>>({});
  const [guardando, start] = useTransition();

  async function recargar() {
    const r = await cargarEmpresaDetalle(token);
    if (r.ok && r.detalle) {
      setDetalle(r.detalle);
      const f: Record<string, string> = {};
      for (const c of r.detalle.campos) {
        if (c.fuente === "CLIENTE" && c.grupo !== "Accesos") f[c.campo] = c.valor ?? "";
      }
      const a = r.detalle.accesos;
      f.clave_sii = a.clave_sii ?? "";
      f.previred_rut = a.previred_rut ?? "";
      f.previred_clave = a.previred_clave ?? "";
      f.afc_clave = a.afc_clave ?? "";
      setForm(f);
    }
    setCargando(false);
  }
  useEffect(() => {
    void recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function set(campo: string, valor: string) {
    setForm((p) => ({ ...p, [campo]: valor }));
  }
  function guardar() {
    start(async () => {
      const r = await guardarDatosEmpresa(token, form);
      if (r.ok) {
        toast.success("Datos guardados");
        await recargar();
      } else {
        toast.error(r.error ?? "No se pudo guardar");
      }
    });
  }

  if (cargando) {
    return (
      <div className="card-soft flex items-center gap-2 rounded-xl bg-card p-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Cargando datos de la empresa…
      </div>
    );
  }
  if (!detalle) return null;

  const editables = detalle.campos.filter(
    (c) => c.fuente === "CLIENTE" && c.grupo !== "Accesos",
  );
  const soloLectura = detalle.campos.filter(
    (c) => c.fuente !== "CLIENTE" && c.grupo !== "Accesos",
  );

  const faltaLabel = (
    <p className="flex items-center gap-1 text-sm font-medium text-red-600">
      <AlertCircle className="size-3.5" /> Falta
    </p>
  );

  const campoRO = (c: CampoEmpresa) => {
    // Actividades económicas: se informan como lista (código — glosa).
    if (c.campo === "actividades_sii") {
      let items: string[] = [];
      try {
        const parsed = c.valor ? JSON.parse(c.valor) : [];
        if (Array.isArray(parsed)) items = parsed.map((x) => String(x));
      } catch {
        /* valor no parseable */
      }
      return (
        <div key={c.campo} className="min-w-0 sm:col-span-2 lg:col-span-3">
          <p className="text-xs text-muted-foreground">{c.etiqueta}</p>
          {c.falta || items.length === 0 ? (
            faltaLabel
          ) : (
            <ul className="mt-0.5 space-y-0.5">
              {items.map((a, i) => (
                <li key={i} className="text-sm font-medium text-foreground">
                  {a}
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }
    // Socios: se desglosan como lista (nombre · RUT · % participación).
    if (c.campo === "socios") {
      let items: { rut?: string; nombre?: string; participacion?: number }[] = [];
      try {
        const parsed = c.valor ? JSON.parse(c.valor) : [];
        if (Array.isArray(parsed)) items = parsed;
      } catch {
        /* valor no parseable */
      }
      return (
        <div key={c.campo} className="min-w-0 sm:col-span-2 lg:col-span-3">
          <p className="text-xs text-muted-foreground">{c.etiqueta}</p>
          {c.falta || items.length === 0 ? (
            faltaLabel
          ) : (
            <ul className="mt-0.5 space-y-0.5">
              {items.map((s, i) => (
                <li key={i} className="text-sm font-medium text-foreground">
                  {s.nombre ?? "—"}
                  {s.rut ? (
                    <span className="font-normal text-muted-foreground"> · {s.rut}</span>
                  ) : null}
                  {s.participacion != null ? (
                    <span className="font-normal text-muted-foreground"> · {s.participacion}%</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }
    const valor =
      c.valor && FECHA_RE.test(c.valor) ? fmtFecha(c.valor) : c.valor;
    return (
      <div key={c.campo} className="min-w-0">
        <p className="text-xs text-muted-foreground">{c.etiqueta}</p>
        {c.falta ? (
          faltaLabel
        ) : (
          <p className="truncate text-sm font-medium text-foreground" title={valor ?? ""}>
            {CAMPOS_JSON.has(c.campo) ? "Cargado ✓" : valor}
          </p>
        )}
      </div>
    );
  };

  const campoEdit = (c: CampoEmpresa) => (
    <div key={c.campo} className="min-w-0">
      <label className={`text-xs ${c.falta ? "font-medium text-red-600" : "text-muted-foreground"}`}>
        {c.etiqueta}
        {c.falta ? " · falta" : ""}
      </label>
      <input
        value={form[c.campo] ?? ""}
        onChange={(e) => set(c.campo, e.target.value)}
        placeholder={c.etiqueta}
        className={`mt-0.5 w-full rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          c.falta && !(form[c.campo] ?? "").trim() ? "border-red-400" : "border-input"
        }`}
      />
    </div>
  );

  const faltaDe = (campo: string) =>
    detalle.campos.find((c) => c.campo === campo)?.falta ?? false;

  const campoPwd = (campo: string, etiqueta: string) => {
    const visible = ver[campo];
    const falta = faltaDe(campo);
    return (
      <div className="min-w-0">
        <label className={`text-xs ${falta ? "font-medium text-red-600" : "text-muted-foreground"}`}>
          {etiqueta}
          {falta ? " · falta" : ""}
        </label>
        <div className="relative mt-0.5">
          <input
            type={visible ? "text" : "password"}
            value={form[campo] ?? ""}
            onChange={(e) => set(campo, e.target.value)}
            placeholder="••••••"
            autoComplete="off"
            className={`w-full rounded-md border bg-background px-2.5 py-1.5 pr-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              falta && !(form[campo] ?? "").trim() ? "border-red-400" : "border-input"
            }`}
          />
          <button
            type="button"
            onClick={() => setVer((p) => ({ ...p, [campo]: !p[campo] }))}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label={visible ? "Ocultar" : "Ver"}
          >
            {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Encabezado con % de cumplimiento */}
      <div className="card-soft rounded-xl bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-heading text-lg font-semibold tracking-tight">
              Datos de la empresa
            </h2>
            <p className="text-sm text-muted-foreground">
              {detalle.razon_social}
              {detalle.rut_empresa ? ` · ${detalle.rut_empresa}` : ""}
            </p>
          </div>
          <div className="text-right">
            <div className={`text-2xl font-bold ${colorPct(detalle.pct)}`}>
              {detalle.pct}%
            </div>
            <p className="text-xs text-muted-foreground">completado</p>
          </div>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all ${barPct(detalle.pct)}`}
            style={{ width: `${detalle.pct}%` }}
          />
        </div>
      </div>

      {/* Campos por grupo */}
      {GRUPOS_VISIBLES.map((g) => {
        const ro = soloLectura.filter((c) => c.grupo === g);
        const ed = editables.filter((c) => c.grupo === g);
        if (ro.length === 0 && ed.length === 0) return null;
        return (
          <div key={g} className="card-soft rounded-xl bg-card p-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {g}
            </p>
            {ro.length > 0 ? (
              <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {ro.map(campoRO)}
              </div>
            ) : null}
            {ed.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {ed.map(campoEdit)}
              </div>
            ) : null}
          </div>
        );
      })}

      {/* Accesos (credenciales) — ocultos, editables */}
      <div className="card-soft rounded-xl bg-card p-5">
        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Lock className="size-3.5" /> Accesos
        </p>
        <p className="mb-3 text-xs text-muted-foreground">
          Credenciales privadas. Se muestran ocultas; toca el ojo para verlas o edítalas.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {campoPwd("clave_sii", "Clave SII")}
          {campoPwd("previred_rut", "RUT Previred")}
          {campoPwd("previred_clave", "Clave Previred")}
          {campoPwd("afc_clave", "Clave AFC")}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          El acceso a AFC usa el RUT de la empresa.
        </p>
      </div>

      <div className="flex items-center justify-end gap-3">
        {detalle.pct >= 100 ? (
          <span className="flex items-center gap-1 text-sm text-emerald-600">
            <CheckCircle2 className="size-4" /> Datos completos
          </span>
        ) : null}
        <button
          onClick={guardar}
          disabled={guardando}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition disabled:opacity-50"
        >
          {guardando ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Guardar cambios
        </button>
      </div>
    </div>
  );
}
