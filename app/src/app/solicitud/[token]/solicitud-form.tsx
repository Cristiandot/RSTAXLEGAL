"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle2, ClipboardCopy, ListChecks } from "lucide-react";
import { enviarSolicitud, enviarGestion } from "./actions";
import { MOTIVOS_AMONESTACION } from "@/lib/amonestaciones";
import { TIPOS_PERMISO } from "@/lib/permisos";
import { formatFecha } from "@/lib/format";
import { calcularVacaciones } from "@/lib/feriados";
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

export type TrabajadorRegistrado = {
  id: string;
  nombres: string;
  apellidos: string;
  rut: string | null;
  cargo: string | null;
  fecha_inicio: string | null;
  tipo_contrato: string | null;
  fecha_vencimiento: string | null;
};

export type InfoEmpresa = {
  razon_social: string;
  opciones: {
    cargo: string;
    jornada: string;
    horas: number | null;
    tipo: string | null;
    nacionalidad: string;
  }[];
  trabajadores: TrabajadorRegistrado[];
};

const selectCls =
  "h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

const AFPS = ["AFP Capital", "AFP Cuprum", "AFP Habitat", "AFP Modelo", "AFP PlanVital", "AFP Provida", "AFP Uno"];
const ESTADOS_CIVILES = ["Soltero(a)", "Casado(a)", "Divorciado(a)", "Viudo(a)", "Conviviente civil"];

type TipoGestion = "contrato" | "anexo" | "amonestacion" | "finiquito" | "vacaciones" | "permiso";

const GESTIONES: { value: TipoGestion; label: string }[] = [
  { value: "contrato", label: "Contrato nuevo (trabajador que se incorpora)" },
  { value: "anexo", label: "Anexo de contrato (modificación o renovación)" },
  { value: "amonestacion", label: "Carta de amonestación" },
  { value: "finiquito", label: "Finiquito / cálculo de despido" },
  { value: "vacaciones", label: "Papeleta de vacaciones" },
  { value: "permiso", label: "Permiso (con o sin goce de remuneraciones)" },
];

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
  "Salud: Fonasa o Isapre (si Isapre, cuál y el valor del plan en UF o $)",
];

/** "3,2" → "3.2" · "120.000" → "120000" (formato es-CL → numérico). */
function normalizarMonto(v: string): string {
  return v.trim().replace(/\./g, "").replace(",", ".");
}

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

function NotaMinimos() {
  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800 sm:col-span-3">
      <strong>Sueldos mínimos de referencia</strong> (Ingreso Mínimo Mensual
      $539.000 por jornada completa de 42 hrs; proporcional según horas):{" "}
      <strong>42 hrs → $539.000</strong> · <strong>30 hrs → $385.000</strong> ·{" "}
      <strong>20 hrs → $256.667</strong>. El sueldo base no puede ser inferior
      al mínimo proporcional de las horas pactadas.
    </div>
  );
}

