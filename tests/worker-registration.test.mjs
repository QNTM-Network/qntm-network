// Sign-up is invite-only until each user has their own graph (2026-10-09, backlog row
// close-registration-until-a-user-has-their-own-graph). worker/src/registration.js decides; auth.js's
// registerOptions asks it first.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { BAD_INVITE_MESSAGE, CLOSED_MESSAGE, registrationAllowed } from "../worker/src/registration.js";

test("fails closed: no invite codes configured means no sign-up, whatever is offered", () => {
  assert.deepEqual(registrationAllowed({}, { handle: "someone" }), { ok: false, status: 403, error: CLOSED_MESSAGE });
  assert.equal(registrationAllowed({ REGISTRATION_INVITES: "" }, { invite: "anything" }).ok, false);
  assert.equal(registrationAllowed({ REGISTRATION_INVITES: " , " }, { invite: "" }).ok, false);
});

test("with codes configured, only a listed code opens sign-up", () => {
  const env = { REGISTRATION_INVITES: "alpha-7, beta-9" };
  assert.deepEqual(registrationAllowed(env, { invite: "beta-9" }), { ok: true });
  assert.deepEqual(registrationAllowed(env, { invite: " alpha-7 " }), { ok: true });
  assert.deepEqual(registrationAllowed(env, { invite: "gamma" }), { ok: false, status: 403, error: BAD_INVITE_MESSAGE });
  assert.equal(registrationAllowed(env, {}).ok, false);
});

test("registerOptions asks the gate before anything else", () => {
  const auth = readFileSync(new URL("../worker/src/auth.js", import.meta.url), "utf8");
  const body = auth.slice(auth.indexOf("async function registerOptions"));
  const gate = body.indexOf("registrationAllowed(env, body)");
  assert.ok(gate > 0, "registerOptions no longer asks registrationAllowed");
  assert.ok(gate < body.indexOf("env.DB"), "registerOptions touches D1 before the gate");
});
