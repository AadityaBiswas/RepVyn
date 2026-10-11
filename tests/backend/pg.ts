// Runs the Supabase migrations in PGlite (Postgres in WebAssembly) with a minimal stand-in
// for Supabase's auth schema and roles, so RLS and the SQL functions are tested for real.
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS = join(import.meta.dirname, "../../supabase/migrations");

const SUPABASE_STUB = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth, public to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
`;

export async function freshDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS, f), "utf8"));
  }
  await db.exec("grant all on all tables in schema public to service_role;");
  return db;
}

/** Runs `sql` as a signed-in user (role authenticated, auth.uid() = uid), or as the service role. */
export async function as<T = Record<string, unknown>>(db: PGlite, who: string | "service" | "anon", sql: string, params: unknown[] = []): Promise<T[]> {
  const role = who === "service" ? "service_role" : who === "anon" ? "anon" : "authenticated";
  const sub = who === "service" || who === "anon" ? "" : who;
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [sub]);
    await tx.exec(`set local role ${role}`);
    const r = await tx.query<T>(sql, params);
    return r.rows;
  });
}

export async function addUser(db: PGlite, id: string): Promise<void> {
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${id.slice(0, 8)}@example.com`]);
}
