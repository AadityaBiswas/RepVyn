// Pro checkout and management for the signed-in user (ADR-0005).
//   { action: "checkout", plan: "in_yearly" }                     -> { keyId, subscriptionId, trial }
//   { action: "verify", paymentId, subscriptionId, signature }     -> entitlement
//   { action: "cancel" }                                          -> entitlement (Pro stays until the period ends)
import { allowedOrigins, corsHeaders, HttpError, json } from "../_shared/http.ts";
import { isPlanKey, razorpayApi, razorpayConfig, rowFromSubscription, subscriptionRequest, verifyCheckout } from "../_shared/razorpay.ts";
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
    const cfg = razorpayConfig((k) => Deno.env.get(k));
    const rzp = razorpayApi(cfg);
    const entitlement = async () => {
      const { data, error } = await db.rpc("entitlement_for", { p_user: user.id });
      if (error) throw error;
      return data as { pro: boolean; hadSubscription: boolean };
    };
    const save = async (row: ReturnType<typeof rowFromSubscription>) => {
      if (!row) return;
      const { error } = await db.rpc("apply_subscription", { p_row: row });
      if (error) throw error;
    };

    if (body.action === "checkout") {
      if (!isPlanKey(body.plan)) throw new HttpError(400, "unknown plan");
      const ent = await entitlement();
      if (ent.pro) throw new HttpError(409, "already Pro");
      // Reuse a checkout opened in the last day for the same plan, so repeated taps do not pile up subscriptions.
      const { data: open } = await db.from("subscriptions").select("provider_subscription_id")
        .eq("user_id", user.id).eq("provider", "razorpay").eq("plan_key", body.plan).eq("status", "created")
        .gt("created_at", new Date(Date.now() - 86_400_000).toISOString()).order("created_at", { ascending: false }).limit(1);
      const reuse = open?.[0]?.provider_subscription_id;
      const sub = reuse ? { id: reuse } : await rzp.createSubscription(subscriptionRequest(cfg, body.plan, user.id, ent.hadSubscription, Date.now()));
      if (!reuse) await save(rowFromSubscription(sub as Parameters<typeof rowFromSubscription>[0], 0));
      log("billing", "checkout", { user: user.id, plan: body.plan, sub: sub.id });
      return json({ keyId: cfg.keyId, subscriptionId: sub.id, trial: !ent.hadSubscription && cfg.trialDays > 0, email: user.email ?? null }, 200, cors);
    }

    if (body.action === "verify") {
      const { paymentId, subscriptionId, signature } = body as Record<string, string>;
      if (!(await verifyCheckout(paymentId, subscriptionId, signature, cfg.keySecret))) throw new HttpError(400, "payment could not be verified");
      // Re-read from Razorpay rather than trusting the client, and check it is this user's.
      const sub = await rzp.fetchSubscription(subscriptionId);
      const row = rowFromSubscription(sub, Math.floor(Date.now() / 1000));
      if (!row || row.user_id !== user.id) throw new HttpError(403, "not your subscription");
      await save(row);
      log("billing", "verified", { user: user.id, sub: sub.id, status: sub.status });
      return json(await entitlement(), 200, cors);
    }

    if (body.action === "cancel") {
      const { data: subs, error } = await db.from("subscriptions").select("provider_subscription_id, status")
        .eq("user_id", user.id).eq("provider", "razorpay").in("status", ["authenticated", "active", "pending"]);
      if (error) throw error;
      for (const s of subs ?? []) {
        // A trial that has not been charged yet ends now; a paid period runs to its end.
        const sub = await rzp.cancelSubscription(s.provider_subscription_id, s.status !== "authenticated");
        await save(rowFromSubscription(sub, Math.floor(Date.now() / 1000), true));
      }
      log("billing", "cancel", { user: user.id, count: subs?.length ?? 0 });
      return json(await entitlement(), 200, cors);
    }

    throw new HttpError(400, "unknown action");
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) log("billing", "error", { error: String(e) });
    return json({ error: status === 500 ? "something went wrong" : (e as Error).message }, status, cors);
  }
});
