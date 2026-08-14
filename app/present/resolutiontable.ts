/**
 * resolutiontable — reading the CONFIG-ONLY RESOLUTION TABLE: the facts a browser needs to
 * preview registration, ordering and the day boundary, decidable from config alone, with no
 * graph read and no clock. PURE: no DOM, no fetch, no clock.
 *
 * ── NOT HOMED IN select/ OR arrange/ — ONE DECLARATION KEY, READ BY ONE FUNCTION, FOR BOTH ──
 *
 * `RegistrationTable` (SELECT's registration defaults) and `SectionOrdering`/`OrderingKey`
 * (ARRANGE's ordering config) are published under the SAME `resolution` key of `presentation.json`
 * and read by the SAME `readConfigResolutionDeclaration` below, because the config itself bundles
 * them, not because this module chose to. Splitting the reader in two would mean parsing one JSON
 * key twice or inventing a boundary the declaration's own shape does not have. Left whole, shared
 * by `select/qualification`'s neighbour `select/membership.ts` on one side and `arrange/ordering.ts`
 * on the other — and by `today.ts`'s day-boundary reader, a third, non-verb axis, for the same
 * reason.
 *
 * `docs/implementation-artifacts/design-the-resolution-architecture.md` step 5. Two of the eight
 * config-only kinds that document names — DEFAULTS and REGISTRATION's per-view minting default —
 * are ALREADY published, by `scripts/generate-qualification-declaration.mjs`, as
 * `qualification.sections[view][section].{nodeType,defaults}`, and already have a live consumer,
 * `app/present/membership.ts`. This module does not re-publish them; see that generator's own
 * header for why a second copy of an already-generated fact is a bug, not a widening. What this
 * module reads is the REST of what step 5 asks for and what the operator's real config measures:
 *
 *   `resolution.registration.baseNodeType` — the REVERT target
 *   (`qntm_md.resolution.registration.RegistrationKey.BASE_NODE_TYPE`), GLOBAL only, forever,
 *   published under a name distinct from `defaultNodeType` even though today they share one
 *   config key. `resolveLineFields` (`membership.ts`) must never be handed this value in place of
 *   the per-view minting default — the design document's own §5.5 names the trap: a local mirror
 *   that used the per-view minting default as a revert target would reproduce, in the browser, the
 *   2026-07-27 `routine -> task -> routine` race the engine restructured its own signatures to
 *   make impossible. This module cannot stop a future caller from making that mistake by itself —
 *   the two fields are both plain strings — but it can and does refuse to let the GENERATOR
 *   conflate them (see that script's own guard: a sheet or section declaring `input_grammar` or
 *   `default_tags` fails generation loudly, because the single GLOBAL value this module reads
 *   would silently stop being correct).
 *
 *   `resolution.lineGrammars` — `line_grammars.yaml`'s two grammars, verbatim.
 *
 *   `resolution.ordering` — the 9 sections (of 186) that declare an `ordering:` list or an
 *   `ordering_mode:`, keyed `view -> section -> { ordering?, orderingMode?, name? }`. `name` is
 *   step 7's own addition (design-the-resolution-architecture.md) — the operator's own words for
 *   the section, the same reason `qualification.sections[view][section].name` exists, published a
 *   second time here because NONE of these 9 sections' predicates survive
 *   `generate-qualification-declaration.mjs`'s own normalisation (measured 2026-08-01: all 9
 *   traverse an edge, consult the clock, or range over a field the app cannot resolve), so that
 *   table has no entry for any of them to join against.
 *
 *   `resolution.orderingFields` — step 7's other addition: an ordering `field` name says nothing
 *   about how its value is spelled on a printed line. Keyed `field -> { token, kind }`, mirroring
 *   `config/vocabulary/markers.yaml`'s own `token`/`extraction_hint` pair, restricted to the fields
 *   `ordering` above actually names and to markers whose value is a magnitude an edit can change
 *   (never a fixed `value:` marker, never `render_only`) — see
 *   `scripts/generate-resolution-declaration.mjs`'s own header for the two named exclusions.
 *
 *   `resolution.dayBoundary` — the day boundary's 3 keys, verbatim.
 *
 *   `resolution.chromeShapes` — step 6's own addition, found while building it: `node_type` alone
 *   does not tell a caller how to SEED a bare new line, because `- [ ] ` and `- ` are not
 *   interchangeable chrome (`newline.ts`'s header measures what each wrong guess costs — one
 *   aborts the whole cycle). `node_types.<t>.render.shape` (schema.yaml) settles it, restricted to
 *   the node types that actually appear as a `default_node_type` candidate somewhere in this
 *   config, and restricted to the two shapes `newline.ts` knows how to seed (`checkbox`,
 *   `plain_line` — never `stat_line`/`heading`, which are left unpublished on purpose). See
 *   `scripts/generate-resolution-declaration.mjs`'s own header for the full account, including the
 *   engine function (`qntm_md.grammar.node_type_form.node_type_forms`) this mirrors.
 *
 * ── THREE READERS, ALL THREE NOW WITH A WIRED CALL SITE ──
 *
 * `app/present/newline.ts`'s GLOBAL rung reads `qualification.sections[view][section].nodeType`
 * (the per-section MINTING default, already published) joined against `chromeShapes` above (design
 * step 6). `app/present/ordering.ts` reads `ordering` and `orderingFields` above (design step 7) to
 * preview a row's position within its section. **Step 7's dependency, measured rather than
 * assumed: NONE of the 9 declared orderings compares a field against the clock** — all seven
 * field-keyed sections sort on an absolute value (`due_date`, `available_date`, `queue_position`),
 * never a `$cycle_today`-relative one, and the two `insertion_order` sections have no field to
 * compare at all. So step 7 does not, in fact, need step 8 — see `ordering.ts`'s own header for
 * the full measurement. `app/present/today.ts` (design step 8) READS `dayBoundary` and
 * resolves it exactly the way the engine does — proven against the engine's own
 * `resolve_logical_day`/`resolve_week_end`, `tests/present-today.test.mjs` — and
 * **`app/index.html`'s `sayAsOf` now calls it** (`todayNoteFor`, wired the same step this
 * comment was updated): membership's 8 clock-bound qualifications still need MORE than the
 * boundary alone (the predicate grammar itself has no orderable-comparison or `$variable`
 * vocabulary today, a separate widening filed as
 * `widen-qualification-language-for-clock-bound-predicates`, backlog.yaml), but the freshness
 * line's own "what day is it" sentence needed nothing else — it reads `nowUtcMs` and
 * `dayBoundary` and produces text, never a membership answer. See capability
 * `day-boundary-resolver-agrees-with-the-engine` for the full account.
 *
 * ── WHY THIS IS A THIRD READER, NOT A WIDER `qualification` OR `structural` ──
 *
 * Same reasoning `structural.ts`'s header gives for sitting beside `declaration.ts` rather than
 * inside it: one served document, several strict readers, each owning one axis. This axis is
 * "facts about registration/ordering/the clock that do not vary per LINE the way membership's
 * three fields do" — a different shape from either existing reader, so a fourth grammar over the
 * same document rather than a wider one of the other two.
 *
 * ── GENERATED, NEVER TRANSCRIBED ──
 *
 * `scripts/generate-resolution-declaration.mjs` produces the `resolution` key of
 * `presentation.json` from the monorepo's `views/default_registration.yaml`, `line_grammars.yaml`,
 * `day_boundary.yaml` and `views/*.yaml`, never by hand — the same condition every reader in this
 * directory already states for its own key.
 */

/** The two names for one config key — see this module's header for why both must exist. */
export interface RegistrationTable {
  /** The MINTING default (GLOBAL rung only, as read here) — `qualification.defaultNodeType`
   * carries the per-view-resolved form a caller should actually use for a new line's type. */
  readonly defaultNodeType: string;
  /** The REVERT target. GLOBAL only, forever. Never a substitute for `defaultNodeType` above. */
  readonly baseNodeType: string;
  readonly inputGrammar: string;
  readonly defaultTags: readonly string[];
}

/** One declared sort key, exactly as `ordering:` states it. */
export interface OrderingKey {
  readonly field: string;
  readonly direction: "asc" | "desc";
}

/** What one section says about its own row order — one or both of `ordering`/`orderingMode` may
 * be present. `name` is the operator's own words for the section — see this module's header for
 * why it rides here rather than being joined from `qualification.sections`. */
export interface SectionOrdering {
  readonly ordering: readonly OrderingKey[] | undefined;
  readonly orderingMode: string | undefined;
  readonly name: string | undefined;
}

/** How an ordering field's value is spelled on a printed line — `markers.yaml`'s own two shapes:
 * a TRAILING-TOKEN marker (`date`/`int`/`float` — a glyph followed by a value that varies line to
 * line) or an ENUM (value-match) marker (`priority`'s `🔽`/`⏫` — one glyph PER value, never a
 * trailing value at all). */
export type OrderingFieldKind = "date" | "int" | "float" | "enum";

/** One field's marker — a discriminated union on `kind`, mirroring
 * `scripts/compile-resolution.mjs`'s own two published shapes exactly. A trailing marker carries
 * ONE glyph (`token`); an enum marker carries MANY, each mapped to the value it spells (`values`,
 * token -> value) — reading it is "does the line contain any of these glyphs", never a single
 * `token` lookup. */
export type OrderingFieldMarker =
  | { readonly kind: "date" | "int" | "float"; readonly token: string }
  | { readonly kind: "enum"; readonly values: Readonly<Record<string, string>> };

/** `day_boundary.yaml`'s 3 keys, verbatim. */
export interface DayBoundary {
  readonly timezone: string;
  readonly dayStartHour: number;
  readonly weekStartsOn: string;
}

/** The render-form family a resolved node type carries — the two shapes `newline.ts` can seed. */
export type ChromeShape = "checkbox" | "plain_line";

