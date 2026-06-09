import { CalendarDays } from "lucide-react";
import { getUsuarioActual } from "@/lib/auth";
import { AppSidebar } from "@/components/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

function fechaHoy(): string {
  const h = new Date();
  const dd = String(h.getDate()).padStart(2, "0");
  const mm = String(h.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${h.getFullYear()}`;
}

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const usuario = await getUsuarioActual();

  return (
    <SidebarProvider>
      <AppSidebar usuario={usuario} />
      <SidebarInset className="bg-transparent">
        <header className="flex h-16 shrink-0 items-center gap-2 px-4 sm:px-6">
          <SidebarTrigger className="-ml-1 text-muted-foreground" />
          <div className="ml-auto flex items-center gap-2 rounded-full border bg-card px-3.5 py-1.5 text-sm text-muted-foreground shadow-sm">
            <CalendarDays className="size-4 text-[var(--brand-teal)]" />
            <span className="font-medium text-foreground">{fechaHoy()}</span>
          </div>
        </header>
        <div className="flex-1 overflow-auto">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
