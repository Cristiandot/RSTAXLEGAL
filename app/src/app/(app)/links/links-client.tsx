"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ClipboardCopy,
  ExternalLink,
  KeyRound,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import {
  activarPortalGrupo,
  crearGrupoCliente,
  regenerarPinGrupo,
} from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type GrupoCliente = {
  id: string;
  codigo: string; // ej. "A.4"
  nombre: string; // ej. "Red Barrera"
  slug: string | null; // portal_slug (link del cliente)
  token: string | null; // form_token del grupo (link interno sin PIN)
  tienePin: boolean;
  pinVisible: string | null; // PIN de la oficina en claro; null si el cliente lo cambió
};

export type LinkClienteRow = {
  id: string;
  razonSocial: string;
  rut: string | null;
  token: string | null;
  correo: string | null;
  grupoId: string | null;
};

const origin = () => (typeof window !== "undefined" ? window.location.origin : "");
const urlCliente = (slug: string) => `${origin()}/portal/${slug}`;
const urlInterno = (token: string) => `${origin()}/portal/${token}`;

/** Lupa con las empresas asociadas al cliente (popover, solo lectura). */
function LupaEmpresas({ empresas }: { empresas: string[] }) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Ver empresas asociadas"
            title="Ver empresas asociadas"
          />
        }
      >
        <Search className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <p className="mb-2 text-xs font-semibold text-muted-foreground">
          Empresas asociadas ({empresas.length})
        </p>
        {empresas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin empresas asignadas.</p>
        ) : (
          <ul className="space-y-1">
            {empresas.map((e) => (
              <li key={e} className="text-sm">
                {e}
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Bloque de acceso al portal de un cliente: link del cliente + link interno + PIN. */
function PortalCliente({
  grupo,
  ocupado,
  onActivar,
  onRegenerar,
  onCopiar,
}: {
  grupo: GrupoCliente;
  ocupado: boolean;
  onActivar: (g: GrupoCliente) => void;
  onRegenerar: (g: GrupoCliente) => void;
  onCopiar: (texto: string, etiqueta: string) => void;
}) {
  if (!grupo.slug || !grupo.token) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-muted/20 p-3">
        <Lock className="size-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Portal sin activar.</span>
        <Button size="sm" className="ml-auto" disabled={ocupado} onClick={() => onActivar(grupo)}>
          <KeyRound className="size-3.5" />
          Activar portal
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
      {/* Link del cliente (con PIN) */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="shrink-0 border-emerald-200 bg-emerald-50 text-emerald-700">
          Link del cliente
        </Badge>
        <code className="min-w-0 flex-1 truncate rounded bg-card px-2 py-1 text-xs" title={urlCliente(grupo.slug)}>
          {urlCliente(grupo.slug)}
        </code>
        <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground">
          requiere PIN
        </Badge>
        <Button variant="outline" size="sm" onClick={() => onCopiar(urlCliente(grupo.slug as string), "Link del cliente")}>
          <ClipboardCopy className="size-3.5" />
          Copiar
        </Button>
      </div>

      {/* Link interno de la oficina (sin PIN) */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="shrink-0 border-amber-200 bg-amber-50 text-amber-700">
          Link interno
        </Badge>
        <code className="min-w-0 flex-1 truncate rounded bg-card px-2 py-1 text-xs" title={urlInterno(grupo.token)}>
          {urlInterno(grupo.token)}
        </code>
        <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground">
          sin PIN · no compartir
        </Badge>
        <Button variant="outline" size="sm" onClick={() => onCopiar(urlInterno(grupo.token as string), "Link interno")}>
          <ClipboardCopy className="size-3.5" />
          Copiar
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Abrir portal (interno)"
          onClick={() => window.open(urlInterno(grupo.token as string), "_blank")}
        >
          <ExternalLink className="size-4" />
        </Button>
      </div>

      {/* PIN: visible si es el de la oficina; si el cliente lo cambió, queda oculto. */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <KeyRound className="size-3.5 text-muted-foreground" />
        {grupo.pinVisible ? (
          <>
            <span className="text-xs text-muted-foreground">PIN</span>
            <strong className="text-base tabular-nums tracking-widest">{grupo.pinVisible}</strong>
            <Button variant="ghost" size="icon-sm" aria-label="Copiar PIN" onClick={() => onCopiar(grupo.pinVisible as string, "PIN")}>
              <ClipboardCopy className="size-3.5" />
            </Button>
          </>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Lock className="size-3" /> PIN cambiado por el cliente
          </span>
        )}
        <Button variant="outline" size="sm" className="ml-auto" disabled={ocupado} onClick={() => onRegenerar(grupo)}>
          <RefreshCw className="size-3.5" />
          Regenerar PIN
        </Button>
      </div>
    </div>
  );
}

export function LinksClient({
  grupos,
  filas,
  errorCarga,
}: {
  grupos: GrupoCliente[];
  filas: LinkClienteRow[];
  errorCarga: string | null;
}) {
  const router = useRouter();
  const [buscar, setBuscar] = useState("");
  const [nuevoCodigo, setNuevoCodigo] = useState("");
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [ocupado, startAccion] = useTransition();

  // Empresas por grupo (para la lupa).
  const empresasPorGrupo = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const f of filas) {
      if (!f.grupoId) continue;
      const lista = map.get(f.grupoId) ?? [];
      lista.push(f.razonSocial);
      map.set(f.grupoId, lista);
    }
    return map;
  }, [filas]);

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    if (!q) return grupos;
    return grupos.filter((g) => {
      const emp = (empresasPorGrupo.get(g.id) ?? []).join(" ");
      return `${g.codigo} ${g.nombre} ${emp}`.toLowerCase().includes(q);
    });
  }, [grupos, empresasPorGrupo, buscar]);

  const activos = grupos.filter((g) => g.slug && g.token).length;

  function copiar(texto: string, etiqueta: string) {
    navigator.clipboard.writeText(texto);
    toast.success(`${etiqueta} copiado`);
  }

  function activar(g: GrupoCliente) {
    startAccion(async () => {
      const res = await activarPortalGrupo(g.id);
      if (res.ok && res.pin) {
        toast.success(`Portal de ${g.codigo} activado — PIN ${res.pin}`);
        router.refresh();
      } else toast.error(res.error ?? "No se pudo activar el portal.");
    });
  }

  function regenerar(g: GrupoCliente) {
    startAccion(async () => {
      const res = await regenerarPinGrupo(g.id);
      if (res.ok && res.pin) {
        toast.success(`PIN de ${g.codigo} regenerado — ${res.pin}`);
        router.refresh();
      } else toast.error(res.error ?? "No se pudo regenerar el PIN.");
    });
  }

  function crearGrupo() {
    startAccion(async () => {
      const res = await crearGrupoCliente(nuevoCodigo, nuevoNombre);
      if (res.ok) {
        toast.success(`Cliente ${nuevoCodigo.trim()} creado`);
        setNuevoCodigo("");
        setNuevoNombre("");
        router.refresh();
      } else toast.error(res.error ?? "Error al crear el cliente");
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Links de clientes</h1>
        <p className="text-sm text-muted-foreground">
          El portal de cada cliente: el <strong>link del cliente</strong> (con PIN, para enviar) y el{" "}
          <strong>link interno</strong> (sin PIN, para revisar en la oficina — no compartir). {activos} de{" "}
          {grupos.length} clientes con portal activo.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar cliente o empresa…"
            className="h-9 w-64 bg-card pl-8"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
          />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Input
            placeholder="Código (A.4)"
            className="h-9 w-28 bg-card"
            value={nuevoCodigo}
            onChange={(e) => setNuevoCodigo(e.target.value)}
          />
          <Input
            placeholder="Nombre del cliente"
            className="h-9 w-48 bg-card"
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
          />
          <Button size="sm" disabled={ocupado} onClick={crearGrupo}>
            <Plus className="size-3.5" />
            Crear cliente
          </Button>
        </div>
      </div>

      {errorCarga ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Error al cargar: {errorCarga}
        </div>
      ) : null}

      <div className="space-y-3">
        {visibles.map((g) => (
          <section key={g.id} className="space-y-2">
            <h2 className="flex items-center gap-2 font-heading text-base font-semibold">
              <Users className="size-4 text-[var(--brand-teal)]" />
              {g.codigo} — {g.nombre}
              <LupaEmpresas empresas={empresasPorGrupo.get(g.id) ?? []} />
              <span className="text-xs font-normal text-muted-foreground">
                {(empresasPorGrupo.get(g.id) ?? []).length} empresa
                {(empresasPorGrupo.get(g.id) ?? []).length === 1 ? "" : "s"}
              </span>
            </h2>

            <PortalCliente
              grupo={g}
              ocupado={ocupado}
              onActivar={activar}
              onRegenerar={regenerar}
              onCopiar={copiar}
            />
          </section>
        ))}
        {visibles.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No hay clientes que coincidan con la búsqueda.
          </p>
        ) : null}
      </div>
    </div>
  );
}
