/**
 * composeNodeLine — a graph node, rendered as the markdown line the engine would print.
 *
 *   `_render_node_line` (apps/qntm-md/src/qntm_md/render/renderer.py:932), from the browser.
 *
 * ── WHAT THIS IS FOR ──
 *
 * `computeViewMembers` decides WHAT belongs in a view and returns `GraphNode[]`. `app/index.html`
 * paints MARKDOWN. Nothing turned one into the other, so the members half — proven against the
 * engine over 4697 assertions — had no caller. This is the missing step, and it is the last thing
 * between here and the migration.
 *
 * PURE. No DOM, no fetch, no clock, no graph traversal. Everything it needs arrives in its two
 * arguments, so the whole function is `(node, context) -> string` and the agreement test can drive
 * it over the engine's own answers without standing anything up.
 *
 * ── IT DECIDES NOTHING. EVERY CELL IS A PUBLISHED FACT ──
 *
 *   shape          `chromeShapes[node.type]`          which head the line takes
 *   checkbox       `renderCheckbox`                   first-match-wins over the node's fields
 *   title          `composition.titleStyles` merged with `renderTitleStyle`'s per-node answer
 *   stamp          `identityModes[node.type].unique`  a unique-identity type renders stampless
 *   tags           `spelling.typeTokens` + `fieldTags`, ordered by `tagOrder`
 *   markers        `spelling.fieldMarkers` + `fieldMarkerValues`, ordered by `markerOrder`
 *   chrome         `spelling.edgeTags` over the node's outgoing edges, ordered by `edgeTagOrder`
 *   continuation   `continuationFields[node.type]`
 *
 * Eight publications, each landed with its own pin. This file joins them; it invents nothing, and
 * the one thing it is entitled to decide is when it CANNOT answer — see the refusals below.
 *
 * ── THE TITLE IS WRAPPED ONCE, AND THAT IS THE SUBTLE PART ──
 *
 * The engine merges TWO style answers — the global, unconditional `composition.form.title_styles`
 * and the per-node `render_title_style` — into one flat list before `_apply_title_style` wraps
 * ONCE. Its own comment says why: two independent wraps "could nest in an order
 * `canonicalise_title_segment`'s peel loop was not proven against".
 *
 * `composeLine` already wraps with `composition.titleStyles`. So the per-node answer is merged INTO
 * a composition handed to it, rather than pre-wrapped here and wrapped again there. One wrap, the
 * proven one.
 *
 * ── WHAT IT REFUSES, AND WHY REFUSING IS THE ONLY HONEST ANSWER ──
 *
 * A composer that is 90% right is worse than none: every disagreement with the engine reads as a
 * sync bug for weeks. So a cell this cannot compute is not guessed and not omitted — the whole line
 * is refused, with a reason, and the caller keeps the engine's markdown for that node.
 *
 *   `unknown-node-type`      `chromeShapes` has no shape — a type this config cannot draw
 *   `no-checkbox-table`      the shape needs a glyph and `renderCheckbox` did not load
 *   `no-identity-mode`       whether to stamp is unknown, and both answers are visibly wrong
 *   `no-spelling`            the tags and markers cells cannot be built
 *   `no-composition`         no cell order at all
 *
 * `render_title_style` ABSENT IS NOT A REFUSAL, deliberately, and it is the one asymmetry here: its
 * `fallback` is `[]`, so "no per-node wrap" is the answer for most nodes anyway, and a missing
 * table degrades to the global styles alone. Every other absence changes a cell that has no
 * harmless value.
 */

import type {
  ConfigResolutionTable,
  Composition,
  EdgeTag,
  RenderCheckbox,
  TagOrder,
} from "../resolutiontable.js";
import { composeLine } from "./composition.js";
import { orderTags } from "../rules.js";
import { nodeLocalContext, titleStyleFor } from "./titlestyle.js";

