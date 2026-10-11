// Small HTTP helpers for the Edge Functions. No Deno globals here, so tests can import it.

export function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  const ok = origin && (allowed.includes("*") || allowed.includes(origin));
  return {
    "access-control-allow-origin": ok ? origin! : allowed[0] ?? "",
    "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}
export const allowedOrigins = (v: string | undefined) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}
