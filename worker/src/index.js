// qntm.network Worker — router.
//   /auth/*         passkey (WebAuthn) register + login          (auth.js)
//   /app/*          the app: capture + the one thing (bearer)    (app.js)
//   POST /config/compile/structural       Gate 1 only, no persistence (config.js)
//   POST /config/compile/qualification    Gate 1 only, no persistence (config.js)
//   POST /config/compile/resolution       Gate 1 only, no persistence (config.js)
//   POST /config/compile/rules            Gate 1 only, no persistence (config.js)
//   POST /config/declaration/<kind>          operator-only — compile + durably store (declarations.js)
//   GET  /config/declaration/<kind>/current  the latest stored version's body (declarations.js)
//   GET  /config/declaration/<kind>/<version> one immutable stored version's body (declarations.js)
//   GET  /export    operator CSV of the signup list              (this file)
//   POST /          signup capture -> D1 (the original landing)  (this file)

import { json, cors } from "./util.js";
import { handleAuth } from "./auth.js";
import { handleApp } from "./app.js";
import { handleConfig } from "./config.js";
import { handleDeclarations } from "./declarations.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default {
  // `ctx` IS THE THIRD ARGUMENT THE RUNTIME HAS ALWAYS PASSED AND THIS ROUTER NEVER TOOK. It is the
  // ExecutionContext, and the one thing on it that matters here is `waitUntil` — work the Worker
  // goes on doing AFTER the response has been sent. `POST /app/edit-file` needs it to answer on the
  // vault write and run the ~10 s engine cycle behind it; see `editFile` in app.js.
  //
  // OPTIONAL ALL THE WAY DOWN. Nothing below requires it to be present: a caller that invokes this
  // handler with two arguments (every test in this repository did until now) gets `undefined`, and
  // every path that would use it falls back to doing the work inline, which is exactly what it did
  // before. There is no route that stops working for want of a `ctx`.
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(origin) });
    }

    // --- app + auth routes (each returns null if the path isn't theirs) ---
    if (url.pathname.startsWith("/auth/")) {
      const res = handleAuth(request, env, url, origin);
      if (res) return res;
    }
    if (url.pathname.startsWith("/app/")) {
      const res = await handleApp(request, env, url, origin, ctx);
      if (res) return res;
    }
    if (url.pathname.startsWith("/config/")) {
      const res = await handleConfig(request, url, origin);
      if (res) return res;
      const res2 = await handleDeclarations(request, env, url, origin);
      if (res2) return res2;
    }

    // --- operator export: GET /export?key=SECRET ---
    if (request.method === "GET" && url.pathname === "/export") {
      if (!env.EXPORT_KEY || url.searchParams.get("key") !== env.EXPORT_KEY) {
        return new Response("forbidden\n", { status: 403 });
      }
      const { results } = await env.DB.prepare(
        "SELECT email, created_at, source FROM signups ORDER BY created_at DESC"
      ).all();
      const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const csv = ["email,created_at,source"]
        .concat((results || []).map((r) => [esc(r.email), esc(r.created_at), esc(r.source)].join(",")))
        .join("\n");
      return new Response(csv + "\n", {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=qntm-signups.csv",
        },
      });
    }

    // --- original signup capture: POST / ---
    if (request.method !== "POST") {
      return json({ ok: false, error: "method not allowed" }, 405, origin);
    }

    let data = {};
    const ct = request.headers.get("Content-Type") || "";
    try {
      if (ct.includes("application/json")) data = await request.json();
      else data = Object.fromEntries(await request.formData());
    } catch {
      return json({ ok: false, error: "bad request" }, 400, origin);
    }

    // Honeypot — a real user never fills the hidden 'company' field.
    if (data.company) return json({ ok: true }, 200, origin);

    const email = String(data.email || "").trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) {
      return json({ ok: false, error: "invalid email" }, 422, origin);
    }

    const source = String(data.source || "landing").slice(0, 64);
    const ip = request.headers.get("CF-Connecting-IP") || "";
    const ua = (request.headers.get("User-Agent") || "").slice(0, 256);

    try {
      await env.DB
        .prepare("INSERT OR IGNORE INTO signups (email, source, ip, user_agent) VALUES (?, ?, ?, ?)")
        .bind(email, source, ip, ua)
        .run();
    } catch {
      return json({ ok: false, error: "store failed" }, 500, origin);
    }

    return json({ ok: true }, 200, origin);
  },
};
