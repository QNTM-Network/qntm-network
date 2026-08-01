/**
 * resolutiontable — reading the CONFIG-ONLY RESOLUTION TABLE: the facts a browser needs to
 * preview registration, ordering and the day boundary, decidable from config alone, with no
 * graph read and no clock. PURE: no DOM, no fetch, no clock.
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
 * ── THREE READERS NOW, ONE STILL WITHOUT A WIRED CALL SITE, STATED RATHER THAN HIDDEN ──
 *
 * `app/present/newline.ts`'s GLOBAL rung reads `qualification.sections[view][section].nodeType`
 * (the per-section MINTING default, already published) joined against `chromeShapes` above (design
 * step 6). `app/present/ordering.ts` reads `ordering` and `orderingFields` above (design step 7) to
 * preview a row's position within its section. **Step 7's dependency, measured rather than
 * assumed: NONE of the 9 declared orderings compares a field against the clock** — all seven
 * field-keyed sections sort on an absolute value (`due_date`, `available_date`, `queue_position`),
 * never a `$cycle_today`-relative one, and the two `insertion_order` sections have no field to
 * compare at all. So step 7 does not, in fact, need step 8 — see `ordering.ts`'s own header for
 * the full measurement. `app/present/today.ts` (design step 8) now READS `dayBoundary` and
 * resolves it exactly the way the engine does — proven against the engine's own
 * `resolve_logical_day`/`resolve_week_end`, `tests/present-today.test.mjs` — but **no call site
 * under `app/index.html` invokes it**: step 8's own measurement found ordering does not need it
 * (above) and membership's 8 clock-bound qualifications need MORE than it (the predicate grammar
 * itself has no orderable-comparison or `$variable` vocabulary today, a separate widening filed as
 * `widen-qualification-language-for-clock-bound-predicates`, backlog.yaml). See capability
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

/** How an ordering field's value is spelled on a printed line — `markers.yaml`'s own shape. */
export type OrderingFieldKind = "date" | "int" | "float";

/** One field's trailing-token marker: the glyph, and the shape its value must have. */
export interface OrderingFieldMarker {
  readonly token: string;
  readonly kind: OrderingFieldKind;
}

/** `day_boundary.yaml`'s 3 keys, verbatim. */
export interface DayBoundary {
  readonly timezone: string;
  readonly dayStartHour: number;
  readonly weekStartsOn: string;
}

/** The render-form family a resolved node type carries — the two shapes `newline.ts` can seed. */
export type ChromeShape = "checkbox" | "plain_line";

/** The whole published table. A lookup, not a resolver. */
export interface ConfigResolutionTable {
  readonly registration: RegistrationTable | undefined;
  /** grammar name -> the shape names it admits. */
  readonly lineGrammars: Readonly<Record<string, readonly string[]>>;
  readonly ordering: Readonly<Record<string, Readonly<Record<string, SectionOrdering>>>>;
  /** ordering field name -> its trailing-token marker. A field named by `ordering` above but
   * absent here has no known marker (a fixed-`value:` marker, a `render_only` one, or none at
   * all) — see this module's header for why that is a refusal, never a guess. */
  readonly orderingFields: Readonly<Record<string, OrderingFieldMarker>>;
  readonly dayBoundary: DayBoundary | undefined;
  /** node type -> its render-form family, for every `default_node_type` candidate this config
   * declares and every shape `newline.ts` knows how to seed. A type absent here is a type whose
   * chrome this app does not know how to produce — see this module's header. */
  readonly chromeShapes: Readonly<Record<string, ChromeShape>>;
  /**
   * EVERY DECLARATION THE GENERATOR READ AND DID NOT PUBLISH, `what -> why`. The two comments
   * above ("a field absent here has no known marker", "a type absent here is one whose chrome this
   * app does not know how to produce") described a refusal the operator had no way to see: absence
   * carried the meaning, and absence looks exactly like nothing-to-say. `dropped` gives each
   * absence its reason. Not read to decide anything. See `scripts/ledger.mjs`.
   */
  readonly dropped: Readonly<Record<string, string>>;
}

