import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseUrl, supabasePublishableKey } from "./config";

/**
 * Refresca la sesión Supabase en cada request y protege rutas.
 * Si no hay usuario y la ruta no es pública, redirige a /login.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANTE: no ejecutar código entre createServerClient y getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const esRutaPublica =
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/solicitud") || // formulario público de clientes (tokenizado)
    pathname.startsWith("/bienvenida") || // onboarding inicial de clientes nuevos (tokenizado)
    pathname.startsWith("/datos-transferencia") || // datos bancarios de RS (copiar para pagar F29)
    pathname.startsWith("/api/agent/") || // API del agente: exige Bearer AGENT_API_TOKEN (lib/agente)
    pathname === "/api/version"; // diagnóstico de deploy (solo SHA)

  if (!user && !esRutaPublica) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Si ya hay sesión y entra a /login, mandarlo al panel.
  if (user && pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
