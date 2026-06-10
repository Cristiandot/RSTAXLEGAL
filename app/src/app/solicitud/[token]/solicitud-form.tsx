"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle2, ClipboardCopy, ListChecks } from "lucide-react";
import { enviarSolicitud } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type InfoEmpresa = {
  razon_social: string;
  opciones: {
    cargo: string;
    jornada: string;
    horas: number | null;
    tipo: string | null;
  }[];
};

const selectCls =
  "h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

const AFPS = ["AFP Capital", "AFP Cuprum", "AFP Habitat", "AFP Modelo", "AFP PlanVital", "AFP Provida", "AFP Uno"];
const ESTADOS_CIVILES = ["Soltero(a)", "Casado(a)", "Divorciado(a)", "Viudo(a)", "Conviviente civil"];

function Campo({ label, children, span2 = false }: { label: string; children: React.ReactNode; span2?: boolean }) {
  return (
    <div className={`flex flex-col gap-1.5 ${span2 ? "sm:col-span-2" : ""}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

const DATOS_TRABAJADOR = [
  "Nombres y apellidos completos",
  "RUT (si está en trámite, indicarlo)",
  "Nacionalidad (si es extranjero, el país)",
  "Fecha de nacimiento",
  "Estado civil",
  "Dirección y comuna donde vive",
  "Teléfono y correo electrónico",
  "AFP",
  "Salud: Fonasa o Isapre (si Isapre, cuál)",
  "Banco, tipo y número de cuenta para el depósito del sueldo",
  "Foto de la cédula de identidad por ambos lados",
];

const MENSAJE_WHATSAPP = `Hola! Para preparar tu contrato de trabajo necesito que me envíes estos datos:

${DATOS_TRABAJADOR.map((d) => `• ${d}`).join("\n")}

¡Gracias!`;

function ChecklistDatos() {
  return (
    <Card className="card-soft border-transparent">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="size-4 text-[var(--brand-teal)]" />
            Datos que debes pedirle al trabajador
          </CardTitle>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(MENSAJE_WHATSAPP);
              toast.success("Mensaje copiado — pégalo en WhatsApp al trabajador");
            }}
          >
            <ClipboardCopy className="size-3.5" />
            Copiar mensaje para WhatsApp
          </Button>
        </div>
        <CardDescription>
          Antes de llenar el formulario, reúne esta información. Puedes copiar el
          mensaje listo y enviárselo al trabajador.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid list-disc gap-1 pl-5 text-sm text-muted-foreground sm:grid-cols-2">
          {DATOS_TRABAJADOR.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function SolicitudForm({ token, empresa }: { token: string; empresa: InfoEmpresa }) {
  const [enviando, startEnviar] = useTransition();
  const [enviada, setEnviada] = useState(false);

  const cargos = useMemo(() => [...new Set(empresa.opciones.map((o) => o.cargo))], [empresa]);
  const [cargo, setCargo] = useState(cargos[0] ?? "");
  const jornadas = useMemo(
    () => [...new Set(empresa.opciones.filter((o) => o.cargo === cargo).map((o) => o.jornada))],
    [empresa, cargo],
  );
  const [jornada, setJornada] = useState("");
  const jornadaActual = jornadas.includes(jornada) ? jornada : (jornadas[0] ?? "completa");

  const [tipoContrato, setTipoContrato] = useState("plazo_fijo");
  const [tipoNacionalidad, setTipoNacionalidad] = useState<"chilena" | "extranjera">("chilena");
  const [paisExtranjero, setPaisExtranjero] = useState("");
  const esExtranjero = tipoNacionalidad === "extranjera";

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const s = (k: string) => String(fd.get(k) ?? "").trim();

    startEnviar(async () => {
      const res = await enviarSolicitud(token, {
        nombres: s("nombres"),
        apellidos: s("apellidos"),
        rut: s("rut"),
        rut_provisorio: fd.get("rut_provisorio") === "on",
        nacionalidad: esExtranjero ? paisExtranjero.trim() || "Extranjera" : "Chilena",
        fecha_nacimiento: s("fecha_nacimiento") || null,
        estado_civil: s("estado_civil"),
        direccion: s("direccion"),
        comuna: s("comuna"),
        fono: s("fono"),
        correo: s("correo"),
        afp: s("afp"),
        salud: s("salud") === "Isapre" ? s("isapre_nombre") || "Isapre" : "Fonasa",
        banco: s("banco"),
        tipo_cuenta: s("tipo_cuenta"),
        numero_cuenta: s("numero_cuenta"),
        cargo,
        jornada_tipo: jornadaActual,
        horas_semanales: jornadaActual === "parcial" ? s("horas_semanales") : null,
        tipo_contrato: tipoContrato,
        fecha_inicio: s("fecha_inicio"),
        fecha_vencimiento: s("fecha_vencimiento") || null,
        sueldo_base: s("sueldo_base"),
        movilizacion: s("movilizacion") || "0",
        colacion: s("colacion") || "0",
        gratificacion:
          s("gratificacion") === "anual"
            ? "Anual (Art. 50 CT, tope 4,75 IMM)"
            : "Mensual (Art. 50 CT, tope 4,75 IMM prorrateado)",
        observaciones: s("observaciones"),
      });
      if (res.ok) {
        setEnviada(true);
        window.scrollTo({ top: 0 });
      } else {
        toast.error(res.error ?? "No se pudo enviar la solicitud.");
      }
    });
  }

  if (enviada) {
    return (
      <Card className="card-soft border-transparent">
        <CardHeader className="items-center text-center">
          <span className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="size-6" />
          </span>
          <CardTitle className="font-heading">Solicitud enviada</CardTitle>
          <CardDescription>
            El equipo de RS Tax &amp; Legal recibió la solicitud y preparará el
            contrato. Te contactaremos si falta algún antecedente.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button variant="outline" onClick={() => { setEnviada(false); }}>
            Enviar otra solicitud
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="text-center">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Solicitud de contrato de trabajo
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {empresa.razon_social} · Ficha de incorporación del nuevo trabajador
        </p>
      </div>

      <ChecklistDatos />

      <Card className="card-soft border-transparent">
        <CardHeader>
          <CardTitle className="text-base">Datos del trabajador</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Campo label="Nombres"><Input name="nombres" required /></Campo>
          <Campo label="Apellidos"><Input name="apellidos" required /></Campo>
          <Campo label="RUT"><Input name="rut" placeholder="12.345.678-9" /></Campo>
          <div className="flex items-end gap-2 pb-1.5">
            <Checkbox id="rut_provisorio" name="rut_provisorio" />
            <Label htmlFor="rut_provisorio" className="text-xs">
              RUT provisorio / en trámite (trabajador extranjero)
            </Label>
          </div>
          <Campo label="Nacionalidad">
            <select
              className={selectCls}
              value={tipoNacionalidad}
              onChange={(e) => setTipoNacionalidad(e.target.value as "chilena" | "extranjera")}
            >
              <option value="chilena">Chilena</option>
              <option value="extranjera">Extranjera</option>
            </select>
            {esExtranjero ? (
              <>
                <Input
                  value={paisExtranjero}
                  onChange={(e) => setPaisExtranjero(e.target.value)}
                  placeholder="País (ej. Venezuela, Perú, Colombia…)"
                  required
                />
                <p className="text-xs text-sky-700">
                  El contrato incluirá las cláusulas para trabajador extranjero.
                </p>
              </>
            ) : null}
          </Campo>
          <Campo label="Fecha de nacimiento"><Input name="fecha_nacimiento" type="date" required /></Campo>
          <Campo label="Estado civil">
            <select name="estado_civil" className={selectCls} defaultValue="Soltero(a)">
              {ESTADOS_CIVILES.map((e) => <option key={e}>{e}</option>)}
            </select>
          </Campo>
          <Campo label="Teléfono"><Input name="fono" inputMode="tel" required /></Campo>
          <Campo label="Dirección"><Input name="direccion" required /></Campo>
          <Campo label="Comuna"><Input name="comuna" required /></Campo>
          <Campo label="Correo electrónico" span2><Input name="correo" type="email" required /></Campo>
          <Campo label="AFP">
            <select name="afp" className={selectCls} defaultValue="AFP Modelo">
              {AFPS.map((a) => <option key={a}>{a}</option>)}
            </select>
          </Campo>
          <Campo label="Salud">
            <div className="flex gap-2">
              <select name="salud" className={`${selectCls} flex-1`} defaultValue="Fonasa">
                <option>Fonasa</option>
                <option>Isapre</option>
              </select>
              <Input name="isapre_nombre" placeholder="Nombre Isapre" className="flex-1" />
            </div>
          </Campo>
          <Campo label="Banco (depósito remuneración)"><Input name="banco" /></Campo>
          <Campo label="Tipo y N° de cuenta">
            <div className="flex gap-2">
              <select name="tipo_cuenta" className={`${selectCls} flex-1`} defaultValue="Cuenta RUT">
                <option>Cuenta RUT</option>
                <option>Cuenta Vista</option>
                <option>Cuenta Corriente</option>
                <option>Cuenta de Ahorro</option>
              </select>
              <Input name="numero_cuenta" placeholder="N°" className="flex-1" />
            </div>
          </Campo>
        </CardContent>
      </Card>

      <Card className="card-soft border-transparent">
        <CardHeader>
          <CardTitle className="text-base">Contrato</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Campo label="Cargo">
            <select className={selectCls} value={cargo} onChange={(e) => { setCargo(e.target.value); setJornada(""); }}>
              {cargos.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Campo>
          <Campo label="Jornada">
            <select className={selectCls} value={jornadaActual} onChange={(e) => setJornada(e.target.value)}>
              {jornadas.map((j) => (
                <option key={j} value={j}>{j === "completa" ? "Completa (full time)" : "Parcial (part time)"}</option>
              ))}
            </select>
          </Campo>
          {jornadaActual === "parcial" ? (
            <Campo label="Horas semanales">
              <Input name="horas_semanales" type="number" min={1} max={28} placeholder="ej. 21" required />
            </Campo>
          ) : null}
          <Campo label="Tipo de contrato">
            <select className={selectCls} value={tipoContrato} onChange={(e) => setTipoContrato(e.target.value)}>
              <option value="plazo_fijo">Plazo fijo</option>
              <option value="indefinido">Indefinido</option>
            </select>
          </Campo>
          <Campo label="Fecha de inicio"><Input name="fecha_inicio" type="date" required /></Campo>
          {tipoContrato === "plazo_fijo" ? (
            <Campo label="Fecha de término"><Input name="fecha_vencimiento" type="date" required /></Campo>
          ) : null}
        </CardContent>
      </Card>

      <Card className="card-soft border-transparent">
        <CardHeader>
          <CardTitle className="text-base">Remuneración</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Campo label="Sueldo base ($)"><Input name="sueldo_base" type="number" min={1} required /></Campo>
          <Campo label="Movilización ($)"><Input name="movilizacion" type="number" min={0} defaultValue={0} /></Campo>
          <Campo label="Colación ($)"><Input name="colacion" type="number" min={0} defaultValue={0} /></Campo>
          <Campo label="Gratificación legal (Art. 50 CT)">
            <select name="gratificacion" className={selectCls} defaultValue="mensual">
              <option value="mensual">Mensual (prorrateada mes a mes)</option>
              <option value="anual">Anual</option>
            </select>
          </Campo>
          {jornadaActual === "parcial" ? (
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800 sm:col-span-3">
              <strong>Referencia sueldo mínimo proporcional</strong> (mínimo
              $539.000 por 42 hrs semanales): <strong>20 hrs → $256.667</strong>{" "}
              · <strong>30 hrs → $385.000</strong>. El sueldo base no puede ser
              inferior al proporcional de las horas pactadas.
            </div>
          ) : null}
          <Campo label="Observaciones" span2>
            <Textarea
              name="observaciones"
              rows={3}
              placeholder="Si el contrato lleva asignación de pérdida de caja, indícalo aquí (monto). Si lleva bono o comisión, explica cómo se obtiene: porcentaje, metas o tabla de comisiones, y si es fijo o variable."
            />
          </Campo>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={enviando}>
          {enviando ? "Enviando…" : "Enviar solicitud"}
        </Button>
      </div>
    </form>
  );
}
