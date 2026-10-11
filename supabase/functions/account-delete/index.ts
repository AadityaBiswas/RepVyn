// Deletes the signed-in user's account and all their data (DPDP, CCPA, store rules).
// Body: { confirm: "DELETE" }. Live subscriptions are cancelled first so nobody is charged after.
import { allowedOrigins, corsHeaders, HttpError, json } from "../_shared/http.ts";
import { razorpayApi, RazorpayError } from "../_shared/razorpay.ts";
import { admin, caller, log } from "../_shared/supabase.ts";

const origins = allowedOrigins(Deno.env.get("APP_ORIGINS"));

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get("origin"), origins);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  try {
    if (req.method !== "POST") throw new HttpError(405, "POST only");
    const db = admin();
    const user = await caller(req, db);
    const body = await req.json().catch(() => ({}));
    if (body.confirm !== "DELETE") throw new HttpError(400, "confirmation missing");

    const { data: subs, error } = await db.from("subscriptions").select("provider_subscription_id")
      .eq("user_id", user.id).eq("provider", "razorpay").in("status", ["created", "authenticated", "active", "pending", "halted", "paused"]);
    if (error) throw error;
    if (subs?.length) {
      const keyId = Deno.env.get("RAZORPAY_KEY_ID"), keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
      if (!keyId || !keySecret) throw new Error("Razorpay keys missing; cannot cancel before delete");
      const rzp = razorpayApi({ keyId, keySecret });
      for (const s of subs) {
        try {
          await rzp.cancelSubscription(s.provider_subscription_id, false);
        } catch (e) {
          // Already cancelled or expired is fine; anything else stops the delete so billing never outlives the account.
          if (!(e instanceof RazorpayError && (e.status === 400 || e.status === 404))) throw e;
        }
      }
    }
    const { error: delErr } = await db.auth.admin.deleteUser(user.id);
    if (delErr) throw delErr;
    log("account-delete", "deleted", { user: user.id, cancelled: subs?.length ?? 0 });
    return json({ ok: true }, 200, cors);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) log("account-delete", "error", { error: String(e) });
    return json({ error: status === 500 ? "something went wrong" : (e as Error).message }, status, cors);
  }
});
