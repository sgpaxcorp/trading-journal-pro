// lib/supaBaseClient.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Lee las variables de entorno públicas de Supabase
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Valida que existan (si falta una, revienta en build para que lo veas rápido)
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables."
  );
}

// 🔹 Cliente principal de Supabase (sirve para browser y server)
export const supabase: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

// 🔹 Alias para ser compatible con tu AuthContext y otros imports
//    Ahora puedes hacer:
//    import { supabaseBrowser } from "@/lib/supaBaseClient";
export const supabaseBrowser: SupabaseClient = supabase;

// (Opcional) default export por si en algún archivo usas `import supabase from "..."`
export default supabase;
