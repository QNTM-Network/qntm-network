"""Static-evidence predicates for qntm.network (a static landing site).

THE STATIC-EVIDENCE RUNTIME. The site has no traced code, but that does NOT mean "no runtime" —
the runtime is DETERMINISTIC ARTIFACT CHECKS (+ one live HTTPS probe), not traced calls. These
predicates RUN under flow-trace's normal scenario + state engine: the scenario
`tests/flow_scenarios/static_evidence.py` exposes the project root as a ScenarioState; each
predicate below asserts ONE invariant over the repo artifacts (index.html, CNAME, worker/) and
returns PASS / FAIL / INFO. This is how qntm.network earns honest greens instead of capping at
hand-inspection. Pin: architecture.yaml#declared-before-enforced.
"""

from __future__ import annotations

import re
import ssl
import urllib.error
import urllib.request
from pathlib import Path

import yaml

from flow_trace.schema import PredicateResult, ScenarioState


def _root(state: ScenarioState) -> Path | None:
    r = state.artifacts.get("project_root")
    return Path(r) if r else None


def _guard(state: ScenarioState) -> PredicateResult | None:
    root = _root(state)
    if root is None or not root.is_dir():
        return PredicateResult(
            status="FAIL",
            message="project_root artifact missing or not a directory (scenario did not expose the project)",
        )
    return None


def _read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return ""


def assert_landing_page_present(state: ScenarioState) -> PredicateResult:
    """index.html renders the brand, the thesis headline, and an email capture form."""
    if guard := _guard(state):
        return guard
    html = _read(_root(state) / "index.html")
    needles = {"brand": "qntm", "headline": "least resistance", "email input": 'type="email"', "form": "<form"}
    missing = [label for label, n in needles.items() if n not in html]
    if missing:
        return PredicateResult(status="FAIL", message=f"index.html missing {missing}", observed_ref="index.html")
    return PredicateResult(
        status="PASS",
        message="landing page carries the brand, thesis headline, and an email form",
        observed_ref="index.html",
    )


def assert_responsive_meta_present(state: ScenarioState) -> PredicateResult:
    """index.html declares responsive behaviour (viewport meta + a mobile media query)."""
    if guard := _guard(state):
        return guard
    html = _read(_root(state) / "index.html")
    missing = [n for n in ['name="viewport"', "@media (max-width: 760px)"] if n not in html]
    if missing:
        return PredicateResult(status="FAIL", message=f"index.html missing responsive markers {missing}", observed_ref="index.html")
    return PredicateResult(
        status="PASS",
        message="viewport meta + mobile media query present (responsive)",
        observed_ref="index.html",
    )


def assert_signature_interactions_present(state: ScenarioState) -> PredicateResult:
    """The thesis-as-interaction shipped and hasn't rotted: glowing cursor + repel + scattered creed."""
    if guard := _guard(state):
        return guard
    html = _read(_root(state) / "index.html")
    missing = [n for n in ["cursor-glow", 'class="repel"', "creed-grid"] if n not in html]
    if missing:
        return PredicateResult(status="FAIL", message=f"signature interactions missing {missing}", observed_ref="index.html")
    return PredicateResult(
        status="PASS",
        message="glowing cursor + repel headlines + scattered creed all present",
        observed_ref="index.html",
    )


def assert_deploy_is_push_to_publish(state: ScenarioState) -> PredicateResult:
    """A CNAME pinned to the custom domain = GitHub Pages serves main on push (no manual step)."""
    if guard := _guard(state):
        return guard
    cname = _read(_root(state) / "CNAME").strip()
    if cname != "qntm.network":
        return PredicateResult(
            status="FAIL",
            message=f"CNAME is {cname!r}, expected 'qntm.network' (push-to-publish custom-domain proxy)",
            observed_ref="CNAME",
        )
    return PredicateResult(
        status="PASS",
        message="CNAME=qntm.network → GitHub Pages publishes main on push (push-to-publish)",
        observed_ref="CNAME",
    )


