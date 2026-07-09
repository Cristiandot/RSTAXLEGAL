"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Lock, RefreshCw, Scale, TrendingUp, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { cargarGestionesFR } from "@/components/gestiones-fr/actions";
import { ModuloCausas } from "@/components/gestiones-fr/modulo-causas";
import { ModuloComercial } from "@/components/gestiones-fr/modulo-comercial";
import type { Causa, Contacto, Cotizacion } from "@/components/gestiones-fr/tipos";

const CLAVE = "5753";
const STORAGE_KEY = "gestiones-fr-unlocked";

type Datos = {
  causas: Causa[];
  contactos: Contacto[];
  cotizaciones: Cotizacion[];
};

export default function GestionesFelipe() {
  const [desbloqueado, setDesbloqueado] = useState(false);
  const [clave, setClave] = useState("");
  const [error, setError] = useState(false);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(false);
  const [modulo, setModulo] = useState<"causas" | "comercial">("causas");
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
    const res = await cargarGestionesFR();
    setCargando(false);
    if (!res.ok) {
      toast.error(res.error ?? "No se pudieron cargar las gestiones.");
      return;
    }
    setDatos({
      causas: res.causas,
      contactos: res.contactos,
      cotizaciones: res.cotizaciones,
    });
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
          <CardContent className="flex flex-col items-center gap-3 py-8">
            <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Lock className="size-5" />
            </span>
            <p className="text-sm text-muted-foreground">
              Sección protegida. Ingresa la clave de 4 dígitos.
            </p>
            <div className="flex items-center gap-2">
              <Input
                ref={inputRef}
                type="password"
                inputMode="numeric"
                autoComplete="off"
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
                className="w-28 text-center text-lg tracking-[0.5em]"
              />
              <Button onClick={() => intentar(clave)} disabled={clave.length < 4}>
                Entrar
              </Button>
            </div>
            {error ? <p className="text-sm text-red-600">Clave incorrecta.</p> : null}
          </CardContent>
        </Card>
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
              {datos ? `${datos.causas.length} causas · audiencias y plazos fatales` : "…"}
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
      </div>

      {!datos ? (
        <Card className="card-soft border-transparent">
          <CardContent className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Cargando gestiones…
          </CardContent>
        </Card>
      ) : modulo === "causas" ? (
        <ModuloCausas causas={datos.causas} recargar={recargar} />
      ) : (
        <ModuloComercial
          contactos={datos.contactos}
          cotizaciones={datos.cotizaciones}
          recargar={recargar}
        />
      )}
    </section>
  );
}