/**
 * ONE TRAILING MARKER, in the direction that PRINTS — `<token> <value>`, where the value's kind is
 * part of the spelling. The same shape `OrderingFieldMarker`'s non-enum arm carries, and
 * deliberately so: where both tables name a field they agree, and a caller holding one does not
 * have to learn a second vocabulary to read the other.
 *
 * `renderOnly` IS CARRIED RATHER THAN FILTERED OUT, and it is the whole reason this type exists
 * separately. A `render_only: true` glyph (`☑️` for `done_task_count`, `🎯` for `par`) is one the
 * engine PRINTS and never reads back. That fact excludes it from the seed table — writing one into
 * a line the operator types would freeze a value the engine goes on deciding — and QUALIFIES it
 * here, because printing it is exactly what the engine does. Two callers need opposite things from
 * one row, so the row says which it is instead of one of them inferring it from the other's
 * absence.
 */
export interface RenderedFieldMarker {
  readonly kind: "date" | "int" | "float";
  readonly token: string;
  readonly renderOnly?: true;
}

/**
 * THE VOCABULARY IN THE DIRECTION THAT PRINTS — how the engine spells a node that already exists.
 *
 * `sectionRegistration[view][section].tokens` is the other direction: the tags a NEW line gets,
 * baked per section for that section's own minting default. It answers "what do I type". This
 * answers "how is this spelled", for a node whose type is whatever the rules left it as — the same
 * widening `chromeShapes` takes, for the same reason.
 *
 * ── THREE TABLES, BECAUSE A LINE HAS THREE PLACES A GLYPH CAN GO ──
 *
 * `fieldTags` — fixed-value, `#`-prefixed: `domain` -> `work` -> `#work`. Goes in the TAGS cell.
 * `fieldMarkerValues` — fixed-value, marker glyph: `priority` -> `high` -> `⏫`. MARKERS cell.
 * `fieldMarkers` — TRAILING: `due_date` -> `📅` + a date that varies line to line. MARKERS cell.
 *
 * SPLIT ON THE ENGINE'S OWN FILTER, not on a guess about glyphs. `source_tags_for_node`
 * (`token_resolver.py:518`) ends `if tag and tag.startswith("#")`, so only a `#`-prefixed glyph is
 * ever a tag; `source_markers_for_node` walks the marker vocabulary for the rest.
 *
 * ── WHAT IS DELIBERATELY ABSENT, AND WHY LOOKING FOR IT HERE IS THE MISTAKE ──
 *
 * THE CHECKBOX GLYPH IS NOT IN ANY OF THESE, and `status` appears in none of them. `[x]` is neither
 * `#`-prefixed nor a marker: it is the line's HEAD cell, and it is not a vocabulary lookup at all.
 * It is decided by `renderCheckbox` — first-match-wins rows with a fallback.
 *
 * This used to be one `fieldTokens` table carrying all three kinds, so `fieldTokens.status` existed
 * and returned exactly the six glyphs a composer wants. Reading it would have agreed with the
 * engine today and diverged on the first row the contract adds — and that precise divergence, from
 * a copy "kept in sync by nothing", rendered done outcomes as `[ ]` and let the next re-ingest
 * silently re-open them (qntm:66/837/903, every four to five days). The table is split so the wrong
 * lookup cannot be written, rather than documented so it can be written knowingly.
 */
export interface RenderedSpelling {
  readonly typeTokens: Readonly<Record<string, string>>;
  readonly fieldTags: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly fieldMarkerValues: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly fieldMarkers: Readonly<Record<string, RenderedFieldMarker>>;
}

/**
 * THE CHECKBOX GLYPH — the first cell of every checkbox line, and a DECISION rather than a lookup.
 *
 * Mirrors `render/contracts/render_checkbox.yaml`, whose header states it is the sole source of
 * truth for this glyph. Two properties are why this is rows-plus-fallback and never a map:
 *
 *   * FIRST-MATCH-WINS. `rows` is ORDERED; the first whose `when` holds decides, later rows never
 *     run. A map is unordered by construction and cannot express it.
 *   * `fallback`. A node whose `status` is absent renders an open box BY RULE. A map has no entry
 *     for "absent" and would leave the caller to invent one.
 *
 * A reader evaluates it exactly as the engine does: walk `rows` in order, take the first whose
 * field equals the node's value, else `fallback`. Do not reorder, do not index by value.
 */
export interface RenderCheckboxRow {
  readonly when: { readonly field: string; readonly equals: string };
  readonly then: string;
}

/**
 * HOW A NODE OF THIS TYPE IS IDENTIFIED — and therefore whether its line carries a stamp.
 *
 * `unique: true` means the type declares `identity: {unique: true}` in `schema.yaml`, and
 * `decide_stamp` (renderer.py) returns `""` for it: the line renders WITHOUT `[[qntm:N]]`, because
 * a structural node's identity is its unique NAME. `field` is what carries that name — the field
 * `applier.py`'s own by-title survival guard matches on when the stamp is absent.
 *
 * `unique: false, field: null` is the ordinary pathway: mint fresh, stamp the line.
 *
 * BOTH HALVES, DELIBERATELY. A reader given `unique` alone knows to omit the stamp and does not
 * know what identifies the node instead — the same half-a-decision shape as publishing
 * `renderCheckbox`'s rows without its `fallback`.
 */
export interface IdentityMode {
  readonly unique: boolean;
  readonly field: string | null;
}

export interface RenderCheckbox {
  readonly rows: readonly RenderCheckboxRow[];
  readonly fallback: string;
}

/**
 * ONE CELL CLASS — the vocabulary `resolution.composition` orders, and nothing more specific than
 * that. `"tags"`/`"markers"`/`"chrome"` name FAMILIES of cell (a line may carry several tag cells),
 * `"checkbox"`/`"title"`/`"stamp"`/`"date"` name a single cell. This IS the closed alphabet a
 * composition may speak in — not an operator-declared field or token, which never appears here (see
 * `app/present/express/composition.ts`'s own header for why that boundary matters).
 */
export type CompositionCellClass = "checkbox" | "title" | "stamp" | "date" | "tags" | "markers" | "chrome";

/**
 * THE SECOND DIRECTION OF A LINE GRAMMAR — where a cell GOES, given a line already recognised as
 * one of `heads`' keys. See `scripts/compile-resolution.mjs`'s own header ("COMPOSITION") for the
 * full citation of `renderer.py`'s composition order this mirrors, and this module's own header for
 * why it is a fourth reader on this table rather than a widening of `lineGrammars`.
 *
 * `heads` is keyed by render shape (`chromeShapes`' own two values — `stat_line`/`heading` are
 * never seeded by this app and so never appear here, the same restriction `SEEDABLE_SHAPES` already
 * applies elsewhere on this table). `tail` is the ONE cell-class order every shape's body shares
 * after its head — see `_field_expression_cells` in the citation above.
 */
export interface Composition {
  readonly heads: Readonly<Record<ChromeShape, readonly CompositionCellClass[]>>;
  readonly tail: readonly CompositionCellClass[];
  readonly separator: string;
  /**
   * THE GFM bullet character every line opens with — one of `-`, `*`, `+`. Declared via
   * `composition.form.bullet` (`global_defaults.yaml`); `"-"` when a root declares none, byte-
   * identical to the pre-existing literal. Always one of these three: `io.parser.parse_checkbox`
   * (monorepo, read-only) already recognises all three regardless of which one was typed, so a
   * declared bullet round-trips with no ingest-side change — see `compile-resolution.mjs`'s own
   * "COMPOSITION FORM" header for the full argument.
   */
  readonly bullet: string;
  /**
   * AN ADDITIONAL, UNCONDITIONAL wrap applied to every composed title — zero or more of `"italic"`
   * / `"bold"` / `"strikethrough"`, declared via `composition.form.title_styles`. `[]` when a root
   * declares none, byte-identical to the pre-existing literal. Restricted to this closed three-
   * member vocabulary because `io.render_context_parse.canonicalise_title_segment` (monorepo,
   * read-only) already strips exactly these wrappers (`*…*` / `**…**` / `~~…~~`) off a title on
   * ingest — see `express/composition.ts`'s `applyTitleStyles` for the emission order this mirrors.
   */
  readonly titleStyles: readonly string[];
}

/**
 * WITHIN the "tags" cell `Composition.tail` names — which tag comes first, when several coexist on
 * one line (a node's own type tag, a domain tag, an edge-shorthand tag). See
 * `scripts/compile-resolution.mjs`'s own header ("TAG ORDER") for the full citation of
 * `order_tags.yaml` this mirrors — that file's own words: "THIS FILE IS THE SOURCE OF TRUTH FOR TAG
 * ORDER. Nothing else is."
 *
 * THE ALGORITHM (`OrderTagsActionDispatcher`, transcribed exactly — `orderTags` in `rules.ts` is the
 * one function that reads this type and performs it): partition a candidate tag list into RANKED
 * (a member of `canonicalOrder`) and UNRANKED; stable-sort the ranked pool by its position in
 * `canonicalOrder`; concatenate per `unrankedPolicy`. `"append_stable"` (the only value the engine
 * declares today) puts the unranked pool AFTER the ranked one, in the unranked items' own original
 * relative order — never alphabetised, never re-sorted a second way.
 */
export interface TagOrder {
  readonly canonicalOrder: readonly string[];
  readonly unrankedPolicy: "append_stable" | "prepend_stable" | "reject";
}

/**
 * WHAT A NEW LINE UNDER ONE SECTION BECOMES — rungs 1 and 2 of `design-the-rule-mirror.md`.
 *
 * `nodeType` is the registration answer, cascaded STRUCTURAL_NODE -> VIEW -> GLOBAL by the
 * generator. `defaults` is the section's own `defaults:` block, verbatim. `tokens` is the pair of
 * facts turned into CHARACTERS: the tokens the ENGINE ITSELF prints for a node of that type
 * carrying those defaults (`TokenResolver.source_tags_for_node`), in the engine's own order.
 *
 * `tokens` is NOT derivable from the other two by this module, and must never be re-derived here.
 * It is the answer to three questions the browser cannot ask — which vocabulary tag spells a
 * (field, value) pair, in what order the engine emits them, and whether a rule retypes the line
 * inside the pass that mints it — and every one of those is a config read that happens once, in
 * `scripts/generate-resolution-declaration.mjs`, with each refusal recorded in `dropped`.
 *
 * A field in `defaults` with no token in `tokens` is a field the engine prints no tag for either;
 * see that generator's own header for why seeding one anyway would freeze a value the engine goes
 * on deciding. An EMPTY `tokens` is therefore an answer ("nothing is spelled here"), never a gap.
 */