def assert_email_signups_persisted(state: ScenarioState) -> PredicateResult:
    """The forms POST to the Cloudflare Worker, and the Worker INSERTs into the signups D1 table."""
    if guard := _guard(state):
        return guard
    root = _root(state)
    html = _read(root / "index.html")
    worker = _read(root / "worker" / "src" / "index.js")
    problems = []
    if "workers.dev" not in html:
        problems.append("index.html does not POST to the Cloudflare Worker endpoint")
    if "form.access" not in html and "signup capture" not in html:
        problems.append("index.html has no signup submit handler")
    if "INSERT" not in worker.upper():
        problems.append("worker/src/index.js does not INSERT a signup")
    if "signups" not in worker:
        problems.append("worker does not reference the signups table")
    if problems:
        return PredicateResult(
            status="FAIL",
            message="email capture not wired — " + "; ".join(problems),
            observed_ref="worker/src/index.js",
        )
    return PredicateResult(
        status="PASS",
        message="forms POST to the Worker; Worker INSERTs into the signups D1 table",
        observed_ref="worker/src/index.js",
    )


def assert_static_evidence_runner_wired(state: ScenarioState) -> PredicateResult:
    """Self-referential: the runner (scenario + this predicate module) exists, so verify runs real checks."""
    if guard := _guard(state):
        return guard
    root = _root(state)
    scenario = root / "tests" / "flow_scenarios" / "static_evidence.py"
    checks = root / "qntm_network_checks.py"
    missing = [str(p.relative_to(root)) for p in (scenario, checks) if not p.is_file()]
    if missing:
        return PredicateResult(status="FAIL", message=f"static-evidence runner missing {missing}", observed_ref="qntm_network_checks.py")
    return PredicateResult(
        status="PASS",
        message="static-evidence runner wired (scenario + predicate module present) — flow-trace verify runs real checks",
        observed_ref="qntm_network_checks.py",
    )


def assert_link_preview_meta_present(state: ScenarioState) -> PredicateResult:
    """SHARE: index.html declares OG + Twitter card meta and the preview image artifact exists."""
    if guard := _guard(state):
        return guard
    root = _root(state)
    html = _read(root / "index.html")
    needles = ["og:title", "og:description", "og:image", 'twitter:card']
    missing = [n for n in needles if n not in html]
    if not (root / "og.png").is_file():
        missing.append("og.png (preview image file)")
    if missing:
        return PredicateResult(status="FAIL", message=f"link-preview not wired — missing {missing}", observed_ref="index.html")
    return PredicateResult(
        status="PASS",
        message="OG + Twitter card meta present and og.png preview image exists (link previews render)",
        observed_ref="index.html",
    )


def assert_visits_are_measured(state: ScenarioState) -> PredicateResult:
    """SEE: index.html ships a privacy-friendly analytics beacon (Cloudflare Web Analytics)."""
    if guard := _guard(state):
        return guard
    html = _read(_root(state) / "index.html")
    has_beacon = "cloudflareinsights.com/beacon" in html
    has_token = "data-cf-beacon" in html and "token" in html
    if not (has_beacon and has_token):
        return PredicateResult(
            status="FAIL",
            message="no analytics beacon — index.html lacks the Cloudflare Web Analytics snippet (beacon + token)",
            observed_ref="index.html",
        )
    return PredicateResult(
        status="PASS",
        message="Cloudflare Web Analytics beacon present (visits measured, no cookies)",
        observed_ref="index.html",
    )


