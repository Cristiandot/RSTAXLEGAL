"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, Eye, Link2, Plus } from "lucide-react";
import { formatFecha } from "@/lib/format";
import { ThSort } from "@/components/th-sort";
import { comparar, type Orden } from "@/lib/ordenar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { crearInvitacion } from "./actions";
import type { AltaEmpresaRow, InvitacionRow, LinkPagoOpcion } from "@/lib/onboarding";

const selectClase =
  "h-9 w-full rounded-md border border-input bg-white px-2 text-sm shadow-xs focus:outline-2 focus:outline-ring/50";
const labelClase = "mb-1 block text-[11px] font-semibold text-muted-foreground";

function urlBienvenida(token: string): string {
  const base =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://rstaxlegal-panel.vercel.app";
  return `${base}/bienvenida/${token}`;
}

type Respuestas = {
  empresa?: Record<string, string>;
  contacto?: Record<string, string>;
  accesos?: Record<string, string>;
  pago?: { ya_suscrito?: boolean };
  rrhh?: {
    tiene_trabajadores?: boolean;
    n_trabajadores?: number;
    trabajadores?: Array<{ nombres?: string; apellidos?: string; rut?: string; cargo?: string }>;
  };
};

const ETIQUETA_CAMPO: Record<string, string> = {
  razon_social: "Razón social",
  rut_empresa: "RUT empresa",
  nombre_fantasia: "Nombre de fantasía",
  giro: "Giro",
  domicilio: "Dirección",
  comuna: "Comuna",
  ciudad: "Ciudad",
  telefono_empresa: "Teléfono empresa",
  correo_empresa: "Correo empresa",
  representante_legal: "Representante legal",
  representante_legal_rut: "RUT representante",
  nombre: "Nombre",
  correo: "Correo",
  telefono: "Teléfono",
  clave_sii: "Clave SII",
  previred_rut: "RUT Previred",
  previred_clave: "Clave Previred",
};

