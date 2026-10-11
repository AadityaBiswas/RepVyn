// Sends due workout reminders as web push (ADR-0007). Called by pg_cron every 5 minutes
// with the x-cron-secret header; see supabase/setup/cron.sql.
import webpush from "npm:web-push@3.6.7";
import { safeEqual } from "../_shared/razorpay.ts";
import { json } from "../_shared/http.ts";
import { reminderMessage } from "../_shared/reminders.ts";
import { admin, log } from "../_shared/supabase.ts";

webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") ?? "mailto:support@repvyn.app", Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);

Deno.serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET") ?? "";
  if (!secret || !safeEqual(req.headers.get("x-cron-secret") ?? "", secret)) return json({ error: "forbidden" }, 403);
  const db = admin();
  let sent = 0, gone = 0, failed = 0;
  // Claim in batches until nothing is due; each claim marks its users so nobody is sent twice.
  for (let round = 0; round < 20; round++) {
    const { data, error } = await db.rpc("claim_due_reminders", { p_limit: 500 });
    if (error) {
      log("send-reminders", "claim failed", { error: error.message });
      return json({ error: "claim failed" }, 500);
    }
    if (!data?.length) break;
    await Promise.all((data as { user_id: string; endpoint: string; p256dh: string; auth: string }[]).map(async (r) => {
      try {
        await webpush.sendNotification({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }, JSON.stringify(reminderMessage()), { TTL: 3600, urgency: "normal" });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          gone++;
          await db.from("push_subscriptions").delete().eq("endpoint", r.endpoint);
        } else {
          failed++;
          log("send-reminders", "push failed", { code, error: String(e).slice(0, 200) });
        }
      }
    }));
  }
  log("send-reminders", "done", { sent, gone, failed });
  return json({ sent, gone, failed });
});