def assert_served_over_valid_https(state: ScenarioState) -> PredicateResult:
    """LIVE-evidence: actually fetch the production site over HTTPS, validating the TLS certificate.

    PASS = 200 over a valid cert. FAIL = a real HTTPS/cert failure (the warning is back).
    INFO = network unreachable this run (offline) — cannot verify, does not gate.
    """
    url = "https://qntm.network/"
    req = urllib.request.Request(url, headers={"User-Agent": "flow-trace-static-check"})
    try:
        with urllib.request.urlopen(req, timeout=8, context=ssl.create_default_context()) as r:
            code, final = r.getcode(), r.geturl()
        if code == 200 and final.startswith("https://"):
            return PredicateResult(status="PASS", message=f"{url} → {code} over a valid TLS cert (live)", observed_ref=final)
        return PredicateResult(status="FAIL", message=f"unexpected response: {code} / {final}", observed_ref=url)
    except urllib.error.HTTPError as e:
        return PredicateResult(status="FAIL", message=f"server returned {e.code} for {url}", observed_ref=url)
    except urllib.error.URLError as e:
        reason = str(getattr(e, "reason", e)).lower()
        if "certificate" in reason or "ssl" in reason:
            return PredicateResult(status="FAIL", message=f"TLS certificate verification FAILED: {getattr(e, 'reason', e)}", observed_ref=url)
        return PredicateResult(status="INFO", message=f"could not reach {url} (offline?) — UNVERIFIABLE this run: {getattr(e, 'reason', e)}", observed_ref=url)
    except (OSError, TimeoutError) as e:
        return PredicateResult(status="INFO", message=f"could not reach {url} (offline?) — UNVERIFIABLE this run: {e}", observed_ref=url)


# ── The application stratum (scaffolded RED 2026-07-23) ──────────────────────────────────────
# Predicates for the TypeScript app capabilities. They FAIL against today's repo BY DESIGN —
# there is no app/ directory, no toolchain, no editor. That failure is the specification: each
# flips PASS only when the real thing lands, and the FAIL→PASS transition is the evidence the
# capability closed rather than merely being declared closed.
#
# Read the ceiling honestly (architecture.yaml, SCOPE CHANGE 2026-07-23): these are Python
# assertions over TypeScript ARTIFACTS. They verify the right things exist and are wired
# together — they do NOT trace TS call flow, because flow-trace cannot (see flow-trace's
# `typescript-capture-backend` row). A green here is existence evidence, never topological proof.


def _app_dir(state: ScenarioState) -> Path:
    return _root(state) / "app"


def _strip_js_comments(source: str) -> str:
    """Remove // line comments and /* */ block comments from JS/TS source.

    Load-bearing for the absence checks below, and learned the hard way (2026-07-23): the first
    version of assert_edits_are_ephemeral searched raw file text, and FAILed against a module
    whose docstring reads "no localStorage, no sessionStorage, no IndexedDB". Prose ABOUT the
    absence of an API is indistinguishable from its use if you only grep. Any absence invariant
    asserted over source has to look at code, not commentary, or it punishes the documentation
    that makes the invariant legible in the first place.

    Deliberately naive — it does not track string literals, so a URL inside a string can lose its
    tail to the `//` rule. That is harmless here: the output is only ever searched for storage
    API names, never re-parsed or executed.
    """
    without_blocks = re.sub(r"/\*.*?\*/", " ", source, flags=re.DOTALL)
    return re.sub(r"//[^\n]*", " ", without_blocks)


def _app_sources(state: ScenarioState) -> list[Path]:
    """Every TS/JS source under app/ — the app's OWN code, deliberately excluding worker/.

    The scoping matters for assert_edits_are_ephemeral: worker/src/index.js persists signups to
    D1 by design, and a repo-wide search for storage APIs would flag that legitimate write as a
    violation of the editor's ephemerality. The invariant is about the EDITOR, so the search is.
    """
    app = _app_dir(state)
    if not app.is_dir():
        return []
    return sorted(p for p in app.rglob("*") if p.suffix in {".ts", ".tsx", ".js", ".mjs"} and p.is_file())


