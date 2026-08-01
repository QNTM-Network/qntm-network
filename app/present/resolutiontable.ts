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
 *   `ordering_mode:`, keyed `view -> section -> { ordering?, orderingMode? }`.
 *
 *   `resolution.dayBoundary` — the day boundary's 3 keys, verbatim.
 *
 * ── NO CONSUMER TODAY, STATED RATHER THAN HIDDEN ──
 *
 * `app/` computes no dates, previews no ordering, and gates no line on its grammar. This table is
 * published because the next three steps in the SAME sequence each name it as their one
 * dependency — step 6 (the new-line seed, needs 5), step 7 (ordering preview, needs 5 and 8) and
 * step 8 (the day boundary, needs 5) — the same posture step 1 took towards step 2. An unread
 * declaration is a bug when nothing is EVER going to read it; it is a precondition when the next
 * three items on the same plan each say they will.
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

/** What one section says about its own row order — one or both may be present. */
export interface SectionOrdering {
  readonly ordering: readonly OrderingKey[] | undefined;
  readonly orderingMode: string | undefined;
}

/** `day_boundary.yaml`'s 3 keys, verbatim. */
export interface DayBoundary {
  readonly timezone: string;
  readonly dayStartHour: number;
  readonly weekStartsOn: string;
}

/** The whole published table. A lookup, not a resolver. */
export interface ConfigResolutionTable {
  readonly registration: RegistrationTable | undefined;
  /** grammar name -> the shape names it admits. */
  readonly lineGrammars: Readonly<Record<string, readonly string[]>>;
  readonly ordering: Readonly<Record<string, Readonly<Record<string, SectionOrdering>>>>;
  readonly dayBoundary: DayBoundary | undefined;
}

/** Mirrors `StructuralReading` / `QualificationReading`: the value, plus what was wrong with it. */
export interface ConfigResolutionReading {
  readonly resolution: ConfigResolutionTable;
  readonly problems: readonly string[];
}

/** The top-level key this module owns. `declaration.ts` knows its name only to skip it. */
export const RESOLUTION_TABLE_KEY = "resolution";

const TOP_KEYS = ["registration", "lineGrammars", "ordering", "dayBoundary"] as const;
const REGISTRATION_KEYS = ["defaultNodeType", "baseNodeType", "inputGrammar", "defaultTags"] as const;
const ORDERING_KEY_KEYS = ["field", "direction"] as const;
const SECTION_ORDERING_KEYS = ["ordering", "orderingMode"] as const;
const DAY_BOUNDARY_KEYS = ["timezone", "dayStartHour", "weekStartsOn"] as const;
const DIRECTIONS = ["asc", "desc"] as const;

const EMPTY: ConfigResolutionTable = {
  registration: undefined,
  lineGrammars: {},
  ordering: {},
  dayBoundary: undefined,
};

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
  return { ordering, orderingMode };
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
      dayBoundary: "dayBoundary" in raw ? readDayBoundary(raw.dayBoundary, problems) : undefined,
    },
    problems,
  };
}
