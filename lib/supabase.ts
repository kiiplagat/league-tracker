import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Browser client (admin session lives in localStorage). Created lazily so builds work without env vars. */
export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error(
        "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.local."
      );
    }
    client = createClient(url, key);
  }
  return client;
}

/** Stateless client for server-rendered public pages (read-only via RLS). */
export function getPublicClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase environment variables.");
  }
  return createClient(url, key, {
    auth: { persistSession: false },
    // Never let Next.js cache these requests: participants must always see the latest published matches.
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
}