export interface SectionRegistration {
  readonly nodeType: string;
  readonly defaults: Readonly<Record<string, string | number | boolean | null>> | undefined;
  readonly tokens: readonly string[];
}

/**
 * The whole published table. A lookup, not a resolver.
 *
 * A VALUE OF THIS TYPE IS COMPLETE IN THE ONE FIELD THAT CANNOT DEGRADE — see `dayBoundary`
 * below. Every OTHER absence here is a per-key refusal a reader must handle by ABSTAINING, and
 * each one is typed `| undefined` or is a record whose entry may simply be missing. `dayBoundary`
 * is not, and the difference is not taste: it is the only field whose consumer (`today.ts`'s
 * `todayFor`) takes it as a REQUIRED parameter, so an absent one is not an abstention a caller
 * chooses — it is a `TypeError` a caller cannot see coming.
 */
export interface ConfigResolutionTable {
  readonly registration: RegistrationTable | undefined;
  /** grammar name -> the shape names it admits. */
  readonly lineGrammars: Readonly<Record<string, readonly string[]>>;
  readonly ordering: Readonly<Record<string, Readonly<Record<string, SectionOrdering>>>>;
  /** ordering field name -> its trailing-token marker. A field named by `ordering` above but
   * absent here has no known marker (a fixed-`value:` marker, a `render_only` one, or none at
   * all) — see this module's header for why that is a refusal, never a guess. */
  readonly orderingFields: Readonly<Record<string, OrderingFieldMarker>>;
  /**
   * THE DECLARED DAY BOUNDARY, AND IT IS NEVER ABSENT — the one field on this table with no
   * `| undefined`, so that no reader anywhere can hold one that is missing.
   *
   * WHY THIS FIELD AND NOT THE OTHERS. `todayFor` (today.ts) takes `DayBoundary`, not
   * `DayBoundary | undefined`, and it dereferences `boundary.timezone` immediately. Every call
   * site that reaches it does so inside `commitLine`'s SYNCHRONOUS prefix, in an `async` function
   * no keydown handler awaits — so an `undefined` here does not degrade a preview, it throws into
   * an unhandled rejection and the operator's capture disappears with no POST and nothing on
   * screen. That is `f448da2`'s exact shape, the defect that silently discarded his `x` and `>`
   * gestures for five hours.
   *
   * The previous shape typed this `DayBoundary | undefined` and left the whole table readable
   * without it, which put the burden on every resolver to remember a guard. One already forgot
   * (`resolvers/rules.ts` carried a documented `!`), and the page GUARDED the same case twelve
   * lines from where it did not — the codebase disagreeing with itself about whether this can
   * happen. Making it required moves the decision to the one place that can actually make it:
   * `readConfigResolutionDeclaration` REFUSES TO PRODUCE A TABLE AT ALL without a valid boundary,
   * so the state is unrepresentable rather than guarded, and a future resolver inherits the
   * guarantee without knowing it exists. See that function's header for what "refuses" costs.
   */
  readonly dayBoundary: DayBoundary;
  /**
   * node type -> its render-form family, for every node type `schema.yaml` DECLARES and every
   * shape this app knows how to draw. A type absent here is a type whose chrome this app does not
   * know how to produce — see this module's header.
   *
   * WIDENED 2026-08-14, and the widening is the point. This used to carry only the types some view
   * names as a `default_node_type` — "what can you mint". A node's type is not fixed when it is
   * minted: a rule can retype it afterwards, and the operator's config declares one that turns a
   * `task` into an `outcome`. Neither `outcome` nor `habit` was published, so the browser could
   * not draw the result of his own rule. It now answers "what can a node BE".
   *
   * NO EXISTING READER SEES A DIFFERENT ANSWER. Every lookup here is keyed by a minting default
   * (`newline.ts`'s GLOBAL rung), so the added entries are ones today's callers never reach.
   */
  readonly chromeShapes: Readonly<Record<string, ChromeShape>>;
  /**
   * `view -> section -> what a new line under it becomes`, for EVERY section of every view sheet.
   *
   * NOT a second copy of `qualification.sections[view][section].{nodeType,defaults}`, and the
   * difference is coverage, not shape: that table is the MEMBERSHIP half and carries only the 49
   * sections whose predicate normalised. `all-personal.tasks` — the operator's own worked example
   * — is not one of them, because `all-personal-nodes` compares `available_date` against the
   * clock. What a new line BECOMES does not depend on what already belongs there, so this table is
   * ungated. `ordering.name` above republishes a fact for the identical reason.
   */
  readonly sectionRegistration: Readonly<Record<string, Readonly<Record<string, SectionRegistration>>>>;
  /**
   * THE FLOOR OF THE CASCADE — the sort spec applied to EVERY section that declares neither
   * `ordering` nor `orderingMode` above (171 of 186 sections, measured against the operator's real
   * config). 2026-08-06 ("the default ordering is declared"): this is now a DECLARED value, read by
   * `scripts/compile-resolution.mjs` from `global_defaults.yaml`'s own `default_ordering:` when an
   * operator's config names one, so it can differ per instance the way every other node type, field
   * and ordering already can — no operator is handed a global naming fields their own vocabulary
   * does not have. When no config declares one, it falls back to the engine's own hardcoded tuple
   * (`apps/qntm-md/src/qntm_md/render/section_builder.py`'s `_DEFAULT_ORDERING`) so behaviour does
   * not change underfoot — see `defaultOrderingSource` for which answer this is. Always published
   * (never absent, never per-view) either way. See `app/present/ordering.ts`'s
   * `resolveOrderingPlacementFor` for where this is actually consumed.
   */
  readonly defaultOrdering: readonly OrderingKey[];
  /**
   * WHICH ANSWER `defaultOrdering`/`priorityRank` ARE — `"config"` when `global_defaults.yaml`
   * declared `default_ordering:` itself, `"engine-fallback"` when it did not and the engine's own
   * hardcoded tuple answered instead. Published so the fallback is a VISIBLE fact rather than the
   * silent one this table used to publish unconditionally with no way to tell the two apart —
   * see `compile-resolution.mjs`'s own header, "THE DEFAULT ORDERING", for the full argument.
   */
  readonly defaultOrderingSource: "config" | "engine-fallback" | undefined;
  /**
   * THE PRIORITY RANK `defaultOrdering`'s own enum-shaped key (`priority`, in the engine's own
   * fallback tuple) compares by — the numeric rank an `"enum"`-kind `orderingFields` marker's
   * spelled value looks up. Declared alongside `default_ordering:` (`priority_rank:`) or, absent
   * that, the engine's own hardcoded `_PRIORITY_RANK` (four numbers for five names —
   * `normal`/`medium` share rank 2). Omitted entirely (not published empty) when the effective
   * default ordering names no field a rank table applies to — the same "absent means nothing to
   * say" convention every other optional key on this table already uses.
   */
  readonly priorityRank: Readonly<Record<string, number>>;
  /**
   * HOW THE ENGINE SPELLS A NODE THAT ALREADY EXISTS — see `RenderedSpelling`'s own header.
   *
   * `undefined` when the served declaration predates this key or declares it malformed, and the
   * caller must treat that as "I do not know how to spell anything" rather than "nothing is
   * spelled". Same posture as `composition`/`tagOrder`: a half-known spelling table would have a
   * composer print some cells and silently omit others, which is worse than printing none.
   */
  readonly spelling: RenderedSpelling | undefined;
  /**
   * THE CHECKBOX GLYPH DECISION — see `RenderCheckbox`'s own header. `undefined` when the served
   * declaration predates this key or declares it malformed, and a caller must then draw NO checkbox
   * rather than fall back to a glyph of its own: an invented `[ ]` over a done node is exactly the
   * re-opening bug this key exists to make impossible.
   */
  readonly renderCheckbox: RenderCheckbox | undefined;
  /** Always `"engine-literal"` — this contract is engine source, not operator config, so there is
   * no config/engine-fallback split to report. Published so the kind of fact is stated. */
  readonly renderCheckboxSource: "engine-literal" | undefined;
  /**
   * node type -> how it is identified. See `IdentityMode`. Keyed over EVERY type `schema.yaml`
   * declares, which is what makes a MISSING key meaningful: it is a type this config does not
   * declare, and a caller must refuse to compose its line rather than assume the ordinary
   * stamped pathway. `undefined` for the whole map when the served declaration predates this key.
   */
  readonly identityModes: Readonly<Record<string, IdentityMode>> | undefined;
  /**
   * WHICH ANSWER `composition.bullet`/`composition.titleStyles` ARE, separately from the block's
   * own `compositionSource`. `composition.form:` is optional INSIDE an optional `composition:`, so
   * a config that orders cells without wrapping a title publishes `compositionSource: "config"`
   * over two values the config never mentioned. One flag cannot speak for both facts.
   */
  readonly compositionFormSource: "config" | "engine-fallback" | undefined;
  /**
   * THE SECOND DIRECTION OF THE LINE GRAMMAR — where a cell goes, once a line's shape is known. See
   * the `Composition` type's own header. 2026-08-06 (closing the asymmetry monorepo PR #72 named):
   * read by `scripts/compile-resolution.mjs` from `global_defaults.yaml`'s own `composition:` key
   * when an operator's config declares one, the same GLOBAL layer and the same visible-fallback
   * discipline `defaultOrdering` already has — see `compositionSource` for which answer this is.
   * `undefined` only when the served document predates this key or the key is malformed, never as
   * a per-operator answer that silently withheld itself.
   */
  readonly composition: Composition | undefined;
  /**
   * WHICH ANSWER `composition` IS — `"config"` when `global_defaults.yaml` declared `composition:`
   * itself, `"engine-fallback"` when it did not and `ENGINE_LITERAL_COMPOSITION` answered instead.
   * `undefined` when the served document predates this key or the key is malformed. The same
   * "never silent about a fallback" posture `defaultOrderingSource` already established, applied
   * here — see `compile-resolution.mjs`'s own header, "COMPOSITION", for the full argument.
   */
  readonly compositionSource: "config" | "engine-fallback" | undefined;
  /**
   * WITHIN "tags" — see the `TagOrder` type's own header. `undefined` when the served document
   * predates this key (2026-08-07) or the key is malformed — a caller with no tag-order fact must
   * abstain from reordering rather than guess one, the same posture `composition: undefined` already
   * requires of a composing caller.
   */
  readonly tagOrder: TagOrder | undefined;
  /**
   * WHICH ANSWER `tagOrder` IS. UNLIKE `compositionSource`, this is never `"config"` —
   * `order_tags.yaml` names no operator-config override surface at all (see its own header,
   * transcribed in `compile-resolution.mjs`), so the only real value is `"engine-literal"`.
   * Published anyway, for the same reason `compositionSource` is: so a reader can tell "this IS the
   * engine's own answer" from "this document predates the key" without the two looking identical.
   */
  readonly tagOrderSource: "engine-literal" | undefined;
  /**
   * EVERY DECLARATION THE GENERATOR READ AND DID NOT PUBLISH, `what -> why`. The two comments
   * above ("a field absent here has no known marker", "a type absent here is one whose chrome this
   * app does not know how to produce") described a refusal the operator had no way to see: absence
   * carried the meaning, and absence looks exactly like nothing-to-say. `dropped` gives each
   * absence its reason. Not read to decide anything. See `scripts/ledger.mjs`.
   */
  readonly dropped: Readonly<Record<string, string>>;
}

