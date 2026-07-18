"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mail, Pencil, Phone, Plus, Trash2 } from "lucide-react";
import { comparar, type Orden } from "@/lib/ordenar";
import { ThSort } from "@/components/th-sort";
import {
  guardarContactoInstitucion,
  eliminarContactoInstitucion,
} from "./directorio-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ContactoInstitucion = {
  id: string;
  institucion: string;
  area: string | null;
  telefono: string | null;
  correo: string | null;
  notas: string | null;
};

const VACIO = { id: null as string | null, institucion: "", area: "", telefono: "", correo: "", notas: "" };

/** Valor por columna para el ordenamiento del directorio. */
const VALOR_COL: Record<string, (c: ContactoInstitucion) => unknown> = {
  institucion: (c) => c.institucion,
  area: (c) => c.area,
  telefono: (c) => c.telefono,
  correo: (c) => c.correo,
};

/**
 * Directorio de teléfonos y correos de instituciones (ACHS, IMED, COMPIN,
 * isapres…) para cuando el equipo necesita llamar durante una tramitación.
 */
export function DirectorioInstituciones({
  contactos,
}: {
  contactos: ContactoInstitucion[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState(VACIO);
  const [orden, setOrden] = useState<Orden>(null);
  const [ocupado, startAccion] = useTransition();

  // Sin orden elegido queda el del servidor (institución, área).
  const ordenados = useMemo(() => {
    if (!orden || !VALOR_COL[orden.col]) return contactos;
    const valor = VALOR_COL[orden.col];
    return [...contactos].sort((a, b) => comparar(valor(a), valor(b), orden.dir));
  }, [contactos, orden]);

  function editar(c: ContactoInstitucion) {
    setForm({
      id: c.id,
      institucion: c.institucion,
      area: c.area ?? "",
      telefono: c.telefono ?? "",
      correo: c.correo ?? "",
      notas: c.notas ?? "",
    });
  }

  function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = { ...form };
    startAccion(async () => {
      const res = await guardarContactoInstitucion(datos);
      if (res.ok) {
        toast.success(datos.id ? "Contacto actualizado" : "Contacto agregado");
        setForm(VACIO);
        router.refresh();
      } else toast.error(res.error ?? "Error al guardar");
    });
  }

  function eliminar(c: ContactoInstitucion) {
    if (!window.confirm(`¿Eliminar el contacto de ${c.institucion}${c.area ? ` (${c.area})` : ""}?`)) return;
    startAccion(async () => {
      const res = await eliminarContactoInstitucion(c.id);
      if (res.ok) {
        toast.success("Contacto eliminado");
        router.refresh();
      } else toast.error(res.error ?? "Error");
    });
  }

  return (
    <>
      <Button variant="outline" onClick={() => setAbierto(true)}>
        <Phone className="size-4" />
        Directorio instituciones
      </Button>

      <Dialog open={abierto} onOpenChange={(o) => { if (!o) { setAbierto(false); setForm(VACIO); } }}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-heading">Directorio de instituciones</DialogTitle>
            <DialogDescription>
              Teléfonos y correos de ACHS, IMED, COMPIN, isapres y demás
              instituciones, para tenerlos a mano al tramitar.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-72 overflow-y-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <ThSort col="institucion" orden={orden} setOrden={setOrden}>
                    Institución
                  </ThSort>
                  <ThSort col="area" orden={orden} setOrden={setOrden}>
                    Área
                  </ThSort>
                  <ThSort col="telefono" orden={orden} setOrden={setOrden}>
                    Teléfono
                  </ThSort>
                  <ThSort col="correo" orden={orden} setOrden={setOrden}>
                    Correo
                  </ThSort>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contactos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      Sin contactos todavía — agrega el primero abajo.
                    </TableCell>
                  </TableRow>
                ) : (
                  ordenados.map((c) => (
                    <TableRow key={c.id} title={c.notas ?? undefined}>
                      <TableCell className="font-medium">{c.institucion}</TableCell>
                      <TableCell>{c.area ?? "—"}</TableCell>
                      <TableCell>
                        {c.telefono ? (
                          <a href={`tel:${c.telefono.replace(/\s/g, "")}`} className="flex items-center gap-1 text-sky-700 hover:underline">
                            <Phone className="size-3" />
                            {c.telefono}
                          </a>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        {c.correo ? (
                          <a href={`mailto:${c.correo}`} className="flex items-center gap-1 text-sky-700 hover:underline">
                            <Mail className="size-3" />
                            {c.correo}
                          </a>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => editar(c)} title="Editar">
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive" disabled={ocupado} onClick={() => eliminar(c)} title="Eliminar">
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <form onSubmit={guardar} className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/40 p-3 sm:grid-cols-4">
            <div className="flex flex-col gap-1">
              <Label className="text-xs" htmlFor="dir-institucion">Institución</Label>
              <Input
                id="dir-institucion"
                required
                placeholder="ej. ACHS"
                value={form.institucion}
                onChange={(e) => setForm({ ...form, institucion: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs" htmlFor="dir-area">Área</Label>
              <Input
                id="dir-area"
                placeholder="ej. Licencias / Mesa central"
                value={form.area}
                onChange={(e) => setForm({ ...form, area: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs" htmlFor="dir-telefono">Teléfono</Label>
              <Input
                id="dir-telefono"
                placeholder="ej. 600 600 2247"
                value={form.telefono}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs" htmlFor="dir-correo">Correo</Label>
              <Input
                id="dir-correo"
                type="email"
                placeholder="opcional"
                value={form.correo}
                onChange={(e) => setForm({ ...form, correo: e.target.value })}
              />
            </div>
            <div className="col-span-2 flex flex-col gap-1 sm:col-span-3">
              <Label className="text-xs" htmlFor="dir-notas">Notas (opcional)</Label>
              <Input
                id="dir-notas"
                placeholder="ej. atienden hasta las 18:00, pedir anexo 2…"
                value={form.notas}
                onChange={(e) => setForm({ ...form, notas: e.target.value })}
              />
            </div>
            <div className="flex items-end justify-end gap-2">
              {form.id ? (
                <Button type="button" variant="outline" onClick={() => setForm(VACIO)} disabled={ocupado}>
                  Cancelar
                </Button>
              ) : null}
              <Button type="submit" disabled={ocupado}>
                <Plus className="size-4" />
                {form.id ? "Guardar cambios" : "Agregar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
