// Razorpay webhook: the source of truth for subscription state (ADR-0005).
// Verified by signature over the raw body, de-duplicated by event id, and order-safe.
import { json } from "../_shared/http.ts";
import { rowFromSubscription, SUBSCRIPTION_EVENTS, verifyWebhook, type WebhookBody } from "../_shared/razorpay.ts";
import { admin, log } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const raw = await req.text();
  if (!(await verifyWebhook(raw, req.headers.get("x-razorpay-signature"), Deno.env.get("RAZORPAY_WEBHOOK_SECRET") ?? ""))) {
    log("razorpay-webhook", "bad signature");
    return json({ error: "bad signature" }, 401);
  }
  let body: WebhookBody;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "bad json" }, 400);
  }
  const db = admin();
  const sub = body.payload?.subscription?.entity;
  const eventId = req.headers.get("x-razorpay-event-id") ?? `${body.event}:${sub?.id ?? ""}:${body.created_at}`;

  const { data: fresh, error: dupErr } = await db.from("billing_events")
    .upsert({ event_id: eventId, type: body.event, provider_subscription_id: sub?.id ?? null, payload: body }, { onConflict: "event_id", ignoreDuplicates: true })
    .select("event_id");
  if (dupErr) {
    log("razorpay-webhook", "store failed", { error: dupErr.message });
    return json({ error: "retry" }, 500); // Razorpay retries non-2xx responses.
  }
  if (!fresh?.length) return json({ ok: true, duplicate: true });

  if (SUBSCRIPTION_EVENTS.has(body.event) && sub) {
    const row = rowFromSubscription(sub, body.created_at);
    if (!row) {
      log("razorpay-webhook", "no user on subscription", { sub: sub.id });
      return json({ ok: true, ignored: true });
    }
    const { error } = await db.rpc("apply_subscription", { p_row: row });
    if (error) {
      // Let Razorpay retry: forget the event so the retry is not treated as a duplicate.
      await db.from("billing_events").delete().eq("event_id", eventId);
      log("razorpay-webhook", "apply failed", { error: error.message, sub: sub.id });
      return json({ error: "retry" }, 500);
    }
    log("razorpay-webhook", "applied", { event: body.event, sub: sub.id, status: sub.status });
  }
  return json({ ok: true });
});