/**
 * Mirrors `StructuralReading` / `QualificationReading`: the value, plus what was wrong with it.
 *
 * `resolution: undefined` IS AN ANSWER, AND IT IS THE SAME ANSWER THE APP ALREADY HANDLES —
 * "this axis said nothing usable". It is the state the page is in before `presentation.json`
 * arrives at all, so every consumer already gates on it (`resolvers/{rules,ordering,promotion}
 * .ts` each open with `resolution === undefined`, and the page's own `globalRegistrationFor` does
 * the same). Adding a second way to be incomplete would have meant a second gate; reusing this one
 * means no caller changes and no future caller has to be told.
 */
export interface ConfigResolutionReading {
  readonly resolution: ConfigResolutionTable | undefined;
  readonly problems: readonly string[];
}

/** The top-level key this module owns. `declaration.ts` knows its name only to skip it. */
export const RESOLUTION_TABLE_KEY = "resolution";

const TOP_KEYS = [
  "registration",
  "lineGrammars",
  "ordering",
  "orderingFields",
  "dayBoundary",
  "chromeShapes",
  "sectionRegistration",
  "defaultOrdering",
  "defaultOrderingSource",
  "priorityRank",
  "composition",
  "compositionSource",
  // The FORM's own provenance, separate from the block's — `composition.form:` is optional inside
  // an optional `composition:`, so one flag cannot speak for both. See the generator's own
  // paragraph beside where it is published.
  "compositionFormSource",
  "tagOrder",
  "tagOrderSource",
  // The vocabulary in the direction that PRINTS. `sectionRegistration[].tokens` is the seed answer
  // — what a NEW line gets, baked per section for that section's minting default. This is the
  // other direction: how the engine spells a node that already exists, whatever its type turned
  // out to be after the rules ran.
  "spelling",
  // The checkbox glyph, and whose answer it is. See `RenderCheckbox` — rows plus a fallback,
  // never a map, because first-match-wins and "no status at all" are both real answers.
  "renderCheckbox",
  "renderCheckboxSource",
  // Whether a type's line carries a stamp, and what identifies it when it does not. Keyed over
  // every declared type, so absence means "unknown type", never "ordinary type".
  "identityModes",
  "dropped",
] as const;
const DEFAULT_ORDERING_SOURCES = ["config", "engine-fallback"] as const;
// Same two values as `DEFAULT_ORDERING_SOURCES` — kept as its own named constant, not a shared
// import, because the two fields it validates (`defaultOrderingSource`, `compositionSource`)
// answer unrelated questions that happen to share a domain; a future third source value for one
// must not silently become valid for the other.
const COMPOSITION_SOURCES = ["config", "engine-fallback"] as const;
/** `tagOrderSource`'s own closed set — see `TagOrder`'s header for why this is ONE member, not two. */
const TAG_ORDER_SOURCES = ["engine-literal"] as const;
const TAG_ORDER_KEYS = ["canonicalOrder", "unrankedPolicy"] as const;
const TAG_ORDER_UNRANKED_POLICIES = ["append_stable", "prepend_stable", "reject"] as const;
const SECTION_REGISTRATION_KEYS = ["nodeType", "defaults", "tokens"] as const;
const REGISTRATION_KEYS = ["defaultNodeType", "baseNodeType", "inputGrammar", "defaultTags"] as const;
const ORDERING_KEY_KEYS = ["field", "direction"] as const;
const SECTION_ORDERING_KEYS = ["ordering", "orderingMode", "name"] as const;
const TRAILING_MARKER_KEYS = ["token", "kind"] as const;
const ENUM_MARKER_KEYS = ["kind", "values"] as const;
const TRAILING_ORDERING_FIELD_KINDS = ["date", "int", "float"] as const;
const DAY_BOUNDARY_KEYS = ["timezone", "dayStartHour", "weekStartsOn"] as const;
const DIRECTIONS = ["asc", "desc"] as const;
const CHROME_SHAPES = ["checkbox", "plain_line"] as const;
const COMPOSITION_KEYS = ["heads", "tail", "separator", "bullet", "titleStyles"] as const;
const COMPOSITION_CELL_CLASSES = ["checkbox", "title", "stamp", "date", "tags", "markers", "chrome"] as const;
/** Mirrors `bundle/loader.py`'s own `_COMPOSITION_BULLET_CHARS` (monorepo, read-only). */
const COMPOSITION_BULLET_CHARS = ["-", "*", "+"] as const;
/** Mirrors `bundle/loader.py`'s own `_COMPOSITION_TITLE_STYLE_VOCABULARY` (monorepo, read-only). */
const COMPOSITION_TITLE_STYLES = ["italic", "bold", "strikethrough"] as const;

// THERE IS NO `EMPTY` TABLE, AND THERE CANNOT BE ONE. This module used to keep a constant with
// every field at its "nothing to say" value and hand it back for a document that declared no
// `resolution` key at all. `dayBoundary: undefined` was one of those fields — which is precisely
// how a table with no day boundary became an ordinary, returnable value that passed every
// resolver's `resolution === undefined` gate and then threw on the next line. The empty table is
// now `undefined` itself: the same silence, spelled the one way every caller already checks.

const isScalarOrNull = (value: unknown): value is string | number | boolean | null =>
  value === null || ["string", "number", "boolean"].includes(typeof value);

/**
 * One section's registration answer, or nothing.
 *
 * ALL THREE FIELDS OR NONE, unlike `SectionOrdering`'s tolerant read of its optional `name`. Each
 * one here changes what the operator's line SAYS: a `nodeType` without its `tokens` would seed no
 * characters at all, and `tokens` without a `nodeType` would spell a type nothing published. A
 * half-read entry is a half-seeded line, so the whole entry is dropped and the section behaves
 * exactly as it did before this key existed.
 */
function readSectionRegistrationEntry(
  path: string,
  value: unknown,
  problems: string[],
): SectionRegistration | undefined {
  if (!isPlainObject(value)) {
    problems.push(`'${path}' is ${shapeOf(value)}, not an object — what a new line here becomes stays unknown`);
    return undefined;
  }
  for (const key of Object.keys(value)) {
    if (!(SECTION_REGISTRATION_KEYS as readonly string[]).includes(key)) {
      problems.push(
        `'${path}.${key}' is not a recognised key — the keys are ${SECTION_REGISTRATION_KEYS.join(", ")}`,
      );
    }
  }
  const { nodeType, defaults, tokens } = value;
  if (typeof nodeType !== "string" || nodeType === "") {
    problems.push(`'${path}.nodeType' is ${JSON.stringify(nodeType)}, not a node type`);
    return undefined;
  }
  if (!Array.isArray(tokens) || !tokens.every((t) => typeof t === "string" && t !== "")) {
    problems.push(
      `'${path}.tokens' is ${JSON.stringify(tokens)}, not an array of non-empty strings — ` +
        "nothing is seeded here rather than part of a line",
    );
    return undefined;
  }
  let read: Record<string, string | number | boolean | null> | undefined;
  if (defaults !== undefined) {
    if (!isPlainObject(defaults)) {
      problems.push(`'${path}.defaults' is ${shapeOf(defaults)}, not an object`);
      return undefined;
    }
    read = {};
    for (const [field, fieldValue] of Object.entries(defaults)) {
      if (!isScalarOrNull(fieldValue)) {
        problems.push(`'${path}.defaults.${field}' is ${shapeOf(fieldValue)}, not a scalar`);
        return undefined;
      }
      read[field] = fieldValue;
    }
  }
  return { nodeType, defaults: read, tokens: tokens as readonly string[] };
}

function readSectionRegistration(
  value: unknown,
  problems: string[],
): Record<string, Record<string, SectionRegistration>> {
  if (!isPlainObject(value)) {
    problems.push(
      `'${RESOLUTION_TABLE_KEY}.sectionRegistration' is ${shapeOf(value)}, not an object — no new ` +
        "line is seeded with what it becomes",
    );
    return {};
  }
  const out: Record<string, Record<string, SectionRegistration>> = {};
  for (const [viewId, sectionsValue] of Object.entries(value)) {
    const viewPath = `${RESOLUTION_TABLE_KEY}.sectionRegistration.${viewId}`;
    if (!isPlainObject(sectionsValue)) {
      problems.push(`'${viewPath}' is ${shapeOf(sectionsValue)}, not an object`);
      continue;
    }
    const sections: Record<string, SectionRegistration> = {};
    for (const [sectionId, raw] of Object.entries(sectionsValue)) {
      const read = readSectionRegistrationEntry(`${viewPath}.${sectionId}`, raw, problems);
      if (read !== undefined) sections[sectionId] = read;
    }
    if (Object.keys(sections).length > 0) out[viewId] = sections;
  }
  return out;
}

