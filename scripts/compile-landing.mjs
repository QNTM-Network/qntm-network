/**
 * compile-landing — the PURE compile step for ONE fact: which view a fresh boot should paint
 * before the operator has chosen anything (`app/index.html`'s `landOn`, called by `loadGraph`).
 *
 * ── WHERE THIS BELONGS, AND WHY IT IS A SIBLING FILE RATHER THAN A NEW FIELD ON
 *    `compile-resolution.mjs`'s OWN `registration` OBJECT ──
 *
 * `views/default_registration.yaml`'s `default_registration:` block is unambiguously the fitting
 * home for this fact: it is the SAME file, the SAME rung (GLOBAL, config-only, decidable with no
 * graph read and no clock), and the SAME shape `scripts/compile-resolution.mjs`'s own
 * `readRegistration` already reads three siblings from — `default_node_type`, `input_grammar`,
 * `default_tags`. A fourth key there, `landing_view`, naming which view id a fresh boot opens on,
 * costs nothing architecturally and was the first design considered.
 *
 * What blocks folding it into `resolution.registration.landingViewId` today is SCHEDULING, not
 * design: at the time this file was written, `compile-resolution.mjs` was under active, concurrent
 * edit by a parallel task (making `ENGINE_DEFAULT_ORDERING` a declared, not hard-coded, value), and
 * a second edit to the same file from a second direction in the same window is exactly the
 * collision this repo's worktree discipline exists to prevent. So this reads the IDENTICAL config
 * location through its own small, independent parser instead — never importing from, and never
 * writing anywhere near, `compile-resolution.mjs`.
 *
 * THE FOLD-TOGETHER THIS SETS UP, so it is named rather than left implicit: once the parallel
 * change lands, `landing_view` can move into `readRegistration`'s own read of the same file,
 * `resolution.registration.landingViewId` can absorb the top-level `landingView` key this file
 * publishes today, this file and `generate-landing-declaration.mjs` can both be deleted, and
 * `app/present/declaration.ts`'s `LANDING_VIEW_KEY` handling can move into
 * `app/present/resolutiontable.ts` beside `RegistrationTable`. Backlog row
 * `declare-the-default-view` names the fold; this file is the honest interim, not the destination.
 *
 * ── PURE, AND WORKER-ISOLATE-SAFE, FOR THE SAME REASON EVERY OTHER `compile-*.mjs` STATES IT ──
 *
 * Only `yaml-subset.mjs` — no `node:fs`, no `node:path`, nothing Node-specific. The same function
 * can run in a CLI shell or a Worker route without crashing at module load.
 */

import { parseYamlSubset } from "./yaml-subset.mjs";

export class GenerationError extends Error {}

/** The one file this module reads — the same key `compile-resolution.mjs` names
 * `DEFAULT_REGISTRATION_KEY` for the identical file, restated here rather than imported (see this
 * file's own header for why: zero coupling to a file under concurrent edit). */
export const DEFAULT_REGISTRATION_KEY = "views/default_registration.yaml";

/**
 * @param {Record<string, string> | Map<string, string>} files path -> file contents. Only
 *   `DEFAULT_REGISTRATION_KEY` is read; every other key is ignored, so a caller may hand this the
 *   same files map it built for `compile-resolution.mjs` without filtering it first.
 * @returns {{ landingViewId: string | undefined }} `landingViewId` is the declared view id, or
 *   `undefined` when nothing declares one — SILENCE, not a refusal. `app/index.html`'s `landOn`
 *   is the one place that turns that silence into a visible, loud fallback; this module only
 *   reports what the config said.
 */
export function compile(files) {
  const isMap = files instanceof Map;
  const has = (key) => (isMap ? files.has(key) : Object.prototype.hasOwnProperty.call(files, key));
  const get = (key) => (isMap ? files.get(key) : files[key]);

  if (!has(DEFAULT_REGISTRATION_KEY)) {
    // NOT A REFUSAL. `compile-resolution.mjs`'s own `readRegistration` is the one that requires
    // this file to exist AT ALL — a config with no `default_registration.yaml` fails THAT compile
    // first, loudly. This module has nothing new to say about a file that already does not exist.
    return { landingViewId: undefined };
  }
  const document = parseYamlSubset(get(DEFAULT_REGISTRATION_KEY), DEFAULT_REGISTRATION_KEY);
  const declared = document && typeof document === "object" ? document.default_registration : undefined;
  if (!declared || typeof declared !== "object" || Array.isArray(declared)) {
    // NOT A REFUSAL, for the same reason: a malformed `default_registration:` mapping is
    // `compile-resolution.mjs`'s own `GenerationError` to raise, not a second one from here.
    return { landingViewId: undefined };
  }
  if (!("landing_view" in declared)) {
    return { landingViewId: undefined };
  }
  const landingView = declared.landing_view;
  if (typeof landingView !== "string" || landingView === "") {
    throw new GenerationError(
      `${DEFAULT_REGISTRATION_KEY}: 'default_registration.landing_view' is ` +
        `${JSON.stringify(landingView)}, not a non-empty string naming a view id`,
    );
  }
  return { landingViewId: landingView };
}