def assert_app_is_a_typed_build(state: ScenarioState) -> PredicateResult:
    """The repo carries a real strict-TypeScript toolchain whose build runs in CI on push.

    Four things together, because any one alone is a false green: a build script nobody runs, a
    tsconfig with strict off, sources with no build, or a build that never fires on push all look
    like "we have TypeScript" while delivering none of the checking that was the point.
    """
    if guard := _guard(state):
        return guard
    root = _root(state)
    problems = []

    # ROOT package.json — worker/package.json is a separate, pre-existing package and must not
    # be mistaken for the app's toolchain.
    pkg = _read(root / "package.json")
    if not pkg:
        problems.append("no root package.json")
    elif '"build"' not in pkg:
        problems.append("root package.json declares no build script")

    tsconfig = _read(root / "tsconfig.json")
    if not tsconfig:
        problems.append("no tsconfig.json")
    elif '"strict": true' not in tsconfig.replace('"strict":true', '"strict": true'):
        problems.append("tsconfig.json does not set strict: true (typing without strict is decorative)")

    ts_sources = [p for p in _app_sources(state) if p.suffix in {".ts", ".tsx"}]
    if not ts_sources:
        problems.append("no TypeScript sources under app/")

    workflows = root / ".github" / "workflows"
    wf_files = sorted(workflows.glob("*.yml")) + sorted(workflows.glob("*.yaml")) if workflows.is_dir() else []
    ci_ok = any(
        "push" in (text := _read(wf)) and "main" in text and ("build" in text or "npm" in text)
        for wf in wf_files
    )
    if not ci_ok:
        problems.append("no CI workflow building on push to main (the deploy would need a human)")

    if problems:
        return PredicateResult(status="FAIL", message=f"typed build not established: {problems}", observed_ref="package.json")
    return PredicateResult(
        status="PASS",
        message=f"strict TypeScript toolchain with {len(ts_sources)} source(s) under app/, built in CI on push",
        observed_ref="package.json",
    )


def assert_markdown_renders_client_side(state: ScenarioState) -> PredicateResult:
    """Markdown renders in the browser from exactly ONE implementation — the Python one is GONE.

    The absence half is load-bearing (architecture.yaml#one-implementation-per-concern): a check
    that only confirmed the TS renderer's presence would pass happily with both renderers sitting
    side by side, which is the precise state this capability exists to prevent.
    """
    if guard := _guard(state):
        return guard
    root = _root(state)
    problems = []

    sources = _app_sources(state)
    if not any("render" in p.name.lower() for p in sources):
        problems.append("no renderer module under app/")

    demo = _read(root / "demo" / "index.html")
    if not demo:
        problems.append("demo/index.html missing")
    elif "<script" not in demo:
        problems.append("demo/index.html loads no script (still a build-time-rendered artifact)")

    if (root / "qntm_network" / "render").is_dir():
        problems.append("qntm_network/render/ still present — the retired Python renderer is a live duplicate")

    # A retired module must not be left referenced by declared topology, or the declaration
    # points at code that no longer exists (declared-but-never-observed drift, permanently).
    #
    # Parse the YAML rather than grepping the text: these files EXPLAIN the retirement in their
    # header comments, and naming the retired module is exactly how that explanation stays
    # useful. Only DECLARED ENTRIES count as a live reference — the same lesson as
    # _strip_js_comments, one file format over.
    arch = root / "docs" / "architecture"
    for name, key in (("flows.yaml", "expected_flows"), ("sinks.yaml", "sinks")):
        try:
            declared = yaml.safe_load(_read(arch / name)) or {}
        except yaml.YAMLError as exc:
            problems.append(f"{name} does not parse: {exc}")
            continue
        entries = declared.get(key) or []
        if any("qntm_network.render" in str(entry) for entry in entries):
            problems.append(f"{name} still declares qntm_network.render topology")

    if problems:
        return PredicateResult(status="FAIL", message=f"client-side rendering not established: {problems}", observed_ref="app/")
    return PredicateResult(
        status="PASS",
        message="markdown renders client-side from a single TS renderer; the Python renderer and its declared topology are retired",
        observed_ref="app/",
    )


