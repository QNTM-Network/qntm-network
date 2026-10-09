// WHO MAY CREATE AN ACCOUNT (2026-10-09, backlog row close-registration-until-a-user-has-their-own-graph,
// project engine-and-clients). Stage 1 of docs/implementation-artifacts/design-a-user-owns-their-graph.md.
//
// Until each user has their own graph, a new account gets a safe but empty app (stage 0 keeps it out of
// the operator's). So sign-up is INVITE-ONLY: allowed only when the Worker has invite codes configured
// (the `REGISTRATION_INVITES` secret, comma-separated) AND the request carries one of them.
//
// FAILS CLOSED. No secret, an empty secret, or no code in the request: sign-up is refused. Signing in
// with an existing passkey is not touched.
//
// PURE — no D1, no WebAuthn — so it is tested without either (tests/worker-registration.test.mjs).

export const CLOSED_MESSAGE =
  "Sign-up is invite-only for now, while each account gets its own space. Already have a passkey? Sign in.";
export const BAD_INVITE_MESSAGE = "That invite code is not valid.";

/** The configured invite codes; empty when none are. */
export function inviteCodes(env) {
  return String(env?.REGISTRATION_INVITES ?? "")
    .split(",")
    .map((code) => code.trim())
    .filter((code) => code !== "");
}

/** `{ ok: true }` when this request may create an account, else `{ ok: false, status, error }`. */
export function registrationAllowed(env, body) {
  const codes = inviteCodes(env);
  const offered = String(body?.invite ?? "").trim();
  if (codes.length === 0 || offered === "") return { ok: false, status: 403, error: CLOSED_MESSAGE };
  if (!codes.includes(offered)) return { ok: false, status: 403, error: BAD_INVITE_MESSAGE };
  return { ok: true };
}
