/**
 * THE VENDOR BUNDLE — markdown-it and the passkey library, from npm, bundled to
 * `/dist/vendor.js` instead of fetched from `esm.sh` at runtime.
 *
 * `app/index.html` used to import both from a CDN:
 *
 *   import { startRegistration, startAuthentication } from "https://esm.sh/@simplewebauthn/browser@13";
 *   import MarkdownIt from "https://esm.sh/markdown-it@14";
 *
 * MEASURED (docs/implementation-artifacts/research-state-and-speed.md §2.2): `markdown-it` off
 * `esm.sh` is 17 sub-requests, a dependency chain four levels deep, ~440 ms of serial latency cold
 * and still 1,175.6 ms with a WARM http cache — the cost is the round trips, not the bytes. And
 * because both imports are static, NOTHING in the module runs until they resolve: the reader sees
 * a fixed bar and a black rectangle until a third-party origin answers four times in a row.
 *
 * IT ALSO VIOLATED A STATED "NO CDN DEPENDENCIES AT RUNTIME" CONSTRAINT — see that section's own
 * finding. This bundle is what makes the constraint true instead of aspirational.
 *
 * THIS IS ITS OWN ENTRY POINT, NOT FOLDED INTO `dist/present.js`. `scripts/build.mjs` keeps
 * `dist/present.js` UNMINIFIED on purpose — it is what the node test suite imports, and legibility
 * there is worth more than its ~4 kB. Two third-party libraries, minified, belong in a bundle nobody
 * reads, not mixed into the one every golden test opens.
 *
 * NEITHER LIBRARY IS RE-EXPORTED FROM `app/present/index.ts`. That barrel is the presentation
 * cascade's public surface (see its own header); a vendor re-export does not belong beside it, and
 * app/index.html already imports app/present/index.ts's build (`/dist/present.js`) and this build
 * (`/dist/vendor.js`) as two separate, same-origin requests.
 */

export { default as MarkdownIt } from "markdown-it";
export { startRegistration, startAuthentication } from "@simplewebauthn/browser";
