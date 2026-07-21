"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarClock,
  FileText,
  LayoutDashboard,
  ListChecks,
  Loader2,
  Lock,
  RefreshCw,
  Scale,
  TrendingUp,
  Unlock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cargarGerencia, cargarGestionesFR } from "@/components/gestiones-fr/actions";
import { ModuloCausas } from "@/components/gestiones-fr/modulo-causas";
import { ModuloComercial } from "@/components/gestiones-fr/modulo-comercial";
import { ModuloGerencia } from "@/components/gestiones-fr/modulo-gerencia";
import { ModuloGestiones } from "@/components/gestiones-fr/modulo-gestiones";
import { ModuloPendientes } from "@/components/gestiones-fr/modulo-pendientes";
import { ModuloTimeBox } from "@/components/gestiones-fr/modulo-timebox";
import type {
  AgendaEvento,
  Causa,
  Contacto,
  Cotizacion,
  DatosGerencia,
  GestionLegal,
  Pendiente,
  PropuestaDiaria,
  Requerimiento,
} from "@/components/gestiones-fr/tipos";

const CLAVE = "5753";
const STORAGE_KEY = "gestiones-fr-unlocked";

type Datos = {
  causas: Causa[];
  contactos: Contacto[];
  cotizaciones: Cotizacion[];
  gestiones: GestionLegal[];
  pendientes: Pendiente[];
  requerimientos: Requerimiento[];
  agenda: AgendaEvento[];
  propuestas: PropuestaDiaria[];
};

type Modulo = "timebox" | "causas" | "gestiones" | "comercial" | "gerencia" | "pendientes";