/** The node this needs — the graph's own shape, so a caller passes what `computeViewMembers` returned. */
export interface ComposableNode {
  readonly id: string;
  readonly type: string;
  readonly fields: Readonly<Record<string, unknown>>;
}

/**
 * ONE OUTGOING EDGE, already resolved to its target's TITLE.
 *
 * Resolved by the caller rather than looked up here, because this module traverses nothing: the
 * engine reads `graph.get_node(target).fields["title"]`, and a composer that took the whole graph
 * to do the same would be a second traversal beside `computeViewMembers`' own. The caller holds
 * both already.
 *
 * A TARGET THE CALLER COULD NOT RESOLVE IS OMITTED BY PASSING NO ENTRY, which mirrors the engine:
 * `_outgoing_edge_chrome_cells` skip-and-warns on a missing target or an empty title rather than
 * emitting a half cell.
 */
export interface OutgoingEdge {
  readonly type: string;
  readonly targetTitle: string;
}

export interface ComposeContext {
  readonly resolution: ConfigResolutionTable;
  /**
   * STATED, NOT ASSUMED. `decide_stamp` suppresses `[[qntm:N]]` on a read_only sheet. No view in
   * the operator's config declares `write_policy` and the engine's default is `"writable"`, so it
   * is published nowhere — and a composer hardcoding it would be right BY COINCIDENCE, the shape
   * refused for `spelling.fieldTokens.status`. It lives here, at the call site, where a second
   * value can actually be passed. See the backlog row for the revisit condition.
   */
  readonly writePolicy?: "writable" | "read_only";
  readonly outgoingEdges?: readonly OutgoingEdge[];
  /** Types only — `render_title_style`'s coming form counts them. See `nodeLocalContext`. */
  readonly incomingEdgeTypes?: readonly string[];
  /** `'    ' * depth`, the PART_OF nesting level. A tree fact, so the caller's. */
  readonly depth?: number;
}

export type ComposeRefusal =
  | "unknown-node-type"
  | "no-checkbox-table"
  | "no-identity-mode"
  | "no-spelling"
  | "no-composition";

export interface ComposedNodeLine {
  readonly text: string;
  /** `{indent+1}{bullet} {value} {token}`, one per declared continuation field that has a value. */
  readonly continuationLines: readonly string[];
}

export type ComposeResult =
  | { readonly ok: true; readonly line: ComposedNodeLine }
  | { readonly ok: false; readonly because: ComposeRefusal };

const QNTM_ID_LINK = /\s*\[\[qntm:[^\]]+\]\]\s*/g;

/**
 * `_clean_title` (renderer.py:1611), transcribed: strip any `[[qntm:N]]` link to a space, then
 * trim. NOT `canonicalise_title_segment`, which the engine also runs — see this module's own
 * agreement test, which asserts that function is the IDENTITY on every real graph title in the
 * fixture rather than assuming it. If that assertion ever fails, this line is where the missing
 * step goes, and the test says exactly which title needed it.
 */
function cleanTitle(value: unknown): string {
  return String(value ?? "").replace(QNTM_ID_LINK, " ").trim();
}

/** `render_checkbox`, first-match-wins over the node's own fields, `fallback` when none holds. */
function checkboxGlyph(table: RenderCheckbox, fields: Readonly<Record<string, unknown>>): string {
  for (const row of table.rows) {
    if (fields[row.when.field] === row.when.equals) return row.then;
  }
  return table.fallback;
}

/** The tags cell: the node's type tag, then every fixed-value field tag it carries, in `tagOrder`. */
function tagCells(node: ComposableNode, resolution: ConfigResolutionTable, order: TagOrder | undefined): readonly string[] {
  const spelling = resolution.spelling;
  if (spelling === undefined) return [];
  const tags: string[] = [];
  const typeToken = spelling.typeTokens[node.type];
  if (typeToken !== undefined) tags.push(typeToken);
  for (const [field, table] of Object.entries(spelling.fieldTags)) {
    const value = node.fields[field];
    if (value === undefined || value === null) continue;
    const token = table[String(value)];
    if (token !== undefined) tags.push(token);
  }
  return order === undefined ? tags : orderTags(tags, order);
}

