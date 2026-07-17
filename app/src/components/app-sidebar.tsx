"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { ChevronsUpDown, ChevronRight, LogOut, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { modulosVisibles, FAVORITOS, type Rol, type Modulo } from "@/lib/modules";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

export type UsuarioSesion = {
  nombre: string;
  correo: string;
  rol: Rol;
};

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  const a = partes[0]?.[0] ?? "";
  const b = partes[1]?.[0] ?? "";
  return (a + b).toUpperCase() || "?";
}

/** Un ítem de módulo dentro del menú (o dentro de Favoritos). */
function ItemModulo({
  m,
  color,
  activo,
  enRuta,
  gestionesPendientes,
}: {
  m: Modulo;
  color?: string;
  activo: boolean;
  enRuta: boolean;
  gestionesPendientes: number;
}) {
  const conBadgeInicio = m.key === "inicio" && gestionesPendientes > 0;

  if (!activo) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          size="sm"
          tooltip={`${m.label} — ${m.estado === "desarrollo" ? "En desarrollo" : "Próximamente"}`}
          className="cursor-default opacity-60"
          aria-disabled
        >
          <m.icon />
          <span>{m.label}</span>
          <Badge
            variant="outline"
            className="ml-auto border-white/20 bg-white/10 text-[10px] font-normal text-white/70"
          >
            {m.estado === "desarrollo" ? "Dev" : "Próx."}
          </Badge>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      {enRuta && color ? (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1.5 bottom-1.5 left-1 z-10 w-0.5 rounded-full group-data-[collapsible=icon]:hidden"
          style={{ background: color }}
        />
      ) : null}
      <SidebarMenuButton
        size="sm"
        render={<Link href={m.href} />}
        isActive={enRuta}
        tooltip={
          conBadgeInicio
            ? `${m.label} — ${gestionesPendientes} pendientes`
            : m.label
        }
      >
        <m.icon style={enRuta && color ? { color } : undefined} />
        <span>{m.label}</span>
        {conBadgeInicio ? (
          <span className="ml-auto flex size-5 shrink-0 items-center justify-center rounded-full bg-red-500 text-[10px] font-semibold text-white">
            {gestionesPendientes > 99 ? "99+" : gestionesPendientes}
          </span>
        ) : null}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppSidebar({
  usuario,
  gestionesPendientes = 0,
}: {
  usuario: UsuarioSesion;
  /** Gestiones sin terminar (v_gestiones_oficina) — puntito rojo en Inicio. */
  gestionesPendientes?: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { state } = useSidebar();
  const secciones = modulosVisibles(usuario.rol);

  const enRuta = React.useCallback(
    (href: string) =>
      href === "/"
        ? pathname === "/"
        : pathname === href || pathname.startsWith(`${href}/`),
    [pathname]
  );

  // Estado abierto/cerrado por área. Por defecto todas abiertas.
  const areas = secciones.filter((s) => s.seccion !== "Inicio");
  const [abiertas, setAbiertas] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries(areas.map((s) => [s.seccion, true]))
  );
  const toggle = (nombre: string) =>
    setAbiertas((prev) => ({ ...prev, [nombre]: !(prev[nombre] ?? true) }));

  // Módulos por key (para resolver los Favoritos con su color de área).
  const porKey = React.useMemo(() => {
    const map = new Map<string, { modulo: Modulo; color?: string }>();
    for (const s of secciones)
      for (const m of s.modulos) map.set(m.key, { modulo: m, color: s.color });
    return map;
  }, [secciones]);
  const favoritos = FAVORITOS.map((k) => porKey.get(k)).filter(
    (x): x is { modulo: Modulo; color?: string } =>
      Boolean(x) && x!.modulo.estado === "activo"
  );

  const inicioSeccion = secciones.find((s) => s.seccion === "Inicio");
  const expandido = state !== "collapsed";

  async function cerrarSesion() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <Sidebar collapsible="icon" variant="floating">
      <SidebarHeader className="p-2">
        <Link
          href="/"
          className="flex items-center justify-center rounded-md px-2 py-2 group-data-[collapsible=icon]:px-0"
        >
          <Image
            src="/logo-oscuro.png"
            alt="Rodríguez Samith Tax & Legal"
            width={210}
            height={60}
            priority
            className="h-12 w-auto object-contain group-data-[collapsible=icon]:hidden"
          />
          <Image
            src="/logo-icono-blanco.png"
            alt="Rodríguez Samith Tax & Legal"
            width={32}
            height={27}
            className="hidden size-8 shrink-0 object-contain group-data-[collapsible=icon]:block"
          />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {/* Inicio — siempre visible, sin plegar */}
        {inicioSeccion ? (
          <SidebarGroup className="pb-0">
            <SidebarMenu>
              {inicioSeccion.modulos.map((m) => (
                <ItemModulo
                  key={m.key}
                  m={m}
                  color={inicioSeccion.color}
                  activo={m.estado === "activo"}
                  enRuta={enRuta(m.href)}
                  gestionesPendientes={gestionesPendientes}
                />
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ) : null}

        {/* Favoritos — solo con el menú expandido */}
        {expandido && favoritos.length > 0 ? (
          <SidebarGroup className="py-1">
            <SidebarGroupLabel className="gap-1.5">
              <Star className="size-3.5" />
              Favoritos
            </SidebarGroupLabel>
            <SidebarMenu>
              {favoritos.map(({ modulo, color }) => (
                <ItemModulo
                  key={`fav-${modulo.key}`}
                  m={modulo}
                  color={color}
                  activo
                  enRuta={enRuta(modulo.href)}
                  gestionesPendientes={gestionesPendientes}
                />
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ) : null}

        {/* Áreas plegables */}
        {areas.map((seccion) => {
          const abierta = abiertas[seccion.seccion] ?? true;
          return (
            <SidebarGroup key={seccion.seccion} className="py-1">
              <SidebarGroupLabel
                render={
                  <button
                    type="button"
                    aria-expanded={abierta}
                    onClick={() => toggle(seccion.seccion)}
                  />
                }
                className="w-full cursor-pointer justify-between transition-colors select-none hover:text-sidebar-foreground"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: seccion.color }}
                  />
                  <span className="truncate">{seccion.seccion}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-sidebar-foreground/40">
                  <span className="text-[10px] tabular-nums">
                    {seccion.modulos.length}
                  </span>
                  <ChevronRight
                    className={cn(
                      "size-3.5 transition-transform duration-200",
                      abierta && "rotate-90"
                    )}
                  />
                </span>
              </SidebarGroupLabel>

              {/* En modo contraído (icon) siempre se muestran los ítems como iconos */}
              {abierta || !expandido ? (
                <SidebarMenu>
                  {seccion.modulos.map((m) => (
                    <ItemModulo
                      key={m.key}
                      m={m}
                      color={seccion.color}
                      activo={m.estado === "activo"}
                      enRuta={enRuta(m.href)}
                      gestionesPendientes={gestionesPendientes}
                    />
                  ))}
                </SidebarMenu>
              ) : null}
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <SidebarMenuButton size="lg" render={<DropdownMenuTrigger />}>
                <Avatar className="size-8 rounded-lg">
                  <AvatarFallback className="rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                    {iniciales(usuario.nombre)}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{usuario.nombre}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {usuario.rol}
                  </span>
                </div>
                <ChevronsUpDown className="ml-auto size-4" />
              </SidebarMenuButton>
              <DropdownMenuContent
                className="min-w-56 rounded-lg"
                side="top"
                align="end"
              >
                <DropdownMenuLabel className="font-normal">
                  <div className="grid text-sm">
                    <span className="font-medium">{usuario.nombre}</span>
                    <span className="text-xs text-muted-foreground">
                      {usuario.correo}
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={cerrarSesion}
                  className="cursor-pointer"
                >
                  <LogOut className="size-4" />
                  Cerrar sesión
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
