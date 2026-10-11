// Deno-only helpers: the service-role client and the signed-in caller.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { HttpError } from "./http.ts";

export function admin(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** The user whose access token is in the Authorization header, or a 401. */
export async function caller(req: Request, db: SupabaseClient): Promise<{ id: string; email: string | undefined }> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "sign in first");
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "sign in first");
  return { id: data.user.id, email: data.user.email };
}

export function log(fn: string, msg: string, extra: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ fn, msg, ...extra }));
}