/**
 * The markers cell. Two shapes, both from `spelling`: a FIXED-value marker prints its glyph alone
 * (`⏫`), a TRAILING marker prints `<glyph> <value>` (`📅 2026-09-01`).
 *
 * ORDERED BY GLYPH, NOT BY CELL — the engine orders the marker KEYS and re-attaches the cells
 * (`_assemble_marker_cells`), because a cell carrying a value could never match a canonical order
 * listing bare emoji.
 */
function markerCells(node: ComposableNode, resolution: ConfigResolutionTable, order: TagOrder | undefined): readonly string[] {
  const spelling = resolution.spelling;
  if (spelling === undefined) return [];
  const byGlyph = new Map<string, string>();
  for (const [field, table] of Object.entries(spelling.fieldMarkerValues)) {
    const value = node.fields[field];
    if (value === undefined || value === null) continue;
    const glyph = table[String(value)];
    if (glyph !== undefined) byGlyph.set(glyph, glyph);
  }
  for (const [field, marker] of Object.entries(spelling.fieldMarkers)) {
    const value = node.fields[field];
    if (value === undefined || value === null || value === "") continue;
    byGlyph.set(marker.token, `${marker.token} ${String(value)}`);
  }
  const glyphs = [...byGlyph.keys()];
  const ordered = order === undefined ? glyphs : orderTags(glyphs, order);
  return ordered.map((glyph) => byGlyph.get(glyph) as string);
}

/**
 * The chrome cell: `#<tag> [[<target title>]]` per chrome-eligible outgoing edge, in `edgeTagOrder`.
 *
 * CARDINALITY IS OBEYED, AND IT GUARDS THE CALLER RATHER THAN THE GRAPH. `one` means a second edge
 * of that type replaces rather than appends, so only the first is emitted.
 *
 * A SECOND SUCH EDGE CANNOT COME FROM THE GRAPH — `qntm_graph` enforces cardinality at creation and
 * raises "Cardinality violation: source already has an outgoing edge of type 'NEXT'". Found by
 * trying to build the fixture, not by reading. So this branch defends against a caller that
 * assembled `outgoingEdges` wrongly, which is a real risk because that list is a plain array this
 * module does not derive. Saying which it guards matters: a comment implying it mirrors an engine
 * behaviour would send the next reader looking for engine code that does not exist.
 */
function chromeCells(
  edges: readonly OutgoingEdge[],
  edgeTags: Readonly<Record<string, EdgeTag>>,
  order: TagOrder | undefined,
): readonly string[] {
  const cellsByTag = new Map<string, string[]>();
  for (const edge of edges) {
    const tag = edgeTags[edge.type];
    if (tag === undefined) continue;
    const title = edge.targetTitle.trim();
    if (title === "") continue; // the engine skip-and-warns rather than emitting a half cell
    const existing = cellsByTag.get(tag.token);
    if (existing === undefined) {
      cellsByTag.set(tag.token, [`${tag.token} [[${title}]]`]);
    } else if (tag.cardinality === "many") {
      existing.push(`${tag.token} [[${title}]]`);
    }
  }
  const tokens = [...cellsByTag.keys()];
  const ordered = order === undefined ? tokens : orderTags(tokens, order);
  return ordered.flatMap((token) => cellsByTag.get(token) as string[]);
}

/** `'    ' * depth` — AC #15's four spaces per level, the same constant `composeLine` uses. */
function indent(depth: number): string {
  return "    ".repeat(Math.max(0, depth));
}

/**
 * Compose one node's line, or refuse. See this module's header for the cells and the refusals.
 */
