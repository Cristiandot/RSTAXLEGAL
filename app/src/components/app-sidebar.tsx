"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { ChevronsUpDown, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { modulosVisibles, type Rol } from "@/lib/modules";
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

export function AppSidebar({ usuario }: { usuario: UsuarioSesion }) {
  const pathname = usePathname();
  const router = useRouter();
  const secciones = modulosVisibles(usuario.rol);

  async function cerrarSesion() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <Sidebar collapsible="icon" variant="floating">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/" />}>
              <Image
                src="/logo-oscuro.png"
                alt="Rodríguez Samith Tax & Legal"
                width={170}
                height={48}
                priority
                className="h-8 w-auto object-contain object-left group-data-[collapsible=icon]:hidden"
              />
              <Image
                src="/logo-icono-blanco.png"
                alt=""
                width={24}
                height={20}
                className="hidden size-6 shrink-0 object-contain group-data-[collapsible=icon]:block"
              />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {secciones.map((seccion) => (
          <SidebarGroup key={seccion.seccion}>
            <SidebarGroupLabel>{seccion.seccion}</SidebarGroupLabel>
            <SidebarMenu>
              {seccion.modulos.map((m) => {
                const activo = m.estado === "activo";
                const enRuta =
                  pathname === m.href || pathname.startsWith(`${m.href}/`);
                return (
                  <SidebarMenuItem key={m.key}>
                    {activo ? (
                      <SidebarMenuButton
                        render={<Link href={m.href} />}
                        isActive={enRuta}
                        tooltip={m.label}
                      >
                        <m.icon />
                        <span>{m.label}</span>
                      </SidebarMenuButton>
                    ) : (
                      <SidebarMenuButton
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
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
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
