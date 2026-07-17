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
  ShieldAlert,
  Users,
} from "lucide-react";
import {
  activarPortalGrupo,
  asignarGrupoCliente,
  crearGrupoCliente,
  regenerarPinGrupo,
} from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type GrupoCliente = {
  id: string;
  codigo: string; // ej. "A.4"
  nombre: string; // ej. "Red Barrera"
  slug: string | null; // portal_slug (link del cliente)
  token: string | null; // form_token del grupo (link interno sin PIN)
  tienePin: boolean;
};

export type LinkClienteRow = {
  id: string;
  razonSocial: string;
  rut: string | null;
  token: string | null;
  correo: string | null;
  grupoId: string | null;
};

const selectCls =
  "h-8 rounded-md border border-input bg-card px-2 text-xs shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

const origin = () => (typeof window !== "undefined" ? window.location.origin : "");
const urlCliente = (slug: string) => `${origin()}/portal/${slug}`;
const urlInterno = (token: string) => `${origin()}/portal/${token}`;

/** Empresas del grupo: identificación + a qué cliente pertenecen (sin links). */
function TablaEmpresas({
  filas,
  grupos,
  ocupado,
  onAsignar,
}: {
  filas: LinkClienteRow[];
  grupos: GrupoCliente[];
  ocupado: boolean;
  onAsignar: (clienteId: string, grupoId: string | null) => void;
}) {
  return (
    <div className="card-soft rounded-xl bg-card">
      <Table stickyHeader>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[340px]">Empresa</TableHead>
            <TableHead>RUT</TableHead>
            <TableHead>Correo de envíos</TableHead>
            <TableHead>Cliente</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filas.map((f) => (
            <TableRow key={f.id}>
              <TableCell className="font-medium">
                <span className="block max-w-[340px] truncate" title={f.razonSocial}>
                  {f.razonSocial}
                </span>
              </TableCell>
              <TableCell>{f.rut ?? "—"}</TableCell>
              <TableCell>
                <span className="block max-w-[220px] truncate" title={f.correo ?? undefined}>
                  {f.correo ?? "—"}
                </span>
              </TableCell>
              <TableCell>
                <select
                  className={selectCls}
                  value={f.grupoId ?? ""}
                  disabled={ocupado}
                  onChange={(e) => onAsignar(f.id, e.target.value || null)}
                  aria-label="Cliente al que pertenece la empresa"
                >
                  <option value="">— Sin asignar —</option>
                  {grupos.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.codigo} — {g.nombre}
                    </option>
                  ))}
                </select>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Bloque de acceso al portal de un cliente: link del cliente + link interno + PIN. */
function PortalCliente({
  grupo,
  pinRevelado,
  ocupado,
  onActivar,
  onRegenerar,
  onCopiar,
  onCerrarPin,
}: {
  grupo: GrupoCliente;
  pinRevelado: string | null;
  ocupado: boolean;
  onActivar: (g: GrupoCliente) => void;
  onRegenerar: (g: GrupoCliente) => void;
  onCopiar: (texto: string, etiqueta: string) => void;
  onCerrarPin: () => void;
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

      {/* PIN */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <KeyRound className="size-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          PIN {grupo.tienePin ? "definido" : "sin definir"}
        </span>
        <Button variant="outline" size="sm" className="ml-auto" disabled={ocupado} onClick={() => onRegenerar(grupo)}>
          <RefreshCw className="size-3.5" />
          Regenerar PIN
        </Button>
      </div>

      {pinRevelado ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5">
          <ShieldAlert className="size-4 shrink-0 text-amber-700" />
          <span className="text-xs text-amber-900">
            PIN generado: <strong className="text-base tabular-nums tracking-widest">{pinRevelado}</strong> — cópialo y
            pásaselo al cliente. No se vuelve a mostrar.
          </span>
          <div className="ml-auto flex gap-1.5">
            <Button variant="outline" size="sm" onClick={() => onCopiar(pinRevelado, "PIN")}>
              <ClipboardCopy className="size-3.5" />
              Copiar PIN
            </Button>
            <Button variant="ghost" size="sm" onClick={onCerrarPin}>
              Listo
            </Button>
          </div>
        </div>
      ) : null}
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
  // PIN recién generado por grupo (se muestra una sola vez).
  const [pines, setPines] = useState<Record<string, string>>({});

  const filtradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    if (!q) return filas;
    const grupoNombre = new Map(grupos.map((g) => [g.id, `${g.codigo} ${g.nombre}`]));
    return filas.filter((f) =>
      `${f.razonSocial} ${f.rut ?? ""} ${f.grupoId ? grupoNombre.get(f.grupoId) ?? "" : ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [filas, grupos, buscar]);

  const porGrupo = useMemo(() => {
    const map = new Map<string, LinkClienteRow[]>();
    for (const f of filtradas) {
      const clave = f.grupoId ?? "__sin__";
      const lista = map.get(clave) ?? [];
      lista.push(f);
      map.set(clave, lista);
    }
    return map;
  }, [filtradas]);

  const activos = grupos.filter((g) => g.slug && g.token).length;

  function copiar(texto: string, etiqueta: string) {
    navigator.clipboard.writeText(texto);
    toast.success(`${etiqueta} copiado`);
  }

  function activar(g: GrupoCliente) {
    startAccion(async () => {
      const res = await activarPortalGrupo(g.id);
      if (res.ok && res.pin) {
        setPines((p) => ({ ...p, [g.id]: res.pin as string }));
        toast.success(`Portal de ${g.codigo} activado`);
        router.refresh();
      } else toast.error(res.error ?? "No se pudo activar el portal.");
    });
  }

  function regenerar(g: GrupoCliente) {
    startAccion(async () => {
      const res = await regenerarPinGrupo(g.id);
      if (res.ok && res.pin) {
        setPines((p) => ({ ...p, [g.id]: res.pin as string }));
        toast.success(`PIN de ${g.codigo} regenerado`);
        router.refresh();
      } else toast.error(res.error ?? "No se pudo regenerar el PIN.");
    });
  }

  function asignar(clienteId: string, grupoId: string | null) {
    startAccion(async () => {
      const res = await asignarGrupoCliente(clienteId, grupoId);
      if (res.ok) {
        toast.success("Empresa asignada");
        router.refresh();
      } else toast.error(res.error ?? "Error al asignar");
    });
  }

  function crearGrupo() {
    startAccion(async () => {
      const res = await crearGrupoCliente(nuevoCodigo, nuevoNombre);
      if (res.ok) {
        toast.success(`Cliente ${nuevoCodigo.trim()} creado — asígnale sus empresas`);
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
            placeholder="Buscar cliente, empresa o RUT…"
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

      {grupos.map((g) => {
        const empresas = porGrupo.get(g.id);
        if ((!empresas || empresas.length === 0) && buscar.trim()) return null;
        return (
          <section key={g.id} className="space-y-2">
            <h2 className="flex items-center gap-2 font-heading text-base font-semibold">
              <Users className="size-4 text-[var(--brand-teal)]" />
              {g.codigo} — {g.nombre}
              <span className="text-xs font-normal text-muted-foreground">
                {empresas?.length ?? 0} empresa{(empresas?.length ?? 0) === 1 ? "" : "s"}
              </span>
            </h2>

            <PortalCliente
              grupo={g}
              pinRevelado={pines[g.id] ?? null}
              ocupado={ocupado}
              onActivar={activar}
              onRegenerar={regenerar}
              onCopiar={copiar}
              onCerrarPin={() => setPines((p) => { const n = { ...p }; delete n[g.id]; return n; })}
            />

            {empresas && empresas.length > 0 ? (
              <TablaEmpresas filas={empresas} grupos={grupos} ocupado={ocupado} onAsignar={asignar} />
            ) : (
              <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                Sin empresas asignadas — usa el selector "Cliente" de cualquier empresa de abajo para asignarla.
              </p>
            )}
          </section>
        );
      })}

      {(porGrupo.get("__sin__")?.length ?? 0) > 0 ? (
        <section className="space-y-2">
          <h2 className="font-heading text-base font-semibold text-muted-foreground">
            Empresas sin cliente asignado
            <span className="ml-2 text-xs font-normal">
              {porGrupo.get("__sin__")?.length} empresa
              {(porGrupo.get("__sin__")?.length ?? 0) === 1 ? "" : "s"}
            </span>
          </h2>
          <TablaEmpresas
            filas={porGrupo.get("__sin__") ?? []}
            grupos={grupos}
            ocupado={ocupado}
            onAsignar={asignar}
          />
        </section>
      ) : null}
    </div>
  );
}
