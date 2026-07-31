/**
 * monorepo-config — where this repo's generators find the operator's qntm-md config, in ONE place.
 *
 * Two generators now read the monorepo (`generate-structural-declaration.mjs` and
 * `generate-qualification-declaration.mjs`). The path from this worktree to that checkout is a
 * fact with a history of being got wrong by one level — the comment this module inherits says so —
 * and a fact stated twice is a fact that can disagree with itself. It is stated here.
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = resolve(fileURLToPath(import.meta.url), "..");

export const REPO_ROOT = resolve(HERE, "..");

// This worktree lives at .../projects/qntm-network/worktrees/qntm-network/<branch>; the monorepo
// is a SIBLING of worktrees/, not a sibling of this directory — three levels up, not two. (The
// flow-trace invocation elsewhere in this repo's docs says `../../qntm`; verified against this
// worktree's actual nesting, that is one level short. `--config-dir` exists on both generators so
// nothing depends on getting this guess right.)
export const DEFAULT_CONFIG_DIR = resolve(
  REPO_ROOT,
  "..",
  "..",
  "..",
  "qntm",
  "apps",
  "qntm-md",
  "config",
);
