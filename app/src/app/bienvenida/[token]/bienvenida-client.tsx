"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import {
  Building2,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  KeyRound,
  Loader2,
  Plus,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import { enviarOnboarding, type OnboardingPayload, type TrabajadorDeclarado } from "./actions";

const inputClase =
  "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm outline-none focus:border-[#17A2B8] focus:ring-2 focus:ring-[#17A2B8]/25";
const labelClase = "mb-1 block text-xs font-semibold text-slate-600";

type Info = {
  nombre: string;
  mensaje: string | null;
  link_pago: string | null;
  link_pago_nombre: string | null;
  estado: string;
  empresa: { razon_social: string | null; rut_empresa: string | null } | null;
};

const TRAB_VACIO: TrabajadorDeclarado = { nombres: "", apellidos: "", rut: "", cargo: "" };

function Seccion({
  numero,
  icono,
  titulo,
  descripcion,
  children,
}: {
  numero: number;
  icono: React.ReactNode;
  titulo: string;
  descripcion?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#0B2545] text-white">
          {icono}
        </span>
        <div>
          <h2 className="text-sm font-bold text-slate-900">
            {numero}. {titulo}
          </h2>
          {descripcion ? <p className="mt-0.5 text-xs text-slate-500">{descripcion}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

export function BienvenidaClient({ token, info }: { token: string; info: Info }) {
  const [enviando, startEnviar] = useTransition();
  const [listo, setListo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- estado del formulario ---
  const [empresa, setEmpresa] = useState({
    razon_social: info.empresa?.razon_social ?? "",
    rut_empresa: info.empresa?.rut_empresa ?? "",
    nombre_fantasia: "",
    giro: "",
    domicilio: "",
    comuna: "",
    ciudad: "",
    telefono_empresa: "",
    correo_empresa: "",
    representante_legal: "",
    representante_legal_rut: "",
  });
  const [contacto, setContacto] = useState({ nombre: "", correo: "", telefono: "" });
  const [accesos, setAccesos] = useState({ clave_sii: "", previred_rut: "", previred_clave: "" });
  const [yaSuscrito, setYaSuscrito] = useState(false);
  const [tieneTrab, setTieneTrab] = useState<null | boolean>(null);
  const [trabajadores, setTrabajadores] = useState<TrabajadorDeclarado[]>([{ ...TRAB_VACIO }]);

  const setE = (k: keyof typeof empresa, v: string) => setEmpresa((p) => ({ ...p, [k]: v }));
  const setC = (k: keyof typeof contacto, v: string) => setContacto((p) => ({ ...p, [k]: v }));
  const setA = (k: keyof typeof accesos, v: string) => setAccesos((p) => ({ ...p, [k]: v }));
  const setT = (i: number, k: keyof TrabajadorDeclarado, v: string) =>
    setTrabajadores((prev) => prev.map((t, j) => (j === i ? { ...t, [k]: v } : t)));

  function enviar() {
    setError(null);
    const payload: OnboardingPayload = {
      empresa,
      contacto,
      accesos,
      pago: { ya_suscrito: yaSuscrito },
      rrhh: {
        tiene_trabajadores: tieneTrab === true,
        n_trabajadores:
          tieneTrab === true
            ? trabajadores.filter((t) => t.nombres.trim() || t.rut.trim()).length
            : 0,
        trabajadores: tieneTrab === true ? trabajadores : [],
      },
    };
    startEnviar(async () => {
      const res = await enviarOnboarding(token, payload);
      if (!res.ok) {
        setError(res.error ?? "No se pudo enviar. Intenta de nuevo.");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      setListo(true);
      window.scrollTo({ top: 0 });
    });
  }

  if (listo) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#0B2545] to-[#123a6b] px-4">
        <div className="w-full max-w-lg rounded-2xl bg-white p-8 text-center shadow-xl">
          <CheckCircle2 className="mx-auto mb-3 size-14 text-teal-500" />
          <h1 className="mb-2 text-xl font-bold text-slate-900">¡Datos recibidos!</h1>
          <p className="mb-4 text-sm text-slate-600">
            Gracias, {info.nombre}. Tu información ya quedó en nuestros sistemas y el equipo de
            RS Tax &amp; Legal la revisará para dejar todo operativo. Te contactaremos a la brevedad
            para los siguientes pasos.
          </p>
          {info.link_pago && !yaSuscrito ? (
            <a
              href={info.link_pago}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-[#17A2B8] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
            >
              <CreditCard className="size-4" />
              ¿Aún no te suscribes? Hazlo aquí
            </a>
          ) : null}
          <p className="mt-6 text-xs text-slate-400">
            RS Tax &amp; Legal · Viña del Mar · admin@rstaxlegal.cl
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 pb-16">
      {/* Encabezado */}
      <div className="bg-gradient-to-b from-[#0B2545] to-[#123a6b] px-4 pt-10 pb-14 text-center text-white">
        <Image
          src="/logo-claro.png"
          alt="RS Tax & Legal"
          width={200}
          height={60}
          className="mx-auto mb-5 h-12 w-auto"
          priority
        />
        <h1 className="text-2xl font-bold sm:text-3xl">¡Bienvenido, {info.nombre}!</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-white/80">
          {info.mensaje?.trim() ||
            "Estamos felices de que te sumes. Completa estos datos una sola vez y nosotros nos encargamos del resto — lo demás lo obtenemos directamente del SII, sin pedirte papeles."}
        </p>
      </div>

      <div className="mx-auto -mt-6 max-w-3xl space-y-5 px-4">
        {info.estado === "completada" ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            Ya recibimos una respuesta con este link. Si necesitas corregir algo, puedes volver a
            enviar el formulario y actualizamos tus datos.
          </div>
        ) : null}
        {error ? (
          <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-700">
            {error}
          </div>
        ) : null}

        {/* 1. Empresa */}
        <Seccion
          numero={1}
          icono={<Building2 className="size-4" />}
          titulo="Datos de tu empresa"
          descripcion="Lo esencial para crear tu ficha. Si algún dato no lo tienes a mano, déjalo en blanco."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelClase}>Razón social *</label>
              <input
                className={inputClase}
                value={empresa.razon_social}
                onChange={(e) => setE("razon_social", e.target.value)}
                placeholder="Comercial Ejemplo SpA"
              />
            </div>
            <div>
              <label className={labelClase}>RUT de la empresa *</label>
              <input
                className={inputClase}
                value={empresa.rut_empresa}
                onChange={(e) => setE("rut_empresa", e.target.value)}
                placeholder="76.123.456-7"
              />
            </div>
            <div>
              <label className={labelClase}>Nombre de fantasía</label>
              <input
                className={inputClase}
                value={empresa.nombre_fantasia}
                onChange={(e) => setE("nombre_fantasia", e.target.value)}
                placeholder="Cómo le dicen a tu negocio"
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClase}>Giro / a qué se dedica</label>
              <input
                className={inputClase}
                value={empresa.giro}
                onChange={(e) => setE("giro", e.target.value)}
                placeholder="Venta de alimentos, servicios odontológicos…"
              />
            </div>
            <div>
              <label className={labelClase}>Dirección</label>
              <input
                className={inputClase}
                value={empresa.domicilio}
                onChange={(e) => setE("domicilio", e.target.value)}
                placeholder="Calle y número"
              />
            </div>
            <div>
              <label className={labelClase}>Comuna</label>
              <input
                className={inputClase}
                value={empresa.comuna}
                onChange={(e) => setE("comuna", e.target.value)}
                placeholder="Viña del Mar"
              />
            </div>
            <div>
              <label className={labelClase}>Correo de la empresa</label>
              <input
                className={inputClase}
                type="email"
                value={empresa.correo_empresa}
                onChange={(e) => setE("correo_empresa", e.target.value)}
                placeholder="contacto@tuempresa.cl"
              />
            </div>
            <div>
              <label className={labelClase}>Teléfono de la empresa</label>
              <input
                className={inputClase}
                value={empresa.telefono_empresa}
                onChange={(e) => setE("telefono_empresa", e.target.value)}
                placeholder="+56 9 …"
              />
            </div>
            <div>
              <label className={labelClase}>Representante legal</label>
              <input
                className={inputClase}
                value={empresa.representante_legal}
                onChange={(e) => setE("representante_legal", e.target.value)}
                placeholder="Nombre completo"
              />
            </div>
            <div>
              <label className={labelClase}>RUT del representante</label>
              <input
                className={inputClase}
                value={empresa.representante_legal_rut}
                onChange={(e) => setE("representante_legal_rut", e.target.value)}
                placeholder="12.345.678-5"
              />
            </div>
          </div>
        </Seccion>

        {/* 2. Contacto */}
        <Seccion
          numero={2}
          icono={<UserRound className="size-4" />}
          titulo="Tu contacto"
          descripcion="Con quién coordinamos el día a día. A este correo llegará toda nuestra comunicación."
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={labelClase}>Nombre *</label>
              <input
                className={inputClase}
                value={contacto.nombre}
                onChange={(e) => setC("nombre", e.target.value)}
                placeholder="Tu nombre"
              />
            </div>
            <div>
              <label className={labelClase}>Correo *</label>
              <input
                className={inputClase}
                type="email"
                value={contacto.correo}
                onChange={(e) => setC("correo", e.target.value)}
                placeholder="tu@correo.cl"
              />
            </div>
            <div>
              <label className={labelClase}>Teléfono</label>
              <input
                className={inputClase}
                value={contacto.telefono}
                onChange={(e) => setC("telefono", e.target.value)}
                placeholder="+56 9 …"
              />
            </div>
          </div>
        </Seccion>

        {/* 3. Accesos */}
        <Seccion
          numero={3}
          icono={<KeyRound className="size-4" />}
          titulo="Accesos SII y Previred"
          descripcion="Con tu clave del SII obtenemos todo lo tributario directamente — no necesitas enviarnos documentos. Tus claves viajan seguras y solo las usa nuestro equipo."
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={labelClase}>Clave del SII (con el RUT de la empresa) *</label>
              <input
                className={inputClase}
                type="password"
                value={accesos.clave_sii}
                onChange={(e) => setA("clave_sii", e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className={labelClase}>RUT de acceso Previred</label>
              <input
                className={inputClase}
                value={accesos.previred_rut}
                onChange={(e) => setA("previred_rut", e.target.value)}
                placeholder="Si tienes cuenta Previred"
              />
            </div>
            <div>
              <label className={labelClase}>Clave Previred</label>
              <input
                className={inputClase}
                type="password"
                value={accesos.previred_clave}
                onChange={(e) => setA("previred_clave", e.target.value)}
                placeholder="Déjala en blanco si no tienes"
              />
            </div>
          </div>
        </Seccion>

        {/* 4. Pago */}
        {info.link_pago ? (
          <Seccion
            numero={4}
            icono={<CreditCard className="size-4" />}
            titulo="Suscripción de pago"
            descripcion="Si ya te suscribiste, omite este paso."
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href={info.link_pago}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#17A2B8] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
              >
                <ExternalLink className="size-4" />
                Suscribir {info.link_pago_nombre ? `· ${info.link_pago_nombre}` : "mi plan"}
              </a>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  className="size-4 accent-[#17A2B8]"
                  checked={yaSuscrito}
                  onChange={(e) => setYaSuscrito(e.target.checked)}
                />
                Ya me suscribí / ya tengo el pago al día
              </label>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              El cargo mensual se ajusta al valor de la UF del día 1 de cada mes.
            </p>
          </Seccion>
        ) : null}

        {/* 5. Equipo */}
        <Seccion
          numero={info.link_pago ? 5 : 4}
          icono={<Users className="size-4" />}
          titulo="Tu equipo"
          descripcion="Para preparar remuneraciones y contratos. Solo nombre, RUT y cargo — el detalle lo vemos juntos después."
        >
          <p className="mb-3 text-sm font-medium text-slate-700">
            ¿Tienes personas contratadas en tu empresa?
          </p>
          <div className="mb-4 flex gap-2">
            <button
              type="button"
              onClick={() => setTieneTrab(true)}
              className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                tieneTrab === true
                  ? "border-[#17A2B8] bg-[#17A2B8]/10 text-[#0B2545]"
                  : "border-slate-300 bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              Sí, tengo trabajadores
            </button>
            <button
              type="button"
              onClick={() => setTieneTrab(false)}
              className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                tieneTrab === false
                  ? "border-[#17A2B8] bg-[#17A2B8]/10 text-[#0B2545]"
                  : "border-slate-300 bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              No, por ahora no
            </button>
          </div>

          {tieneTrab === true ? (
            <div className="space-y-2">
              {trabajadores.map((t, i) => (
                <div
                  key={i}
                  className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_130px_1fr_36px]"
                >
                  <input
                    className={inputClase}
                    value={t.nombres}
                    onChange={(e) => setT(i, "nombres", e.target.value)}
                    placeholder="Nombres"
                  />
                  <input
                    className={inputClase}
                    value={t.apellidos}
                    onChange={(e) => setT(i, "apellidos", e.target.value)}
                    placeholder="Apellidos"
                  />
                  <input
                    className={inputClase}
                    value={t.rut}
                    onChange={(e) => setT(i, "rut", e.target.value)}
                    placeholder="RUT"
                  />
                  <input
                    className={inputClase}
                    value={t.cargo}
                    onChange={(e) => setT(i, "cargo", e.target.value)}
                    placeholder="Cargo (vendedor, cajera…)"
                  />
                  <button
                    type="button"
                    title="Quitar"
                    className="flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-400 hover:text-red-500"
                    onClick={() =>
                      setTrabajadores((prev) =>
                        prev.length > 1 ? prev.filter((_, j) => j !== i) : [{ ...TRAB_VACIO }],
                      )
                    }
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setTrabajadores((prev) => [...prev, { ...TRAB_VACIO }])}
                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[#17A2B8] px-3 py-2 text-sm font-semibold text-[#0B2545] hover:bg-[#17A2B8]/10"
              >
                <Plus className="size-4" />
                Agregar otro trabajador
              </button>
            </div>
          ) : null}
        </Seccion>

        {/* Enviar */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm">
          <button
            type="button"
            onClick={enviar}
            disabled={enviando}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0B2545] px-6 py-3.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60 sm:w-auto sm:min-w-72"
          >
            {enviando ? <Loader2 className="size-4 animate-spin" /> : null}
            {enviando ? "Enviando…" : "Enviar mis datos a RS Tax & Legal"}
          </button>
          <p className="mt-3 text-xs text-slate-400">
            Tus datos viajan cifrados y quedan directamente en nuestros sistemas. Cualquier duda:
            admin@rstaxlegal.cl · +56 9 7392 8662
          </p>
        </div>
      </div>
    </main>
  );
}