export default function GestionesFelipe() {
  const router = useRouter();
  const [desbloqueado, setDesbloqueado] = useState(false);
  const [clave, setClave] = useState("");
  const [error, setError] = useState(false);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [gerencia, setGerencia] = useState<DatosGerencia | null>(null);
  const [cargando, setCargando] = useState(false);
  const [modulo, setModulo] = useState<Modulo>("timebox");
  const inputRef = useRef<HTMLInputElement>(null);

  // El desbloqueo dura mientras viva la pestaña. Se lee tras montar para no
  // romper la hidratación (mismo patrón que el portal): el primer render
  // siempre es "bloqueado".
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (sessionStorage.getItem(STORAGE_KEY) === "1") setDesbloqueado(true);
  }, []);

  useEffect(() => {
    if (desbloqueado && !datos && !cargando) void recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desbloqueado]);

  async function recargar() {
    setCargando(true);
    const [res, resGerencia] = await Promise.all([cargarGestionesFR(), cargarGerencia()]);
    setCargando(false);
    if (!res.ok) {
      toast.error(res.error ?? "No se pudieron cargar las gestiones.");
      return;
    }
    setDatos({
      causas: res.causas,
      contactos: res.contactos,
      cotizaciones: res.cotizaciones,
      gestiones: res.gestiones,
      pendientes: res.pendientes,
      requerimientos: res.requerimientos,
      agenda: res.agenda,
      propuestas: res.propuestas,
    });
    if (resGerencia.ok) setGerencia(resGerencia.datos);
    else toast.error(resGerencia.error ?? "No se pudo cargar Gerencia.");
  }

  function intentar(valor: string) {
    if (valor.length < 4) return;
    if (valor === CLAVE) {
      sessionStorage.setItem(STORAGE_KEY, "1");
      setDesbloqueado(true);
      setError(false);
    } else {
      setError(true);
      setClave("");
      inputRef.current?.focus();
    }
  }

  function bloquear() {
    sessionStorage.removeItem(STORAGE_KEY);
    setDesbloqueado(false);
    setDatos(null);
    setClave("");
  }

  if (!desbloqueado) {
    return (
      <section className="mt-9">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Gestiones Felipe Rodriguez
        </h2>
        <Card className="card-soft border-transparent">
          <CardContent className="flex flex-col items-center gap-3 py-16">
            <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Lock className="size-5" />
            </span>
            <p className="text-sm text-muted-foreground">Sección protegida.</p>
          </CardContent>
        </Card>

        {/* Pop-up de clave: se abre solo al entrar; cerrarlo devuelve al dashboard */}
        <Dialog
          open
          onOpenChange={(abierto) => {
            if (!abierto) router.push("/");
          }}
        >
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Lock className="size-4" />
                Gestiones Felipe Rodríguez
              </DialogTitle>
              <DialogDescription>
                Ingresa la clave de 4 dígitos para entrar.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-3 py-2">
              <Input
                ref={inputRef}
                type="password"
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                maxLength={4}
                value={clave}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                  setClave(v);
                  setError(false);
                  if (v.length === 4) intentar(v);
                }}
                onKeyDown={(e) => e.key === "Enter" && intentar(clave)}
                placeholder="••••"
                className="h-12 w-40 text-center !text-2xl tracking-[0.6em]"
              />
              {error ? (
                <p className="text-sm text-red-600">Clave incorrecta.</p>
              ) : null}
              <Button
                className="w-40"
                onClick={() => intentar(clave)}
                disabled={clave.length < 4}
              >
                Entrar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </section>
    );
  }

  return (
    <section className="mt-9">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Gestiones Felipe Rodriguez
        </h2>
        <Button variant="ghost" size="sm" onClick={() => void recargar()} disabled={cargando}>
          <RefreshCw className={`size-4 ${cargando ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
        <Button variant="ghost" size="sm" onClick={bloquear}>
          <Unlock className="size-4" />
          Bloquear
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setModulo("timebox")}
          className={`flex min-w-56 flex-1 items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition ${
            modulo === "timebox"
              ? "border-[var(--brand-teal,#17A2B8)] bg-accent"
              : "border-transparent bg-white hover:bg-muted/50"
          }`}
        >
          <CalendarClock className="size-5 shrink-0 text-[var(--brand-teal,#17A2B8)]" />
          <span>
            <span className="block text-sm font-semibold">Time Box</span>
            <span className="block text-xs text-muted-foreground">agenda del día por bloques</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => setModulo("causas")}
          className={`flex min-w-64 flex-1 items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition ${
            modulo === "causas"
              ? "border-[var(--brand-teal,#17A2B8)] bg-accent"
              : "border-transparent bg-white hover:bg-muted/50"
          }`}
        >
          <Scale className="size-5 shrink-0 text-[var(--brand-teal,#17A2B8)]" />
          <span>
            <span className="block text-sm font-semibold">Causas judiciales</span>
            <span className="block text-xs text-muted-foreground">
              {datos ? `${datos.causas.length} causas · agrupadas por estado` : "…"}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => setModulo("gestiones")}
          className={`flex min-w-56 flex-1 items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition ${
            modulo === "gestiones"
              ? "border-[var(--brand-teal,#17A2B8)] bg-accent"
              : "border-transparent bg-white hover:bg-muted/50"
          }`}
        >
          <FileText className="size-5 shrink-0 text-[var(--brand-teal,#17A2B8)]" />
          <span>
            <span className="block text-sm font-semibold">Gestiones</span>
            <span className="block text-xs text-muted-foreground">
              {datos ? `${datos.gestiones.length} gestiones · compraventas, estudios, solicitudes` : "…"}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => setModulo("comercial")}
          className={`flex min-w-64 flex-1 items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition ${
            modulo === "comercial"
              ? "border-[var(--brand-teal,#17A2B8)] bg-accent"
              : "border-transparent bg-white hover:bg-muted/50"
          }`}
        >
          <TrendingUp className="size-5 shrink-0 text-[var(--brand-teal,#17A2B8)]" />
          <span>
            <span className="block text-sm font-semibold">Prospección &amp; Cotizaciones</span>
            <span className="block text-xs text-muted-foreground">
              {datos
                ? `${datos.contactos.length} contactos · ${datos.cotizaciones.length} cotizaciones`
                : "…"}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => setModulo("gerencia")}
          className={`flex min-w-64 flex-1 items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition ${
            modulo === "gerencia"
              ? "border-[var(--brand-teal,#17A2B8)] bg-accent"
              : "border-transparent bg-white hover:bg-muted/50"
          }`}
        >
          <LayoutDashboard className="size-5 shrink-0 text-[var(--brand-teal,#17A2B8)]" />
          <span>
            <span className="block text-sm font-semibold">Gerencia</span>
            <span className="block text-xs text-muted-foreground">
              {gerencia
                ? `facturación vs meta · ${gerencia.cartera.filter((c) => !c.es_prospecto).length} clientes en cartera`
                : "…"}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => setModulo("pendientes")}
          className={`flex min-w-56 flex-1 items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition ${
            modulo === "pendientes"
              ? "border-[var(--brand-teal,#17A2B8)] bg-accent"
              : "border-transparent bg-white hover:bg-muted/50"
          }`}
        >
          <ListChecks className="size-5 shrink-0 text-[var(--brand-teal,#17A2B8)]" />
          <span>
            <span className="block text-sm font-semibold">Pendientes</span>
            <span className="block text-xs text-muted-foreground">
              {datos
                ? `${datos.pendientes.filter((p) => !p.hecho).length} propios · ${datos.requerimientos.length} requerimientos`
                : "…"}
            </span>
          </span>
        </button>
      </div>

      {!datos ? (
        <Card className="card-soft border-transparent">
          <CardContent className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Cargando gestiones…
          </CardContent>
        </Card>
      ) : modulo === "timebox" ? (
        <ModuloTimeBox
          causas={datos.causas}
          gestiones={datos.gestiones}
          contactos={datos.contactos}
          cotizaciones={datos.cotizaciones}
          pendientes={datos.pendientes}
          agenda={datos.agenda}
          propuestas={datos.propuestas}
        />
      ) : modulo === "causas" ? (
        <ModuloCausas causas={datos.causas} agenda={datos.agenda} recargar={recargar} />
      ) : modulo === "gestiones" ? (
        <ModuloGestiones gestiones={datos.gestiones} recargar={recargar} />
      ) : modulo === "comercial" ? (
        <ModuloComercial
          contactos={datos.contactos}
          cotizaciones={datos.cotizaciones}
          recargar={recargar}
        />
      ) : modulo === "pendientes" ? (
        <ModuloPendientes
          causas={datos.causas}
          gestiones={datos.gestiones}
          contactos={datos.contactos}
          cotizaciones={datos.cotizaciones}
          requerimientos={datos.requerimientos}
          pendientes={datos.pendientes}
          recargar={recargar}
        />
      ) : gerencia ? (
        <ModuloGerencia datos={gerencia} recargar={recargar} />
      ) : (
        <Card className="card-soft border-transparent">
          <CardContent className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Cargando gerencia…
          </CardContent>
        </Card>
      )}
    </section>
  );
}
