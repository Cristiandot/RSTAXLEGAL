import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseUrl, supabasePublishableKey } from "./config";

/**
 * Cliente Supabase para Server Components, Route Handlers y Server Actions.
 * Lee y escribe la sesión en cookies. Debe crearse por request (no cachear).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabasePublishableKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Invocado desde un Server Component: el refresh de sesión lo
            // maneja el middleware, así que se puede ignorar.
          }
        },
      },
    },
  );
}
