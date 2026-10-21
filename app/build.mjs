// Bundles the app (engine + catalog + params + body maps) into one self-contained app/dist/index.html,
// and adds what the installable web app needs: the static files in app/public, a versioned service worker,
// and a Cloudflare Pages `_headers` file with a Content Security Policy for exactly this build.
//   npm run app              build once
//   npm run app -- --serve   build, then serve on http://localhost:5173 and rebuild on change
//
// Configuration comes from REPVYN_* environment variables, or a git-ignored `.env` file next to package.json
// (see .env.example). Only public values: nothing here is secret.
import { context } from "esbuild";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const serve = process.argv.includes("--serve");

function env() {
  const out = { ...process.env };
  if (existsSync(".env")) {
    for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && out[m[1]] === undefined) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return out;
}
const e = env();
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const config = {
  supabaseUrl: e.REPVYN_SUPABASE_URL || undefined,
  supabaseAnonKey: e.REPVYN_SUPABASE_ANON_KEY || undefined,
  razorpayKeyId: e.REPVYN_RAZORPAY_KEY_ID || undefined,
  vapidPublicKey: e.REPVYN_VAPID_PUBLIC_KEY || undefined,
  posthogKey: e.REPVYN_POSTHOG_KEY || undefined,
  posthogHost: e.REPVYN_POSTHOG_HOST || undefined,
  ...(e.REPVYN_SUPPORT_EMAIL ? { supportEmail: e.REPVYN_SUPPORT_EMAIL } : {}),
};
if (config.razorpayKeyId?.startsWith("rzp_live_") && !config.supabaseUrl) throw new Error("A live Razorpay key needs REPVYN_SUPABASE_URL too.");

const sha = (s, enc = "base64") => createHash("sha256").update(s).digest(enc);
const origin = (u) => { try { return new URL(u).origin; } catch { return ""; } };

function csp(scriptHash) {
  const supa = config.supabaseUrl ? origin(config.supabaseUrl) : "";
  const posthog = origin(config.posthogHost ?? "https://us.i.posthog.com");
  return [
    "default-src 'self'",
    `script-src 'self' 'sha256-${scriptHash}' https://checkout.razorpay.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://*.razorpay.com",
    // The fonts are listed here too: the service worker fetches them itself (to keep them for offline), and a
    // worker's own fetches fall under connect-src. Without them the fonts fail once the worker is in control.
    // data: is for the body maps, which are bundled as data URLs and read with fetch (app/src/figure.ts).
    `connect-src 'self' ${supa} ${supa.replace("https://", "wss://")} https://api.razorpay.com https://lumberjack.razorpay.com ${posthog} https://fonts.googleapis.com https://fonts.gstatic.com data:`.replace(/\s+/g, " ").trim(),
    "frame-src https://api.razorpay.com https://checkout.razorpay.com",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

const HEAD = `<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="description" content="Home workouts planned around what your muscles are ready for.">
`;

/** The policy of the current build, so the local server can send what production sends. */
let policy = "";

const write = {
  name: "html",
  setup(b) {
    b.onEnd(({ outputFiles, errors }) => {
      if (errors.length) return;
      const js = outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
      const html = readFileSync("app/index.html", "utf8")
        .replace("/*APP*/", () => js)
        // The touch icon in index.html is an SVG data URI, which iOS ignores; the PNG one is added below.
        .replace(/<link rel="apple-touch-icon" href="data:[^"]*">\n?/, "")
        .replace("</head>", () => `${HEAD}</head>`);
      const build = `${pkg.version}-${sha(html, "hex").slice(0, 10)}`;
      mkdirSync("app/dist", { recursive: true });
      cpSync("app/public", "app/dist", { recursive: true });
      writeFileSync("app/dist/index.html", html);
      writeFileSync("app/dist/sw.js", readFileSync("app/public/sw.js", "utf8").replaceAll("__BUILD__", build));
      policy = csp(sha(js));
      writeFileSync("app/dist/_headers", [
        "/*",
        `  Content-Security-Policy: ${policy}`,
        "  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload",
        "  X-Content-Type-Options: nosniff",
        "  Referrer-Policy: strict-origin-when-cross-origin",
        "  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(self \"https://api.razorpay.com\" \"https://checkout.razorpay.com\")",
        "  Cross-Origin-Opener-Policy: same-origin-allow-popups",
        "/",
        "  Cache-Control: no-cache",
        "/sw.js",
        "  Cache-Control: no-cache",
        "/icons/*",
        "  Cache-Control: public, max-age=604800",
        "",
      ].join("\n"));
      const live = [config.supabaseUrl && "accounts", config.razorpayKeyId && "billing", config.vapidPublicKey && "push", config.posthogKey && "analytics"].filter(Boolean);
      console.log(`app/dist/index.html  ${(html.length / 1024).toFixed(0)} KB  build ${build}  ${live.length ? live.join(", ") : "device only"}`);
    });
  },
};
const ctx = await context({
  entryPoints: ["app/src/main.tsx"], bundle: true, minify: true, format: "iife", target: "es2020", write: false,
  jsx: "automatic", jsxImportSource: "preact", loader: { ".png": "dataurl" }, plugins: [write],
  define: { __REPVYN_CONFIG__: JSON.stringify({ ...config, version: pkg.version }) },
});
if (!serve) {
  await ctx.rebuild();
  await ctx.dispose();
} else {
  await ctx.watch();
  const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
  createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
    const file = join("app/dist", path === "/" || !extname(path) ? "index.html" : path);
    if (!existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    // The same policy as production (minus the https upgrade, which a plain-http local backend cannot meet),
    // so anything the policy would block shows up here first.
    res.writeHead(200, {
      "content-type": types[extname(file)] ?? "application/octet-stream", "cache-control": "no-store",
      "content-security-policy": policy.replace("; upgrade-insecure-requests", ""),
    });
    res.end(readFileSync(file));
  }).listen(5173, () => console.log("http://localhost:5173"));
}
