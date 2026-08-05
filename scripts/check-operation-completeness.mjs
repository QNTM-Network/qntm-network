/**
 * check-operation-completeness — THE ENFORCER FOR `design-the-two-rules.md` §2.2, AN OPERATION
 * COMPLETES: no write this page hands to `WriteRegister` may leave that register with no way to
 * ever say what happened to it.
 *
 * ── WHAT "AN OPERATION" MEANS HERE, PRECISELY, AND WHY IT IS NARROWER THAN §2.2's OWN PROSE ──
 *
 * `design-the-two-rules.md` §2.2 states the rule in terms of what the OPERATOR sees: bounded
 * retry, then one of three acts (re-read, restore last-known-good, hand back to the row). That is
 * a claim about the SCREEN, and no static check can see a screen — `THE PERCEPTION RULE` (§4 of
 * that document) means the correct on-screen answer is usually NOTHING, so "does this path show
 * the right thing" is not a question source code alone can answer.
 *
 * What CAN be checked mechanically is the one concrete, closed thing the operator named as the
 * anchor: `WriteRegister.open(token, path)` (`app/present/correlation.ts`) opens exactly one
 * outstanding write per token, and the class exposes exactly three ways to close one —
 * `arrive()` (a match), `giveUp()`, `concludeGiveUp()`. `.open()` is called in exactly one place
 * in this whole application (`writeFile`, `app/index.html`) — checked below, at line ~90, as a
 * standing invariant of this checker's own soundness rather than assumed — so EVERY call site of
 * `writeFile(...)` is, by construction, the complete and closed set of places an operation begins.
 *
 * AN OPERATION (as this checker defines it) IS: one call to `writeFile(...)`, together with the
 * `try`/`catch` that necessarily surrounds it (a promise nobody awaits inside a guarded block
 * cannot be reasoned about here at all, and is refused rather than guessed past — see below).
 * IT IS COMPLETE WHEN:
 *
 *   1. THE TRY BLOCK'S NORMAL COMPLETION reaches a call to `arrive(...)` — the one function that
 *      hands a write's answer to `WriteRegister` for matching. A write whose success path never
 *      calls it can never be released by a match, no matter what the server answers.
 *   2. THE CATCH BLOCK, on every path a JavaScript exception can take through it, reaches a call
 *      from a NAMED, CLOSED VOCABULARY of terminal acts (below) before it can return or fall off
 *      the end.
 *
 * The second `collect()`-shaped case — a bounded retry series (`PickupSchedule`) exhausting with
 * no match ever having arrived — is checked structurally too, at the one place it can end:
 * `collect()`'s own `next.outcome === "exhausted"` branch must call `writes.concludeGiveUp(`.
 *
 * ── THE TERMINAL-ACT VOCABULARY, NAMED RATHER THAN INFERRED ──
 *
 * `writes.giveUp(`, `writes.concludeGiveUp(` — the register's own two ways to close a token.
 * `paintView(` — `commitLine`'s "restore last-known-good" repaint from the server's own last
 *   answer (item 12 in `design-the-two-rules.md` §3 — already the rule, working, and it does not
 *   go through the register at all: the SCREEN reaching truth is the terminal act, and the token
 *   is left to decay by the register's own capacity/grace bounds, which is declared, argued and
 *   safe in `correlation.ts`'s own header — "giving up releases NOTHING... the direction this
 *   whole capability fails in on purpose").
 * `healFromRefusal(` — the "adopt the server's file" act, used when there is no operator text at
 *   stake to protect.
 *
 * A CATCH BLOCK THAT REACHES NONE OF THESE, ON SOME PATH, IS A HANG BY THIS CHECKER'S DEFINITION.
 * A legitimate FIFTH act introduced under a new name will not be recognised, and this checker will
 * report a FALSE failure rather than silently passing — the fail-safe direction, and the cost is
 * one line added to `ACT_CALLS` below, done deliberately rather than never done at all.
 *
 * ── WHAT THIS CHECKER DOES NOT PROVE — ITS BLIND SPOTS, NAMED RATHER THAN DISCOVERED LATER ──
 *
 *   1. PRESENCE, NOT REACHABILITY. It asks "does a call to an act appear anywhere in this catch
 *      block's subtree", not "is that call guaranteed to run on every path through the block". A
 *      terminal-act call sitting inside a dead branch (an `if (false)`, an unreachable arm) would
 *      still satisfy it. This is a real, deliberate narrowing — a sound path-sensitive prover
 *      would need real control-flow analysis this script does not attempt — and it is the direct
 *      trade against the "false positives are worse than a narrow scope" instruction: a checker
 *      that tried to be path-sensitive here would need to understand every branching construct
 *      this file might ever use, and getting that subtly wrong produces exactly the blind spot
 *      this document exists to avoid.
 *   2. IT DOES NOT CHECK `bootRead`'s retry-then-throw (item 14) or `refresh()` (item 15). Neither
 *      touches `WriteRegister` — they are a DIFFERENT instance of "an operation completes" (a
 *      bounded read retry, not a token lifecycle) and would need a differently-shaped check. Named
 *      here as explicitly NOT covered rather than silently assumed covered.
 *   3. IT DOES NOT CHECK `WriteRegister.arrive`'s own `gaveUp` list (grace-exhaustion via a stream
 *      of arrivals that name the path but never the token). `correlate()` (`app/index.html`)
 *      discards that half of `arrive()`'s return value by design — `correlation.ts`'s own header
 *      states plainly that giving up this way "releases nothing and proves nothing" and that this
 *      is safe because nothing downstream depends on it: a row that stays held is the fail-safe
 *      direction this whole mechanism chooses on purpose, not a hang. Checking it would mean
 *      flagging documented, argued, intentional behaviour as a defect.
 *   4. IT CANNOT SEE A NEW OPERATION KIND THAT DOES NOT ROUTE THROUGH `writeFile`/`WriteRegister`
 *      AT ALL. If a future write path opens its own tracking mechanism instead of extending
 *      `WriteRegister` (exactly what `design-the-two-rules.md` §2.2 asks NOT to happen), this
 *      checker has nothing to say about it — it can only enforce discipline on the machinery
 *      that exists, not detect a parallel one being built beside it.
 *   5. IT PARSES ONLY `app/index.html`'s inline `<script type="module">`. That is deliberate — it
 *      is the ONE place `WriteRegister.open` is ever called (checked, not assumed, below) — but a
 *      second inline script block, or a second file calling `.open()` directly, would silently
 *      fall outside everything below the extraction step. The soundness check at the top (exactly
 *      one `.open(` call, and it is inside `writeFile`) is what stands between that possibility and
 *      a checker that quietly checks nothing.
 *
 * ── USAGE ──
 *
 *   node scripts/check-operation-completeness.mjs               check app/index.html
 *   node scripts/check-operation-completeness.mjs --file PATH   check a different HTML file
 *                                                                (the mutation proof uses this)
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, "..");
export const DEFAULT_APP_HTML = resolve(REPO_ROOT, "app", "index.html");

/** The closed vocabulary of calls this checker accepts as "an operation reached a terminal act". */
const ACT_CALLS = Object.freeze([
  { object: "writes", method: "giveUp" },
  { object: "writes", method: "concludeGiveUp" },
  { object: null, method: "paintView" },
  { object: null, method: "healFromRefusal" },
]);