def assert_edit_and_view_modes_are_togglable(state: ScenarioState) -> PredicateResult:
    """The app declares a view mode, an edit mode, and a control that switches between them."""
    if guard := _guard(state):
        return guard
    sources = _app_sources(state)
    if not sources:
        return PredicateResult(status="FAIL", message="no app sources under app/ — the editor does not exist", observed_ref="app/")

    corpus = "\n".join(_read(p) for p in sources).lower()
    missing = [term for term in ("view", "edit", "toggle") if term not in corpus]
    if missing:
        return PredicateResult(
            status="FAIL",
            message=f"app sources declare no {missing} — both modes and a switch between them are required",
            observed_ref="app/",
        )
    return PredicateResult(
        status="PASS",
        message=f"app declares view/edit modes and a toggle across {len(sources)} source(s)",
        observed_ref="app/",
    )


def assert_edits_are_ephemeral(state: ScenarioState) -> PredicateResult:
    """The editor persists NOTHING — memory only, discarded on refresh.

    An ABSENCE invariant, and the declared property of this version of the editing surface. If
    someone later adds persistence, this FAILs and the change has to go through governance rather
    than silently altering what the thing is. Scoped to app/ so the Worker's D1 signup writes —
    persistence that is correct and declared elsewhere — are never in scope.
    """
    if guard := _guard(state):
        return guard
    sources = _app_sources(state)
    if not sources:
        return PredicateResult(status="FAIL", message="no app sources under app/ — nothing to hold ephemeral yet", observed_ref="app/")

    banned = ("localstorage", "sessionstorage", "indexeddb", "window.name")
    offenders = []
    for path in sources:
        # Comments stripped first — a module that DOCUMENTS its own ephemerality must not be
        # convicted by its own docstring. See _strip_js_comments.
        code = _strip_js_comments(_read(path)).lower()
        for api in banned:
            if api in code:
                offenders.append(f"{path.name}:{api}")
    if offenders:
        return PredicateResult(
            status="FAIL",
            message=f"editor persists state — ephemerality is declared but violated by {offenders}",
            observed_ref="app/",
        )
    return PredicateResult(
        status="PASS",
        message=f"no persistence API in {len(sources)} app source(s) — edits are memory-only, lost on refresh as declared",
        observed_ref="app/",
    )


def assert_app_is_reachable_from_the_front_door(state: ScenarioState) -> PredicateResult:
    """The app has ONE address, a visitor can reach it in one click, and the old URL still answers.

    Three assertions of one claim, and none of the three is sufficient alone:

      1. THE APP IS AT /app/ — app/index.html exists and carries the module script that IS the
         app. Without this the link points at a 404.
      2. THE LANDING PAGE LINKS TO IT — index.html contains an anchor whose href is /app/. This
         is the one that rots: it was absent for the whole life of the site until 2026-07-30, and
         nothing noticed, because "the page renders" and "the page is a way in" are different
         properties and only the first was ever asserted. The survey found it by reading the HTML
         a month later; this predicate finds it on the next push.
      3. THE OLD URL STILL ANSWERS — app.html at the repo root redirects to /app/. GitHub Pages
         serves this repo verbatim with no rewrite rules, so an address keeps working only while
         a file sits at it. The operator has /app.html bookmarked. Deleting the stub is a 404 for
         him, and that must be a red test rather than a discovery.

    Scoped to what is IN THE REPO, deliberately. A live fetch would be the stronger check and it
    is also the one that returns nothing useful from a train — state-served-over-valid-https
    already carries that trade-off and degrades to INFO offline. This one is fully deterministic,
    so it can gate.
    """
    if guard := _guard(state):
        return guard
    root = _root(state)
    problems = []

    page = root / "app" / "index.html"
    page_html = _read(page)
    if not page_html:
        problems.append("no app/index.html — the app has no address at /app/")
    elif '<script type="module">' not in page_html:
        problems.append("app/index.html carries no module script — it is not the app")

    landing = _read(root / "index.html")
    if not landing:
        problems.append("no index.html")
    elif not re.search(r'<a\b[^>]*href="/app/"', landing):
        problems.append('index.html has no <a href="/app/"> — the app is unreachable from the front door')

    stub = _read(root / "app.html")
    if not stub:
        problems.append("no app.html — the previous address 404s (GitHub Pages has no redirect rules)")
    elif "/app/" not in stub:
        problems.append("app.html no longer points at /app/ — the previous address is a dead end")

    if problems:
        return PredicateResult(
            status="FAIL",
            message=f"the app is not reachable as declared: {problems}",
            observed_ref="index.html",
        )
    return PredicateResult(
        status="PASS",
        message="the app lives at /app/, the landing page links to it in one click, and /app.html redirects there",
        observed_ref="index.html",
    )