export function SolicitudForm({ token, empresa }: { token: string; empresa: InfoEmpresa }) {
  const [enviando, startEnviar] = useTransition();
  const [enviada, setEnviada] = useState(false);
  const [gestion, setGestion] = useState<TipoGestion>("contrato");
  // "" = sin elegir · "manual" = trabajador que no está en la lista · uuid = registrado
  const [trabajadorSel, setTrabajadorSel] = useState("");
  const [anexoTipo, setAnexoTipo] = useState("renovacion_fijo_a_fijo");
  const [anexoHoras, setAnexoHoras] = useState("");
  const [causal, setCausal] = useState("");
  const [vacInicio, setVacInicio] = useState("");
  const [vacFin, setVacFin] = useState("");
  const calcVac = useMemo(
    () => (vacInicio && vacFin ? calcularVacaciones(vacInicio, vacFin) : null),
    [vacInicio, vacFin],
  );

  // Permiso: el catálogo fija el goce en los legales; en el resto lo elige el cliente.
  const [permisoTipo, setPermisoTipo] = useState("sin_goce");
  const [permisoGoce, setPermisoGoce] = useState("sin");
  const [permisoUnidad, setPermisoUnidad] = useState<"dias" | "horas">("dias");
  const [perDesde, setPerDesde] = useState("");
  const [perHasta, setPerHasta] = useState("");
  const permisoDef = TIPOS_PERMISO.find((t) => t.value === permisoTipo) ?? TIPOS_PERMISO[0];
  const goceFijo = permisoDef.goce !== null;
  const goceActual = goceFijo ? (permisoDef.goce as string) : permisoGoce;
  const calcPermiso = useMemo(() => {
    if (permisoUnidad !== "dias" || !perDesde || !perHasta) return null;
    return calcularVacaciones(perDesde, perHasta);
  }, [permisoUnidad, perDesde, perHasta]);
  const permisoDiasCorridos = useMemo(() => {
    if (permisoUnidad !== "dias" || !perDesde || !perHasta) return null;
    const ini = new Date(`${perDesde}T00:00:00Z`).getTime();
    const fin = new Date(`${perHasta}T00:00:00Z`).getTime();
    if (Number.isNaN(ini) || Number.isNaN(fin) || fin < ini) return null;
    return Math.round((fin - ini) / 86_400_000) + 1;
  }, [permisoUnidad, perDesde, perHasta]);

  const cargos = useMemo(() => [...new Set(empresa.opciones.map((o) => o.cargo))], [empresa]);
  const [cargo, setCargo] = useState(cargos[0] ?? "");
  const jornadas = useMemo(
    () => [...new Set(empresa.opciones.filter((o) => o.cargo === cargo).map((o) => o.jornada))],
    [empresa, cargo],
  );
  const [jornada, setJornada] = useState("");
  const jornadaActual = jornadas.includes(jornada) ? jornada : (jornadas[0] ?? "completa");

  const [tipoNacionalidad, setTipoNacionalidad] = useState<"chilena" | "extranjera">("chilena");
  const [paisExtranjero, setPaisExtranjero] = useState("");
  const esExtranjero = tipoNacionalidad === "extranjera";

  const [salud, setSalud] = useState("Fonasa");
  const [planUnidad, setPlanUnidad] = useState("UF");
  const [gratifTipo, setGratifTipo] = useState("25");

  const nacBuscada = esExtranjero ? "extranjero" : "chileno";
  const opcionesCombo = useMemo(
    () =>
      empresa.opciones.filter(
        (o) => o.cargo === cargo && o.jornada === jornadaActual && o.nacionalidad === nacBuscada,
      ),
    [empresa, cargo, jornadaActual, nacBuscada],
  );
  const comboSinPlantilla = esExtranjero && opcionesCombo.length === 0;
  const tiposDisponibles = useMemo(() => {
    const base = opcionesCombo.length > 0
      ? opcionesCombo
      : empresa.opciones.filter((o) => o.cargo === cargo && o.jornada === jornadaActual);
    return [...new Set(base.map((o) => o.tipo).filter(Boolean))] as string[];
  }, [opcionesCombo, empresa, cargo, jornadaActual]);
  const [tipoContrato, setTipoContrato] = useState("");
  const tipoActual = tiposDisponibles.includes(tipoContrato)
    ? tipoContrato
    : (tiposDisponibles[0] ?? "plazo_fijo");

  const esContrato = gestion === "contrato";
  const esAnexo = gestion === "anexo";
  const esGestionRrhh =
    gestion === "amonestacion" ||
    gestion === "finiquito" ||
    gestion === "vacaciones" ||
    gestion === "permiso";

  // Para todo lo que no es contrato nuevo, el trabajador se elige de la lista
  // de registrados (RSTL ya tiene sus datos); el tipeo manual queda de respaldo.
  const usaListaTrabajadores = !esContrato && empresa.trabajadores.length > 0;
  const trabajador =
    usaListaTrabajadores && trabajadorSel !== "" && trabajadorSel !== "manual"
      ? (empresa.trabajadores.find((t) => t.id === trabajadorSel) ?? null)
      : null;
  const entradaManual = esContrato || !usaListaTrabajadores || trabajadorSel === "manual";

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const s = (k: string) => String(fd.get(k) ?? "").trim();

    const esIsapre = esContrato && s("salud") === "Isapre";
    const planValor = esIsapre ? normalizarMonto(s("plan_valor")) : "";
    if (esIsapre && (planValor === "" || Number.isNaN(Number(planValor)))) {
      toast.error(
        "Indica el valor del plan de Isapre (un número; usa coma para decimales de UF, ej. 3,2).",
      );
      return;
    }

    startEnviar(async () => {
      let res: { ok: boolean; error?: string };

      if (esGestionRrhh) {
        const datos: Record<string, string> =
          gestion === "amonestacion"
            ? {
                fecha_hechos: s("fecha_hechos"),
                motivo: s("motivo"),
                descripcion: s("descripcion"),
              }
            : gestion === "finiquito"
              ? {
                  causal: s("causal"),
                  fecha_aviso: s("fecha_aviso"),
                  fecha_termino: s("fecha_termino"),
                  aviso_modalidad: s("aviso_modalidad"),
                }
              : gestion === "permiso"
                ? {
                    tipo_permiso: permisoTipo,
                    goce: goceActual,
                    unidad: permisoUnidad,
                    fecha_desde: s("permiso_desde"),
                    fecha_hasta:
                      permisoUnidad === "horas" ? s("permiso_desde") : s("permiso_hasta"),
                    horas: permisoUnidad === "horas" ? s("permiso_horas") : "",
                  }
                : {
                    fecha_inicio: s("fecha_inicio_vac"),
                    fecha_termino: s("fecha_termino_vac"),
                  };

        res = await enviarGestion(token, {
          tipo: gestion,
          trabajador_id: trabajador?.id ?? null,
          nombres: trabajador ? trabajador.nombres : s("nombres"),
          apellidos: trabajador ? trabajador.apellidos : s("apellidos"),
          rut: trabajador ? (trabajador.rut ?? "") : s("rut"),
          observaciones: s("observaciones"),
          datos,
        });
      } else {
        const base = {
          tipo_solicitud: gestion,
          trabajador_id: trabajador?.id ?? null,
          nombres: trabajador ? trabajador.nombres : s("nombres"),
          apellidos: trabajador ? trabajador.apellidos : s("apellidos"),
          rut: trabajador ? (trabajador.rut ?? "") : s("rut"),
          rut_provisorio: fd.get("rut_provisorio") === "on",
          nacionalidad: esExtranjero ? paisExtranjero.trim() || "Extranjera" : "Chilena",
          observaciones: s("observaciones"),
        };
        const payload = esAnexo
          ? {
              ...base,
              anexo_tipo: anexoTipo,
              anexo_detalle: s("anexo_detalle"),
              fecha_inicio: s("fecha_contrato_original"),
              fecha_vencimiento: s("fecha_nueva_termino") || null,
              anexo_horas: anexoTipo === "cambio_jornada" ? s("anexo_horas") : null,
              anexo_fecha_cambio:
                anexoTipo === "cambio_jornada" ? s("anexo_fecha_cambio") : null,
              cargo: anexoTipo === "cambio_jornada" ? s("anexo_cargo") : null,
            }
          : {
              ...base,
              fecha_nacimiento: s("fecha_nacimiento") || null,
              estado_civil: s("estado_civil"),
              direccion: s("direccion"),
              comuna: s("comuna"),
              fono: s("fono"),
              correo: s("correo"),
              afp: s("afp"),
              salud: esIsapre ? s("isapre_nombre") || "Isapre" : "Fonasa",
              salud_plan_unidad: esIsapre ? s("plan_unidad") : null,
              salud_plan_valor: esIsapre ? planValor : null,
              cargo,
              jornada_tipo: jornadaActual,
              horas_semanales: jornadaActual === "parcial" ? s("horas_semanales") : null,
              tipo_contrato: tipoActual,
              fecha_inicio: s("fecha_inicio"),
              fecha_vencimiento: s("fecha_vencimiento") || null,
              sueldo_base: s("sueldo_base"),
              movilizacion: s("movilizacion") || "0",
              colacion: s("colacion") || "0",
              perdida_caja: s("perdida_caja") || "0",
              gratificacion:
                gratifTipo === "sin"
                  ? "Sin gratificación"
                  : gratifTipo === "tope"
                    ? "Tope legal: 4,75 IMM anual, prorrateado mensual"
                    : gratifTipo === "manual"
                      ? `Manual: $${Number(s("gratificacion_monto") || 0).toLocaleString("es-CL")} mensuales`
                      : "25% de lo devengado, con tope de 4,75 IMM anual (Art. 50 CT)",
              gratificacion_tipo: gratifTipo,
              gratificacion_monto:
                gratifTipo === "manual" ? s("gratificacion_monto") : null,
            };
        res = await enviarSolicitud(token, payload);
      }

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
            El equipo de RS Tax &amp; Legal la revisará y te contactará al correo
            indicado. Si falta algún antecedente, te lo pediremos.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button variant="outline" onClick={() => setEnviada(false)}>
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
          Portal de solicitudes
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {empresa.razon_social} · RS Tax &amp; Legal
        </p>
      </div>

      <Card className="card-soft border-transparent">
        <CardContent className="pt-4">
          <Campo label="¿Qué necesitas solicitar?">
            <select
              className={selectCls}
              value={gestion}
              onChange={(e) => {
                setGestion(e.target.value as TipoGestion);
                setTrabajadorSel("");
              }}
            >
              {GESTIONES.map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
          </Campo>
        </CardContent>
      </Card>

      {esContrato ? <ChecklistDatos /> : null}

      {/* ================= TRABAJADOR ================= */}
      <Card className="card-soft border-transparent">
        <CardHeader>
          <CardTitle className="text-base">
            {esContrato ? "Datos del trabajador" : "Trabajador"}
          </CardTitle>
          {esGestionRrhh || esAnexo ? (
            <CardDescription>El trabajador ya contratado al que corresponde esta gestión.</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {usaListaTrabajadores ? (
            <Campo label="¿Quién es el trabajador?" span2>
              <select
                className={selectCls}
                value={trabajadorSel}
                onChange={(e) => setTrabajadorSel(e.target.value)}
                required
              >
                <option value="">— Selecciona al trabajador —</option>
                {empresa.trabajadores.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.apellidos} {t.nombres}
                    {t.rut ? ` — ${t.rut}` : ""}
                  </option>
                ))}
                <option value="manual">Otro trabajador (no está en la lista)</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Trabajadores registrados con RS Tax &amp; Legal (activos o con
                contrato reciente). Si no aparece, elige la última opción e
                ingresa sus datos.
              </p>
            </Campo>
          ) : null}
          {trabajador ? (
            <div className="rounded-lg border border-input bg-muted/40 p-3 text-sm sm:col-span-2">
              <p className="font-medium">
                {trabajador.nombres} {trabajador.apellidos}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {trabajador.rut ? `RUT ${trabajador.rut}` : "RUT en trámite"}
                {trabajador.cargo ? ` · ${trabajador.cargo}` : ""}
                {trabajador.fecha_inicio
                  ? ` · Contrato desde el ${formatFecha(trabajador.fecha_inicio)}`
                  : ""}
                {trabajador.tipo_contrato === "plazo_fijo" && trabajador.fecha_vencimiento
                  ? ` (plazo fijo hasta el ${formatFecha(trabajador.fecha_vencimiento)})`
                  : ""}
              </p>
            </div>
          ) : null}
          {entradaManual ? (
            <>
              <Campo label="Nombres"><Input name="nombres" required /></Campo>
              <Campo label="Apellidos"><Input name="apellidos" required /></Campo>
              <Campo label="RUT"><Input name="rut" placeholder="12.345.678-9" required={esGestionRrhh} /></Campo>
            </>
          ) : null}
          {!esGestionRrhh && entradaManual ? (
            <div className="flex items-end gap-2 pb-1.5">
              <Checkbox id="rut_provisorio" name="rut_provisorio" />
              <Label htmlFor="rut_provisorio" className="text-xs">
                RUT provisorio / en trámite (trabajador extranjero)
              </Label>
            </div>
          ) : null}
          {!esGestionRrhh && entradaManual ? (
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
                  {esContrato ? (
                    <p className="text-xs text-sky-700">
                      El contrato incluirá las cláusulas para trabajador extranjero.
                    </p>
                  ) : null}
                </>
              ) : null}
            </Campo>
          ) : null}
          {esContrato ? (
            <>
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
                <select
                  name="salud"
                  className={selectCls}
                  value={salud}
                  onChange={(e) => setSalud(e.target.value)}
                >
                  <option>Fonasa</option>
                  <option>Isapre</option>
                </select>
              </Campo>
              {salud === "Isapre" ? (
                <div className="grid gap-2 sm:col-span-2 sm:grid-cols-3">
                  <Campo label="Nombre de la Isapre">
                    <Input
                      name="isapre_nombre"
                      placeholder="ej. Colmena, Banmédica…"
                      required
                    />
                  </Campo>
                  <Campo label="Plan pactado en">
                    <select
                      name="plan_unidad"
                      className={selectCls}
                      value={planUnidad}
                      onChange={(e) => setPlanUnidad(e.target.value)}
                    >
                      <option value="UF">UF</option>
                      <option value="CLP">Pesos ($)</option>
                    </select>
                  </Campo>
                  <Campo
                    label={
                      planUnidad === "UF" ? "Valor del plan (UF)" : "Valor del plan ($)"
                    }
                  >
                    <Input
                      name="plan_valor"
                      inputMode="decimal"
                      placeholder={planUnidad === "UF" ? "ej. 3,2" : "ej. 120.000"}
                      required
                    />
                  </Campo>
                </div>
              ) : null}
            </>
          ) : null}
        </CardContent>
      </Card>

      {/* ================= ANEXO ================= */}
      {esAnexo ? (
        <Card className="card-soft border-transparent">
          <CardHeader>
            <CardTitle className="text-base">Anexo solicitado</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Campo label="Tipo de anexo" span2>
              <select className={selectCls} value={anexoTipo} onChange={(e) => setAnexoTipo(e.target.value)}>
                <option value="renovacion_fijo_a_fijo">Renovación de plazo fijo a plazo fijo (nuevo plazo)</option>
                <option value="renovacion_indefinido">Renovación: pasa a contrato indefinido</option>
                <option value="cambio_jornada">Cambio de jornada (de completa a parcial, o cambio de horas)</option>
                <option value="otro">Otro (explicar abajo)</option>
              </select>
            </Campo>
            <Campo label="Fecha del contrato original">
              <Input
                key={trabajadorSel}
                name="fecha_contrato_original"
                type="date"
                defaultValue={trabajador?.fecha_inicio ?? ""}
                required
              />
            </Campo>
            {anexoTipo === "renovacion_fijo_a_fijo" ? (
              <Campo label="Nueva fecha de término">
                <Input name="fecha_nueva_termino" type="date" required />
              </Campo>
            ) : null}
            {anexoTipo === "cambio_jornada" ? (
              <>
                <Campo label="Cargo del trabajador" span2>
                  <select
                    key={trabajadorSel}
                    name="anexo_cargo"
                    className={selectCls}
                    defaultValue={
                      (trabajador?.cargo
                        ? cargos.find((c) => c.toLowerCase() === trabajador.cargo!.toLowerCase())
                        : undefined) ?? (cargos[0] ?? "")
                    }
                    required
                  >
                    {cargos.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Importante: el cargo determina la malla de turnos que lleva
                    el anexo.
                  </p>
                </Campo>
                <Campo label="Nuevas horas semanales">
                  <Input
                    name="anexo_horas"
                    type="number"
                    min={1}
                    max={42}
                    required
                    value={anexoHoras}
                    onChange={(e) => setAnexoHoras(e.target.value)}
                    placeholder="ej. 20"
                  />
                </Campo>
                <Campo label="Desde qué fecha rige la nueva jornada">
                  <Input name="anexo_fecha_cambio" type="date" required />
                </Campo>
                {Number(anexoHoras) > 28 ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 sm:col-span-2">
                    Sobre 28 horas semanales ya no es jornada parcial legal (el
                    tope es 2/3 de 42 hrs, Art. 40 bis CT). Podemos hacerlo
                    igual como reducción de jornada ordinaria — el equipo legal
                    lo revisará.
                  </p>
                ) : null}
              </>
            ) : null}
            {anexoTipo === "otro" ? (
              <Campo label="¿Qué necesitas que diga este anexo?" span2>
                <Textarea
                  name="anexo_detalle"
                  rows={3}
                  required
                  placeholder="Explícalo con palabras simples: por ejemplo, cambio de sueldo, cambio de funciones, nuevo horario, etc…"
                />
              </Campo>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* ================= AMONESTACIÓN ================= */}
      {gestion === "amonestacion" ? (
        <Card className="card-soft border-transparent">
          <CardHeader>
            <CardTitle className="text-base">Carta de amonestación</CardTitle>
            <CardDescription>
              Cuéntanos qué pasó. El equipo legal redactará la carta y te la
              enviará para firmar y entregar.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Campo label="Fecha de los hechos">
              <Input name="fecha_hechos" type="date" required />
            </Campo>
            <Campo label="Motivo de la amonestación">
              <select name="motivo" className={selectCls} defaultValue="atrasos" required>
                {MOTIVOS_AMONESTACION.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </Campo>
            <Campo label="¿Qué ocurrió? Descríbelo con tus palabras" span2>
              <Textarea
                name="descripcion"
                rows={4}
                required
                placeholder="Ejemplo: llegó 2 horas atrasado el lunes 9 y el martes 10 sin avisar; no usó los elementos de seguridad; abandonó el turno antes de la hora, etc…"
              />
            </Campo>
          </CardContent>
        </Card>
      ) : null}

      {/* ================= FINIQUITO ================= */}
      {gestion === "finiquito" ? (
        <Card className="card-soft border-transparent">
          <CardHeader>
            <CardTitle className="text-base">Finiquito / despido</CardTitle>
            <CardDescription>
              Solo necesitamos saber quién, la causal y las fechas — el cálculo
              lo hacemos nosotros con la información que ya tenemos y te lo
              enviamos para revisión antes de cualquier paso.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Campo label="Motivo del término" span2>
              <select name="causal" className={selectCls} value={causal} onChange={(e) => setCausal(e.target.value)} required>
                <option value="">Selecciona…</option>
                <option value="renuncia">Renuncia del trabajador</option>
                <option value="mutuo_acuerdo">Mutuo acuerdo</option>
                <option value="vencimiento_plazo">Se cumple el plazo del contrato (no se renueva)</option>
                <option value="conclusion_obra">Termina la obra o servicio</option>
                <option value="necesidades_empresa">Necesidades de la empresa (Art. 161)</option>
                <option value="conducta">Despido por conducta del trabajador (Art. 160)</option>
                <option value="no_seguro">No estoy seguro (explicar en observaciones)</option>
              </select>
            </Campo>
            {causal === "necesidades_empresa" ? (
              <Campo label="Esta causal lleva mes de aviso — ¿cómo lo harás?" span2>
                <select name="aviso_modalidad" className={selectCls} defaultValue="" required>
                  <option value="">Selecciona…</option>
                  <option value="avisar_30">Voy a avisar con 30 días de anticipación</option>
                  <option value="pagar_mes">Voy a pagar el mes de aviso (indemnización sustitutiva)</option>
                </select>
              </Campo>
            ) : (
              <input type="hidden" name="aviso_modalidad" value="" />
            )}
            <Campo label="Fecha de aviso del despido">
              <Input name="fecha_aviso" type="date" required />
            </Campo>
            <Campo label="Fecha de término de la relación laboral">
              <Input name="fecha_termino" type="date" required />
            </Campo>
            <p className="rounded-lg border border-sky-200 bg-sky-50 p-2.5 text-xs text-sky-800 sm:col-span-2">
              No hay problema con que la fecha de aviso y la de término sean el
              mismo día — por ejemplo, si es por vencimiento del plazo, o si es
              otra causal pero estás dispuesto a pagar el mes de aviso.
            </p>
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 sm:col-span-2">
              Importante: no comuniques el despido al trabajador hasta que el
              equipo legal revise esta solicitud — hay causales y fueros que
              cambian completamente el procedimiento.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {/* ================= VACACIONES ================= */}
      {gestion === "vacaciones" ? (
        <Card className="card-soft border-transparent">
          <CardHeader>
            <CardTitle className="text-base">Papeleta de vacaciones</CardTitle>
            <CardDescription>
              Prepararemos la papeleta (comprobante de feriado legal) y te la
              enviaremos para la firma del trabajador.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Campo label="Primer día de vacaciones">
              <Input
                name="fecha_inicio_vac"
                type="date"
                required
                value={vacInicio}
                onChange={(e) => setVacInicio(e.target.value)}
              />
            </Campo>
            <Campo label="Último día de vacaciones">
              <Input
                name="fecha_termino_vac"
                type="date"
                required
                value={vacFin}
                onChange={(e) => setVacFin(e.target.value)}
              />
            </Campo>
            {vacInicio && vacFin && !calcVac ? (
              <p className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 sm:col-span-2">
                El último día no puede ser anterior al primero.
              </p>
            ) : null}
            {calcVac ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 sm:col-span-2">
                <p className="font-medium">
                  Son {calcVac.diasHabiles} día{calcVac.diasHabiles === 1 ? "" : "s"} hábil
                  {calcVac.diasHabiles === 1 ? "" : "es"} de vacaciones
                </p>
                <p className="mt-0.5 text-xs">
                  {calcVac.fechaRegreso
                    ? `El trabajador se reintegra el ${formatFecha(calcVac.fechaRegreso)}. `
                    : ""}
                  {calcVac.feriadosEnRango.length > 0
                    ? `No se cuentan: ${calcVac.feriadosEnRango
                        .map((f) => `${f.nombre} (${formatFecha(f.fecha)})`)
                        .join(", ")}.`
                    : ""}
                </p>
                {!calcVac.coberturaCompleta ? (
                  <p className="mt-1 text-xs text-amber-700">
                    Parte del rango está fuera de nuestro calendario de feriados —
                    el equipo confirmará el conteo exacto.
                  </p>
                ) : null}
              </div>
            ) : null}
            <p className="rounded-lg border border-sky-200 bg-sky-50 p-2.5 text-xs text-sky-800 sm:col-span-2">
              Los sábados, domingos y feriados legales en Chile no se descuentan
              de las vacaciones (Arts. 67 y 69 del Código del Trabajo) — el
              conteo de arriba ya los excluye.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {/* ================= PERMISO ================= */}
      {gestion === "permiso" ? (
        <Card className="card-soft border-transparent">
          <CardHeader>
            <CardTitle className="text-base">Permiso</CardTitle>
            <CardDescription>
              Los permisos no descuentan días de vacaciones. Los sin goce se
              descuentan de la remuneración del mes; los legales (matrimonio,
              nacimiento, fallecimiento) son pagados por ley.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Campo label="Tipo de permiso" span2>
              <select
                className={selectCls}
                value={permisoTipo}
                onChange={(e) => {
                  const def = TIPOS_PERMISO.find((t) => t.value === e.target.value);
                  setPermisoTipo(e.target.value);
                  setPermisoGoce(def?.goce ?? def?.goceDefault ?? "sin");
                }}
                required
              >
                {TIPOS_PERMISO.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              {permisoDef.nota ? (
                <p className="text-xs text-muted-foreground">{permisoDef.nota}</p>
              ) : null}
            </Campo>
            <Campo label="¿Con o sin goce de remuneraciones?">
              <select
                className={selectCls}
                value={goceActual}
                onChange={(e) => setPermisoGoce(e.target.value)}
                disabled={goceFijo}
              >
                <option value="con">Con goce (pagado)</option>
                <option value="sin">Sin goce (se descuenta)</option>
              </select>
              {goceFijo ? (
                <p className="text-xs text-muted-foreground">
                  Este tipo de permiso {permisoDef.goce === "con" ? "es con goce" : "es sin goce"} —
                  no se puede cambiar.
                </p>
              ) : null}
            </Campo>
            <Campo label="¿Día(s) completo(s) u horas?">
              <select
                className={selectCls}
                value={permisoUnidad}
                onChange={(e) => setPermisoUnidad(e.target.value as "dias" | "horas")}
              >
                <option value="dias">Día(s) completo(s)</option>
                <option value="horas">Horas dentro de un día</option>
              </select>
            </Campo>
            <Campo label={permisoUnidad === "horas" ? "Fecha del permiso" : "Primer día del permiso"}>
              <Input
                name="permiso_desde"
                type="date"
                required
                value={perDesde}
                onChange={(e) => setPerDesde(e.target.value)}
              />
            </Campo>
            {permisoUnidad === "dias" ? (
              <Campo label="Último día del permiso (el mismo si es un solo día)">
                <Input
                  name="permiso_hasta"
                  type="date"
                  required
                  value={perHasta}
                  onChange={(e) => setPerHasta(e.target.value)}
                />
              </Campo>
            ) : (
              <Campo label="Cantidad de horas">
                <Input
                  name="permiso_horas"
                  type="number"
                  min={0.5}
                  max={10}
                  step={0.5}
                  required
                  placeholder="ej. 4"
                />
              </Campo>
            )}
            {permisoUnidad === "dias" && perDesde && perHasta && permisoDiasCorridos === null ? (
              <p className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 sm:col-span-2">
                El último día no puede ser anterior al primero.
              </p>
            ) : null}
            {permisoDiasCorridos !== null ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 sm:col-span-2">
                <p className="font-medium">
                  {permisoDiasCorridos} día{permisoDiasCorridos === 1 ? "" : "s"} de permiso{" "}
                  {goceActual === "con" ? "con goce" : "sin goce"} de remuneraciones
                </p>
                {calcPermiso && calcPermiso.diasHabiles !== permisoDiasCorridos ? (
                  <p className="mt-0.5 text-xs">
                    De esos, {calcPermiso.diasHabiles} caen en día hábil (lunes a
                    viernes sin feriados) — referencia para el descuento si es sin goce.
                  </p>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* ================= CONTRATO (secciones propias) ================= */}
      {esContrato ? (
        <>
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
                  <Input name="horas_semanales" type="number" min={1} max={28} placeholder="máx. 28 (jornada parcial)" required />
                </Campo>
              ) : null}
              <Campo label="Tipo de contrato">
                <select className={selectCls} value={tipoActual} onChange={(e) => setTipoContrato(e.target.value)}>
                  {tiposDisponibles.map((t) => (
                    <option key={t} value={t}>{t === "plazo_fijo" ? "Plazo fijo" : "Indefinido"}</option>
                  ))}
                </select>
              </Campo>
              {comboSinPlantilla ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 sm:col-span-2">
                  Para esta combinación aún no hay modelo de contrato de
                  extranjero. Puedes enviar la solicitud igual: el equipo de RS
                  Tax &amp; Legal preparará el modelo al revisarla.
                </p>
              ) : null}
              <Campo label="Fecha de inicio"><Input name="fecha_inicio" type="date" required /></Campo>
              {tipoActual === "plazo_fijo" ? (
                <Campo label="Fecha de término"><Input name="fecha_vencimiento" type="date" required /></Campo>
              ) : null}
            </CardContent>
          </Card>

          <Card className="card-soft border-transparent">
            <CardHeader>
              <CardTitle className="text-base">Remuneración</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <NotaMinimos />
              <Campo label="Sueldo base ($)"><Input name="sueldo_base" type="number" min={1} required /></Campo>
              <Campo label="Movilización ($)"><Input name="movilizacion" type="number" min={0} defaultValue={0} /></Campo>
              <Campo label="Colación ($)"><Input name="colacion" type="number" min={0} defaultValue={0} /></Campo>
              <Campo label="Asignación de pérdida de caja ($) — 0 si no maneja caja">
                <Input name="perdida_caja" type="number" min={0} defaultValue={0} />
              </Campo>
              <Campo label="Gratificación legal (Art. 50 CT)">
                <select
                  name="gratificacion_tipo"
                  className={selectCls}
                  value={gratifTipo}
                  onChange={(e) => setGratifTipo(e.target.value)}
                >
                  <option value="sin">Sin gratificación</option>
                  <option value="25">25% (con tope legal — la más común)</option>
                  <option value="tope">Tope (4,75 IMM ÷ 12 mensual)</option>
                  <option value="manual">Manual (monto fijo)</option>
                </select>
              </Campo>
              {gratifTipo === "manual" ? (
                <Campo label="Monto gratificación mensual ($)">
                  <Input
                    name="gratificacion_monto"
                    type="number"
                    min={1}
                    required
                    placeholder="ej. 150000"
                  />
                </Campo>
              ) : null}
              <div className="flex flex-col gap-1.5 sm:col-span-3">
                <Label className="text-xs">Otras consideraciones remuneracionales</Label>
                <Textarea
                  name="observaciones"
                  rows={3}
                  placeholder="Cualquier asignación o descuento DISTINTO a los anteriores. Por ejemplo: asignación de pérdida de caja (indica el monto), bonos o comisiones (explica cómo se calculan: porcentaje, metas o tabla, fijo o variable), aguinaldos, descuentos pactados, etc."
                />
                <p className="text-xs text-muted-foreground">
                  Usa este espacio para todo pago o descuento que no esté en las
                  casillas anteriores — mientras más detalle, más rápido sale el
                  contrato.
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}

      {/* ================= CONTACTO + OBSERVACIONES (no contrato: en contrato
          las observaciones van en la sección Remuneración) ================= */}
      {!esContrato ? (
        <Card className="card-soft border-transparent">
          <CardContent className="grid gap-3 pt-4 sm:grid-cols-2">
            <Campo label="Observaciones" span2>
              <Textarea
                name="observaciones"
                rows={3}
                placeholder="Cualquier detalle adicional que debamos saber, etc…"
              />
            </Campo>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={enviando}>
          {enviando ? "Enviando…" : "Enviar solicitud"}
        </Button>
      </div>
    </form>
  );
}