export function InvitacionesTab({
  invitaciones,
  linksPago,
  empresas,
}: {
  invitaciones: InvitacionRow[];
  linksPago: LinkPagoOpcion[];
  empresas: AltaEmpresaRow[];
}) {
  const router = useRouter();
  const [creando, startCrear] = useTransition();
  const [formOpen, setFormOpen] = useState(false);
  const [nombre, setNombre] = useState("");
  const [empresaSel, setEmpresaSel] = useState("");
  const [requierePago, setRequierePago] = useState(true);
  const [linkSel, setLinkSel] = useState("");
  const [linkCustom, setLinkCustom] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [copiado, setCopiado] = useState<string | null>(null);
  const [viendo, setViendo] = useState<InvitacionRow | null>(null);
  const [orden, setOrden] = useState<Orden>(null);

  // Por defecto se mantiene el orden del servidor (creación más reciente
  // primero); con orden activo, por la columna elegida.
  const invitacionesOrdenadas = useMemo(() => {
    if (!orden) return invitaciones;
    const val = (i: InvitacionRow): unknown => {
      switch (orden.col) {
        case "cliente":
          return i.nombre_cliente;
        case "creada":
          return i.created_at;
        case "plan":
          return i.link_pago_nombre ?? (i.link_pago ? "Link personalizado" : "No requiere");
        case "estado":
          return i.estado;
        case "empresa":
          return i.empresa_razon;
        default:
          return null;
      }
    };
    return [...invitaciones].sort((a, b) => comparar(val(a), val(b), orden.dir));
  }, [invitaciones, orden]);

  function copiar(id: string, texto: string) {
    void navigator.clipboard.writeText(texto).then(() => {
      setCopiado(id);
      toast.success("Link copiado — envíaselo al cliente.");
      setTimeout(() => setCopiado(null), 2000);
    });
  }

  function crear() {
    const linkPlan = linksPago.find((l) => l.id === linkSel);
    const link = requierePago
      ? linkSel === "__otro__"
        ? linkCustom.trim()
        : (linkPlan?.link ?? null)
      : null;
    if (requierePago && !link) {
      toast.error("Elige el link de pago del plan (o marca que no requiere suscripción).");
      return;
    }
    startCrear(async () => {
      const res = await crearInvitacion({
        nombre_cliente: nombre,
        cliente_id: empresaSel || null,
        link_pago: link,
        link_pago_nombre:
          !requierePago || linkSel === "__otro__"
            ? null
            : linkPlan
              ? `${linkPlan.nombre}${linkPlan.monto ? ` (${linkPlan.monto})` : ""}`
              : null,
        mensaje: mensaje || null,
      });
      if (!res.ok || !res.token) {
        toast.error(res.error ?? "No se pudo crear la invitación.");
        return;
      }
      copiar(`nuevo-${res.token}`, urlBienvenida(res.token));
      toast.success("Invitación creada.");
      setFormOpen(false);
      setNombre("");
      setEmpresaSel("");
      setRequierePago(true);
      setLinkSel("");
      setLinkCustom("");
      setMensaje("");
      router.refresh();
    });
  }

  const r = (viendo?.respuestas ?? null) as Respuestas | null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm text-muted-foreground">
          Genera un link de bienvenida personalizado por cliente: él llena sus datos (empresa,
          contacto, claves SII/Previred, trabajadores) y todo entra solo a la ficha. El link de
          pago se elige según su plan.
        </p>
        <Button size="sm" onClick={() => setFormOpen((x) => !x)}>
          <Plus className="size-4" />
          Nueva invitación
        </Button>
      </div>

      {formOpen ? (
        <form
          className="rounded-xl border border-dashed border-[var(--brand-teal,#17A2B8)] bg-muted/30 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            crear();
          }}
        >
          <div className="mb-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClase}>Nombre del cliente * (como lo saludamos: &quot;Juan Pérez&quot; o &quot;Ferretería El Clavo&quot;)</label>
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} required placeholder="Juan Pérez" />
            </div>
            <div>
              <label className={labelClase}>Empresa existente (opcional — si ya está creada en el panel)</label>
              <select className={selectClase} value={empresaSel} onChange={(e) => setEmpresaSel(e.target.value)}>
                <option value="">— Cliente nuevo (la ficha se crea sola con sus respuestas) —</option>
                {empresas.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.razon_social} {e.rut_empresa ? `· ${e.rut_empresa}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClase}>¿Requiere suscripción de pago?</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setRequierePago(true)}
                  className={`h-9 flex-1 rounded-md border px-3 text-sm font-semibold transition ${
                    requierePago
                      ? "border-[var(--brand-teal,#17A2B8)] bg-accent"
                      : "border-input bg-white text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  Sí, enviarle link
                </button>
                <button
                  type="button"
                  onClick={() => setRequierePago(false)}
                  className={`h-9 flex-1 rounded-md border px-3 text-sm font-semibold transition ${
                    !requierePago
                      ? "border-[var(--brand-teal,#17A2B8)] bg-accent"
                      : "border-input bg-white text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  No aplica
                </button>
              </div>
            </div>
            {requierePago ? (
              <div>
                <label className={labelClase}>Link de pago (según su plan) *</label>
                <select className={selectClase} value={linkSel} onChange={(e) => setLinkSel(e.target.value)}>
                  <option value="">— Elegir plan —</option>
                  {linksPago.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nombre} {l.monto ? `· ${l.monto}` : ""}
                    </option>
                  ))}
                  <option value="__otro__">Otro link (pegar manualmente)</option>
                </select>
              </div>
            ) : null}
            {requierePago && linkSel === "__otro__" ? (
              <div>
                <label className={labelClase}>Link de pago personalizado</label>
                <Input
                  value={linkCustom}
                  onChange={(e) => setLinkCustom(e.target.value)}
                  placeholder="https://www.mercadopago.cl/…"
                />
              </div>
            ) : null}
            <div>
              <label className={labelClase}>Mensaje de bienvenida (opcional, sale en el encabezado)</label>
              <Input
                value={mensaje}
                onChange={(e) => setMensaje(e.target.value)}
                placeholder="¡Hola Juan! Completa estos datos y quedamos operativos."
              />
            </div>
          </div>
          {!requierePago ? (
            <p className="mb-3 text-xs text-muted-foreground">
              El paso de suscripción NO aparecerá en el formulario del cliente.
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={creando || !nombre.trim()}>
              <Link2 className="size-4" />
              Generar link de bienvenida
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Al generar, el link queda copiado al portapapeles listo para enviarlo por correo o WhatsApp.
          </p>
        </form>
      ) : null}

      <div className="overflow-x-auto rounded-xl border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <ThSort col="cliente" orden={orden} setOrden={setOrden}>Cliente</ThSort>
              <ThSort col="creada" orden={orden} setOrden={setOrden}>Creada</ThSort>
              <ThSort col="plan" orden={orden} setOrden={setOrden}>Plan / link de pago</ThSort>
              <ThSort col="estado" orden={orden} setOrden={setOrden}>Estado</ThSort>
              <ThSort col="empresa" orden={orden} setOrden={setOrden}>Empresa vinculada</ThSort>
              <TableHead className="text-right">Link</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invitaciones.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  Aún no hay invitaciones. Crea la primera con &quot;Nueva invitación&quot;.
                </TableCell>
              </TableRow>
            ) : null}
            {invitacionesOrdenadas.map((i) => (
              <TableRow key={i.id}>
                <TableCell className="text-sm font-medium">{i.nombre_cliente}</TableCell>
                <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                  {formatFecha(i.created_at)}
                </TableCell>
                <TableCell className="max-w-44 truncate text-xs text-muted-foreground" title={i.link_pago ?? undefined}>
                  {i.link_pago_nombre ?? (i.link_pago ? "Link personalizado" : "No requiere")}
                </TableCell>
                <TableCell>
                  {i.estado === "completada" ? (
                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                      Completada{i.completada_at ? ` · ${formatFecha(i.completada_at)}` : ""}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-700">
                      Esperando respuesta
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="max-w-48 truncate text-xs" title={i.empresa_razon ?? undefined}>
                  {i.empresa_razon ?? "—"}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1.5">
                    {i.respuestas ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setViendo(i)}
                      >
                        <Eye className="size-3.5" />
                        Respuestas
                      </Button>
                    ) : null}
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-7"
                      title="Copiar link de bienvenida"
                      onClick={() => copiar(i.id, urlBienvenida(i.token))}
                    >
                      {copiado === i.id ? (
                        <Check className="size-3.5 text-teal-600" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                    </Button>
                    <a
                      href={urlBienvenida(i.token)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex size-7 items-center justify-center rounded-md border hover:bg-muted"
                      title="Abrir la vista del cliente"
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Dialog de respuestas */}
      <Dialog open={viendo !== null} onOpenChange={(o) => !o && setViendo(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Respuestas de {viendo?.nombre_cliente}</DialogTitle>
            <DialogDescription>
              Todo esto ya quedó aplicado en la ficha de la empresa
              {viendo?.empresa_razon ? ` (${viendo.empresa_razon})` : ""}.
            </DialogDescription>
          </DialogHeader>
          {r ? (
            <div className="space-y-4 text-sm">
              {(["empresa", "contacto", "accesos"] as const).map((seccion) => {
                const datos = r[seccion];
                if (!datos) return null;
                const filas = Object.entries(datos).filter(([, v]) => v && String(v).trim());
                if (!filas.length) return null;
                return (
                  <div key={seccion}>
                    <h4 className="mb-1.5 text-xs font-bold tracking-wide text-muted-foreground uppercase">
                      {seccion === "empresa" ? "Empresa" : seccion === "contacto" ? "Contacto" : "Accesos"}
                    </h4>
                    <div className="grid gap-x-6 gap-y-1 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2">
                      {filas.map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-3">
                          <span className="text-xs text-muted-foreground">{ETIQUETA_CAMPO[k] ?? k}</span>
                          <span className="text-right text-xs font-medium break-all">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              <div>
                <h4 className="mb-1.5 text-xs font-bold tracking-wide text-muted-foreground uppercase">
                  Equipo declarado
                </h4>
                {r.rrhh?.tiene_trabajadores && r.rrhh.trabajadores?.length ? (
                  <div className="overflow-hidden rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nombre</TableHead>
                          <TableHead>RUT</TableHead>
                          <TableHead>Cargo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {r.rrhh.trabajadores.map((t, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="text-xs">
                              {`${t.nombres ?? ""} ${t.apellidos ?? ""}`.trim()}
                            </TableCell>
                            <TableCell className="text-xs">{t.rut || "—"}</TableCell>
                            <TableCell className="text-xs">{t.cargo || "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Declaró no tener trabajadores contratados.</p>
                )}
              </div>
              {r.pago ? (
                <p className="text-xs text-muted-foreground">
                  Pago: {r.pago.ya_suscrito ? "indicó que ya está suscrito." : "no marcó la suscripción como hecha."}
                </p>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
