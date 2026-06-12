"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardCopy, ExternalLink, Link2, Plus, Search, Users } from "lucide-react";
import { asignarGrupoCliente, crearGrupoCliente, generarLinkCliente } from "./actions";
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

function urlPortal(token: string): string {
  return `${window.location.origin}/solicitud/${token}`;
}

function TablaEmpresas({
  filas,
  grupos,
  ocupado,
  onCopiar,
  onGenerar,
  onAsignar,
}: {
  filas: LinkClienteRow[];
  grupos: GrupoCliente[];
  ocupado: boolean;
  onCopiar: (token: string, razonSocial: string) => void;
  onGenerar: (f: LinkClienteRow) => void;
  onAsignar: (clienteId: string, grupoId: string | null) => void;
}) {
  return (
    <div className="card-soft overflow-x-auto rounded-xl bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[300px]">Empresa</TableHead>
            <TableHead>RUT</TableHead>
            <TableHead>Correo de envíos</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Link</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filas.map((f) => (
            <TableRow key={f.id}>
              <TableCell className="font-medium">
                <span className="block max-w-[300px] truncate" title={f.razonSocial}>
                  {f.razonSocial}
                </span>
              </TableCell>
              <TableCell>{f.rut ?? "—"}</TableCell>
              <TableCell>
                <span className="block max-w-[200px] truncate" title={f.correo ?? undefined}>
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
              <TableCell>
                {f.token ? (
                  <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                    Activo
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    Sin link
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                {f.token ? (
                  <div className="flex justify-end gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onCopiar(f.token as string, f.razonSocial)}
                    >
                      <ClipboardCopy className="size-3.5" />
                      Copiar link
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Abrir portal"
                      onClick={() => window.open(urlPortal(f.token as string), "_blank")}
                    >
                      <ExternalLink className="size-4" />
                    </Button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" disabled={ocupado} onClick={() => onGenerar(f)}>
                    <Link2 className="size-3.5" />
                    Generar link
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
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

  const conLink = filas.filter((f) => f.token).length;

  function copiar(token: string, razonSocial: string) {
    navigator.clipboard.writeText(urlPortal(token));
    toast.success(`Link de ${razonSocial} copiado — pégaselo al cliente`);
  }

  function generar(f: LinkClienteRow) {
    startAccion(async () => {
      const res = await generarLinkCliente(f.id);
      if (res.ok && res.token) {
        navigator.clipboard.writeText(urlPortal(res.token));
        toast.success(`Link de ${f.razonSocial} generado y copiado`);
        router.refresh();
      } else toast.error(res.error ?? "No se pudo generar el link.");
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
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Links clientes</h1>
        <p className="text-sm text-muted-foreground">
          Cartera organizada por cliente y sus empresas. Cada empresa tiene su
          propio link de portal (solicitudes + detalle remuneraciones); los
          accesos por cliente vendrán sobre esta misma estructura. {conLink} de{" "}
          {filas.length} empresas con link activo.
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
        if (!empresas || empresas.length === 0) {
          // con búsqueda activa se ocultan los clientes sin coincidencias
          if (buscar.trim()) return null;
        }
        return (
          <section key={g.id} className="space-y-2">
            <h2 className="flex items-center gap-2 font-heading text-base font-semibold">
              <Users className="size-4 text-[var(--brand-teal)]" />
              {g.codigo} — {g.nombre}
              <span className="text-xs font-normal text-muted-foreground">
                {empresas?.length ?? 0} empresa{(empresas?.length ?? 0) === 1 ? "" : "s"}
              </span>
            </h2>
            {empresas && empresas.length > 0 ? (
              <TablaEmpresas
                filas={empresas}
                grupos={grupos}
                ocupado={ocupado}
                onCopiar={copiar}
                onGenerar={generar}
                onAsignar={asignar}
              />
            ) : (
              <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                Sin empresas asignadas — usa el selector "Cliente" de cualquier
                empresa de abajo para asignarla.
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
            onCopiar={copiar}
            onGenerar={generar}
            onAsignar={asignar}
          />
        </section>
      ) : null}
    </div>
  );
}