export function composeNodeLine(node: ComposableNode, context: ComposeContext): ComposeResult {
  const { resolution } = context;
  const composition = resolution.composition;
  if (composition === undefined) return { ok: false, because: "no-composition" };
  if (resolution.spelling === undefined) return { ok: false, because: "no-spelling" };

  const shape = resolution.chromeShapes[node.type];
  if (shape === undefined) return { ok: false, because: "unknown-node-type" };

  const identity = resolution.identityModes?.[node.type];
  if (identity === undefined) return { ok: false, because: "no-identity-mode" };

  let checkbox: string | undefined;
  if (shape === "checkbox") {
    if (resolution.renderCheckbox === undefined) return { ok: false, because: "no-checkbox-table" };
    checkbox = checkboxGlyph(resolution.renderCheckbox, node.fields);
  }

  // THE STAMP. Suppressed for a unique-identity type (its name IS its identity) and for a
  // read_only sheet — `decide_stamp`'s empty-string branches.
  //
  // IT FALLS BACK TO THE NODE'S OWN `id`, and that is not a detail. `_resolved_qntm_id`
  // (renderer.py:1606) is `node.id if qntm_id_value is None else qntm_id_value`, so a node with no
  // `qntm_id` field still stamps — with its uuid. The first draft here read `fields.qntm_id` alone
  // and emitted NO stamp for such a node, which is most of them; the agreement differential caught
  // it on its first run, on the very first fixture.
  const declared = node.fields.qntm_id;
  const resolvedId = declared === undefined || declared === null ? node.id : String(declared);
  const stamp =
    identity.unique || context.writePolicy === "read_only" || resolvedId === ""
      ? ""
      : `[[qntm:${resolvedId}]]`;

  // ONE FLAT LIST, WRAPPED ONCE — see the header. The per-node answer first, then the global one,
  // which is the order `_render_node_line` extends them in; `applyTitleStyles` nests by kind rather
  // than by position, so the merge order cannot change the bytes, and it mirrors the engine anyway.
  const perNode =
    resolution.renderTitleStyle === undefined
      ? []
      : titleStyleFor(
          resolution.renderTitleStyle,
          nodeLocalContext(
            { type: node.type, fields: node.fields },
            (context.outgoingEdges ?? []).map((e) => e.type),
            context.incomingEdgeTypes ?? [],
          ),
        );
  const merged: Composition = {
    ...composition,
    titleStyles: [...perNode, ...composition.titleStyles],
  };

  // `exactOptionalPropertyTypes` — a plain_line carries NO checkbox cell, and "absent" is not the
  // same as "present and undefined" under that flag. Spread it in only when the shape has one,
  // which is also the truer statement: `composition.heads.plain_line` never names the cell.
  const text = composeLine(
    shape,
    {
      ...(checkbox === undefined ? {} : { checkbox }),
      title: cleanTitle(node.fields.title),
      stamp,
      date: "", // always "" — the engine's own dissolved cell, kept in the order for faithfulness
      tags: tagCells(node, resolution, resolution.tagOrder),
      markers: markerCells(node, resolution, resolution.markerOrder),
      chrome: chromeCells(context.outgoingEdges ?? [], resolution.spelling.edgeTags, resolution.edgeTagOrder),
    },
    merged,
    context.depth ?? 0,
  );

  // CONTINUATION LINES sit one level DEEPER and carry the bare tag that re-ingests them. A
  // declared field with no value emits nothing, which is the engine's own `if isinstance(value,
  // str) and value.strip()` guard.
  const continuationLines: string[] = [];
  for (const declared of resolution.continuationFields?.[node.type] ?? []) {
    const value = node.fields[declared.field];
    if (typeof value !== "string" || value.trim() === "") continue;
    const tag = declared.token === null ? "" : ` ${declared.token}`;
    continuationLines.push(`${indent((context.depth ?? 0) + 1)}${composition.bullet} ${value}${tag}`);
  }

  return { ok: true, line: { text, continuationLines } };
}