/** `what -> why`, validated the same way every other string map in this reader is. */
function readDropped(value: unknown, problems: string[]): Record<string, string> {
  if (!isPlainObject(value)) {
    problems.push(
      `'${RESOLUTION_TABLE_KEY}.dropped' is ${shapeOf(value)}, not an object — what the ` +
        "generator refused to publish stays unknown",
    );
    return {};
  }
  const out: Record<string, string> = {};
  for (const [what, why] of Object.entries(value)) {
    if (typeof why !== "string") {
      problems.push(`'${RESOLUTION_TABLE_KEY}.dropped.${what}' is ${shapeOf(why)}, not a reason`);
      continue;
    }
    out[what] = why;
  }
  return out;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const shapeOf = (value: unknown): string => (Array.isArray(value) ? "an array" : typeof value);

function readRegistration(value: unknown, problems: string[]): RegistrationTable | undefined {
  if (!isPlainObject(value)) {
    problems.push(
      `'${RESOLUTION_TABLE_KEY}.registration' is ${shapeOf(value)}, not an object — the ` +
        "registration table stays unknown",
    );
    return undefined;
  }
  for (const key of Object.keys(value)) {
    if (!(REGISTRATION_KEYS as readonly string[]).includes(key)) {
      problems.push(
        `'${RESOLUTION_TABLE_KEY}.registration.${key}' is not a recognised key and was NOT ` +
          `applied — the keys are ${REGISTRATION_KEYS.join(", ")}`,
      );
    }
  }
  const { defaultNodeType, baseNodeType, inputGrammar, defaultTags } = value;
  let ok = true;
  for (const [name, v] of [
    ["defaultNodeType", defaultNodeType],
    ["baseNodeType", baseNodeType],
    ["inputGrammar", inputGrammar],
  ] as const) {
    if (typeof v !== "string" || v === "") {
      problems.push(
        `'${RESOLUTION_TABLE_KEY}.registration.${name}' is ${JSON.stringify(v)}, not a ` +
          "non-empty string",
      );
      ok = false;
    }
  }
  if (!Array.isArray(defaultTags) || !defaultTags.every((t) => typeof t === "string")) {
    problems.push(
      `'${RESOLUTION_TABLE_KEY}.registration.defaultTags' is ${JSON.stringify(defaultTags)}, ` +
        "not an array of strings",
    );
    ok = false;
  }
  if (!ok) return undefined;
  return {
    defaultNodeType: defaultNodeType as string,
    baseNodeType: baseNodeType as string,
    inputGrammar: inputGrammar as string,
    defaultTags: defaultTags as readonly string[],
  };
}

function readLineGrammars(value: unknown, problems: string[]): Record<string, readonly string[]> {
  if (!isPlainObject(value)) {
    problems.push(
      `'${RESOLUTION_TABLE_KEY}.lineGrammars' is ${shapeOf(value)}, not an object — every ` +
        "grammar stays unknown",
    );
    return {};
  }
  const out: Record<string, readonly string[]> = {};
  for (const [name, shapes] of Object.entries(value)) {
    if (!Array.isArray(shapes) || !shapes.every((s) => typeof s === "string")) {
      problems.push(
        `'${RESOLUTION_TABLE_KEY}.lineGrammars.${name}' is ${JSON.stringify(shapes)}, not an ` +
          "array of strings",
      );
      continue;
    }
    out[name] = shapes as readonly string[];
  }
  return out;
}

function readOrderingKey(path: string, value: unknown, problems: string[]): OrderingKey | undefined {
  if (!isPlainObject(value)) {
    problems.push(`'${path}' is ${shapeOf(value)}, not an object — this ordering key is unknown`);
    return undefined;
  }
  for (const key of Object.keys(value)) {
    if (!(ORDERING_KEY_KEYS as readonly string[]).includes(key)) {
      problems.push(
        `'${path}.${key}' is not a recognised key — the keys are ${ORDERING_KEY_KEYS.join(", ")}`,
      );
    }
  }
  const { field, direction } = value;
  if (typeof field !== "string" || field === "") {
    problems.push(`'${path}.field' is ${JSON.stringify(field)}, not a non-empty string`);
    return undefined;
  }
  if (!(DIRECTIONS as readonly string[]).includes(direction as string)) {
    problems.push(
      `'${path}.direction' is ${JSON.stringify(direction)}, not one of ${DIRECTIONS.join(", ")}`,
    );
    return undefined;
  }
  return { field, direction: direction as "asc" | "desc" };
}

function readSectionOrdering(
  path: string,
  value: unknown,
  problems: string[],
): SectionOrdering | undefined {
  if (!isPlainObject(value)) {
    problems.push(`'${path}' is ${shapeOf(value)}, not an object — this section's ordering is unknown`);
    return undefined;
  }
  for (const key of Object.keys(value)) {
    if (!(SECTION_ORDERING_KEYS as readonly string[]).includes(key)) {
      problems.push(
        `'${path}.${key}' is not a recognised key — the keys are ${SECTION_ORDERING_KEYS.join(", ")}`,
      );
    }
  }
  let ordering: readonly OrderingKey[] | undefined;
  if (value.ordering !== undefined) {
    if (!Array.isArray(value.ordering) || value.ordering.length === 0) {
      problems.push(`'${path}.ordering' is ${JSON.stringify(value.ordering)}, not a non-empty array`);
      return undefined;
    }
    const keys: OrderingKey[] = [];
    for (const [i, entry] of value.ordering.entries()) {
      const read = readOrderingKey(`${path}.ordering[${i}]`, entry, problems);
      if (read === undefined) return undefined;
      keys.push(read);
    }
    ordering = keys;
  }
  let orderingMode: string | undefined;
  if (value.orderingMode !== undefined) {
    if (typeof value.orderingMode !== "string" || value.orderingMode === "") {
      problems.push(`'${path}.orderingMode' is ${JSON.stringify(value.orderingMode)}, not a string`);
      return undefined;
    }
    orderingMode = value.orderingMode;
  }
  if (ordering === undefined && orderingMode === undefined) {
    problems.push(`'${path}' declares neither 'ordering' nor 'orderingMode' — nothing to publish`);
    return undefined;
  }
  let name: string | undefined;
  if (value.name !== undefined) {
    if (typeof value.name !== "string" || value.name === "") {
      problems.push(`'${path}.name' is ${JSON.stringify(value.name)}, not a non-empty string`);
      return undefined;
    }
    name = value.name;
  }
  return { ordering, orderingMode, name };
}

function readOrdering(
  value: unknown,
  problems: string[],
): Record<string, Record<string, SectionOrdering>> {
  if (!isPlainObject(value)) {
    problems.push(
      `'${RESOLUTION_TABLE_KEY}.ordering' is ${shapeOf(value)}, not an object — every section's ` +
        "order stays unknown",
    );
    return {};
  }
  const out: Record<string, Record<string, SectionOrdering>> = {};
  for (const [viewId, sectionsValue] of Object.entries(value)) {
    const viewPath = `${RESOLUTION_TABLE_KEY}.ordering.${viewId}`;
    if (!isPlainObject(sectionsValue)) {
      problems.push(`'${viewPath}' is ${shapeOf(sectionsValue)}, not an object`);
      continue;
    }
    const sections: Record<string, SectionOrdering> = {};
    for (const [sectionId, raw] of Object.entries(sectionsValue)) {
      const read = readSectionOrdering(`${viewPath}.${sectionId}`, raw, problems);
      if (read !== undefined) sections[sectionId] = read;
    }
    if (Object.keys(sections).length > 0) out[viewId] = sections;
  }
  return out;
}

/**
 * One field's marker — TWO shapes, dispatched on `kind` the same way `readSectionOrdering`
 * dispatches on which of `ordering`/`orderingMode` a section carries. `kind: "enum"` reads
 * `values` (token -> value, `priority`'s `🔽`/`⏫`); the three trailing kinds read `token` (one
 * glyph, `due_date`'s `📅`) — see `OrderingFieldMarker`'s own header for why these are genuinely
 * different shapes rather than one shape with an optional field.
 */
function readOrderingFieldMarker(
  path: string,
  value: unknown,
  problems: string[],
): OrderingFieldMarker | undefined {
  if (!isPlainObject(value)) {
    problems.push(`'${path}' is ${shapeOf(value)}, not an object — this field's marker is unknown`);
    return undefined;
  }
  if (value.kind === "enum") {
    for (const key of Object.keys(value)) {
      if (!(ENUM_MARKER_KEYS as readonly string[]).includes(key)) {
        problems.push(`'${path}.${key}' is not a recognised key — the keys are ${ENUM_MARKER_KEYS.join(", ")}`);
      }
    }
    const { values } = value;
    if (!isPlainObject(values) || Object.keys(values).length === 0) {
      problems.push(`'${path}.values' is ${shapeOf(values)}, not a non-empty object of token -> value`);
      return undefined;
    }
    const read: Record<string, string> = {};
    for (const [token, spelled] of Object.entries(values)) {
      if (token === "" || typeof spelled !== "string" || spelled === "") {
        problems.push(`'${path}.values["${token}"]' is ${JSON.stringify(spelled)}, not a non-empty string`);
        return undefined;
      }
      read[token] = spelled;
    }
    return { kind: "enum", values: read };
  }
  for (const key of Object.keys(value)) {
    if (!(TRAILING_MARKER_KEYS as readonly string[]).includes(key)) {
      problems.push(`'${path}.${key}' is not a recognised key — the keys are ${TRAILING_MARKER_KEYS.join(", ")}`);
    }
  }
  const { token, kind } = value;
  if (typeof token !== "string" || token === "") {
    problems.push(`'${path}.token' is ${JSON.stringify(token)}, not a non-empty string`);
    return undefined;
  }
  if (!(TRAILING_ORDERING_FIELD_KINDS as readonly string[]).includes(kind as string)) {
    problems.push(
      `'${path}.kind' is ${JSON.stringify(kind)}, not one of ` +
        `${[...TRAILING_ORDERING_FIELD_KINDS, "enum"].join(", ")}`,
    );
    return undefined;
  }
  return { token, kind: kind as "date" | "int" | "float" };
}

function readOrderingFieldMarkers(
  value: unknown,
  problems: string[],
): Record<string, OrderingFieldMarker> {
  if (!isPlainObject(value)) {
    problems.push(
      `'${RESOLUTION_TABLE_KEY}.orderingFields' is ${shapeOf(value)}, not an object — every ` +
        "field's marker stays unknown",
    );
    return {};
  }
  const out: Record<string, OrderingFieldMarker> = {};
  for (const [field, raw] of Object.entries(value)) {
    const read = readOrderingFieldMarker(`${RESOLUTION_TABLE_KEY}.orderingFields.${field}`, raw, problems);
    if (read !== undefined) out[field] = read;
  }
  return out;
}

function readDayBoundary(value: unknown, problems: string[]): DayBoundary | undefined {
  if (!isPlainObject(value)) {
    problems.push(
      `'${RESOLUTION_TABLE_KEY}.dayBoundary' is ${shapeOf(value)}, not an object — the day ` +
        "boundary stays unknown",
    );
    return undefined;
  }
  for (const key of Object.keys(value)) {
    if (!(DAY_BOUNDARY_KEYS as readonly string[]).includes(key)) {
      problems.push(
        `'${RESOLUTION_TABLE_KEY}.dayBoundary.${key}' is not a recognised key — the keys are ` +
          `${DAY_BOUNDARY_KEYS.join(", ")}`,
      );
    }
  }
  const { timezone, dayStartHour, weekStartsOn } = value;
  let ok = true;
  if (typeof timezone !== "string" || timezone === "") {
    problems.push(`'${RESOLUTION_TABLE_KEY}.dayBoundary.timezone' is ${JSON.stringify(timezone)}`);
    ok = false;
  }
  if (typeof dayStartHour !== "number" || !Number.isInteger(dayStartHour) || dayStartHour < 0 || dayStartHour > 23) {
    problems.push(
      `'${RESOLUTION_TABLE_KEY}.dayBoundary.dayStartHour' is ${JSON.stringify(dayStartHour)}, ` +
        "not an integer 0..23",
    );
    ok = false;
  }
  if (typeof weekStartsOn !== "string" || weekStartsOn === "") {
    problems.push(
      `'${RESOLUTION_TABLE_KEY}.dayBoundary.weekStartsOn' is ${JSON.stringify(weekStartsOn)}`,
    );
    ok = false;
  }
  if (!ok) return undefined;
  return {
    timezone: timezone as string,
    dayStartHour: dayStartHour as number,
    weekStartsOn: weekStartsOn as string,
  };
}

/**
 * `resolution.spelling` — the render-direction vocabulary. Malformed at the TOP yields `undefined`
 * for the whole fact (the `readComposition`/`readTagOrder` posture, and for the same reason: a
 * composer holding half a spelling table prints a line that is wrong in a way nothing flags).
 * Malformed at one ENTRY drops that entry and keeps the rest, the `readChromeShapes` posture — one
 * unreadable glyph is not a reason to stop knowing every other one.
 */
function readSpelling(value: unknown, problems: string[]): RenderedSpelling | undefined {
  const path = `${RESOLUTION_TABLE_KEY}.spelling`;
  if (!isPlainObject(value)) {
    problems.push(`'${path}' is ${shapeOf(value)}, not an object — how a node is spelled stays unknown`);
    return undefined;
  }
  const readStringMap = (raw: unknown, where: string): Record<string, string> | undefined => {
    if (!isPlainObject(raw)) {
      problems.push(`'${where}' is ${shapeOf(raw)}, not an object — every spelling in it stays unknown`);
      return undefined;
    }
    const out: Record<string, string> = {};
    for (const [key, token] of Object.entries(raw)) {
      if (typeof token !== "string" || token === "") {
        problems.push(`'${where}.${key}' is ${JSON.stringify(token)}, not a non-empty string — that one spelling stays unknown`);
        continue;
      }
      out[key] = token;
    }
    return out;
  };

  const typeTokens = readStringMap(value.typeTokens, `${path}.typeTokens`);
  if (typeTokens === undefined) return undefined;

  const readNested = (
    raw: unknown,
    where: string,
  ): Record<string, Record<string, string>> | undefined => {
    if (!isPlainObject(raw)) {
      problems.push(`'${where}' is ${shapeOf(raw)}, not an object — every spelling in it stays unknown`);
      return undefined;
    }
    const out: Record<string, Record<string, string>> = {};
    for (const [field, table] of Object.entries(raw)) {
      const read = readStringMap(table, `${where}.${field}`);
      if (read !== undefined) out[field] = read;
    }
    return out;
  };

  const fieldTags = readNested(value.fieldTags, `${path}.fieldTags`);
  if (fieldTags === undefined) return undefined;
  const fieldMarkerValues = readNested(value.fieldMarkerValues, `${path}.fieldMarkerValues`);
  if (fieldMarkerValues === undefined) return undefined;

  if (!isPlainObject(value.fieldMarkers)) {
    problems.push(`'${path}.fieldMarkers' is ${shapeOf(value.fieldMarkers)}, not an object — every trailing marker stays unknown`);
    return undefined;
  }
  const fieldMarkers: Record<string, RenderedFieldMarker> = {};
  for (const [field, marker] of Object.entries(value.fieldMarkers)) {
    if (!isPlainObject(marker)) {
      problems.push(`'${path}.fieldMarkers.${field}' is ${shapeOf(marker)}, not an object — this marker stays unknown`);
      continue;
    }
    const { kind, token, renderOnly } = marker;
    if (kind !== "date" && kind !== "int" && kind !== "float") {
      problems.push(`'${path}.fieldMarkers.${field}.kind' is ${JSON.stringify(kind)}, not date, int or float — this marker stays unknown`);
      continue;
    }
    if (typeof token !== "string" || token === "") {
      problems.push(`'${path}.fieldMarkers.${field}.token' is ${JSON.stringify(token)}, not a non-empty string — this marker stays unknown`);
      continue;
    }
    // ABSENT IS THE COMMON CASE and means "the engine reads this back". Only `true` is admitted, so
    // a `false` on the wire is a declaration this reader does not recognise rather than a synonym
    // for absence — the generator never writes one.
    if (renderOnly !== undefined && renderOnly !== true) {
      problems.push(`'${path}.fieldMarkers.${field}.renderOnly' is ${JSON.stringify(renderOnly)}, not true or absent — this marker stays unknown`);
      continue;
    }
    fieldMarkers[field] = renderOnly === true ? { kind, token, renderOnly: true } : { kind, token };
  }

  return { typeTokens, fieldTags, fieldMarkerValues, fieldMarkers };
}

/**
 * `resolution.renderCheckbox` — see `RenderCheckbox`'s own header. Malformed yields `undefined` for
 * the WHOLE fact, never a partial row list: a composer holding half a decision table would draw the
 * right glyph for some statuses and an invented one for the rest, which is the failure this key
 * exists to end. A missing `fallback` is fatal for the same reason — it is the answer for a
 * status-less node, not a default a reader may supply.
 */
function readRenderCheckbox(value: unknown, problems: string[]): RenderCheckbox | undefined {
  const path = `${RESOLUTION_TABLE_KEY}.renderCheckbox`;
  if (!isPlainObject(value)) {
    problems.push(`'${path}' is ${shapeOf(value)}, not an object — the checkbox glyph stays unknown`);
    return undefined;
  }
  if (typeof value.fallback !== "string" || value.fallback === "") {
    problems.push(
      `'${path}.fallback' is ${JSON.stringify(value.fallback)}, not a non-empty string — a ` +
        "status-less node's glyph is decided by this and there is no default to assume",
    );
    return undefined;
  }
  if (!Array.isArray(value.rows)) {
    problems.push(`'${path}.rows' is ${shapeOf(value.rows)}, not an array — the checkbox glyph stays unknown`);
    return undefined;
  }
  const rows: RenderCheckboxRow[] = [];
  for (const [index, row] of value.rows.entries()) {
    // ONE MALFORMED ROW POISONS THE WHOLE TABLE, unlike `chromeShapes`' per-entry tolerance. Order
    // is meaning here: dropping row 2 and keeping rows 3-6 silently promotes every later row, so a
    // node that should match the dropped one takes the next row's glyph instead of the fallback.
    // Skipping is not a smaller failure than refusing; it is a wrong answer instead of no answer.
    if (
      !isPlainObject(row) ||
      !isPlainObject(row.when) ||
      typeof row.when.field !== "string" ||
      typeof row.when.equals !== "string" ||
      typeof row.then !== "string" ||
      row.then === ""
    ) {
      problems.push(
        `'${path}.rows[${index}]' is not {when: {field, equals}, then} — the whole checkbox ` +
          "decision stays unknown, because dropping one row of an ordered table changes what " +
          "every later row answers",
      );
      return undefined;
    }
    rows.push({ when: { field: row.when.field, equals: row.when.equals }, then: row.then });
  }
  return { rows, fallback: value.fallback };
}

/**
 * `resolution.identityModes` — see `IdentityMode`. Whole-fact `undefined` on a malformed map, and
 * ONE bad entry poisons it, unlike `chromeShapes`' per-entry tolerance. The asymmetry is the point:
 * a dropped `chromeShapes` entry makes a type undrawable and the caller notices, whereas a dropped
 * identity entry is indistinguishable from "this type is ordinary" — which silently stamps a node
 * the engine renders stampless.
 */
function readIdentityModes(value: unknown, problems: string[]): Readonly<Record<string, IdentityMode>> | undefined {
  const path = `${RESOLUTION_TABLE_KEY}.identityModes`;
  if (!isPlainObject(value)) {
    problems.push(`'${path}' is ${shapeOf(value)}, not an object — how any node is identified stays unknown`);
    return undefined;
  }
  const out: Record<string, IdentityMode> = {};
  for (const [nodeType, mode] of Object.entries(value)) {
    if (!isPlainObject(mode) || typeof mode.unique !== "boolean") {
      problems.push(
        `'${path}.${nodeType}' is not {unique: boolean, field: string|null} — the whole identity ` +
          "map stays unknown, because a missing entry reads as 'ordinary type' and would stamp a " +
          "node the engine renders stampless",
      );
      return undefined;
    }
    if (mode.field !== null && (typeof mode.field !== "string" || mode.field === "")) {
      problems.push(`'${path}.${nodeType}.field' is ${JSON.stringify(mode.field)}, not a non-empty string or null`);
      return undefined;
    }
    // `unique: true` WITH `field: null` IS LEGAL, AND IT IS NOT THE SAME AS `unique: false`.
    //
    // Refusing it was this reader's first instinct and it was WRONG — caught by the committed
    // fixture config, whose `header` declares `identity: {unique: true}` and no `field:` at all.
    // The engine accepts that and the two halves are read by DIFFERENT callers:
    //   `decide_stamp` (renderer.py) consults ONLY `unique`, so the line renders STAMPLESS.
    //   `applier.py`'s by-title survival guard needs BOTH — `if not unique or not id_field: return
    //   False` — so it does not fire, and nothing re-identifies the node once the stamp is gone.
    // So this combination means "stampless, and no name carries its identity either". Publishing
    // it faithfully is the point; a reader that refused it would refuse a config the engine runs.
    out[nodeType] = { unique: mode.unique, field: mode.field };
  }
  return out;
}

/** `resolution.renderCheckboxSource` — one legal value, checked rather than assumed. */
function readRenderCheckboxSource(value: unknown, problems: string[]): "engine-literal" | undefined {
  if (value !== "engine-literal") {
    problems.push(
      `'${RESOLUTION_TABLE_KEY}.renderCheckboxSource' is ${JSON.stringify(value)}, not ` +
        '"engine-literal" — the checkbox contract is engine source with no operator override ' +
        "surface, so any other answer means this declaration was produced by something else",
    );
    return undefined;
  }
  return "engine-literal";
}

function readChromeShapes(value: unknown, problems: string[]): Record<string, ChromeShape> {
  if (!isPlainObject(value)) {
    problems.push(
      `'${RESOLUTION_TABLE_KEY}.chromeShapes' is ${shapeOf(value)}, not an object — every node ` +
        "type's chrome shape stays unknown",
    );
    return {};
  }
  const out: Record<string, ChromeShape> = {};
  for (const [nodeType, shape] of Object.entries(value)) {
    if (!(CHROME_SHAPES as readonly string[]).includes(shape as string)) {
      problems.push(
        `'${RESOLUTION_TABLE_KEY}.chromeShapes.${nodeType}' is ${JSON.stringify(shape)}, not one ` +
          `of ${CHROME_SHAPES.join(", ")} — this node type's chrome shape stays unknown`,
      );
      continue;
    }
    out[nodeType] = shape as ChromeShape;
  }
  return out;
}

/**
 * `resolution.defaultOrdering` — a bare LIST of ordering keys (not `view -> section ->` keyed:
 * this is the SAME tuple for every section that has no declaration of its own, so there is
 * nothing to key it by). Reuses `readOrderingKey` — the shape of one entry is identical to one
 * entry of a declared section's own `ordering:` list.
 */
function readDefaultOrdering(value: unknown, problems: string[]): readonly OrderingKey[] {
  const path = `${RESOLUTION_TABLE_KEY}.defaultOrdering`;
  if (!Array.isArray(value) || value.length === 0) {
    problems.push(`'${path}' is ${shapeOf(value)}, not a non-empty array — the engine default stays unknown`);
    return [];
  }
  const keys: OrderingKey[] = [];
  for (const [i, entry] of value.entries()) {
    const read = readOrderingKey(`${path}[${i}]`, entry, problems);
    if (read === undefined) return [];
    keys.push(read);
  }
  return keys;
}

/**
 * `resolution.defaultOrderingSource` — `"config"` or `"engine-fallback"`, or `undefined` if the
 * document declares neither (an older declaration, published before this key existed) or something
 * else entirely (reported, never guessed).
 */
function readDefaultOrderingSource(
  value: unknown,
  problems: string[],
): "config" | "engine-fallback" | undefined {
  if (!(DEFAULT_ORDERING_SOURCES as readonly string[]).includes(value as string)) {
    problems.push(
      `'${RESOLUTION_TABLE_KEY}.defaultOrderingSource' is ${JSON.stringify(value)}, not one of ` +
        `${DEFAULT_ORDERING_SOURCES.join(", ")} — which answer defaultOrdering/priorityRank are stays unknown`,
    );
    return undefined;
  }
  return value as "config" | "engine-fallback";
}

/** `resolution.priorityRank` — field VALUE (`"urgent"`) -> its numeric rank. Every value here is
 * a positive integer; the ENGINE decides the numbers, this reader only checks the shape. */
function readPriorityRank(value: unknown, problems: string[]): Record<string, number> {
  const path = `${RESOLUTION_TABLE_KEY}.priorityRank`;
  if (!isPlainObject(value) || Object.keys(value).length === 0) {
    problems.push(`'${path}' is ${shapeOf(value)}, not a non-empty object — the priority rank stays unknown`);
    return {};
  }
  const out: Record<string, number> = {};
  for (const [name, rank] of Object.entries(value)) {
    if (typeof rank !== "number" || !Number.isInteger(rank) || rank < 1) {
      problems.push(`'${path}.${name}' is ${JSON.stringify(rank)}, not a positive integer`);
      return {};
    }
    out[name] = rank;
  }
  return out;
}

/** One cell-class order (a `heads.<shape>` entry, or `tail`) — a non-empty array drawn ONLY from
 * `COMPOSITION_CELL_CLASSES`, reported and dropped otherwise. */
function readCellClassOrder(
  path: string,
  value: unknown,
  problems: string[],
): readonly CompositionCellClass[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    problems.push(`'${path}' is ${shapeOf(value)}, not a non-empty array — this order stays unknown`);
    return undefined;
  }
  const out: CompositionCellClass[] = [];
  for (const [i, entry] of value.entries()) {
    if (!(COMPOSITION_CELL_CLASSES as readonly string[]).includes(entry as string)) {
      problems.push(
        `'${path}[${i}]' is ${JSON.stringify(entry)}, not one of ${COMPOSITION_CELL_CLASSES.join(", ")}`,
      );
      return undefined;
    }
    out.push(entry as CompositionCellClass);
  }
  return out;
}

