"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Check,
  ClipboardCopy,
  Eye,
  EyeOff,
  KeyRound,
  Pencil,
  Plus,
  Search,
  X,
} from "lucide-react";
import {
  guardarCredencial,
  revelarCredencial,
  type CampoCredencial,
  type TipoClave,
} from "./actions";
import { RutCopiable } from "@/components/rut-copiable";
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

export type CredencialRow = {
  id: string;
  razonSocial: string;
  rut: string | null; // RUT empresa = usuario SII
  previredRut: string | null; // usuario Previred
  tieneClaveSii: boolean;
  tieneClavePrevired: boolean;
  activo: boolean;
  grupo: string | null; // "A.4 — Red Barrera"
};

/**
 * Celda de clave: muestra puntitos, y con botones se revela, copia o edita.
 * El valor real se pide al servidor recién al apretar un botón (queda
 * auditado); nunca viene en el HTML inicial.
 */
function ClaveCell({
  clienteId,
  campo,
  etiqueta,
  razonSocial,
  tiene,
}: {
  clienteId: string;
  campo: TipoClave;
  etiqueta: string; // "Clave SII" | "Clave Previred"
  razonSocial: string;
  tiene: boolean;
}) {
  const router = useRouter();
  const [valor, setValor] = useState<string | null>(null); // clave ya traída
  const [visible, setVisible] = useState(false);
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [guardada, setGuardada] = useState(false); // se agregó clave donde no había

  const hayClave = tiene || guardada || Boolean(valor);

  async function traer(accion: "revelar" | "copiar"): Promise<string | null> {
    if (valor !== null) return valor;
    const res = await revelarCredencial(clienteId, campo, accion);
    if (!res.ok) {
      toast.error(res.error ?? "No se pudo obtener la clave.");
      return null;
    }
    setValor(res.valor ?? "");
    return res.valor ?? "";
  }

  async function ver() {
    if (visible) {
      setVisible(false);
      return;
    }
    setOcupado(true);
    const v = await traer("revelar");
    setOcupado(false);
    if (v !== null) setVisible(true);
  }

  async function copiar() {
    setOcupado(true);
    const v = await traer("copiar");
    setOcupado(false);
    if (v === null) return;
    if (!v) {
      toast.info(`${razonSocial} no tiene ${etiqueta.toLowerCase()} guardada.`);
      return;
    }
    navigator.clipboard.writeText(v);
    toast.success(`${etiqueta} de ${razonSocial} copiada`);
  }

  async function editar() {
    setOcupado(true);
    const v = hayClave ? await traer("revelar") : "";
    setOcupado(false);
    if (v === null) return;
    setBorrador(v);
    setEditando(true);
  }

  async function guardar() {
    setOcupado(true);
    const res = await guardarCredencial(clienteId, campo, borrador);
    setOcupado(false);
    if (!res.ok) {
      toast.error(res.error ?? "No se pudo guardar.");
      return;
    }
    const limpio = borrador.trim();
    setValor(limpio || "");
    setGuardada(Boolean(limpio));
    setVisible(Boolean(limpio));
    setEditando(false);
    toast.success(
      limpio
        ? `${etiqueta} de ${razonSocial} actualizada`
        : `${etiqueta} de ${razonSocial} eliminada`,
    );
    router.refresh();
  }

  if (editando) {
    return (
      <div className="flex items-center gap-1">
        <Input
          autoFocus
          className="h-8 w-36 bg-card font-mono text-xs"
          value={borrador}
          onChange={(e) => setBorrador(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") guardar();
            if (e.key === "Escape") setEditando(false);
          }}
          aria-label={`${etiqueta} de ${razonSocial}`}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={ocupado}
          aria-label="Guardar"
          onClick={guardar}
        >
          <Check className="size-4 text-emerald-600" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={ocupado}
          aria-label="Cancelar"
          onClick={() => setEditando(false)}
        >
          <X className="size-4 text-muted-foreground" />
        </Button>
      </div>
    );
  }

  if (!hayClave) {
    return (
      <Button
        variant="ghost"
        size="sm"
        disabled={ocupado}
        className="h-7 px-2 text-xs text-muted-foreground"
        onClick={editar}
      >
        <Plus className="size-3.5" />
        Agregar
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-0.5">
      <span
        className="min-w-[90px] font-mono text-xs tracking-wider select-all"
        title={visible ? undefined : "Clave oculta"}
      >
        {visible && valor !== null ? valor : "••••••••"}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={ocupado}
        aria-label={visible ? "Ocultar clave" : "Ver clave"}
        onClick={ver}
      >
        {visible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={ocupado}
        aria-label="Copiar clave"
        onClick={copiar}
      >
        <ClipboardCopy className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={ocupado}
        aria-label="Editar clave"
        onClick={editar}
      >
        <Pencil className="size-3.5" />
      </Button>
    </div>
  );
}

/** RUT Previred: visible (no es secreto), copiable y editable en línea. */
function RutPreviredCell({
  clienteId,
  valorInicial,
}: {
  clienteId: string;
  valorInicial: string | null;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState(valorInicial ?? "");
  const [ocupado, setOcupado] = useState(false);

  async function guardar() {
    setOcupado(true);
    const res = await guardarCredencial(
      clienteId,
      "previred_rut" as CampoCredencial,
      borrador,
    );
    setOcupado(false);
    if (!res.ok) {
      toast.error(res.error ?? "No se pudo guardar.");
      return;
    }
    setEditando(false);
    toast.success("RUT Previred actualizado");
    router.refresh();
  }

  if (editando) {
    return (
      <div className="flex items-center gap-1">
        <Input
          autoFocus
          className="h-8 w-32 bg-card text-xs"
          value={borrador}
          onChange={(e) => setBorrador(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") guardar();
            if (e.key === "Escape") setEditando(false);
          }}
          aria-label="RUT Previred"
        />
        <Button variant="ghost" size="icon-sm" disabled={ocupado} aria-label="Guardar" onClick={guardar}>
          <Check className="size-4 text-emerald-600" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={ocupado}
          aria-label="Cancelar"
          onClick={() => setEditando(false)}
        >
          <X className="size-4 text-muted-foreground" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-0.5">
      <RutCopiable rut={valorInicial} />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Editar RUT Previred"
        onClick={() => {
          setBorrador(valorInicial ?? "");
          setEditando(true);
        }}
      >
        <Pencil className="size-3.5" />
      </Button>
    </div>
  );
}

export function CredencialesClient({
  filas,
  errorCarga,
}: {
  filas: CredencialRow[];
  errorCarga: string | null;
}) {
  const [buscar, setBuscar] = useState("");
  const [verInactivas, setVerInactivas] = useState(false);

  const filtradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return filas.filter((f) => {
      if (!verInactivas && !f.activo) return false;
      if (!q) return true;
      return `${f.razonSocial} ${f.rut ?? ""} ${f.previredRut ?? ""} ${f.grupo ?? ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [filas, buscar, verInactivas]);

  const activas = filas.filter((f) => f.activo);
  const conSii = activas.filter((f) => f.tieneClaveSii).length;
  const conPrevired = activas.filter((f) => f.tieneClavePrevired).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-semibold tracking-tight">
          <KeyRound className="size-6 text-[var(--brand-teal)]" />
          Credenciales
        </h1>
        <p className="text-sm text-muted-foreground">
          Claves SII y Previred de cada empresa. Vienen ocultas: el ojo la
          muestra, el otro botón la copia sin mostrarla y el lápiz la cambia.
          Cada vez que alguien ve o copia una clave queda registrado. {conSii}{" "}
          de {activas.length} empresas activas con clave SII y {conPrevired}{" "}
          con clave Previred.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar empresa, RUT o cliente…"
            className="h-9 w-72 bg-card pl-8"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
          />
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={verInactivas}
            onChange={(e) => setVerInactivas(e.target.checked)}
          />
          Mostrar empresas inactivas
        </label>
        <span className="ml-auto text-xs text-muted-foreground">
          {filtradas.length} empresa{filtradas.length === 1 ? "" : "s"}
        </span>
      </div>

      {errorCarga ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Error al cargar: {errorCarga}
        </div>
      ) : null}

      <div className="card-soft rounded-xl bg-card">
        <Table stickyHeader>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[280px]">Empresa</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>RUT SII (usuario)</TableHead>
              <TableHead>Clave SII</TableHead>
              <TableHead>RUT Previred (usuario)</TableHead>
              <TableHead>Clave Previred</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="font-medium">
                  <span className="block max-w-[280px] truncate" title={f.razonSocial}>
                    {f.razonSocial}
                  </span>
                  {!f.activo ? (
                    <Badge variant="outline" className="mt-0.5 text-[10px] text-muted-foreground">
                      Inactiva
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  <span className="block max-w-[180px] truncate" title={f.grupo ?? undefined}>
                    {f.grupo ?? "—"}
                  </span>
                </TableCell>
                <TableCell>
                  <RutCopiable rut={f.rut} />
                </TableCell>
                <TableCell>
                  <ClaveCell
                    clienteId={f.id}
                    campo="clave_sii"
                    etiqueta="Clave SII"
                    razonSocial={f.razonSocial}
                    tiene={f.tieneClaveSii}
                  />
                </TableCell>
                <TableCell>
                  <RutPreviredCell clienteId={f.id} valorInicial={f.previredRut} />
                </TableCell>
                <TableCell>
                  <ClaveCell
                    clienteId={f.id}
                    campo="previred_clave"
                    etiqueta="Clave Previred"
                    razonSocial={f.razonSocial}
                    tiene={f.tieneClavePrevired}
                  />
                </TableCell>
              </TableRow>
            ))}
            {filtradas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  Sin resultados para la búsqueda.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
