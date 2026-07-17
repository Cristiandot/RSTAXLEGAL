"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Check, Loader2, UserRound } from "lucide-react";
import { guardarTrabajador } from "./actions";

export type CampoFaltante = {
  campo: string;
  etiqueta: string;
  grupo: string | null;
  selector: string | null;
};
export type TrabajadorFalta = {
  id: string;
  nombre: string;
  rut: string | null;
  cargo: string | null;
  campos: CampoFaltante[];
};
export type NominaInfo = {
  razon_social: string;
  trabajadores: TrabajadorFalta[];
};

// Opciones para los campos con desplegable. Los que no están acá van como texto.
const OPCIONES: Record<string, { v: string; l: string }[]> = {
  estado_civil: ["Soltero", "Casado", "Divorciado", "Viudo", "Separado", "Conviviente Civil"].map((x) => ({ v: x, l: x })),
  sexo: [{ v: "Masculino", l: "Masculino" }, { v: "Femenino", l: "Femenino" }],
  jornada_tipo: [{ v: "completa", l: "Completa" }, { v: "parcial", l: "Parcial" }],
  tipo_contrato: [
    { v: "indefinido", l: "Indefinido" },
    { v: "plazo_fijo", l: "Plazo fijo" },
    { v: "por_obra", l: "Por obra o faena" },
  ],
  regimen_previsional: [{ v: "afp", l: "AFP" }, { v: "ips", l: "IPS (ex-INP)" }, { v: "sip", l: "SIP" }],
  afp: ["Capital", "Cuprum", "Habitat", "Modelo", "PlanVital", "Provida", "Uno"].map((x) => ({ v: x, l: x })),
  salud: ["Fonasa", "Banmédica", "Consalud", "Cruz Blanca", "Colmena", "Nueva Masvida", "Vida Tres", "Esencial"].map((x) => ({ v: x, l: x })),
  discapacidad: [
    { v: "no", l: "No" },
    { v: "discapacidad_compin", l: "Discapacidad certificada por la COMPIN" },
  ],
};

function tipoInput(campo: string): string {
  if (campo.startsWith("fecha_")) return "date";
  if (campo.startsWith("correo")) return "email";
  if (campo.startsWith("fono") || campo.startsWith("telefono")) return "tel";
  return "text";
}

const inputCls =
  "h-10 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#17A2B8]";

function TarjetaTrabajador({
  token,
  t,
  onListo,
}: {
  token: string;
  t: TrabajadorFalta;
  onListo: () => void;
}) {
  const [valores, setValores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [listo, setListo] = useState(false);

  async function guardar() {
    const updates: Record<string, string> = {};
    for (const [k, v] of Object.entries(valores)) if (v.trim()) updates[k] = v.trim();
    if (Object.keys(updates).length === 0) {
      toast.error("Completa al menos un dato antes de guardar.");
      return;
    }
    setGuardando(true);
    const r = await guardarTrabajador(token, t.id, updates);
    setGuardando(false);
    if (r.ok) {
      toast.success(`Datos de ${t.nombre} guardados (${r.campos} campos).`);
      setListo(true);
      onListo();
    } else {
      toast.error(r.error ?? "No se pudo guardar.");
    }
  }

  if (listo) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <Check className="size-5 shrink-0 text-emerald-600" />
        <div>
          <p className="font-medium text-emerald-900">{t.nombre}</p>
          <p className="text-xs text-emerald-700">¡Listo! Datos enviados a RS Tax &amp; Legal.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-input bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-full bg-[#0B2545]/5 text-[#0B2545]">
          <UserRound className="size-4" />
        </span>
        <div>
          <p className="font-medium leading-tight">{t.nombre}</p>
          <p className="text-xs text-muted-foreground">
            {t.rut ?? "sin RUT"}{t.cargo ? ` · ${t.cargo}` : ""} · faltan {t.campos.length} datos
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {t.campos.map((c) => {
          const ops = c.selector ? OPCIONES[c.selector] : undefined;
          return (
            <label key={c.campo} className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">{c.etiqueta}</span>
              {ops ? (
                <select
                  className={inputCls}
                  value={valores[c.campo] ?? ""}
                  onChange={(e) => setValores((s) => ({ ...s, [c.campo]: e.target.value }))}
                >
                  <option value="">Seleccionar…</option>
                  {ops.map((o) => (
                    <option key={o.v} value={o.v}>{o.l}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={tipoInput(c.campo)}
                  className={inputCls}
                  value={valores[c.campo] ?? ""}
                  onChange={(e) => setValores((s) => ({ ...s, [c.campo]: e.target.value }))}
                />
              )}
            </label>
          );
        })}
      </div>

      <div className="mt-3 flex justify-end">
        <button
          onClick={guardar}
          disabled={guardando}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-[#0B2545] px-4 text-sm font-medium text-white hover:bg-[#0B2545]/90 disabled:opacity-60"
        >
          {guardando ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Guardar
        </button>
      </div>
    </div>
  );
}

export function CompletarNominaClient({ token, info }: { token: string; info: NominaInfo }) {
  const total = info.trabajadores.length;
  const [listos, setListos] = useState(0);

  const sinPendientes = useMemo(() => total > 0 && listos >= total, [total, listos]);

  return (
    <main className="min-h-svh bg-[#F4F6F8] px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
          <Image src="/logo-claro.png" alt="RS Tax & Legal" width={200} height={56} className="mx-auto mb-3 h-10 w-auto" />
          <h1 className="font-heading text-xl font-semibold">Completar datos de trabajadores</h1>
          <p className="mt-1 text-sm text-muted-foreground">{info.razon_social}</p>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
            Nos faltan algunos datos de tus trabajadores para tener las fichas al día.
            Completa lo que puedas y presiona <strong>Guardar</strong> en cada uno. Se envía directo a RS Tax &amp; Legal.
          </p>
          {total > 0 ? (
            <p className="mt-3 inline-block rounded-full bg-[#0B2545]/5 px-3 py-1 text-xs font-medium text-[#0B2545]">
              {listos} de {total} trabajadores completados
            </p>
          ) : null}
        </div>

        {total === 0 || sinPendientes ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
            <Check className="mx-auto mb-2 size-8 text-emerald-600" />
            <p className="font-medium text-emerald-900">
              {total === 0 ? "¡Todo al día!" : "¡Gracias! Recibimos todos los datos."}
            </p>
            <p className="mt-1 text-sm text-emerald-700">
              No hay datos pendientes de tus trabajadores. Puedes cerrar esta página.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {info.trabajadores.map((t) => (
              <TarjetaTrabajador key={t.id} token={token} t={t} onListo={() => setListos((n) => n + 1)} />
            ))}
          </div>
        )}

        <p className="text-center text-[11px] text-muted-foreground">
          Rodríguez Samith Tax &amp; Legal · Los datos se tratan conforme a la Ley 21.719 y se usan
          solo para las gestiones laborales de tu empresa.
        </p>
      </div>
    </main>
  );
}