def assert_the_view_chooser_is_one_folder_drawer(state: ScenarioState) -> PredicateResult:
    """There is ONE way to choose a view, it groups by the vault's folders, and a thumb can use it.

    Four assertions of one claim. The first is the one that rots.

      1. ONE CHOOSER, NOT TWO. The app chose views through a bare `<select>` grouped by a
         hand-written `domain` label. The drawer replaced it. A half-retirement — the drawer
         landed, the `<select>` left in place "for now" — is the failure this clause refuses,
         and it is the cheapest kind of rot to commit: nothing breaks, the page just grows two
         answers to one question.
      2. THE FOLDER COMES FROM `path`. A view carries both `path` (the rendered file's place in
         the vault, which is also the address the write path posts to) and `domain` (a label
         written by hand in a view config). Measured across the operator's 76 view configs they
         disagree: `dev/test-scratchpad.md` is declared `domain: personal`, fourteen views in
         four project folders under `dev/` are one flat `dev` bucket, and the five vault-root
         views carry `domain: all`, which is not a folder anywhere. So the drawer derives the
         folder from `path` and this asserts it still does — a future edit that "simplifies" it
         back to `domain` would be a regression nothing else would catch.
      3. A THUMB CAN USE IT. One `--touch` token, at least 44px, and the bar's and the drawer's
         controls take it rather than sizing themselves. A minimum written in nine places is a
         minimum that is 40px in one of them.
      4. THE SCREEN'S EDGES AND A READER'S PREFERENCE ARE HONOURED. The viewport meta carries
         `viewport-fit=cover`, which is what makes the safe-area insets load-bearing rather than
         decorative; and a drawer that slides does not slide for someone who asked it not to.

    Deterministic over app/index.html, like state-app-is-reachable-from-the-front-door and for
    the same reason: the page is hand-authored HTML outside tsconfig, outside the bundle, and
    outside flow-trace's JS capture (a node module-load hook cannot import an HTML document), so
    an artifact check is the only enforcement that reaches it from here. What it CANNOT see is
    behaviour — that is tests/app-shell.test.mjs, which lifts the page's script and drives it.
    """
    if guard := _guard(state):
        return guard
    root = _root(state)
    page = _read(root / "app" / "index.html")
    if not page:
        return PredicateResult(status="FAIL", message="no app/index.html", observed_ref="app/index.html")

    # Comments are stripped first: the page EXPLAINS what it retired and why, and a check that
    # searched the raw text would make writing that explanation a failure.
    code = re.sub(r"<!--.*?-->", "", page, flags=re.S)
    code = re.sub(r"/\*.*?\*/", "", code, flags=re.S)
    code = re.sub(r"^\s*//.*$", "", code, flags=re.M)

    problems = []

    for corpse in ("<select", "viewPick", "optgroup"):
        if corpse in code:
            problems.append(f"the retired view chooser survives ({corpse}) — there are two ways to pick a view")
    if 'id="drawer"' not in code or 'id="viewTree"' not in code:
        problems.append("no view drawer — the app has no way to choose a view")

    # CLAUSE 2 — CORRECTED 2026-08-11, AND THE CORRECTION IS THE INTERESTING PART.
    #
    # This clause used to read `if "folderOf" not in code or "lastIndexOf" not in code`, both
    # searched in app/index.html. It went RED on 2026-08-05 and stayed red for six days across
    # twenty consecutive CI runs, reporting "nothing derives a folder from a view's path".
    #
    # THAT REPORT WAS FALSE, AND IT WAS FALSE IN THE DIRECTION THAT MATTERS. The derivation did not
    # disappear; it MOVED, in 5492786 (PR #114, "extract the view drawer into app/shell/drawer.ts,
    # a typed component"). It now lives at app/shell/drawer.ts:187 as `folderOf`, which the page
    # imports through the bundle. `lastIndexOf` is an IMPLEMENTATION DETAIL of that function, and
    # this clause was asserting it in the file the function had just correctly left — so the check
    # went red exactly because the code got better. The page moving logic out of a hand-authored
    # `<script>` and into a typed module inside .flow-trace.yaml's capture filter is the migration
    # this whole repo is pursuing; a predicate that fails on it is measuring the wrong thing.
    #
    # WHAT IT ASSERTS NOW: the CLAIM rather than one file's spelling of it. The page must DELEGATE
    # (it names `folderOf`/`foldersOf` and does not hand-roll a second derivation), the module must
    # actually DERIVE the folder from a path, and neither may fall back to the `domain` label. The
    # `domain` ban is checked in BOTH places now, because after PR #114 a regression to the label
    # would land in the drawer module, where the old single-file check could not have seen it.
    drawer = _read(root / "app" / "shell" / "drawer.ts")
    if "folderOf" not in code or "foldersOf" not in code:
        problems.append("the page does not use the drawer's folder derivation (folderOf/foldersOf)")
    if not drawer:
        problems.append("no app/shell/drawer.ts — the folder derivation has no home")
    elif "lastIndexOf" not in drawer or "path" not in drawer:
        problems.append(
            "app/shell/drawer.ts no longer derives a folder from a view's path"
        )
    for where, source in (("app/index.html", code), ("app/shell/drawer.ts", drawer)):
        if source and re.search(r"\bv\.domain\b|\bdomain\s*\|\|", source):
            problems.append(
                f"{where} groups by `domain`, which is a label and disagrees with the vault"
            )

    touch = re.search(r"--touch:\s*([\d.]+)rem", code)
    if not touch:
        problems.append("no --touch token — the minimum target size is not stated once")
    elif float(touch.group(1)) * 16 < 44:
        problems.append(f"--touch is {touch.group(1)}rem, under the 44px minimum")
    else:
        for control in (".barbtn", ".foldbtn", ".viewbtn"):
            rule = re.search(re.escape(control) + r"[^{}]*\{([^{}]*)\}", code)
            if not rule or "min-height: var(--touch)" not in rule.group(1):
                problems.append(f"{control} sizes itself rather than taking --touch")

    if "viewport-fit=cover" not in page:
        problems.append("the viewport meta no longer covers the display, so the insets below are decorative")
    if "env(safe-area-inset-top" not in code or "env(safe-area-inset-bottom" not in code:
        problems.append("the shell does not pay the safe-area insets")
    if "prefers-reduced-motion" not in code:
        problems.append("the drawer slides for a reader who asked it not to")

    if problems:
        return PredicateResult(
            status="FAIL",
            message=f"the view chooser is not one folder drawer: {problems}",
            observed_ref="app/index.html",
        )
    return PredicateResult(
        status="PASS",
        message=(
            "one chooser: a drawer grouping views by their vault folder (from `path`, not `domain`), "
            "with 44px targets, the safe-area insets paid, and the slide honouring prefers-reduced-motion"
        ),
        observed_ref="app/index.html",
    )
# TOMBSTONE: assert_every_class_names_a_declared_package — deleted 2026-08-11, the same day it was
# written. It asserted that every class in classes.yaml names a package declared in packages.yaml.
# The check was right and mutation-proven; the capability it gated
# (`every-declared-class-names-its-package-home`) was a category error — its subject was this
# repo's own declaration files, not anything the app does — and was retracted with it. See the
# tombstone at the foot of docs/architecture/capabilities.yaml. The gap it covered belongs in
# flow-trace as a declarable package-gate policy mirroring `RollupConfig.horizontal_gate_policy`.