function isCallTo(node, spec) {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  if (spec.object === null) {
    return ts.isIdentifier(callee) && callee.text === spec.method;
  }
  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === spec.object &&
    callee.name.text === spec.method
  );
}

function isCallToName(node, name) {
  return ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name;
}

/** Does `root`'s subtree contain a call matching any entry in `ACT_CALLS`? */
function subtreeReachesAnAct(root) {
  let found = false;
  const visit = (node) => {
    if (found) return;
    if (ACT_CALLS.some((spec) => isCallTo(node, spec))) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}

/** Does `root`'s subtree contain a call to the bare function `name`? */
function subtreeCallsName(root, name) {
  let found = false;
  const visit = (node) => {
    if (found) return;
    if (isCallToName(node, name)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}

function nearestAncestor(node, predicate) {
  let p = node.parent;
  while (p !== undefined) {
    if (predicate(p)) return p;
    p = p.parent;
  }
  return undefined;
}

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
}

/**
 * Extract the page's real module script and parse it. Returns `{sourceFile, scriptStartLine}`,
 * where `scriptStartLine` lets a violation be reported at the line it actually sits on in
 * `app/index.html`, not at its offset inside the extracted fragment.
 */
function parseAppScript(html) {
  const match = /<script type="module">([\s\S]*?)<\/script>/.exec(html);
  if (!match) {
    throw new Error("no <script type=\"module\"> found — nothing here can be checked");
  }
  const scriptStartLine = html.slice(0, match.index).split("\n").length;
  const sourceFile = ts.createSourceFile(
    "app-inline-script.js",
    match[1],
    ts.ScriptTarget.ES2022,
    /* setParentNodes */ true,
    ts.ScriptKind.JS,
  );
  return { sourceFile, scriptStartLine };
}

function realLine(scriptStartLine, sourceFile, node) {
  return scriptStartLine + lineOf(sourceFile, node) - 1;
}

/**
 * Run the check against one HTML source string. Returns `{violations, sitesChecked}`, where each
 * violation is `{line, message}` and `line` is the real line number in the HTML source handed in.
 */
export function checkOperationCompleteness(html) {
  const { sourceFile, scriptStartLine } = parseAppScript(html);
  const violations = [];
  const at = (node) => realLine(scriptStartLine, sourceFile, node);

  // ── THE SOUNDNESS CHECK: EVERY `writeFile(...)` CALL SITE IS, BY CONSTRUCTION, EVERY PLACE AN
  //    OPERATION CAN BEGIN, BECAUSE `writes.open(` IS CALLED IN EXACTLY ONE PLACE AND IT IS INSIDE
  //    `writeFile`. If that stops being true this checker is silently checking the wrong thing, so
  //    it is asserted here rather than assumed. ──
  const openCalls = [];
  let writeFileFunctionNode = null;
  const findDeclarationsAndOpens = (node) => {
    if (
      (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) &&
      node.name?.text === "writeFile"
    ) {
      writeFileFunctionNode = node;
    }
    if (isCallTo(node, { object: "writes", method: "open" })) {
      openCalls.push(node);
    }
    ts.forEachChild(node, findDeclarationsAndOpens);
  };
  findDeclarationsAndOpens(sourceFile);

  if (openCalls.length !== 1) {
    violations.push({
      line: openCalls[0] ? at(openCalls[0]) : scriptStartLine,
      message:
        `expected exactly one call to 'writes.open(' in app/index.html's module script (this ` +
        `checker's whole model depends on it), found ${openCalls.length}. Every writeFile(...) ` +
        `call site is treated as 'every place an operation begins' ONLY because this holds — if ` +
        `it no longer does, this checker needs to be widened before it can be trusted again.`,
    });
  } else if (writeFileFunctionNode === undefined || writeFileFunctionNode === null) {
    violations.push({
      line: at(openCalls[0]),
      message: "'writes.open(' is called, but no function named 'writeFile' was found to contain it.",
    });
  } else {
    const insideWriteFile = nearestAncestor(openCalls[0], (n) => n === writeFileFunctionNode) !== undefined;
    if (!insideWriteFile) {
      violations.push({
        line: at(openCalls[0]),
        message: "'writes.open(' is called outside 'writeFile' — this checker's model of where " +
          "an operation begins no longer matches the code.",
      });
    }
  }

  // ── EVERY `writeFile(...)` CALL SITE — THE OPERATION SITES THEMSELVES ──
  let sitesChecked = 0;
  const findWriteFileCalls = (node) => {
    if (isCallToName(node, "writeFile") && node !== writeFileFunctionNode) {
      checkOneOperationSite(node);
    }
    ts.forEachChild(node, findWriteFileCalls);
  };

  function checkOneOperationSite(callNode) {
    sitesChecked += 1;
    const line = at(callNode);
    const tryNode = nearestAncestor(callNode, (n) => ts.isTryStatement(n));
    if (tryNode === undefined) {
      violations.push({
        line,
        message:
          `writeFile(...) at app/index.html:${line} is not inside a try/catch — an exception ` +
          "from this write (a dead network, a thrown parse) has no path to a terminal act at all.",
      });
      return;
    }
    if (tryNode.catchClause === undefined) {
      violations.push({
        line,
        message:
          `writeFile(...) at app/index.html:${line} is inside a try with no catch — a rejected ` +
          "write propagates past every terminal act this page defines.",
      });
      return;
    }

    // 1. The try block's normal completion must hand the answer to arrive(...).
    if (!subtreeCallsName(tryNode.tryBlock, "arrive")) {
      violations.push({
        line,
        message:
          `writeFile(...) at app/index.html:${line}: its try block never calls arrive(...) — a ` +
          "write the server actually accepted can never be matched and released.",
      });
    }

    // 2. The catch block must reach a recognised terminal act somewhere in its subtree.
    if (!subtreeReachesAnAct(tryNode.catchClause.block)) {
      violations.push({
        line: at(tryNode.catchClause),
        message:
          `the catch guarding writeFile(...) at app/index.html:${line} (catch at ` +
          `app/index.html:${at(tryNode.catchClause)}) reaches none of writes.giveUp(...), ` +
          "writes.concludeGiveUp(...), paintView(...) or healFromRefusal(...) — a refused or " +
          "failed write here has nothing defined to do next.",
      });
    }
  }

  findWriteFileCalls(sourceFile);

  // ── THE PICKUP-EXHAUSTED SITE — collect()'s own bounded-retry give-up, item 4 ──
  let collectFunctionNode = null;
  const findCollect = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "collect") {
      collectFunctionNode = node;
    }
    ts.forEachChild(node, findCollect);
  };
  findCollect(sourceFile);

  if (collectFunctionNode === null) {
    violations.push({
      line: scriptStartLine,
      message:
        "no function named 'collect' was found — the pickup-exhausted terminal act " +
        "(design-the-two-rules.md §3 item 4) could not be located to check at all.",
    });
  } else {
    let exhaustedBranch = null;
    const findExhausted = (node) => {
      if (
        ts.isIfStatement(node) &&
        ts.isBinaryExpression(node.expression) &&
        node.expression.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
        ((ts.isStringLiteral(node.expression.right) && node.expression.right.text === "exhausted") ||
          (ts.isStringLiteral(node.expression.left) && node.expression.left.text === "exhausted"))
      ) {
        exhaustedBranch = node;
      }
      ts.forEachChild(node, findExhausted);
    };
    findExhausted(collectFunctionNode);

    if (exhaustedBranch === null) {
      violations.push({
        line: at(collectFunctionNode),
        message:
          "collect() no longer has a branch comparing an outcome to \"exhausted\" — the " +
          "pickup-exhausted terminal act (design-the-two-rules.md §3 item 4) could not be located.",
      });
    } else {
      sitesChecked += 1;
      if (!subtreeReachesAnAct(exhaustedBranch.thenStatement)) {
        violations.push({
          line: at(exhaustedBranch),
          message:
            `collect()'s "exhausted" branch at app/index.html:${at(exhaustedBranch)} reaches ` +
            "none of writes.giveUp(...), writes.concludeGiveUp(...), paintView(...) or " +
            "healFromRefusal(...) — a pickup that ran out of retries falls through with no " +
            "action, the exact shape design-the-two-rules.md §3 item 4 measured.",
        });
      }
    }
  }

  return { violations, sitesChecked };
}

function main() {
  const args = process.argv.slice(2);
  let file = DEFAULT_APP_HTML;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--file") file = resolve(args[++i]);
    else throw new Error(`unknown flag: ${args[i]}`);
  }
  const html = readFileSync(file, "utf8");
  const { violations, sitesChecked } = checkOperationCompleteness(html);
  console.log(`operation-completeness: ${sitesChecked} site(s) checked in ${file}`);
  if (violations.length === 0) {
    console.log("every write operation reaches a terminal state on every path this checker can see.");
    return;
  }
  console.error(`${violations.length} operation(s) can end without reaching a terminal state:\n`);
  for (const v of violations) {
    console.error(`  ${file}:${v.line}: ${v.message}\n`);
  }
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    console.error(String(error?.message || error));
    process.exit(2);
  }
}