/**
 * `resolution.composition` — see the `Composition` type's own header. A malformed shape yields
 * `undefined` for the WHOLE fact (unlike `chromeShapes`/`ordering`'s per-entry tolerance): a
 * composer fed a half-declared order — a `tail` but no `heads.checkbox` — would silently compose a
 * line missing its own bullet or title, which is a worse failure than declining to compose at all.
 */
function readComposition(value: unknown, problems: string[]): Composition | undefined {
  const path = `${RESOLUTION_TABLE_KEY}.composition`;
  if (!isPlainObject(value)) {
    problems.push(`'${path}' is ${shapeOf(value)}, not an object — composition stays unknown`);
    return undefined;
  }
  for (const key of Object.keys(value)) {
    if (!(COMPOSITION_KEYS as readonly string[]).includes(key)) {
      problems.push(`'${path}.${key}' is not a recognised key — the keys are ${COMPOSITION_KEYS.join(", ")}`);
    }
  }
  const { heads, tail, separator, bullet, titleStyles } = value;
  if (!isPlainObject(heads)) {
    problems.push(`'${path}.heads' is ${shapeOf(heads)}, not an object`);
    return undefined;
  }
  const readHeads: Partial<Record<ChromeShape, readonly CompositionCellClass[]>> = {};
  for (const shape of CHROME_SHAPES) {
    if (!(shape in heads)) {
      problems.push(`'${path}.heads.${shape}' is missing — every seedable shape needs a declared head`);
      return undefined;
    }
    const read = readCellClassOrder(`${path}.heads.${shape}`, (heads as Record<string, unknown>)[shape], problems);
    if (read === undefined) return undefined;
    readHeads[shape] = read;
  }
  for (const key of Object.keys(heads)) {
    if (!(CHROME_SHAPES as readonly string[]).includes(key)) {
      problems.push(`'${path}.heads.${key}' is not a recognised shape — the shapes are ${CHROME_SHAPES.join(", ")}`);
    }
  }
  const readTail = readCellClassOrder(`${path}.tail`, tail, problems);
  if (readTail === undefined) return undefined;
  if (typeof separator !== "string" || separator === "") {
    problems.push(`'${path}.separator' is ${JSON.stringify(separator)}, not a non-empty string`);
    return undefined;
  }
  if (!(COMPOSITION_BULLET_CHARS as readonly string[]).includes(bullet as string)) {
    problems.push(
      `'${path}.bullet' is ${JSON.stringify(bullet)}, not one of ${COMPOSITION_BULLET_CHARS.join(", ")}`,
    );
    return undefined;
  }
  if (!Array.isArray(titleStyles) || !titleStyles.every((s) => typeof s === "string")) {
    problems.push(`'${path}.titleStyles' is ${shapeOf(titleStyles)}, not an array of strings`);
    return undefined;
  }
  for (const [i, style] of titleStyles.entries()) {
    if (!(COMPOSITION_TITLE_STYLES as readonly string[]).includes(style as string)) {
      problems.push(
        `'${path}.titleStyles[${i}]' is ${JSON.stringify(style)}, not one of ${COMPOSITION_TITLE_STYLES.join(", ")}`,
      );
      return undefined;
    }
  }
  return {
    heads: readHeads as Readonly<Record<ChromeShape, readonly CompositionCellClass[]>>,
    tail: readTail,
    separator,
    bullet: bullet as string,
    titleStyles: titleStyles as readonly string[],
  };
}

