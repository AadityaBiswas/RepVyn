// A local stand-in for Supabase, for trying accounts and sync without Docker or a cloud project.
// Runs the real migrations in PGlite and answers the few auth and REST calls the app makes.
// Any email signs in with the code 123456. Data lives in memory and is gone when it stops.
//
//   npm run dev:backend                     (listens on http://localhost:54321)
//   REPVYN_SUPABASE_URL=http://localhost:54321 REPVYN_SUPABASE_ANON_KEY=dev npm run app -- --serve
//
// Not for production: it does no real authentication.
import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { addUser, as, freshDb } from "../tests/backend/pg";

const PORT = Number(process.env.PORT ?? 54321);
const db = await freshDb();
const users = new Map<string, string>(); // email -> id

const b64u = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (sub: string, email: string) =>
  `${b64u({ alg: "HS256", typ: "JWT" })}.${b64u({ sub, email, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 86400 * 30 })}.dev`;
const subOf = (req: IncomingMessage): string | null => {
  const t = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
  try {
    return (JSON.parse(Buffer.from(t.split(".")[1] ?? "", "base64url").toString()) as { sub?: string }).sub ?? null;
  } catch {
    return null;
  }
};
const idFor = (email: string) => {
  const h = createHash("sha256").update(email.toLowerCase()).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
function session(email: string) {
  const id = users.get(email)!;
  const user = { id, email, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  return { access_token: jwt(id, email), refresh_token: `r-${email}`, token_type: "bearer", expires_in: 86400 * 30, expires_at: Math.floor(Date.now() / 1000) + 86400 * 30, user };
}

const argTypes = new Map<string, { names: string[]; types: string[] }>();
async function signature(fn: string) {
  if (!argTypes.has(fn)) {
    const r = await db.query<{ names: string[]; types: string }>(
      "select proargnames as names, array_to_string(proargtypes::regtype[], ',') as types from pg_proc where proname = $1 and pronamespace = 'public'::regnamespace", [fn]);
    if (!r.rows[0]) return null;
    argTypes.set(fn, { names: r.rows[0].names ?? [], types: r.rows[0].types ? r.rows[0].types.split(",") : [] });
  }
  return argTypes.get(fn)!;
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(body === undefined ? "" : JSON.stringify(body));
}
const read = (req: IncomingMessage) => new Promise<string>((ok) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => ok(s)); });

createServer(async (req, res) => {
  res.setHeader("access-control-allow-origin", req.headers.origin ?? "*");
  res.setHeader("access-control-allow-headers", "authorization, apikey, content-type, x-client-info, prefer, accept-profile, content-profile, x-supabase-api-version");
  res.setHeader("access-control-allow-methods", "GET, POST, DELETE, PATCH, OPTIONS");
  if (req.method === "OPTIONS") return send(res, 204, undefined);
  const url = new URL(req.url!, "http://x");
  const body = req.method === "GET" ? {} : JSON.parse((await read(req)) || "{}");
  try {
    if (url.pathname === "/auth/v1/otp") {
      const email = String(body.email).toLowerCase();
      if (!users.has(email)) {
        users.set(email, idFor(email));
        await addUser(db, users.get(email)!).catch(() => {});
      }
      console.log(`code for ${email}: 123456`);
      return send(res, 200, {});
    }
    if (url.pathname === "/auth/v1/verify") {
      const email = String(body.email).toLowerCase();
      if (body.token !== "123456" || !users.has(email)) return send(res, 403, { code: "otp_expired", msg: "Token has expired or is invalid" });
      return send(res, 200, session(email));
    }
    if (url.pathname === "/auth/v1/token") {
      const email = String(body.refresh_token ?? "").replace(/^r-/, "");
      return users.has(email) ? send(res, 200, session(email)) : send(res, 400, { msg: "bad refresh token" });
    }
    if (url.pathname === "/auth/v1/user") {
      const sub = subOf(req);
      const email = [...users].find(([, id]) => id === sub)?.[0];
      return email ? send(res, 200, session(email).user) : send(res, 401, { msg: "no user" });
    }
    if (url.pathname === "/auth/v1/logout") return send(res, 204, undefined);

    const sub = subOf(req) ?? "anon";
    const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/);
    if (rpc) {
      const sig = await signature(rpc[1]!);
      if (!sig) return send(res, 404, { message: "no such function" });
      const names = Object.keys(body).filter((k) => sig.names.includes(k));
      const sql = `select public.${rpc[1]}(${names.map((n, i) => `${n} => $${i + 1}::${sig.types[sig.names.indexOf(n)]}`).join(", ")}) as r`;
      const params = names.map((n) => (body[n] !== null && typeof body[n] === "object" && !Array.isArray(body[n]) ? JSON.stringify(body[n]) : Array.isArray(body[n]) && sig.types[sig.names.indexOf(n)] === "jsonb" ? JSON.stringify(body[n]) : body[n]));
      const rows = await as<{ r: unknown }>(db, sub, sql, params);
      return send(res, 200, rows[0]?.r ?? null);
    }
    if (url.pathname === "/rest/v1/push_subscriptions") {
      if (req.method === "POST") {
        await as(db, sub, "insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, $3, $4)", [body.user_id, body.endpoint, body.p256dh, body.auth]);
        return send(res, 201, undefined);
      }
      if (req.method === "DELETE") {
        await as(db, sub, "delete from public.push_subscriptions where endpoint = $1", [url.searchParams.get("endpoint")?.replace(/^eq\./, "")]);
        return send(res, 204, undefined);
      }
    }
    if (url.pathname.startsWith("/functions/v1/")) return send(res, 501, { error: "Edge Functions are not emulated; use `npx supabase functions serve`." });
    return send(res, 404, { message: "not emulated" });
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return send(res, 400, { code: err.code ?? "XX000", message: err.message ?? String(e) });
  }
}).listen(PORT, "127.0.0.1", () => console.log(`dev backend on http://localhost:${PORT} (sign in with any email, code 123456)`));
