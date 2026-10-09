/**
 * compile-presentation — the WHOLE declaration a client reads, built from one set of config files
 * by one call (2026-10-09, backlog row config-publish-in-the-api, project engine-and-clients).
 *
 * Before this, the document existed only as `presentation.json`, assembled one key at a time by
 * seven CLI generators each rewriting the committed file, plus five rendition keys and an
 * `indentUnit` typed in by hand. A publish route cannot run seven CLIs against a file. It needs
 * `files -> document`, and that is this function: every key below comes from a `compile-*.mjs`
 * that already exists, so nothing is compiled twice and no compiler is copied.
 *
 * WHAT IS NOT HERE ANY MORE, AND WHY THAT IS SAFE.
 *   note        prose for a human; the reader skips it. The words live in config/client.yaml.
 *   indentUnit  a hand copy of the engine's own literal 4 (renderer.py); the client core falls
 *               back to that same 4 (`DEFAULT_INDENT_UNIT`) when the key is absent.
 *   checkbox, heading, prose, tags, stamp
 *               client preferences, so they now come from client.yaml's `renditions:`.
 *
 * PURE AND WORKER-ISOLATE-SAFE, like every module it calls: no `node:fs`.
 *
 * @param {Record<string, string> | Map<string, string>} files config path -> contents
 * @returns {{declaration: object, dropped: object, version: string}} `version` is the content hash
 *   of `{declaration, dropped}` (declaration-version.mjs), the same identity scheme as each key's.
 * @throws the first compiler's refusal, unreworded.
 */

import { compile as compileStructural } from "./compile-structural.mjs";
import { compile as compileQualification } from "./compile-qualification.mjs";
import { compile as compileResolution } from "./compile-resolution.mjs";
import { compile as compileRules } from "./compile-rules.mjs";
import { compile as compileLanding } from "./compile-landing.mjs";
import { compile as compileClient } from "./compile-client.mjs";
import { versionKey } from "./declaration-version.mjs";

export function compile(files) {
  const structural = compileStructural(files);
  const qualification = compileQualification(files);
  const resolution = compileResolution(files);
  const rules = compileRules(files);
  const { landingViewId } = compileLanding(files);
  const { lists, renditions } = compileClient(files);

  const declaration = {
    ...renditions,
    structural: structural.declaration,
    qualification: qualification.declaration,
    resolution: resolution.declaration,
    rules: rules.declaration,
    ...(landingViewId === undefined ? {} : { landingView: landingViewId }),
    ...(lists === undefined ? {} : { client: { lists } }),
  };
  const dropped = {
    structural: structural.dropped,
    qualification: qualification.dropped,
    resolution: resolution.dropped,
    rules: rules.dropped,
  };
  return { declaration, dropped, version: versionKey({ declaration, dropped }) };
}