/**
 * `resolution.compositionSource` — `"config"` or `"engine-fallback"`, or `undefined` if the
 * document declares neither (an older declaration, published before this key existed) or something
 * else entirely (reported, never guessed). Mirrors `readDefaultOrderingSource` exactly.
 */
/**
 * Shared by `compositionSource` and `compositionFormSource` — same two legal values, same meaning,
 * over different halves of one block. `key` is a parameter rather than a constant BECAUSE it is
 * shared: a problem naming `compositionSource` when `compositionFormSource` was the malformed one
 * sends the operator to a key that is perfectly fine.
 */
function readCompositionSource(
  value: unknown,
  problems: string[],
  key: "compositionSource" | "compositionFormSource",
): "config" | "engine-fallback" | undefined {
  if (!(COMPOSITION_SOURCES as readonly string[]).includes(value as string)) {
    problems.push(
      `'${RESOLUTION_TABLE_KEY}.${key}' is ${JSON.stringify(value)}, not one of ` +
        `${COMPOSITION_SOURCES.join(", ")} — which answer composition is stays unknown`,
    );
    return undefined;
  }
  return value as "config" | "engine-fallback";
}

/** `resolution.tagOrder` — see the `TagOrder` type's own header. Malformed yields `undefined` for
 * the WHOLE fact, the same posture `readComposition` takes: a half-declared order (a
 * `canonicalOrder` but no `unrankedPolicy`) is a worse failure to hand a caller silently than
 * declining to publish an order at all. */
