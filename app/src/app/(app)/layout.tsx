import { getUsuarioActual } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/app-sidebar";
import { RelojHeader } from "@/components/reloj-header";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const usuario = await getUsuarioActual();

  // Gestiones de oficina sin terminar → contador rojo en "Inicio y requerimientos".
  const supabase = await createClient();
  const { count } = await supabase
    .from("v_gestiones_oficina")
    .select("*", { count: "exact", head: true })
    .eq("pendiente", true);

  return (
    <SidebarProvider>
      <AppSidebar usuario={usuario} gestionesPendientes={count ?? 0} />
      <SidebarInset className="bg-transparent">
        <header className="flex h-16 shrink-0 items-center gap-2 px-4 sm:px-6">
          <SidebarTrigger className="-ml-1 text-muted-foreground" />
          <RelojHeader />
        </header>
        <div className="flex-1 overflow-auto">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