/** Mirrors `StructuralReading` / `QualificationReading`: the value, plus what was wrong with it. */
export interface ConfigResolutionReading {
  readonly resolution: ConfigResolutionTable;
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
  "dropped",
] as const;
const REGISTRATION_KEYS = ["defaultNodeType", "baseNodeType", "inputGrammar", "defaultTags"] as const;
const ORDERING_KEY_KEYS = ["field", "direction"] as const;
const SECTION_ORDERING_KEYS = ["ordering", "orderingMode", "name"] as const;
const ORDERING_FIELD_MARKER_KEYS = ["token", "kind"] as const;
const ORDERING_FIELD_KINDS = ["date", "int", "float"] as const;
const DAY_BOUNDARY_KEYS = ["timezone", "dayStartHour", "weekStartsOn"] as const;
const DIRECTIONS = ["asc", "desc"] as const;
const CHROME_SHAPES = ["checkbox", "plain_line"] as const;

const EMPTY: ConfigResolutionTable = {
  registration: undefined,
  lineGrammars: {},
  ordering: {},
  orderingFields: {},
  dayBoundary: undefined,
  chromeShapes: {},
  dropped: {},
};

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

function readOrderingFieldMarker(
  path: string,
  value: unknown,
  problems: string[],
): OrderingFieldMarker | undefined {
  if (!isPlainObject(value)) {
    problems.push(`'${path}' is ${shapeOf(value)}, not an object — this field's marker is unknown`);
    return undefined;
  }
  for (const key of Object.keys(value)) {
    if (!(ORDERING_FIELD_MARKER_KEYS as readonly string[]).includes(key)) {
      problems.push(
        `'${path}.${key}' is not a recognised key — the keys are ` +
          `${ORDERING_FIELD_MARKER_KEYS.join(", ")}`,
      );
    }
  }
  const { token, kind } = value;
  if (typeof token !== "string" || token === "") {
    problems.push(`'${path}.token' is ${JSON.stringify(token)}, not a non-empty string`);
    return undefined;
  }
  if (!(ORDERING_FIELD_KINDS as readonly string[]).includes(kind as string)) {
    problems.push(
      `'${path}.kind' is ${JSON.stringify(kind)}, not one of ${ORDERING_FIELD_KINDS.join(", ")}`,
    );
    return undefined;
  }
  return { token, kind: kind as OrderingFieldKind };
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
 * Read the `resolution` key of a served presentation declaration.
 *
 * Same posture every reader in this directory takes: no key at all is silence, not a problem; a
 * key of the wrong shape is reported and the sub-fact that could not be read falls back to
 * "unknown" rather than aborting the whole read, so one bad section does not blind the app to the
 * rest of the table.
 */
export function readConfigResolutionDeclaration(document: unknown): ConfigResolutionReading {
  if (!isPlainObject(document)) {
    return { resolution: EMPTY, problems: [] }; // declaration.ts's own guard already reports this
  }
  if (!(RESOLUTION_TABLE_KEY in document)) {
    return { resolution: EMPTY, problems: [] };
  }
  const raw = document[RESOLUTION_TABLE_KEY];
  const problems: string[] = [];
  if (!isPlainObject(raw)) {
    problems.push(
      `'${RESOLUTION_TABLE_KEY}' is ${shapeOf(raw)}, not an object — the whole resolution table ` +
        "stays unknown",
    );
    return { resolution: EMPTY, problems };
  }
  for (const key of Object.keys(raw)) {
    if (!(TOP_KEYS as readonly string[]).includes(key)) {
      problems.push(
        `'${RESOLUTION_TABLE_KEY}.${key}' is not a recognised key and was NOT applied — the keys ` +
          `are ${TOP_KEYS.join(", ")}`,
      );
    }
  }
  return {
    resolution: {
      registration: "registration" in raw ? readRegistration(raw.registration, problems) : undefined,
      lineGrammars: "lineGrammars" in raw ? readLineGrammars(raw.lineGrammars, problems) : {},
      ordering: "ordering" in raw ? readOrdering(raw.ordering, problems) : {},
      orderingFields:
        "orderingFields" in raw ? readOrderingFieldMarkers(raw.orderingFields, problems) : {},
      dayBoundary: "dayBoundary" in raw ? readDayBoundary(raw.dayBoundary, problems) : undefined,
      chromeShapes: "chromeShapes" in raw ? readChromeShapes(raw.chromeShapes, problems) : {},
      dropped: "dropped" in raw ? readDropped(raw.dropped, problems) : {},
    },
    problems,
  };
}