function readTagOrder(value: unknown, problems: string[]): TagOrder | undefined {
  const path = `${RESOLUTION_TABLE_KEY}.tagOrder`;
  if (!isPlainObject(value)) {
    problems.push(`'${path}' is ${shapeOf(value)}, not an object — tag order stays unknown`);
    return undefined;
  }
  for (const key of Object.keys(value)) {
    if (!(TAG_ORDER_KEYS as readonly string[]).includes(key)) {
      problems.push(`'${path}.${key}' is not a recognised key — the keys are ${TAG_ORDER_KEYS.join(", ")}`);
    }
  }
  const { canonicalOrder, unrankedPolicy } = value;
  if (!Array.isArray(canonicalOrder) || canonicalOrder.length === 0 || !canonicalOrder.every((t) => typeof t === "string")) {
    problems.push(`'${path}.canonicalOrder' is ${shapeOf(canonicalOrder)}, not a non-empty array of strings`);
    return undefined;
  }
  if (!(TAG_ORDER_UNRANKED_POLICIES as readonly string[]).includes(unrankedPolicy as string)) {
    problems.push(
      `'${path}.unrankedPolicy' is ${JSON.stringify(unrankedPolicy)}, not one of ` +
        `${TAG_ORDER_UNRANKED_POLICIES.join(", ")}`,
    );
    return undefined;
  }
  return {
    canonicalOrder: canonicalOrder as readonly string[],
    unrankedPolicy: unrankedPolicy as TagOrder["unrankedPolicy"],
  };
}

/** `resolution.tagOrderSource` — see `TagOrder`'s own header for why `"engine-literal"` is the
 * only real value. Mirrors `readCompositionSource` exactly, one member narrower. */
function readTagOrderSource(value: unknown, problems: string[]): "engine-literal" | undefined {
  if (!(TAG_ORDER_SOURCES as readonly string[]).includes(value as string)) {
    problems.push(
      `'${RESOLUTION_TABLE_KEY}.tagOrderSource' is ${JSON.stringify(value)}, not one of ` +
        `${TAG_ORDER_SOURCES.join(", ")} — which answer tagOrder is stays unknown`,
    );
    return undefined;
  }
  return value as "engine-literal";
}

/**
 * Read the `resolution` key of a served presentation declaration.
 *
 * Same posture every reader in this directory takes, FOR EVERY FIELD BUT ONE: no key at all is
 * silence, not a problem; a key of the wrong shape is reported and the sub-fact that could not be
 * read falls back to "unknown" rather than aborting the whole read, so one bad section does not
 * blind the app to the rest of the table.
 *
 * ── THE ONE EXCEPTION, AND WHY THE REFUSAL LIVES HERE ──
 *
 * A table WITHOUT A VALID DAY BOUNDARY IS NOT ADOPTED AT ALL. This function returns
 * `resolution: undefined`, and every consumer's existing `resolution === undefined` gate takes it
 * from there. See `ConfigResolutionTable.dayBoundary`'s own comment for the defect class this
 * closes; what belongs here is why the DECLARATION BOUNDARY is the right place for it.
 *
 * The alternative was a guard at the use site (`resolvers/rules.ts`). It was rejected for a
 * reason that is about the next change rather than this one: the next resolver to read the
 * boundary would have to remember the same guard, and "remember" is exactly what failed the first
 * time. A refusal here is checked once, by the compiler, for every reader that will ever exist.
 *
 * ── WHAT THIS COSTS, STATED RATHER THAN GLOSSED ──
 *
 * It is a WIDER refusal than the boundary alone. A document whose `ordering`/`chromeShapes`/
 * `sectionRegistration` are perfectly good but whose `dayBoundary` is missing or malformed now
 * yields NO resolution table, so the ordering preview, the parent-promotion axis and the page's
 * `globalRegistrationFor` new-line seeding all go quiet too — where today they would still work.
 *
 * That trade is deliberate. What they lose is a PREVIEW; what the old shape lost was the
 * OPERATOR'S CAPTURE — no POST, no line, no message. A quiet preview is a state this app already
 * has a name and a behaviour for (it is the state before `presentation.json` arrives); a
 * vanished keystroke is the one failure this codebase treats as unacceptable. The refusal is also
 * LOUD: an absent boundary under a present `resolution` key is reported as a problem, so
 * `applyPresentation` prints it and the operator can see why the previews stopped.
 *
 * NOT A HARD FAILURE AT BOOT. Nothing here throws, and nothing downstream does either — the app
 * boots, paints, moves the cursor and WRITES with `resolution: undefined`, which is precisely the
 * "a missing or broken presentation.json costs nothing but a warning" posture the page's own
 * `loadPresentation` header states. This function widens what falls into that posture; it does
 * not turn any part of it into a crash.
 */
export function readConfigResolutionDeclaration(document: unknown): ConfigResolutionReading {
  if (!isPlainObject(document)) {
    return { resolution: undefined, problems: [] }; // declaration.ts's own guard already reports this
  }
  if (!(RESOLUTION_TABLE_KEY in document)) {
    return { resolution: undefined, problems: [] };
  }
  const raw = document[RESOLUTION_TABLE_KEY];
  const problems: string[] = [];
  if (!isPlainObject(raw)) {
    problems.push(
      `'${RESOLUTION_TABLE_KEY}' is ${shapeOf(raw)}, not an object — the whole resolution table ` +
        "stays unknown",
    );
    return { resolution: undefined, problems };
  }
  for (const key of Object.keys(raw)) {
    if (!(TOP_KEYS as readonly string[]).includes(key)) {
      problems.push(
        `'${RESOLUTION_TABLE_KEY}.${key}' is not a recognised key and was NOT applied — the keys ` +
          `are ${TOP_KEYS.join(", ")}`,
      );
    }
  }
  // READ FIRST, THEN DECIDE WHETHER TO ADOPT. `readDayBoundary` reports its own malformed-shape
  // problems into `problems` either way, so a broken boundary is described in the operator's
  // console with the same detail it always was — the difference is only that the table it would
  // have ridden on is no longer handed out.
  const dayBoundary = "dayBoundary" in raw ? readDayBoundary(raw.dayBoundary, problems) : undefined;
  if (dayBoundary === undefined) {
    if (!("dayBoundary" in raw)) {
      // An ABSENT boundary published no problem of its own until now — absence carried the
      // meaning, and absence looks exactly like nothing-to-say. It is not: it is the whole table
      // declining to load, and the operator must be able to read why.
      problems.push(
        `'${RESOLUTION_TABLE_KEY}' declares no 'dayBoundary' — the whole resolution table is NOT ` +
          "applied, because a table without a day boundary is a table this app cannot resolve a " +
          "date against. Ordering, promotion and new-line seeding stay silent until one is declared.",
      );
    }
    return { resolution: undefined, problems };
  }
  return {
    resolution: {
      registration: "registration" in raw ? readRegistration(raw.registration, problems) : undefined,
      lineGrammars: "lineGrammars" in raw ? readLineGrammars(raw.lineGrammars, problems) : {},
      ordering: "ordering" in raw ? readOrdering(raw.ordering, problems) : {},
      orderingFields:
        "orderingFields" in raw ? readOrderingFieldMarkers(raw.orderingFields, problems) : {},
      dayBoundary,
      chromeShapes: "chromeShapes" in raw ? readChromeShapes(raw.chromeShapes, problems) : {},
      sectionRegistration:
        "sectionRegistration" in raw ? readSectionRegistration(raw.sectionRegistration, problems) : {},
      defaultOrdering: "defaultOrdering" in raw ? readDefaultOrdering(raw.defaultOrdering, problems) : [],
      defaultOrderingSource:
        "defaultOrderingSource" in raw ? readDefaultOrderingSource(raw.defaultOrderingSource, problems) : undefined,
      priorityRank: "priorityRank" in raw ? readPriorityRank(raw.priorityRank, problems) : {},
      composition: "composition" in raw ? readComposition(raw.composition, problems) : undefined,
      compositionSource:
        "compositionSource" in raw
          ? readCompositionSource(raw.compositionSource, problems, "compositionSource")
          : undefined,
      // REUSES `readCompositionSource` — the two flags have the same two legal values and the same
      // meaning, over different halves of one block. A second reader would be the same rule
      // written twice, which is the shape that lets them drift apart.
      compositionFormSource:
        "compositionFormSource" in raw
          ? readCompositionSource(raw.compositionFormSource, problems, "compositionFormSource")
          : undefined,
      spelling: "spelling" in raw ? readSpelling(raw.spelling, problems) : undefined,
      renderCheckbox: "renderCheckbox" in raw ? readRenderCheckbox(raw.renderCheckbox, problems) : undefined,
      // `"engine-literal"` is the ONLY legal value — unlike composition's two-state config /
      // engine-fallback, this contract lives in the engine's own source and has no operator
      // override surface, so there is no second answer for a reader to distinguish. Published
      // anyway, and validated, so the KIND of fact is stated rather than assumed.
      renderCheckboxSource:
        "renderCheckboxSource" in raw ? readRenderCheckboxSource(raw.renderCheckboxSource, problems) : undefined,
      identityModes: "identityModes" in raw ? readIdentityModes(raw.identityModes, problems) : undefined,
      tagOrder: "tagOrder" in raw ? readTagOrder(raw.tagOrder, problems) : undefined,
      tagOrderSource: "tagOrderSource" in raw ? readTagOrderSource(raw.tagOrderSource, problems) : undefined,
      dropped: "dropped" in raw ? readDropped(raw.dropped, problems) : {},
    },
    problems,
  };
}
