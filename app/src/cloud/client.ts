// The backend client, created on first use and only when the build has a backend configured.
// Built from Supabase's auth and PostgREST clients alone (not supabase-js), which keeps realtime and
// storage code out of the bundle.
import { GoTrueClient as AuthClient } from "@supabase/auth-js";
import { PostgrestClient } from "@supabase/postgrest-js";
import { cloudEnabled, config } from "../config";

export interface Backend {
  auth: AuthClient;
  /** PostgREST as the signed-in user (RLS applies). */
  db(): Promise<PostgrestClient>;
  rpc<T>(fn: string, args?: Record<string, unknown>): Promise<{ data: T | null; error: { message: string; code?: string } | null }>;
}

let backend: Backend | null = null;

async function token(auth: AuthClient): Promise<string> {
  const { data } = await auth.getSession();
  return data.session?.access_token ?? config.supabaseAnonKey!;
}

export function supabase(): Backend | null {
  if (!cloudEnabled()) return null;
  if (backend) return backend;
  const url = config.supabaseUrl!.replace(/\/$/, "");
  const anon = config.supabaseAnonKey!;
  const auth = new AuthClient({
    url: `${url}/auth/v1`, headers: { apikey: anon, Authorization: `Bearer ${anon}` },
    storageKey: "repvyn-auth", persistSession: true, autoRefreshToken: true, detectSessionInUrl: false,
  });
  const db = async () => new PostgrestClient(`${url}/rest/v1`, { headers: { apikey: anon, Authorization: `Bearer ${await token(auth)}` } });
  backend = {
    auth,
    db,
    rpc: async <T,>(fn: string, args: Record<string, unknown> = {}) => {
      const { data, error } = await (await db()).rpc(fn, args);
      return { data: data as T | null, error };
    },
  };
  return backend;
}

/** Calls an Edge Function as the signed-in user; throws with the function's own error message. */
export async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const sb = supabase();
  if (!sb) throw new Error("Accounts are not available in this build.");
  let res: Response;
  try {
    res = await fetch(`${config.supabaseUrl!.replace(/\/$/, "")}/functions/v1/${name}`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: config.supabaseAnonKey!, authorization: `Bearer ${await token(sb.auth)}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("No connection. Try again when you are online.");
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Something went wrong. Try again.");
  return data;
}
