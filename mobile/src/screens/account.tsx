// Sign in, and the Profile "Account" section, after AccountPage and AccountSection in app/src/ui/account.tsx.
import { useState } from "react";
import { TextInput, View } from "react-native";
import { useApp } from "../app";
import { deleteAccount, sendCode, signOut, syncNow, useCloud, verifyCode } from "../cloud";
import { BackButton, BottomCta, Card, H1, Page, Sheet, T } from "../kit";
import { Press } from "../motion";
import { FONT } from "../theme";
import { Row, Section } from "./tabs";

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
function ago(ms: number | null, now: number): string {
  if (!ms) return "Not yet";
  const m = Math.round((now - ms) / 60_000);
  return m < 1 ? "Just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : fmtDate(ms);
}

function Btn({ label, onPress, kind = "quiet", disabled }: { label: string; onPress: () => void; kind?: "ink" | "quiet" | "danger"; disabled?: boolean }) {
  const { c } = useApp();
  const bg = kind === "ink" ? c.ink : kind === "danger" ? c.w2 : c.bg;
  const ink = kind === "ink" ? c.bg : kind === "danger" ? c.onW2 : c.ink;
  return (
    <Press onPress={onPress} disabled={disabled} style={{ height: 52, borderRadius: 999, backgroundColor: bg, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.5 : 1 }}>
      <T w={600} size={16} color={ink}>{label}</T>
    </Press>
  );
}

export function AccountSection() {
  const app = useApp();
  const { c, now } = app;
  const cl = useCloud();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try { await f(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  if (!cl.enabled) return null;
  const syncValue = cl.status === "syncing" ? "Syncing" : cl.status === "offline" ? "Offline" : cl.status === "error" ? "Paused" : ago(cl.lastSyncAt, now);
  return (
    <Section title="Account">
      <Card style={{ paddingHorizontal: 20 }}>
        {!cl.account ? (
          <Row id="signin" label="Sign in" value="" last>
            <View style={{ gap: 12 }}>
              <Btn kind="ink" label="Sign in with email" onPress={app.openAccount} />
            </View>
          </Row>
        ) : (
          <>
            <Row id="sync" label="Synced" value={syncValue}>
              <View style={{ gap: 12 }}>
                <T color={c.muted}>{cl.account.email ?? "Your account"}{cl.error ? `. ${cl.error}` : ""}</T>
                {cl.reauth
                  ? <Btn kind="ink" label="Sign in again" onPress={app.openAccount} />
                  : <Btn label="Sync now" disabled={cl.status === "syncing"} onPress={() => void syncNow()} />}
              </View>
            </Row>
            <Row id="delete" label="Delete account" value="">
              <View style={{ gap: 12 }}>
                {confirm && <T color={c.muted}>This cannot be undone.</T>}
                {confirm
                  ? <Btn kind="danger" label="Delete account and all data" disabled={busy} onPress={() => void run(deleteAccount)} />
                  : <Btn label="Delete account" onPress={() => setConfirm(true)} />}
              </View>
            </Row>
            <Row id="logout" label="Log out" value="" last>
              <View style={{ gap: 12 }}>
                <Btn kind="danger" label="Log out" disabled={busy} onPress={() => void run(signOut)} />
              </View>
            </Row>
          </>
        )}
      </Card>
      {err && <T color={c.accentText} style={{ marginTop: 4 }}>{err}</T>}
    </Section>
  );
}

export function Account() {
  const app = useApp();
  const { c } = app;
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const ready = !busy && (sent ? code.length >= 6 : valid);
  const go = async () => {
    if (!ready) return;
    setBusy(true);
    setErr(null);
    try {
      if (!sent) { await sendCode(email); setSent(true); }
      else {
        await verifyCode(email, code);
        // From first-run set-up: bring the account's training down first, so a set-up account skips set-up.
        if (app.saved.onboarded) app.back();
        else { await syncNow(); app.afterSignIn(); }
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const field = { height: 56, paddingHorizontal: 20, borderRadius: 999, backgroundColor: c.surface, color: c.ink, fontSize: 17, fontFamily: FONT[400] } as const;
  return (
    <Sheet>
      <Page top={64} bottom={132}>
        <H1>{sent ? "Check your email" : "Sign in"}</H1>
        <T size={16} color={c.muted} style={{ marginTop: 12, lineHeight: 22 }}>
          {sent ? email.trim() : "We will email you a code."}
        </T>
        <View style={{ marginTop: 28, gap: 12 }}>
          {!sent ? (
            <TextInput key="email" value={email} onChangeText={setEmail} onSubmitEditing={() => void go()} placeholder="you@example.com" placeholderTextColor={c.faint}
              keyboardType="email-address" autoCapitalize="none" autoComplete="email" autoCorrect={false} autoFocus accessibilityLabel="Email" returnKeyType="send" style={field} />
          ) : (
            <TextInput key="code" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, ""))} onSubmitEditing={() => void go()} placeholder="123456" placeholderTextColor={c.faint}
              keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={8} autoFocus accessibilityLabel="Code"
              style={{ ...field, fontFamily: FONT.mono, letterSpacing: 6, textAlign: "center" }} />
          )}
          {err && <T color={c.accentText}>{err}</T>}
          {sent && <Btn label="Use a different email" disabled={busy} onPress={() => { setSent(false); setCode(""); setErr(null); }} />}
        </View>
      </Page>
      <BackButton onPress={app.back} />
      <BottomCta onPress={() => void go()} disabled={!ready}>{busy ? "One moment" : sent ? "Sign in" : "Email me a code"}</BottomCta>
    </Sheet>
  );
}
