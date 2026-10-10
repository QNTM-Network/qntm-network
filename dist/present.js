// app/present/express/levels.ts
var SPECIFICITY = [
  "FOCUS",
  "MODE",
  "LINE",
  "STRUCTURAL_NODE",
  "VIEW",
  "USER",
  "GLOBAL"
];
function isSilent(contribution) {
  return contribution === void 0 || Object.keys(contribution).length === 0;
}

// app/present/express/rendition.ts
var RESOLUTION_KEYS = [
  "checkbox",
  "heading",
  "prose",
  "tags",
  "stamp"
];
var DEFAULT = Object.freeze({
  checkbox: "wired",
  heading: "wired",
  prose: "wired",
  tags: "raw",
  stamp: "raw"
});
var TASK = /^(\s*)- \[( |x|X)\] (.*)$/;
var ANY_GLYPH_TASK = /^(\s*)- \[(.)\] (.*)$/;
var HEADING = /^(#{1,6})\s+(.*)$/;
function classifyLine(line, statuses) {
  const task = TASK.exec(line);
  if (task !== null) {
    const done = (task[2] ?? "").toLowerCase() === "x";
    return {
      kind: "checkbox",
      source: line,
      indent: task[1] ?? "",
      done,
      tail: task[3] ?? "",
      status: statuses?.[`[${task[2] ?? " "}]`] ?? (done ? "done" : "open")
    };
  }
  if (statuses !== void 0) {
    const other = ANY_GLYPH_TASK.exec(line);
    const status = other === null ? void 0 : statuses[`[${other[2] ?? ""}]`];
    if (other !== null && status !== void 0) {
      return {
        kind: "checkbox",
        source: line,
        indent: other[1] ?? "",
        done: status === "done",
        tail: other[3] ?? "",
        status
      };
    }
  }
  const heading = HEADING.exec(line);
  if (heading !== null) {
    return {
      kind: "heading",
      source: line,
      hashes: heading[1] ?? "",
      text: heading[2] ?? ""
    };
  }
  if (line.trim() === "") {
    return { kind: "blank", source: line };
  }
  return { kind: "prose", source: line };
}
var BULLET = /^(\s*)([-*+])(\s+|$)/;
var CHECKBOX_GLYPH = /^\[.\]\s*/;
function carriesContent(line) {
  const shape = classifyLine(line);
  if (shape.kind === "blank") {
    return false;
  }
  if (shape.kind === "heading") {
    return shape.text.trim() !== "";
  }
  const tail = line.replace(BULLET, "").replace(CHECKBOX_GLYPH, "");
  let stripped = tail;
  for (const span of [...tagSpans(tail)].reverse()) {
    stripped = stripped.slice(0, span.start) + stripped.slice(span.end);
  }
  return stripped.trim() !== "";
}
function chromeOf(line) {
  const shape = classifyLine(line);
  if (shape.kind === "checkbox") {
    return shape.indent + "- [ ] ";
  }
  if (shape.kind !== "prose") {
    return null;
  }
  const bullet = BULLET.exec(line);
  if (bullet === null) {
    return null;
  }
  return (bullet[1] ?? "") + "- ";
}
var TAG = /(^|\s)#([a-zA-Z_][a-zA-Z0-9_-]*)/g;
function tagSpans(text) {
  const spans = [];
  for (const match of text.matchAll(TAG)) {
    const start = (match.index ?? 0) + (match[1] ?? "").length;
    const tag = "#" + (match[2] ?? "");
    spans.push({ start, end: start + tag.length, text: tag });
  }
  return spans;
}
var QNTM_ID = /\[\[qntm:([A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?)\]\]/gi;
function stampSpans(text) {
  const spans = [];
  for (const match of text.matchAll(QNTM_ID)) {
    const start = match.index ?? 0;
    spans.push({ start, end: start + match[0].length, text: match[0], id: match[1] ?? "" });
  }
  return spans;
}
function qntmIdSpans(text) {
  return stampSpans(text).map(({ start, end }) => ({ start, end }));
}
var WIKI_LINK = /\[\[([^\]]+)\]\]/g;
function wikiLinkSpans(text) {
  const spans = [];
  for (const match of text.matchAll(WIKI_LINK)) {
    const start = match.index ?? 0;
    spans.push({ start, end: start + match[0].length });
  }
  return spans;
}
var MARKER_GLYPH = /\p{Extended_Pictographic}️?/gu;
var MARKER_VALUE = /^(?:\d{4}-\d{2}-\d{2}|\d+(?:\.\d+)?)$/;
function markerSpans(text) {
  const spans = [];
  for (const match of text.matchAll(MARKER_GLYPH)) {
    const glyphStart = match.index ?? 0;
    const glyphEnd = glyphStart + match[0].length;
    const after = text.slice(glyphEnd);
    const leadingSpace = /^\s+/.exec(after);
    let end = glyphEnd;
    if (leadingSpace !== null) {
      const rest = after.slice(leadingSpace[0].length);
      const token = /^\S+/.exec(rest);
      if (token !== null && MARKER_VALUE.test(token[0])) {
        end = glyphEnd + leadingSpace[0].length + token[0].length;
      }
    }
    spans.push({ start: glyphStart, end });
  }
  return spans;
}
function titleSpans(line) {
  const shape = classifyLine(line);
  let content;
  let prefixLen;
  if (shape.kind === "blank") {
    return [];
  } else if (shape.kind === "heading") {
    content = shape.text;
    prefixLen = line.length - shape.text.length;
  } else if (shape.kind === "checkbox") {
    content = shape.tail;
    prefixLen = line.length - shape.tail.length;
  } else {
    const bullet = BULLET.exec(line);
    let prefix = bullet !== null ? bullet[0].length : 0;
    let rest = bullet !== null ? line.slice(prefix) : line;
    const glyph = CHECKBOX_GLYPH.exec(rest);
    if (glyph !== null) {
      prefix += glyph[0].length;
      rest = rest.slice(glyph[0].length);
    }
    content = rest;
    prefixLen = prefix;
  }
  const claims = [];
  for (const span of [...wikiLinkSpans(content), ...tagSpans(content), ...markerSpans(content)]) {
    if (!claims.some((claimed) => span.start >= claimed.start && span.start < claimed.end)) {
      claims.push(span);
    }
  }
  claims.sort((a, b) => a.start - b.start);
  const atomAt = (index) => claims.find((claim) => index >= claim.start && index < claim.end);
  const words2 = [];
  let i = 0;
  while (i < content.length) {
    const atom = atomAt(i);
    if (atom !== void 0) {
      i = atom.end;
      continue;
    }
    if (/\s/.test(content[i] ?? "")) {
      i += 1;
      continue;
    }
    const start = i;
    while (i < content.length && atomAt(i) === void 0 && !/\s/.test(content[i] ?? "")) {
      i += 1;
    }
    words2.push({ start: start + prefixLen, end: i + prefixLen });
  }
  return words2;
}
function contentOf(line) {
  const shape = classifyLine(line);
  if (shape.kind === "blank") return null;
  if (shape.kind === "heading") return shape.text;
  if (shape.kind === "checkbox") return shape.tail;
  const bullet = BULLET.exec(line);
  let rest = bullet !== null ? line.slice(bullet[0].length) : line;
  const glyph = CHECKBOX_GLYPH.exec(rest);
  if (glyph !== null) rest = rest.slice(glyph[0].length);
  return rest;
}
var STYLE_WRAPS = ["~~", "**", "*", "_"];
function cleanTitleFor(line) {
  const content = contentOf(line);
  if (content === null) {
    return { kind: "abstains", because: "no-title" };
  }
  const claims = [];
  for (const span of [...wikiLinkSpans(content), ...tagSpans(content), ...markerSpans(content)]) {
    if (!claims.some((claimed) => span.start >= claimed.start && span.start < claimed.end)) {
      claims.push(span);
    }
  }
  claims.sort((a, b) => a.start - b.start);
  let cut = "";
  let at = 0;
  for (const claim of claims) {
    cut += content.slice(at, claim.start);
    at = claim.end;
  }
  cut += content.slice(at);
  const normalised = cut.replace(/\s+/g, " ").trim();
  for (const wrap of STYLE_WRAPS) {
    if (normalised.startsWith(wrap) && normalised.endsWith(wrap) && normalised.length > wrap.length * 2) {
      return { kind: "abstains", because: "style-ambiguous" };
    }
  }
  return { kind: "title", text: normalised };
}

// app/present/arrange/structural.ts
var STRUCTURAL_KEY = "structural";
var EDGE_SOURCES = ["self", "position"];
var EDGE_DIRECTIONS = ["incoming", "outgoing"];
var STRUCTURAL_TOP_KEYS = ["indent", "edgeCardinality", "edgeDirectionRegistry", "sections", "dropped"];
var INDENT_KEYS = ["edgeType", "edgeSource"];
var SECTION_LANGUAGE_KEYS = ["edgeTypes", "edgeDirection"];
var EMPTY = {
  indent: void 0,
  edgeCardinality: {},
  edgeDirectionRegistry: {},
  sections: {},
  dropped: {}
};
function readDropped(value, problems) {
  if (!isPlainObject(value)) {
    problems.push(
      `'${STRUCTURAL_KEY}.dropped' is ${Array.isArray(value) ? "an array" : typeof value}, not an object \u2014 what the generator refused to publish stays unknown`
    );
    return {};
  }
  const out = {};
  for (const [what, why] of Object.entries(value)) {
    if (typeof why !== "string") {
      problems.push(
        `'${STRUCTURAL_KEY}.dropped.${what}' is ${Array.isArray(why) ? "an array" : typeof why}, not a reason`
      );
      continue;
    }
    out[what] = why;
  }
  return out;
}
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function readIndent(value, problems) {
  if (!isPlainObject(value)) {
    problems.push(
      `'structural.indent' is ${Array.isArray(value) ? "an array" : typeof value}, not an object \u2014 the global indent binding stays unknown`
    );
    return void 0;
  }
  for (const key of Object.keys(value)) {
    if (!INDENT_KEYS.includes(key)) {
      problems.push(
        `'structural.indent.${key}' is not a recognised key and was NOT applied \u2014 the keys are ${INDENT_KEYS.join(", ")}`
      );
    }
  }
  const edgeType = value.edgeType;
  const edgeSource = value.edgeSource;
  let ok = true;
  if (typeof edgeType !== "string" || edgeType === "") {
    problems.push(
      `'structural.indent.edgeType' is ${JSON.stringify(edgeType)}, not a non-empty string`
    );
    ok = false;
  }
  if (!EDGE_SOURCES.includes(edgeSource)) {
    problems.push(
      `'structural.indent.edgeSource' is ${JSON.stringify(edgeSource)}, which is not one of ${EDGE_SOURCES.join(", ")}`
    );
    ok = false;
  }
  if (!ok) {
    return void 0;
  }
  return { edgeType, edgeSource };
}
function readEdgeCardinality(path, value, problems) {
  if (!isPlainObject(value)) {
    problems.push(
      `'${path}' is ${Array.isArray(value) ? "an array" : typeof value}, not an object \u2014 every edge type's cardinality stays unknown`
    );
    return {};
  }
  const out = {};
  for (const [edgeType, cardinality] of Object.entries(value)) {
    if (typeof cardinality !== "string" || cardinality === "") {
      problems.push(
        `'${path}.${edgeType}' is ${JSON.stringify(cardinality)}, not a non-empty string \u2014 that edge type's cardinality stays unknown`
      );
      continue;
    }
    out[edgeType] = cardinality;
  }
  return out;
}
function readSectionLanguage(path, value, problems) {
  if (!isPlainObject(value)) {
    problems.push(
      `'${path}' is ${Array.isArray(value) ? "an array" : typeof value}, not an object \u2014 this section's structural language stays unknown`
    );
    return void 0;
  }
  for (const key of Object.keys(value)) {
    if (!SECTION_LANGUAGE_KEYS.includes(key)) {
      problems.push(
        `'${path}.${key}' is not a recognised key and was NOT applied \u2014 the keys are ${SECTION_LANGUAGE_KEYS.join(", ")}`
      );
    }
  }
  const edgeTypes = value.edgeTypes;
  const edgeDirection = value.edgeDirection;
  let ok = true;
  if (!Array.isArray(edgeTypes) || edgeTypes.length === 0 || !edgeTypes.every((t) => typeof t === "string" && t !== "")) {
    problems.push(
      `'${path}.edgeTypes' is ${JSON.stringify(edgeTypes)}, not a non-empty array of non-empty strings`
    );
    ok = false;
  }
  if (!EDGE_DIRECTIONS.includes(edgeDirection)) {
    problems.push(
      `'${path}.edgeDirection' is ${JSON.stringify(edgeDirection)}, which is not one of ${EDGE_DIRECTIONS.join(", ")}`
    );
    ok = false;
  }
  if (!ok) {
    return void 0;
  }
  return { edgeTypes, edgeDirection };
}
function readSections(value, problems) {
  if (!isPlainObject(value)) {
    problems.push(
      `'structural.sections' is ${Array.isArray(value) ? "an array" : typeof value}, not an object \u2014 every section override stays unknown`
    );
    return {};
  }
  const out = {};
  for (const [viewId, sectionsValue] of Object.entries(value)) {
    const path = `structural.sections.${viewId}`;
    if (!isPlainObject(sectionsValue)) {
      problems.push(
        `'${path}' is ${Array.isArray(sectionsValue) ? "an array" : typeof sectionsValue}, not an object \u2014 this view's section overrides stay unknown`
      );
      continue;
    }
    const sections = {};
    for (const [sectionId, languageValue] of Object.entries(sectionsValue)) {
      const language = readSectionLanguage(`${path}.${sectionId}`, languageValue, problems);
      if (language !== void 0) {
        sections[sectionId] = language;
      }
    }
    if (Object.keys(sections).length > 0) {
      out[viewId] = sections;
    }
  }
  return out;
}
function readStructuralDeclaration(document2) {
  if (!isPlainObject(document2)) {
    return { structural: EMPTY, problems: [] };
  }
  if (!(STRUCTURAL_KEY in document2)) {
    return { structural: EMPTY, problems: [] };
  }
  const raw = document2[STRUCTURAL_KEY];
  const problems = [];
  if (!isPlainObject(raw)) {
    problems.push(
      `'${STRUCTURAL_KEY}' is ${Array.isArray(raw) ? "an array" : typeof raw}, not an object \u2014 the whole structural language stays unknown`
    );
    return { structural: EMPTY, problems };
  }
  for (const key of Object.keys(raw)) {
    if (!STRUCTURAL_TOP_KEYS.includes(key)) {
      problems.push(
        `'${STRUCTURAL_KEY}.${key}' is not a recognised key and was NOT applied \u2014 the keys are ${STRUCTURAL_TOP_KEYS.join(", ")}`
      );
    }
  }
  const indent3 = "indent" in raw ? readIndent(raw.indent, problems) : void 0;
  const edgeCardinality = "edgeCardinality" in raw ? readEdgeCardinality(`${STRUCTURAL_KEY}.edgeCardinality`, raw.edgeCardinality, problems) : {};
  const edgeDirectionRegistry = "edgeDirectionRegistry" in raw ? readEdgeCardinality(`${STRUCTURAL_KEY}.edgeDirectionRegistry`, raw.edgeDirectionRegistry, problems) : {};
  const sections = "sections" in raw ? readSections(raw.sections, problems) : {};
  const dropped = "dropped" in raw ? readDropped(raw.dropped, problems) : {};
  return { structural: { indent: indent3, edgeCardinality, edgeDirectionRegistry, sections, dropped }, problems };
}

// app/present/select/qualification.ts
var COMPARISON_OPERATORS = ["gt", "gte", "lt", "lte"];
var CYCLE_EXPRESSION_RE = /^\$(cycle_today|cycle_week_end)(?:\s*[+-]\s*\d+\s*d)?$/;
function isCycleExpression(value) {
  return typeof value === "string" && CYCLE_EXPRESSION_RE.test(value);
}
function qualifierNeedsGraph(qualifier) {
  return (qualifier.edgeSteps?.length ?? 0) > 0;
}
function predicateNeedsClock(predicate) {
  if (predicate.not !== void 0) return predicateNeedsClock(predicate.not);
  if (predicate.eq !== void 0) return isCycleExpression(predicate.eq);
  return COMPARISON_OPERATORS.some((op) => {
    const operand = predicate[op];
    return operand !== void 0 && isCycleExpression(operand);
  });
}
function findClauseNeedsClock(clause) {
  return Object.values(clause.fields).some(predicateNeedsClock);
}
function qualifierNeedsClock(qualifier) {
  if (findClauseNeedsClock(qualifier.find)) return true;
  return qualifier.exclude.some(findClauseNeedsClock);
}
var QUALIFICATION_KEY = "qualification";
var DEFAULT_TRAVERSAL_DEPTH = 1;
var TOP_KEYS = [
  "defaultNodeType",
  "structuralNodeTypes",
  "resolvableFields",
  "extractionFields",
  "tokens",
  "predicates",
  "sections",
  "sectionOrder",
  "refused",
  "dropped",
  "traversalDepth"
];
var SECTION_KEYS = ["qualification", "nodeType", "defaults", "name"];
var EXTRACTION_FIELD_KINDS = ["date", "int", "float"];
var EMPTY2 = {
  defaultNodeType: void 0,
  structuralNodeTypes: [],
  resolvableFields: [],
  extractionFields: {},
  tokens: {},
  predicates: {},
  sections: {},
  sectionOrder: {},
  refused: {},
  dropped: {},
  traversalDepth: DEFAULT_TRAVERSAL_DEPTH
};
function isPlainObject2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
var shapeOf = (value) => Array.isArray(value) ? "an array" : typeof value;
function isFieldValue(value) {
  return value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}
function readPredicate(path, value, problems) {
  if (!isPlainObject2(value)) {
    problems.push(`'${path}' is ${shapeOf(value)}, not an object \u2014 this predicate stays unknown`);
    return void 0;
  }
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0] === "eq") {
    if (!isFieldValue(value.eq)) {
      problems.push(`'${path}.eq' is ${shapeOf(value.eq)}, not a scalar or null`);
      return void 0;
    }
    return { eq: value.eq };
  }
  if (keys.length === 1 && keys[0] === "not") {
    const inner = readPredicate(`${path}.not`, value.not, problems);
    return inner === void 0 ? void 0 : { not: inner };
  }
  if (keys.length > 0 && keys.every((k) => COMPARISON_OPERATORS.includes(k))) {
    const compare2 = {};
    for (const operator of keys) {
      const operand = value[operator];
      if (!isFieldValue(operand)) {
        problems.push(`'${path}.${operator}' is ${shapeOf(operand)}, not a scalar or null`);
        return void 0;
      }
      compare2[operator] = operand;
    }
    return compare2;
  }
  problems.push(
    `'${path}' carries ${keys.length} operator(s) (${keys.join(", ")}) \u2014 exactly one of eq, not, or one or more of gt/gte/lt/lte`
  );
  return void 0;
}
function readFindClause(path, value, problems) {
  if (!isPlainObject2(value)) {
    problems.push(`'${path}' is ${shapeOf(value)}, not an object \u2014 this clause stays unknown`);
    return void 0;
  }
  for (const key of Object.keys(value)) {
    if (key !== "nodeType" && key !== "fields") {
      problems.push(`'${path}.${key}' is not a recognised key \u2014 the keys are nodeType, fields`);
    }
  }
  let nodeType = null;
  if (value.nodeType !== null && value.nodeType !== void 0) {
    if (!Array.isArray(value.nodeType) || value.nodeType.length === 0 || !value.nodeType.every((t) => typeof t === "string" && t !== "")) {
      problems.push(
        `'${path}.nodeType' is ${JSON.stringify(value.nodeType)}, not null and not a non-empty array of non-empty strings \u2014 this clause stays unknown`
      );
      return void 0;
    }
    nodeType = value.nodeType;
  }
  const fields = {};
  if (value.fields !== void 0) {
    if (!isPlainObject2(value.fields)) {
      problems.push(`'${path}.fields' is ${shapeOf(value.fields)}, not an object`);
      return void 0;
    }
    for (const [field, predicate] of Object.entries(value.fields)) {
      const read = readPredicate(`${path}.fields.${field}`, predicate, problems);
      if (read === void 0) return void 0;
      fields[field] = read;
    }
  }
  return { nodeType, fields };
}
var DIRECTIONS = ["children", "parents"];
function readEdgeStep(path, value, problems) {
  if (!isPlainObject2(value)) {
    problems.push(`'${path}' is ${shapeOf(value)}, not an object \u2014 this edge step stays unknown`);
    return void 0;
  }
  for (const key of Object.keys(value)) {
    if (key !== "direction" && key !== "mustExist" && key !== "edgeType" && key !== "nodeType" && key !== "fields") {
      problems.push(
        `'${path}.${key}' is not a recognised key \u2014 the keys are direction, mustExist, edgeType, nodeType, fields`
      );
    }
  }
  if (typeof value.direction !== "string" || !DIRECTIONS.includes(value.direction)) {
    problems.push(`'${path}.direction' is ${JSON.stringify(value.direction)}, not children or parents`);
    return void 0;
  }
  if (typeof value.mustExist !== "boolean") {
    problems.push(`'${path}.mustExist' is ${shapeOf(value.mustExist)}, not a boolean`);
    return void 0;
  }
  const edgeType = readStringList(`${path}.edgeType`, value.edgeType, problems);
  if (edgeType.length === 0) return void 0;
  const rest = readFindClause(path, { nodeType: value.nodeType, fields: value.fields }, problems);
  if (rest === void 0) return void 0;
  return {
    direction: value.direction,
    mustExist: value.mustExist,
    edgeType,
    nodeType: rest.nodeType,
    fields: rest.fields
  };
}
function readPredicates(value, problems) {
  if (!isPlainObject2(value)) {
    problems.push(
      `'${QUALIFICATION_KEY}.predicates' is ${shapeOf(value)}, not an object \u2014 every section's membership stays unknown`
    );
    return {};
  }
  const out = {};
  for (const [name, raw] of Object.entries(value)) {
    const path = `${QUALIFICATION_KEY}.predicates.${name}`;
    if (!isPlainObject2(raw)) {
      problems.push(`'${path}' is ${shapeOf(raw)}, not an object`);
      continue;
    }
    for (const key of Object.keys(raw)) {
      if (key !== "find" && key !== "exclude" && key !== "edgeSteps") {
        problems.push(`'${path}.${key}' is not a recognised key \u2014 the keys are find, exclude, edgeSteps`);
      }
    }
    const find = readFindClause(`${path}.find`, raw.find, problems);
    if (find === void 0) continue;
    if (raw.exclude !== void 0 && !Array.isArray(raw.exclude)) {
      problems.push(`'${path}.exclude' is ${shapeOf(raw.exclude)}, not an array`);
      continue;
    }
    const exclude = [];
    let ok = true;
    for (const [i, clause] of (raw.exclude ?? []).entries()) {
      const read = readFindClause(`${path}.exclude[${i}]`, clause, problems);
      if (read === void 0) {
        ok = false;
        break;
      }
      exclude.push(read);
    }
    if (!ok) continue;
    if (raw.edgeSteps !== void 0 && !Array.isArray(raw.edgeSteps)) {
      problems.push(`'${path}.edgeSteps' is ${shapeOf(raw.edgeSteps)}, not an array`);
      continue;
    }
    const edgeSteps = [];
    let edgeOk = true;
    for (const [i, step] of (raw.edgeSteps ?? []).entries()) {
      const read = readEdgeStep(`${path}.edgeSteps[${i}]`, step, problems);
      if (read === void 0) {
        edgeOk = false;
        break;
      }
      edgeSteps.push(read);
    }
    if (!edgeOk) continue;
    out[name] = edgeSteps.length > 0 ? { find, exclude, edgeSteps } : { find, exclude };
  }
  return out;
}
function readSections2(value, predicates, problems) {
  if (!isPlainObject2(value)) {
    problems.push(
      `'${QUALIFICATION_KEY}.sections' is ${shapeOf(value)}, not an object \u2014 no section is placed`
    );
    return {};
  }
  const out = {};
  for (const [viewId, sectionsValue] of Object.entries(value)) {
    const viewPath = `${QUALIFICATION_KEY}.sections.${viewId}`;
    if (!isPlainObject2(sectionsValue)) {
      problems.push(`'${viewPath}' is ${shapeOf(sectionsValue)}, not an object`);
      continue;
    }
    const sections = {};
    for (const [sectionId, raw] of Object.entries(sectionsValue)) {
      const path = `${viewPath}.${sectionId}`;
      if (!isPlainObject2(raw)) {
        problems.push(`'${path}' is ${shapeOf(raw)}, not an object`);
        continue;
      }
      for (const key of Object.keys(raw)) {
        if (!SECTION_KEYS.includes(key)) {
          problems.push(
            `'${path}.${key}' is not a recognised key \u2014 the keys are ${SECTION_KEYS.join(", ")}`
          );
        }
      }
      if (typeof raw.qualification !== "string" || raw.qualification === "") {
        problems.push(`'${path}.qualification' is ${JSON.stringify(raw.qualification)}, not a name`);
        continue;
      }
      if (!(raw.qualification in predicates)) {
        problems.push(
          `'${path}.qualification' names '${raw.qualification}', which is not in predicates \u2014 this section stays undecidable`
        );
        continue;
      }
      if (typeof raw.nodeType !== "string" || raw.nodeType === "") {
        problems.push(`'${path}.nodeType' is ${JSON.stringify(raw.nodeType)}, not a node type`);
        continue;
      }
      let defaults;
      if (raw.defaults !== void 0) {
        if (!isPlainObject2(raw.defaults)) {
          problems.push(`'${path}.defaults' is ${shapeOf(raw.defaults)}, not an object`);
          continue;
        }
        defaults = {};
        let ok = true;
        for (const [field, fieldValue2] of Object.entries(raw.defaults)) {
          if (!isFieldValue(fieldValue2)) {
            problems.push(`'${path}.defaults.${field}' is ${shapeOf(fieldValue2)}, not a scalar`);
            ok = false;
            break;
          }
          defaults[field] = fieldValue2;
        }
        if (!ok) continue;
      }
      let name;
      if (raw.name !== void 0) {
        if (typeof raw.name === "string" && raw.name !== "") {
          name = raw.name;
        } else {
          problems.push(`'${path}.name' is ${JSON.stringify(raw.name)}, not a name \u2014 falling back`);
        }
      }
      sections[sectionId] = { qualification: raw.qualification, nodeType: raw.nodeType, defaults, name };
    }
    if (Object.keys(sections).length > 0) out[viewId] = sections;
  }
  return out;
}
function readExtractionFields(value, problems) {
  if (!isPlainObject2(value)) {
    problems.push(
      `'${QUALIFICATION_KEY}.extractionFields' is ${shapeOf(value)}, not an object \u2014 no field spelled by a varying trailing value can be resolved`
    );
    return {};
  }
  const out = {};
  for (const [field, raw] of Object.entries(value)) {
    const path = `${QUALIFICATION_KEY}.extractionFields.${field}`;
    if (!isPlainObject2(raw)) {
      problems.push(`'${path}' is ${shapeOf(raw)}, not an object`);
      continue;
    }
    const { token, kind } = raw;
    if (typeof token !== "string" || token === "") {
      problems.push(`'${path}.token' is ${JSON.stringify(token)}, not a non-empty string`);
      continue;
    }
    if (typeof kind !== "string" || !EXTRACTION_FIELD_KINDS.includes(kind)) {
      problems.push(`'${path}.kind' is ${JSON.stringify(kind)}, not one of ${EXTRACTION_FIELD_KINDS.join(", ")}`);
      continue;
    }
    out[field] = { token, kind };
  }
  return out;
}
function readTokens(value, problems) {
  if (!isPlainObject2(value)) {
    problems.push(
      `'${QUALIFICATION_KEY}.tokens' is ${shapeOf(value)}, not an object \u2014 no line's fields can be resolved`
    );
    return {};
  }
  const out = {};
  for (const [field, familyValue] of Object.entries(value)) {
    const path = `${QUALIFICATION_KEY}.tokens.${field}`;
    if (!isPlainObject2(familyValue)) {
      problems.push(`'${path}' is ${shapeOf(familyValue)}, not an object`);
      continue;
    }
    const family = {};
    for (const [token, tokenValue] of Object.entries(familyValue)) {
      if (!isFieldValue(tokenValue) || tokenValue === null) {
        problems.push(`'${path}.${token}' is ${JSON.stringify(tokenValue)}, not a scalar value`);
        continue;
      }
      family[token] = tokenValue;
    }
    out[field] = family;
  }
  return out;
}
function readStringList(path, value, problems) {
  if (!Array.isArray(value) || !value.every((t) => typeof t === "string" && t !== "")) {
    problems.push(`'${path}' is ${JSON.stringify(value)}, not an array of non-empty strings`);
    return [];
  }
  return value;
}
function readSectionOrder(value, problems) {
  if (!isPlainObject2(value)) {
    problems.push(
      `'${QUALIFICATION_KEY}.sectionOrder' is ${shapeOf(value)}, not an object \u2014 no section can be addressed by its position in the file`
    );
    return {};
  }
  const out = {};
  for (const [viewId, order] of Object.entries(value)) {
    out[viewId] = readStringList(`${QUALIFICATION_KEY}.sectionOrder.${viewId}`, order, problems);
  }
  return out;
}
function readReasons(key, value, problems) {
  if (!isPlainObject2(value)) {
    problems.push(`'${QUALIFICATION_KEY}.${key}' is ${shapeOf(value)}, not an object`);
    return {};
  }
  const out = {};
  for (const [name, reason] of Object.entries(value)) {
    if (typeof reason !== "string") {
      problems.push(`'${QUALIFICATION_KEY}.${key}.${name}' is ${shapeOf(reason)}, not a string`);
      continue;
    }
    out[name] = reason;
  }
  return out;
}
function readQualificationDeclaration(document2) {
  if (!isPlainObject2(document2)) {
    return { qualification: EMPTY2, problems: [] };
  }
  if (!(QUALIFICATION_KEY in document2)) {
    return { qualification: EMPTY2, problems: [] };
  }
  const raw = document2[QUALIFICATION_KEY];
  const problems = [];
  if (!isPlainObject2(raw)) {
    problems.push(
      `'${QUALIFICATION_KEY}' is ${shapeOf(raw)}, not an object \u2014 no section's membership can be decided`
    );
    return { qualification: EMPTY2, problems };
  }
  for (const key of Object.keys(raw)) {
    if (!TOP_KEYS.includes(key)) {
      problems.push(
        `'${QUALIFICATION_KEY}.${key}' is not a recognised key and was NOT applied \u2014 the keys are ${TOP_KEYS.join(", ")}`
      );
    }
  }
  let defaultNodeType;
  if ("defaultNodeType" in raw) {
    if (typeof raw.defaultNodeType === "string" && raw.defaultNodeType !== "") {
      defaultNodeType = raw.defaultNodeType;
    } else {
      problems.push(
        `'${QUALIFICATION_KEY}.defaultNodeType' is ${JSON.stringify(raw.defaultNodeType)}, not a node type \u2014 the GLOBAL registration rung stays unknown`
      );
    }
  }
  const predicates = "predicates" in raw ? readPredicates(raw.predicates, problems) : {};
  let traversalDepth = DEFAULT_TRAVERSAL_DEPTH;
  if ("traversalDepth" in raw) {
    if (typeof raw.traversalDepth === "number" && Number.isInteger(raw.traversalDepth) && raw.traversalDepth >= 0) {
      traversalDepth = raw.traversalDepth;
    } else {
      problems.push(
        `'${QUALIFICATION_KEY}.traversalDepth' is ${JSON.stringify(raw.traversalDepth)}, not a non-negative integer \u2014 the built-in default (${DEFAULT_TRAVERSAL_DEPTH}) is used instead`
      );
    }
  }
  return {
    qualification: {
      defaultNodeType,
      structuralNodeTypes: "structuralNodeTypes" in raw ? readStringList(
        `${QUALIFICATION_KEY}.structuralNodeTypes`,
        raw.structuralNodeTypes,
        problems
      ) : [],
      resolvableFields: "resolvableFields" in raw ? readStringList(`${QUALIFICATION_KEY}.resolvableFields`, raw.resolvableFields, problems) : [],
      extractionFields: "extractionFields" in raw ? readExtractionFields(raw.extractionFields, problems) : {},
      tokens: "tokens" in raw ? readTokens(raw.tokens, problems) : {},
      predicates,
      sections: "sections" in raw ? readSections2(raw.sections, predicates, problems) : {},
      sectionOrder: "sectionOrder" in raw ? readSectionOrder(raw.sectionOrder, problems) : {},
      refused: "refused" in raw ? readReasons("refused", raw.refused, problems) : {},
      dropped: "dropped" in raw ? readReasons("dropped", raw.dropped, problems) : {},
      traversalDepth
    },
    problems
  };
}

// app/present/resolutiontable.ts
var RESOLUTION_TABLE_KEY = "resolution";
var TOP_KEYS2 = [
  "registration",
  "lineGrammars",
  "ordering",
  "orderingFields",
  "dayBoundary",
  "chromeShapes",
  // The unfiltered twin of the line above. Both are published because they answer different
  // questions — see `renderShapes`' own comment on the interface for the one that made it necessary.
  "renderShapes",
  "sectionRegistration",
  "defaultOrdering",
  "defaultOrderingSource",
  "priorityRank",
  "composition",
  "compositionSource",
  "viewComposition",
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
  // The per-node title wrap. Nested predicates over an opaque path, unlike renderCheckbox's
  // one-field comparison — see `TitleStylePredicate`.
  "renderTitleStyle",
  "renderTitleStyleSource",
  // Whether a type's line carries a stamp, and what identifies it when it does not. Keyed over
  // every declared type, so absence means "unknown type", never "ordinary type".
  "identityModes",
  // The extra indented lines a node type re-emits beneath its own line, and the bare tag each
  // carries. Keyed only by the types that declare them — absence has one meaning here.
  "continuationFields",
  // How each section's heading renders. `name` is the live one — 303 of 304 sections declare it.
  "sectionPresentation",
  // The other two canonical cell orders. `tagOrder` shipped alone; a composer could order one of
  // the three cell families that carry more than one cell, and had to invent the rest.
  "markerOrder",
  "markerOrderSource",
  "edgeTagOrder",
  "edgeTagOrderSource",
  "dropped"
];
var DEFAULT_ORDERING_SOURCES = ["config", "not-declared"];
var COMPOSITION_SOURCES = ["config", "engine-fallback"];
var TAG_ORDER_SOURCES = ["engine-literal"];
var TAG_ORDER_KEYS = ["canonicalOrder", "unrankedPolicy"];
var TAG_ORDER_UNRANKED_POLICIES = ["append_stable", "prepend_stable", "reject"];
var SECTION_REGISTRATION_KEYS = ["nodeType", "defaults", "tokens"];
var REGISTRATION_KEYS = ["defaultNodeType", "baseNodeType", "inputGrammar", "defaultTags"];
var ORDERING_KEY_KEYS = ["field", "direction"];
var SECTION_ORDERING_KEYS = ["ordering", "orderingMode", "name"];
var TRAILING_MARKER_KEYS = ["token", "kind"];
var ENUM_MARKER_KEYS = ["kind", "values"];
var TRAILING_ORDERING_FIELD_KINDS = ["date", "int", "float"];
var DAY_BOUNDARY_KEYS = ["timezone", "dayStartHour", "weekStartsOn"];
var DIRECTIONS2 = ["asc", "desc"];
var CHROME_SHAPES = ["checkbox", "plain_line"];
var COMPOSITION_KEYS = ["heads", "tail", "separator", "bullet", "titleStyles"];
var COMPOSITION_CELL_CLASSES = ["checkbox", "title", "stamp", "date", "tags", "markers", "chrome"];
var COMPOSITION_BULLET_CHARS = ["-", "*", "+"];
var COMPOSITION_TITLE_STYLES = ["italic", "bold", "strikethrough"];
var isScalarOrNull = (value) => value === null || ["string", "number", "boolean"].includes(typeof value);
function readSectionRegistrationEntry(path, value, problems) {
  if (!isPlainObject3(value)) {
    problems.push(`'${path}' is ${shapeOf2(value)}, not an object \u2014 what a new line here becomes stays unknown`);
    return void 0;
  }
  for (const key of Object.keys(value)) {
    if (!SECTION_REGISTRATION_KEYS.includes(key)) {
      problems.push(
        `'${path}.${key}' is not a recognised key \u2014 the keys are ${SECTION_REGISTRATION_KEYS.join(", ")}`
      );
    }
  }
  const { nodeType, defaults, tokens } = value;
  if (typeof nodeType !== "string" || nodeType === "") {
    problems.push(`'${path}.nodeType' is ${JSON.stringify(nodeType)}, not a node type`);
    return void 0;
  }
  if (!Array.isArray(tokens) || !tokens.every((t) => typeof t === "string" && t !== "")) {
    problems.push(
      `'${path}.tokens' is ${JSON.stringify(tokens)}, not an array of non-empty strings \u2014 nothing is seeded here rather than part of a line`
    );
    return void 0;
  }
  let read;
  if (defaults !== void 0) {
    if (!isPlainObject3(defaults)) {
      problems.push(`'${path}.defaults' is ${shapeOf2(defaults)}, not an object`);
      return void 0;
    }
    read = {};
    for (const [field, fieldValue2] of Object.entries(defaults)) {
      if (!isScalarOrNull(fieldValue2)) {
        problems.push(`'${path}.defaults.${field}' is ${shapeOf2(fieldValue2)}, not a scalar`);
        return void 0;
      }
      read[field] = fieldValue2;
    }
  }
  return { nodeType, defaults: read, tokens };
}
function readSectionRegistration(value, problems) {
  if (!isPlainObject3(value)) {
    problems.push(
      `'${RESOLUTION_TABLE_KEY}.sectionRegistration' is ${shapeOf2(value)}, not an object \u2014 no new line is seeded with what it becomes`
    );
    return {};
  }
  const out = {};
  for (const [viewId, sectionsValue] of Object.entries(value)) {
    const viewPath = `${RESOLUTION_TABLE_KEY}.sectionRegistration.${viewId}`;
    if (!isPlainObject3(sectionsValue)) {
      problems.push(`'${viewPath}' is ${shapeOf2(sectionsValue)}, not an object`);
      continue;
    }
    const sections = {};
    for (const [sectionId, raw] of Object.entries(sectionsValue)) {
      const read = readSectionRegistrationEntry(`${viewPath}.${sectionId}`, raw, problems);
      if (read !== void 0) sections[sectionId] = read;
    }
    if (Object.keys(sections).length > 0) out[viewId] = sections;
  }
  return out;
}
function readDropped2(value, problems) {
  if (!isPlainObject3(value)) {
    problems.push(
      `'${RESOLUTION_TABLE_KEY}.dropped' is ${shapeOf2(value)}, not an object \u2014 what the generator refused to publish stays unknown`
    );
    return {};
  }
  const out = {};
  for (const [what, why] of Object.entries(value)) {
    if (typeof why !== "string") {
      problems.push(`'${RESOLUTION_TABLE_KEY}.dropped.${what}' is ${shapeOf2(why)}, not a reason`);
      continue;
    }
    out[what] = why;
  }
  return out;
}
function isPlainObject3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
var shapeOf2 = (value) => Array.isArray(value) ? "an array" : typeof value;
function readRegistration(value, problems) {
  if (!isPlainObject3(value)) {
    problems.push(
      `'${RESOLUTION_TABLE_KEY}.registration' is ${shapeOf2(value)}, not an object \u2014 the registration table stays unknown`
    );
    return void 0;
  }
  for (const key of Object.keys(value)) {
    if (!REGISTRATION_KEYS.includes(key)) {
      problems.push(
        `'${RESOLUTION_TABLE_KEY}.registration.${key}' is not a recognised key and was NOT applied \u2014 the keys are ${REGISTRATION_KEYS.join(", ")}`
      );
    }
  }
  const { defaultNodeType, baseNodeType, inputGrammar, defaultTags } = value;
  let ok = true;
  for (const [name, v] of [
    ["defaultNodeType", defaultNodeType],
    ["baseNodeType", baseNodeType],
    ["inputGrammar", inputGrammar]
  ]) {
    if (typeof v !== "string" || v === "") {
      problems.push(
        `'${RESOLUTION_TABLE_KEY}.registration.${name}' is ${JSON.stringify(v)}, not a non-empty string`
      );
      ok = false;
    }
  }
  if (!Array.isArray(defaultTags) || !defaultTags.every((t) => typeof t === "string")) {
    problems.push(
      `'${RESOLUTION_TABLE_KEY}.registration.defaultTags' is ${JSON.stringify(defaultTags)}, not an array of strings`
    );
    ok = false;
  }
  if (!ok) return void 0;
  return {
    defaultNodeType,
    baseNodeType,
    inputGrammar,
    defaultTags
  };
}
function readLineGrammars(value, problems) {
  if (!isPlainObject3(value)) {
    problems.push(
      `'${RESOLUTION_TABLE_KEY}.lineGrammars' is ${shapeOf2(value)}, not an object \u2014 every grammar stays unknown`
    );
    return {};
  }
  const out = {};
  for (const [name, shapes] of Object.entries(value)) {
    if (!Array.isArray(shapes) || !shapes.every((s) => typeof s === "string")) {
      problems.push(
        `'${RESOLUTION_TABLE_KEY}.lineGrammars.${name}' is ${JSON.stringify(shapes)}, not an array of strings`
      );
      continue;
    }
    out[name] = shapes;
  }
  return out;
}
function readOrderingKey(path, value, problems) {
  if (!isPlainObject3(value)) {
    problems.push(`'${path}' is ${shapeOf2(value)}, not an object \u2014 this ordering key is unknown`);
    return void 0;
  }
  for (const key of Object.keys(value)) {
    if (!ORDERING_KEY_KEYS.includes(key)) {
      problems.push(
        `'${path}.${key}' is not a recognised key \u2014 the keys are ${ORDERING_KEY_KEYS.join(", ")}`
      );
    }
  }
  const { field, direction } = value;
  if (typeof field !== "string" || field === "") {
    problems.push(`'${path}.field' is ${JSON.stringify(field)}, not a non-empty string`);
    return void 0;
  }
  if (!DIRECTIONS2.includes(direction)) {
    problems.push(
      `'${path}.direction' is ${JSON.stringify(direction)}, not one of ${DIRECTIONS2.join(", ")}`
    );
    return void 0;
  }
  return { field, direction };
}
function readSectionOrdering(path, value, problems) {
  if (!isPlainObject3(value)) {
    problems.push(`'${path}' is ${shapeOf2(value)}, not an object \u2014 this section's ordering is unknown`);
    return void 0;
  }
  for (const key of Object.keys(value)) {
    if (!SECTION_ORDERING_KEYS.includes(key)) {
      problems.push(
        `'${path}.${key}' is not a recognised key \u2014 the keys are ${SECTION_ORDERING_KEYS.join(", ")}`
      );
    }
  }
  let ordering;
  if (value.ordering !== void 0) {
    if (!Array.isArray(value.ordering) || value.ordering.length === 0) {
      problems.push(`'${path}.ordering' is ${JSON.stringify(value.ordering)}, not a non-empty array`);
      return void 0;
    }
    const keys = [];
    for (const [i, entry] of value.ordering.entries()) {
      const read = readOrderingKey(`${path}.ordering[${i}]`, entry, problems);
      if (read === void 0) return void 0;
      keys.push(read);
    }
    ordering = keys;
  }
  let orderingMode;
  if (value.orderingMode !== void 0) {
    if (typeof value.orderingMode !== "string" || value.orderingMode === "") {
      problems.push(`'${path}.orderingMode' is ${JSON.stringify(value.orderingMode)}, not a string`);
      return void 0;
    }
    orderingMode = value.orderingMode;
  }
  if (ordering === void 0 && orderingMode === void 0) {
    problems.push(`'${path}' declares neither 'ordering' nor 'orderingMode' \u2014 nothing to publish`);
    return void 0;
  }
  let name;
  if (value.name !== void 0) {
    if (typeof value.name !== "string" || value.name === "") {
      problems.push(`'${path}.name' is ${JSON.stringify(value.name)}, not a non-empty string`);
      return void 0;
    }
    name = value.name;
  }
  return { ordering, orderingMode, name };
}
function readOrdering(value, problems) {
  if (!isPlainObject3(value)) {
    problems.push(
      `'${RESOLUTION_TABLE_KEY}.ordering' is ${shapeOf2(value)}, not an object \u2014 every section's order stays unknown`
    );
    return {};
  }
  const out = {};
  for (const [viewId, sectionsValue] of Object.entries(value)) {
    const viewPath = `${RESOLUTION_TABLE_KEY}.ordering.${viewId}`;
    if (!isPlainObject3(sectionsValue)) {
      problems.push(`'${viewPath}' is ${shapeOf2(sectionsValue)}, not an object`);
      continue;
    }
    const sections = {};
    for (const [sectionId, raw] of Object.entries(sectionsValue)) {
      const read = readSectionOrdering(`${viewPath}.${sectionId}`, raw, problems);
      if (read !== void 0) sections[sectionId] = read;
    }
    if (Object.keys(sections).length > 0) out[viewId] = sections;
  }
  return out;
}
function readOrderingFieldMarker(path, value, problems) {
  if (!isPlainObject3(value)) {
    problems.push(`'${path}' is ${shapeOf2(value)}, not an object \u2014 this field's marker is unknown`);
    return void 0;
  }
  if (value.kind === "enum") {
    for (const key of Object.keys(value)) {
      if (!ENUM_MARKER_KEYS.includes(key)) {
        problems.push(`'${path}.${key}' is not a recognised key \u2014 the keys are ${ENUM_MARKER_KEYS.join(", ")}`);
      }
    }
    const { values } = value;
    if (!isPlainObject3(values) || Object.keys(values).length === 0) {
      problems.push(`'${path}.values' is ${shapeOf2(values)}, not a non-empty object of token -> value`);
      return void 0;
    }
    const read = {};
    for (const [token2, spelled] of Object.entries(values)) {
      if (token2 === "" || typeof spelled !== "string" || spelled === "") {
        problems.push(`'${path}.values["${token2}"]' is ${JSON.stringify(spelled)}, not a non-empty string`);
        return void 0;
      }
      read[token2] = spelled;
    }
    return { kind: "enum", values: read };
  }
  for (const key of Object.keys(value)) {
    if (!TRAILING_MARKER_KEYS.includes(key)) {
      problems.push(`'${path}.${key}' is not a recognised key \u2014 the keys are ${TRAILING_MARKER_KEYS.join(", ")}`);
    }
  }
  const { token, kind } = value;
  if (typeof token !== "string" || token === "") {
    problems.push(`'${path}.token' is ${JSON.stringify(token)}, not a non-empty string`);
    return void 0;
  }
  if (!TRAILING_ORDERING_FIELD_KINDS.includes(kind)) {
    problems.push(
      `'${path}.kind' is ${JSON.stringify(kind)}, not one of ${[...TRAILING_ORDERING_FIELD_KINDS, "enum"].join(", ")}`
    );
    return void 0;
  }
  return { token, kind };
}
function readOrderingFieldMarkers(value, problems) {
  if (!isPlainObject3(value)) {
    problems.push(
      `'${RESOLUTION_TABLE_KEY}.orderingFields' is ${shapeOf2(value)}, not an object \u2014 every field's marker stays unknown`
    );
    return {};
  }
  const out = {};
  for (const [field, raw] of Object.entries(value)) {
    const read = readOrderingFieldMarker(`${RESOLUTION_TABLE_KEY}.orderingFields.${field}`, raw, problems);
    if (read !== void 0) out[field] = read;
  }
  return out;
}
function readDayBoundary(value, problems) {
  if (!isPlainObject3(value)) {
    problems.push(
      `'${RESOLUTION_TABLE_KEY}.dayBoundary' is ${shapeOf2(value)}, not an object \u2014 the day boundary stays unknown`
    );
    return void 0;
  }
  for (const key of Object.keys(value)) {
    if (!DAY_BOUNDARY_KEYS.includes(key)) {
      problems.push(
        `'${RESOLUTION_TABLE_KEY}.dayBoundary.${key}' is not a recognised key \u2014 the keys are ${DAY_BOUNDARY_KEYS.join(", ")}`
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
      `'${RESOLUTION_TABLE_KEY}.dayBoundary.dayStartHour' is ${JSON.stringify(dayStartHour)}, not an integer 0..23`
    );
    ok = false;
  }
  if (typeof weekStartsOn !== "string" || weekStartsOn === "") {
    problems.push(
      `'${RESOLUTION_TABLE_KEY}.dayBoundary.weekStartsOn' is ${JSON.stringify(weekStartsOn)}`
    );
    ok = false;
  }
  if (!ok) return void 0;
  return {
    timezone,
    dayStartHour,
    weekStartsOn
  };
}
function readSpelling(value, problems) {
  const path = `${RESOLUTION_TABLE_KEY}.spelling`;
  if (!isPlainObject3(value)) {
    problems.push(`'${path}' is ${shapeOf2(value)}, not an object \u2014 how a node is spelled stays unknown`);
    return void 0;
  }
  const readStringMap = (raw, where) => {
    if (!isPlainObject3(raw)) {
      problems.push(`'${where}' is ${shapeOf2(raw)}, not an object \u2014 every spelling in it stays unknown`);
      return void 0;
    }
    const out = {};
    for (const [key, token] of Object.entries(raw)) {
      if (typeof token !== "string" || token === "") {
        problems.push(`'${where}.${key}' is ${JSON.stringify(token)}, not a non-empty string \u2014 that one spelling stays unknown`);
        continue;
      }
      out[key] = token;
    }
    return out;
  };
  const typeTokens = readStringMap(value.typeTokens, `${path}.typeTokens`);
  if (typeTokens === void 0) return void 0;
  if (!isPlainObject3(value.edgeTags)) {
    problems.push(`'${path}.edgeTags' is ${shapeOf2(value.edgeTags)}, not an object \u2014 every edge tag stays unknown`);
    return void 0;
  }
  const edgeTags = {};
  for (const [edgeType, tag] of Object.entries(value.edgeTags)) {
    if (!isPlainObject3(tag) || typeof tag.token !== "string" || tag.token === "") {
      problems.push(`'${path}.edgeTags.${edgeType}.token' is not a non-empty string \u2014 this edge tag stays unknown`);
      continue;
    }
    if (tag.cardinality !== "one" && tag.cardinality !== "many") {
      problems.push(
        `'${path}.edgeTags.${edgeType}.cardinality' is ${JSON.stringify(tag.cardinality)}, not "one" or "many" \u2014 whether a second edge of this type replaces or appends is unknown, so the tag is not published`
      );
      continue;
    }
    edgeTags[edgeType] = { token: tag.token, cardinality: tag.cardinality };
  }
  const readNested = (raw, where) => {
    if (!isPlainObject3(raw)) {
      problems.push(`'${where}' is ${shapeOf2(raw)}, not an object \u2014 every spelling in it stays unknown`);
      return void 0;
    }
    const out = {};
    for (const [field, table] of Object.entries(raw)) {
      const read = readStringMap(table, `${where}.${field}`);
      if (read !== void 0) out[field] = read;
    }
    return out;
  };
  const fieldTags = readNested(value.fieldTags, `${path}.fieldTags`);
  if (fieldTags === void 0) return void 0;
  const fieldMarkerValues = readNested(value.fieldMarkerValues, `${path}.fieldMarkerValues`);
  if (fieldMarkerValues === void 0) return void 0;
  if (!isPlainObject3(value.fieldMarkers)) {
    problems.push(`'${path}.fieldMarkers' is ${shapeOf2(value.fieldMarkers)}, not an object \u2014 every trailing marker stays unknown`);
    return void 0;
  }
  const fieldMarkers = {};
  for (const [field, marker] of Object.entries(value.fieldMarkers)) {
    if (!isPlainObject3(marker)) {
      problems.push(`'${path}.fieldMarkers.${field}' is ${shapeOf2(marker)}, not an object \u2014 this marker stays unknown`);
      continue;
    }
    const { kind, token, renderOnly } = marker;
    if (kind !== "date" && kind !== "int" && kind !== "float") {
      problems.push(`'${path}.fieldMarkers.${field}.kind' is ${JSON.stringify(kind)}, not date, int or float \u2014 this marker stays unknown`);
      continue;
    }
    if (typeof token !== "string" || token === "") {
      problems.push(`'${path}.fieldMarkers.${field}.token' is ${JSON.stringify(token)}, not a non-empty string \u2014 this marker stays unknown`);
      continue;
    }
    if (renderOnly !== void 0 && renderOnly !== true) {
      problems.push(`'${path}.fieldMarkers.${field}.renderOnly' is ${JSON.stringify(renderOnly)}, not true or absent \u2014 this marker stays unknown`);
      continue;
    }
    fieldMarkers[field] = renderOnly === true ? { kind, token, renderOnly: true } : { kind, token };
  }
  return { typeTokens, edgeTags, fieldTags, fieldMarkerValues, fieldMarkers };
}
function readRenderCheckbox(value, problems) {
  const path = `${RESOLUTION_TABLE_KEY}.renderCheckbox`;
  if (!isPlainObject3(value)) {
    problems.push(`'${path}' is ${shapeOf2(value)}, not an object \u2014 the checkbox glyph stays unknown`);
    return void 0;
  }
  if (typeof value.fallback !== "string" || value.fallback === "") {
    problems.push(
      `'${path}.fallback' is ${JSON.stringify(value.fallback)}, not a non-empty string \u2014 a status-less node's glyph is decided by this and there is no default to assume`
    );
    return void 0;
  }
  if (!Array.isArray(value.rows)) {
    problems.push(`'${path}.rows' is ${shapeOf2(value.rows)}, not an array \u2014 the checkbox glyph stays unknown`);
    return void 0;
  }
  const rows = [];
  for (const [index, row] of value.rows.entries()) {
    if (!isPlainObject3(row) || !isPlainObject3(row.when) || typeof row.when.field !== "string" || typeof row.when.equals !== "string" || typeof row.then !== "string" || row.then === "") {
      problems.push(
        `'${path}.rows[${index}]' is not {when: {field, equals}, then} \u2014 the whole checkbox decision stays unknown, because dropping one row of an ordered table changes what every later row answers`
      );
      return void 0;
    }
    rows.push({ when: { field: row.when.field, equals: row.when.equals }, then: row.then });
  }
  return { rows, fallback: value.fallback };
}
function readIdentityModes(value, problems) {
  const path = `${RESOLUTION_TABLE_KEY}.identityModes`;
  if (!isPlainObject3(value)) {
    problems.push(`'${path}' is ${shapeOf2(value)}, not an object \u2014 how any node is identified stays unknown`);
    return void 0;
  }
  const out = {};
  for (const [nodeType, mode] of Object.entries(value)) {
    if (!isPlainObject3(mode) || typeof mode.unique !== "boolean") {
      problems.push(
        `'${path}.${nodeType}' is not {unique: boolean, field: string|null} \u2014 the whole identity map stays unknown, because a missing entry reads as 'ordinary type' and would stamp a node the engine renders stampless`
      );
      return void 0;
    }
    if (mode.field !== null && (typeof mode.field !== "string" || mode.field === "")) {
      problems.push(`'${path}.${nodeType}.field' is ${JSON.stringify(mode.field)}, not a non-empty string or null`);
      return void 0;
    }
    out[nodeType] = { unique: mode.unique, field: mode.field };
  }
  return out;
}
function readContinuationFields(value, problems) {
  const path = `${RESOLUTION_TABLE_KEY}.continuationFields`;
  if (!isPlainObject3(value)) {
    problems.push(`'${path}' is ${shapeOf2(value)}, not an object \u2014 every continuation line stays unknown`);
    return void 0;
  }
  const out = {};
  for (const [nodeType, declared] of Object.entries(value)) {
    if (!Array.isArray(declared) || declared.length === 0) {
      problems.push(`'${path}.${nodeType}' is ${shapeOf2(declared)}, not a non-empty array`);
      return void 0;
    }
    const lines = [];
    for (const [index, entry] of declared.entries()) {
      if (!isPlainObject3(entry) || typeof entry.field !== "string" || entry.field === "") {
        problems.push(`'${path}.${nodeType}[${index}].field' is not a non-empty string`);
        return void 0;
      }
      if (entry.token !== null && (typeof entry.token !== "string" || entry.token === "")) {
        problems.push(`'${path}.${nodeType}[${index}].token' is ${JSON.stringify(entry.token)}, not a non-empty string or null`);
        return void 0;
      }
      lines.push({ field: entry.field, token: entry.token });
    }
    out[nodeType] = lines;
  }
  return out;
}
var TITLE_STYLE_COMPARISONS = /* @__PURE__ */ new Set(["eq", "ne", "gt", "gte", "lt", "lte"]);
function readTitleStylePredicate(value, path, problems) {
  if (!isPlainObject3(value) || typeof value.op !== "string") {
    problems.push(`'${path}' is ${shapeOf2(value)}, not a predicate with an 'op'`);
    return void 0;
  }
  const op = value.op;
  if (TITLE_STYLE_COMPARISONS.has(op)) {
    if (typeof value.path !== "string" || value.path === "") {
      problems.push(`'${path}.path' is ${JSON.stringify(value.path)}, not a non-empty string`);
      return void 0;
    }
    if (typeof value.value !== "string" && typeof value.value !== "number") {
      problems.push(`'${path}.value' is ${JSON.stringify(value.value)}, not a string or number`);
      return void 0;
    }
    return { op, path: value.path, value: value.value };
  }
  if (op === "and" || op === "or") {
    if (!Array.isArray(value.terms) || value.terms.length === 0) {
      problems.push(`'${path}.terms' is ${shapeOf2(value.terms)}, not a non-empty array`);
      return void 0;
    }
    const terms = [];
    for (const [index, term] of value.terms.entries()) {
      const read = readTitleStylePredicate(term, `${path}.terms[${index}]`, problems);
      if (read === void 0) return void 0;
      terms.push(read);
    }
    return { op, terms };
  }
  if (op === "not") {
    const term = readTitleStylePredicate(value.term, `${path}.term`, problems);
    return term === void 0 ? void 0 : { op: "not", term };
  }
  problems.push(
    `'${path}.op' is ${JSON.stringify(op)}, which this reader cannot evaluate \u2014 the whole title style table stays unknown rather than skipping the row, because first-match-wins means a skipped row silently promotes every row after it`
  );
  return void 0;
}
function readRenderTitleStyle(value, problems) {
  const path = `${RESOLUTION_TABLE_KEY}.renderTitleStyle`;
  if (!isPlainObject3(value)) {
    problems.push(`'${path}' is ${shapeOf2(value)}, not an object \u2014 the title wrap stays unknown`);
    return void 0;
  }
  const readStyles = (raw, where) => {
    if (!Array.isArray(raw) || !raw.every((x) => typeof x === "string" && x !== "")) {
      problems.push(`'${where}' is ${shapeOf2(raw)}, not an array of non-empty strings`);
      return void 0;
    }
    return raw;
  };
  const fallback = readStyles(value.fallback, `${path}.fallback`);
  if (fallback === void 0) return void 0;
  if (!Array.isArray(value.rows)) {
    problems.push(`'${path}.rows' is ${shapeOf2(value.rows)}, not an array`);
    return void 0;
  }
  const rows = [];
  for (const [index, row] of value.rows.entries()) {
    if (!isPlainObject3(row)) {
      problems.push(`'${path}.rows[${index}]' is ${shapeOf2(row)}, not an object`);
      return void 0;
    }
    const when = readTitleStylePredicate(row.when, `${path}.rows[${index}].when`, problems);
    if (when === void 0) return void 0;
    const then = readStyles(row.then, `${path}.rows[${index}].then`);
    if (then === void 0) return void 0;
    rows.push({ when, then });
  }
  return { rows, fallback };
}
function readSectionPresentation(value, problems) {
  const path = `${RESOLUTION_TABLE_KEY}.sectionPresentation`;
  if (!isPlainObject3(value)) {
    problems.push(`'${path}' is ${shapeOf2(value)}, not an object \u2014 how any heading renders stays unknown`);
    return void 0;
  }
  const out = {};
  for (const [viewId, sections] of Object.entries(value)) {
    if (!isPlainObject3(sections)) {
      problems.push(`'${path}.${viewId}' is ${shapeOf2(sections)}, not an object`);
      return void 0;
    }
    const read = {};
    for (const [sectionId, entry] of Object.entries(sections)) {
      if (!isPlainObject3(entry)) {
        problems.push(`'${path}.${viewId}.${sectionId}' is ${shapeOf2(entry)}, not an object`);
        return void 0;
      }
      const at = `${path}.${viewId}.${sectionId}`;
      for (const key of ["name", "headerValue", "containerNode", "emptyChildrenPlaceholder"]) {
        const v = entry[key];
        if (v !== void 0 && (typeof v !== "string" || v === "")) {
          problems.push(`'${at}.${key}' is ${JSON.stringify(v)}, not a non-empty string`);
          return void 0;
        }
      }
      if (entry.bodyPolicy !== void 0 && entry.bodyPolicy !== "full_body" && entry.bodyPolicy !== "header_only") {
        problems.push(
          `'${at}.bodyPolicy' is ${JSON.stringify(entry.bodyPolicy)}, not "full_body" or "header_only" \u2014 whether this section renders its members at all stays unknown`
        );
        return void 0;
      }
      const kept = {};
      for (const key of ["name", "headerValue", "bodyPolicy", "containerNode", "emptyChildrenPlaceholder"]) {
        const v = entry[key];
        if (v !== void 0) kept[key] = v;
      }
      read[sectionId] = kept;
    }
    out[viewId] = read;
  }
  return out;
}
function readRenderCheckboxSource(value, problems, key = "renderCheckboxSource") {
  if (value !== "engine-literal") {
    problems.push(
      `'${RESOLUTION_TABLE_KEY}.${key}' is ${JSON.stringify(value)}, not "engine-literal" \u2014 the checkbox contract is engine source with no operator override surface, so any other answer means this declaration was produced by something else`
    );
    return void 0;
  }
  return "engine-literal";
}
function readRenderShapes(value, problems) {
  if (!isPlainObject3(value)) {
    problems.push(
      `'${RESOLUTION_TABLE_KEY}.renderShapes' is ${shapeOf2(value)}, not an object \u2014 whether a section keeps its heading line stays unknown`
    );
    return void 0;
  }
  const out = {};
  for (const [nodeType, shape] of Object.entries(value)) {
    if (typeof shape !== "string" || shape === "") {
      problems.push(
        `'${RESOLUTION_TABLE_KEY}.renderShapes.${nodeType}' is ${JSON.stringify(shape)}, not a non-empty string`
      );
      return void 0;
    }
    out[nodeType] = shape;
  }
  return out;
}
function readChromeShapes(value, problems) {
  if (!isPlainObject3(value)) {
    problems.push(
      `'${RESOLUTION_TABLE_KEY}.chromeShapes' is ${shapeOf2(value)}, not an object \u2014 every node type's chrome shape stays unknown`
    );
    return {};
  }
  const out = {};
  for (const [nodeType, shape] of Object.entries(value)) {
    if (!CHROME_SHAPES.includes(shape)) {
      problems.push(
        `'${RESOLUTION_TABLE_KEY}.chromeShapes.${nodeType}' is ${JSON.stringify(shape)}, not one of ${CHROME_SHAPES.join(", ")} \u2014 this node type's chrome shape stays unknown`
      );
      continue;
    }
    out[nodeType] = shape;
  }
  return out;
}
function readDefaultOrdering(value, problems) {
  const path = `${RESOLUTION_TABLE_KEY}.defaultOrdering`;
  if (!Array.isArray(value) || value.length === 0) {
    problems.push(`'${path}' is ${shapeOf2(value)}, not a non-empty array \u2014 the engine default stays unknown`);
    return [];
  }
  const keys = [];
  for (const [i, entry] of value.entries()) {
    const read = readOrderingKey(`${path}[${i}]`, entry, problems);
    if (read === void 0) return [];
    keys.push(read);
  }
  return keys;
}
function readDefaultOrderingSource(value, problems) {
  if (!DEFAULT_ORDERING_SOURCES.includes(value)) {
    problems.push(
      `'${RESOLUTION_TABLE_KEY}.defaultOrderingSource' is ${JSON.stringify(value)}, not one of ${DEFAULT_ORDERING_SOURCES.join(", ")} \u2014 which answer defaultOrdering/priorityRank are stays unknown`
    );
    return void 0;
  }
  return value;
}
function readPriorityRank(value, problems) {
  const path = `${RESOLUTION_TABLE_KEY}.priorityRank`;
  if (!isPlainObject3(value)) {
    problems.push(`'${path}' is ${shapeOf2(value)}, not an object \u2014 the priority rank stays unknown`);
    return {};
  }
  const out = {};
  for (const [name, rank2] of Object.entries(value)) {
    if (typeof rank2 !== "number" || !Number.isInteger(rank2) || rank2 < 1) {
      problems.push(`'${path}.${name}' is ${JSON.stringify(rank2)}, not a positive integer`);
      return {};
    }
    out[name] = rank2;
  }
  return out;
}
function readCellClassOrder(path, value, problems) {
  if (!Array.isArray(value) || value.length === 0) {
    problems.push(`'${path}' is ${shapeOf2(value)}, not a non-empty array \u2014 this order stays unknown`);
    return void 0;
  }
  const out = [];
  for (const [i, entry] of value.entries()) {
    if (!COMPOSITION_CELL_CLASSES.includes(entry)) {
      problems.push(
        `'${path}[${i}]' is ${JSON.stringify(entry)}, not one of ${COMPOSITION_CELL_CLASSES.join(", ")}`
      );
      return void 0;
    }
    out.push(entry);
  }
  return out;
}
function readComposition(value, problems) {
  const path = `${RESOLUTION_TABLE_KEY}.composition`;
  if (!isPlainObject3(value)) {
    problems.push(`'${path}' is ${shapeOf2(value)}, not an object \u2014 composition stays unknown`);
    return void 0;
  }
  for (const key of Object.keys(value)) {
    if (!COMPOSITION_KEYS.includes(key)) {
      problems.push(`'${path}.${key}' is not a recognised key \u2014 the keys are ${COMPOSITION_KEYS.join(", ")}`);
    }
  }
  const { heads, tail, separator, bullet, titleStyles } = value;
  if (!isPlainObject3(heads)) {
    problems.push(`'${path}.heads' is ${shapeOf2(heads)}, not an object`);
    return void 0;
  }
  const readHeads = {};
  for (const shape of CHROME_SHAPES) {
    if (!(shape in heads)) {
      problems.push(`'${path}.heads.${shape}' is missing \u2014 every seedable shape needs a declared head`);
      return void 0;
    }
    const read = readCellClassOrder(`${path}.heads.${shape}`, heads[shape], problems);
    if (read === void 0) return void 0;
    readHeads[shape] = read;
  }
  for (const key of Object.keys(heads)) {
    if (!CHROME_SHAPES.includes(key)) {
      problems.push(`'${path}.heads.${key}' is not a recognised shape \u2014 the shapes are ${CHROME_SHAPES.join(", ")}`);
    }
  }
  const readTail = readCellClassOrder(`${path}.tail`, tail, problems);
  if (readTail === void 0) return void 0;
  if (typeof separator !== "string" || separator === "") {
    problems.push(`'${path}.separator' is ${JSON.stringify(separator)}, not a non-empty string`);
    return void 0;
  }
  if (!COMPOSITION_BULLET_CHARS.includes(bullet)) {
    problems.push(
      `'${path}.bullet' is ${JSON.stringify(bullet)}, not one of ${COMPOSITION_BULLET_CHARS.join(", ")}`
    );
    return void 0;
  }
  if (!Array.isArray(titleStyles) || !titleStyles.every((s) => typeof s === "string")) {
    problems.push(`'${path}.titleStyles' is ${shapeOf2(titleStyles)}, not an array of strings`);
    return void 0;
  }
  for (const [i, style] of titleStyles.entries()) {
    if (!COMPOSITION_TITLE_STYLES.includes(style)) {
      problems.push(
        `'${path}.titleStyles[${i}]' is ${JSON.stringify(style)}, not one of ${COMPOSITION_TITLE_STYLES.join(", ")}`
      );
      return void 0;
    }
  }
  return {
    heads: readHeads,
    tail: readTail,
    separator,
    bullet,
    titleStyles
  };
}
function readViewComposition(value, problems) {
  if (!isPlainObject3(value)) {
    problems.push(
      `'viewComposition' is ${shapeOf2(value)}, not an object \u2014 no view can spell its own lines`
    );
    return {};
  }
  const out = {};
  for (const [viewId, entry] of Object.entries(value)) {
    if (!isPlainObject3(entry)) {
      problems.push(
        `'viewComposition.${viewId}' is ${shapeOf2(entry)}, not an object \u2014 this view falls back to the global composition`
      );
      continue;
    }
    const { formSource, ...rest } = entry;
    const composition = readComposition(rest, problems);
    if (composition === void 0) {
      problems.push(`'viewComposition.${viewId}' did not read as a composition \u2014 falling back`);
      continue;
    }
    if (formSource !== "config" && formSource !== "engine-fallback") {
      problems.push(
        `'viewComposition.${viewId}.formSource' is ${JSON.stringify(formSource)}, not "config" or "engine-fallback" \u2014 this view falls back to the global composition`
      );
      continue;
    }
    out[viewId] = { ...composition, formSource };
  }
  return out;
}
function compositionFor(resolution, viewId) {
  if (resolution === void 0) return void 0;
  const own = resolution.viewComposition[viewId];
  if (own !== void 0) {
    const { formSource: _formSource, ...composition } = own;
    return { composition, source: "view" };
  }
  if (resolution.composition === void 0) return void 0;
  return {
    composition: resolution.composition,
    source: resolution.compositionSource ?? "engine-fallback"
  };
}
function readCompositionSource(value, problems, key) {
  if (!COMPOSITION_SOURCES.includes(value)) {
    problems.push(
      `'${RESOLUTION_TABLE_KEY}.${key}' is ${JSON.stringify(value)}, not one of ${COMPOSITION_SOURCES.join(", ")} \u2014 which answer composition is stays unknown`
    );
    return void 0;
  }
  return value;
}
function readTagOrder(value, problems, key = "tagOrder") {
  const path = `${RESOLUTION_TABLE_KEY}.${key}`;
  if (!isPlainObject3(value)) {
    problems.push(`'${path}' is ${shapeOf2(value)}, not an object \u2014 tag order stays unknown`);
    return void 0;
  }
  for (const key2 of Object.keys(value)) {
    if (!TAG_ORDER_KEYS.includes(key2)) {
      problems.push(`'${path}.${key2}' is not a recognised key \u2014 the keys are ${TAG_ORDER_KEYS.join(", ")}`);
    }
  }
  const { canonicalOrder, unrankedPolicy } = value;
  if (!Array.isArray(canonicalOrder) || canonicalOrder.length === 0 || !canonicalOrder.every((t) => typeof t === "string")) {
    problems.push(`'${path}.canonicalOrder' is ${shapeOf2(canonicalOrder)}, not a non-empty array of strings`);
    return void 0;
  }
  if (!TAG_ORDER_UNRANKED_POLICIES.includes(unrankedPolicy)) {
    problems.push(
      `'${path}.unrankedPolicy' is ${JSON.stringify(unrankedPolicy)}, not one of ${TAG_ORDER_UNRANKED_POLICIES.join(", ")}`
    );
    return void 0;
  }
  return {
    canonicalOrder,
    unrankedPolicy
  };
}
function readTagOrderSource(value, problems, key = "tagOrderSource") {
  if (!TAG_ORDER_SOURCES.includes(value)) {
    problems.push(
      `'${RESOLUTION_TABLE_KEY}.${key}' is ${JSON.stringify(value)}, not one of ${TAG_ORDER_SOURCES.join(", ")} \u2014 which answer that order is stays unknown`
    );
    return void 0;
  }
  return value;
}
function readConfigResolutionDeclaration(document2) {
  if (!isPlainObject3(document2)) {
    return { resolution: void 0, problems: [] };
  }
  if (!(RESOLUTION_TABLE_KEY in document2)) {
    return { resolution: void 0, problems: [] };
  }
  const raw = document2[RESOLUTION_TABLE_KEY];
  const problems = [];
  if (!isPlainObject3(raw)) {
    problems.push(
      `'${RESOLUTION_TABLE_KEY}' is ${shapeOf2(raw)}, not an object \u2014 the whole resolution table stays unknown`
    );
    return { resolution: void 0, problems };
  }
  for (const key of Object.keys(raw)) {
    if (!TOP_KEYS2.includes(key)) {
      problems.push(
        `'${RESOLUTION_TABLE_KEY}.${key}' is not a recognised key and was NOT applied \u2014 the keys are ${TOP_KEYS2.join(", ")}`
      );
    }
  }
  const dayBoundary = "dayBoundary" in raw ? readDayBoundary(raw.dayBoundary, problems) : void 0;
  if (dayBoundary === void 0) {
    if (!("dayBoundary" in raw)) {
      problems.push(
        `'${RESOLUTION_TABLE_KEY}' declares no 'dayBoundary' \u2014 the whole resolution table is NOT applied, because a table without a day boundary is a table this app cannot resolve a date against. Ordering, promotion and new-line seeding stay silent until one is declared.`
      );
    }
    return { resolution: void 0, problems };
  }
  return {
    resolution: {
      registration: "registration" in raw ? readRegistration(raw.registration, problems) : void 0,
      lineGrammars: "lineGrammars" in raw ? readLineGrammars(raw.lineGrammars, problems) : {},
      ordering: "ordering" in raw ? readOrdering(raw.ordering, problems) : {},
      orderingFields: "orderingFields" in raw ? readOrderingFieldMarkers(raw.orderingFields, problems) : {},
      dayBoundary,
      chromeShapes: "chromeShapes" in raw ? readChromeShapes(raw.chromeShapes, problems) : {},
      renderShapes: "renderShapes" in raw ? readRenderShapes(raw.renderShapes, problems) : void 0,
      sectionRegistration: "sectionRegistration" in raw ? readSectionRegistration(raw.sectionRegistration, problems) : {},
      defaultOrdering: "defaultOrdering" in raw ? readDefaultOrdering(raw.defaultOrdering, problems) : [],
      defaultOrderingSource: "defaultOrderingSource" in raw ? readDefaultOrderingSource(raw.defaultOrderingSource, problems) : void 0,
      priorityRank: "priorityRank" in raw ? readPriorityRank(raw.priorityRank, problems) : {},
      composition: "composition" in raw ? readComposition(raw.composition, problems) : void 0,
      viewComposition: "viewComposition" in raw ? readViewComposition(raw.viewComposition, problems) : {},
      compositionSource: "compositionSource" in raw ? readCompositionSource(raw.compositionSource, problems, "compositionSource") : void 0,
      // REUSES `readCompositionSource` — the two flags have the same two legal values and the same
      // meaning, over different halves of one block. A second reader would be the same rule
      // written twice, which is the shape that lets them drift apart.
      compositionFormSource: "compositionFormSource" in raw ? readCompositionSource(raw.compositionFormSource, problems, "compositionFormSource") : void 0,
      spelling: "spelling" in raw ? readSpelling(raw.spelling, problems) : void 0,
      renderCheckbox: "renderCheckbox" in raw ? readRenderCheckbox(raw.renderCheckbox, problems) : void 0,
      // `"engine-literal"` is the ONLY legal value — unlike composition's two-state config /
      // engine-fallback, this contract lives in the engine's own source and has no operator
      // override surface, so there is no second answer for a reader to distinguish. Published
      // anyway, and validated, so the KIND of fact is stated rather than assumed.
      renderCheckboxSource: "renderCheckboxSource" in raw ? readRenderCheckboxSource(raw.renderCheckboxSource, problems) : void 0,
      renderTitleStyle: "renderTitleStyle" in raw ? readRenderTitleStyle(raw.renderTitleStyle, problems) : void 0,
      renderTitleStyleSource: "renderTitleStyleSource" in raw ? readRenderCheckboxSource(raw.renderTitleStyleSource, problems, "renderTitleStyleSource") : void 0,
      identityModes: "identityModes" in raw ? readIdentityModes(raw.identityModes, problems) : void 0,
      continuationFields: "continuationFields" in raw ? readContinuationFields(raw.continuationFields, problems) : void 0,
      sectionPresentation: "sectionPresentation" in raw ? readSectionPresentation(raw.sectionPresentation, problems) : void 0,
      // REUSES `readTagOrder`/`readTagOrderSource` — three canonical orders, one shape, one reader.
      // Three copies of the same validation is how three orders drift into three dialects.
      markerOrder: "markerOrder" in raw ? readTagOrder(raw.markerOrder, problems, "markerOrder") : void 0,
      markerOrderSource: "markerOrderSource" in raw ? readTagOrderSource(raw.markerOrderSource, problems, "markerOrderSource") : void 0,
      edgeTagOrder: "edgeTagOrder" in raw ? readTagOrder(raw.edgeTagOrder, problems, "edgeTagOrder") : void 0,
      edgeTagOrderSource: "edgeTagOrderSource" in raw ? readTagOrderSource(raw.edgeTagOrderSource, problems, "edgeTagOrderSource") : void 0,
      tagOrder: "tagOrder" in raw ? readTagOrder(raw.tagOrder, problems) : void 0,
      tagOrderSource: "tagOrderSource" in raw ? readTagOrderSource(raw.tagOrderSource, problems) : void 0,
      dropped: "dropped" in raw ? readDropped2(raw.dropped, problems) : {}
    },
    problems
  };
}

// app/present/indent.ts
var INDENT_UNIT = 4;
var LEADING_WHITESPACE = /^\s*/;
function indentedLine(line, direction, count, unit = INDENT_UNIT) {
  const shape = classifyLine(line);
  if (shape.kind === "blank" || shape.kind === "heading") {
    return line;
  }
  const match = LEADING_WHITESPACE.exec(line);
  const currentLength = match?.[0].length ?? 0;
  const rest = line.slice(currentLength);
  const units = direction === "in" ? Math.floor(currentLength / unit) + count : Math.max(0, Math.ceil(currentLength / unit) - count);
  return " ".repeat(units * unit) + rest;
}

// app/present/express/declaration.ts
var NOTE = "note";
var RULES_KEY = "rules";
var LANDING_VIEW_KEY = "landingView";
var INDENT_UNIT_KEY = "indentUnit";
var DEFAULT_INDENT_UNIT = INDENT_UNIT;
var RENDITIONS = ["raw", "wired"];
function isRendition(value) {
  return typeof value === "string" && RENDITIONS.includes(value);
}
function readDeclaration(document2) {
  const problems = [];
  if (typeof document2 !== "object" || document2 === null || Array.isArray(document2)) {
    return {
      contribution: {},
      indentUnit: DEFAULT_INDENT_UNIT,
      landingView: void 0,
      problems: [
        `the declaration is ${Array.isArray(document2) ? "an array" : typeof document2}, not an object \u2014 every key stays silent and every line falls through to the default`
      ]
    };
  }
  const entries = Object.entries(document2);
  const contribution = {};
  let indentUnit = DEFAULT_INDENT_UNIT;
  let landingView;
  for (const [key, value] of entries) {
    if (key === NOTE) {
      if (typeof value !== "string") {
        problems.push(`'${NOTE}' is ${typeof value}, not a string \u2014 it is prose, not a key`);
      }
      continue;
    }
    if (key === STRUCTURAL_KEY) {
      continue;
    }
    if (key === QUALIFICATION_KEY) {
      continue;
    }
    if (key === RESOLUTION_TABLE_KEY) {
      continue;
    }
    if (key === RULES_KEY) {
      continue;
    }
    if (key === "client") {
      continue;
    }
    if (key === INDENT_UNIT_KEY) {
      if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
        problems.push(
          `'${INDENT_UNIT_KEY}' is ${JSON.stringify(value)}, which is not a positive whole number of spaces \u2014 the built-in default (${DEFAULT_INDENT_UNIT}) is used instead`
        );
      } else {
        indentUnit = value;
      }
      continue;
    }
    if (key === LANDING_VIEW_KEY) {
      if (typeof value !== "string" || value === "") {
        problems.push(
          `'${LANDING_VIEW_KEY}' is ${JSON.stringify(value)}, which is not a non-empty view id \u2014 no landing view is adopted from this document`
        );
      } else {
        landingView = value;
      }
      continue;
    }
    if (!RESOLUTION_KEYS.includes(key)) {
      problems.push(
        `'${key}' is not a resolution key and was NOT applied \u2014 the keys are ${RESOLUTION_KEYS.join(", ")}`
      );
      continue;
    }
    if (!isRendition(value)) {
      problems.push(
        `'${key}' is ${JSON.stringify(value)}, which is not a rendition \u2014 it stays silent, so the key falls through to the default. The renditions are ${RENDITIONS.join(", ")}`
      );
      continue;
    }
    contribution[key] = value;
  }
  return { contribution, indentUnit, landingView, problems };
}

// app/present/address.ts
function sectionOrdinalAt(source, lineIndex) {
  const lines = source.split("\n");
  if (!Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex >= lines.length) {
    return null;
  }
  let ordinal = null;
  for (let at = 0; at <= lineIndex; at += 1) {
    if (classifyLine(lines[at] ?? "").kind === "heading") {
      ordinal = ordinal === null ? 0 : ordinal + 1;
    }
  }
  return ordinal;
}
function sectionAt(source, lineIndex, view, sectionOrder) {
  const ordinal = sectionOrdinalAt(source, lineIndex);
  if (ordinal === null) {
    return null;
  }
  const order = sectionOrder[view];
  if (order === void 0) {
    return null;
  }
  return order[ordinal] ?? null;
}
function sectionForInsertAt(source, lineIndex, view, sectionOrder) {
  return sectionAt(source, lineIndex - 1, view, sectionOrder);
}
function sectionOrderFor(view, declared) {
  if (!Array.isArray(view.sections)) {
    return declared;
  }
  return { ...declared, [view.id]: view.sections };
}

// app/present/express/composition.ts
function readCell(cellClass, cells) {
  const value = cells[cellClass];
  if (value === void 0 || value === "") {
    return [];
  }
  if (Array.isArray(value)) {
    return value.filter((v) => typeof v === "string" && v !== "");
  }
  return typeof value === "string" ? [value] : [];
}
function indentFor(depth) {
  return "    ".repeat(Math.max(0, Math.trunc(depth)));
}
function applyTitleStyles(text, titleStyles) {
  let styled = text;
  if (titleStyles.includes("italic")) styled = `*${styled}*`;
  if (titleStyles.includes("bold")) styled = `**${styled}**`;
  if (titleStyles.includes("strikethrough")) styled = `~~${styled}~~`;
  return styled;
}
function composeLine(shape, cells, composition, depth = 0) {
  const order = [...composition.heads[shape], ...composition.tail];
  const parts = [];
  for (const cellClass of order) {
    if (cellClass === "title") {
      if (cells.title !== "") {
        parts.push(applyTitleStyles(cells.title, composition.titleStyles));
      }
      continue;
    }
    parts.push(...readCell(cellClass, cells));
  }
  return `${indentFor(depth)}${composition.bullet} ${parts.join(composition.separator)}`;
}
var TITLE_SLOT = String.fromCharCode(0);
function composeSeed(shape, known, composition, depth = 0) {
  const order = [...composition.heads[shape], ...composition.tail];
  const parts = [];
  for (const cellClass of order) {
    if (cellClass === "title") {
      parts.push(applyTitleStyles(TITLE_SLOT, composition.titleStyles));
      continue;
    }
    parts.push(...readCell(cellClass, known));
  }
  const joined = parts.join(composition.separator);
  const prefix = `${indentFor(depth)}${composition.bullet} `;
  const slotIndex = joined.indexOf(TITLE_SLOT);
  if (slotIndex === -1) {
    return { text: `${prefix}${joined}`, cursorOffset: (prefix + joined).length };
  }
  const bare = joined.slice(0, slotIndex) + joined.slice(slotIndex + 1);
  return { text: `${prefix}${bare}`, cursorOffset: prefix.length + slotIndex };
}

// app/present/select/membership.ts
var RESOLVABLE_FIELDS = ["asserted_state", "blocked_state", "cadence", "cap_state", "change_type", "class_state", "domain", "genre", "god_box", "instantiate", "layer", "lead_state", "node_type", "package_state", "principle_state", "priority", "program_role", "recheck", "reviewed", "status", "tier", "title"];
var abstains = (because) => ({ kind: "abstains", because });
function titleCaseFromId(id) {
  return id.split("-").filter((part) => part.length > 0).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
var CHECKBOX = /^\s*- (\[[^\]]\]) (.*)$/;
var CYCLE_EXPRESSION_PARTS = /^\$(cycle_today|cycle_week_end)(?:\s*([+-])\s*(\d+)\s*d)?$/;
var MS_PER_DAY = 864e5;
function resolveCycleExpression(raw, today) {
  const match = CYCLE_EXPRESSION_PARTS.exec(raw);
  if (match === null) {
    throw new Error(`resolveCycleExpression: '${raw}' is not a recognised cycle expression`);
  }
  const [, variable, operator, daysText] = match;
  const base = variable === "cycle_today" ? today.logicalDate : today.weekEnd;
  if (operator === void 0 || daysText === void 0) return base;
  const [y, m, d] = base.split("-").map(Number);
  const baseMs = Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1);
  const offsetMs = Number(daysText) * MS_PER_DAY;
  const shifted = new Date(operator === "+" ? baseMs + offsetMs : baseMs - offsetMs);
  const pad22 = (n) => String(n).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${pad22(shifted.getUTCMonth() + 1)}-${pad22(shifted.getUTCDate())}`;
}
function resolveOperand(value, today) {
  if (!isCycleExpression(value)) return value;
  if (today === void 0) {
    throw new Error(
      "evaluatePredicate: this predicate compares a field against a cycle expression ($cycle_today/$cycle_week_end) \u2014 it needs 'today' (app/present/today.ts's TodayAnswer), which this call did not supply. The caller must check qualifierNeedsClock() and abstain, or supply today, never call this function on a clock-bound qualifier without it."
    );
  }
  return resolveCycleExpression(value, today);
}
function applyComparison(operator, cmp) {
  if (operator === "gt") return cmp > 0;
  if (operator === "gte") return cmp >= 0;
  if (operator === "lt") return cmp < 0;
  if (operator === "lte") return cmp <= 0;
  return false;
}
function compareOrdered(actual, operator, expected) {
  if (typeof actual === "string" && typeof expected === "string") {
    return applyComparison(operator, actual < expected ? -1 : actual > expected ? 1 : 0);
  }
  if (typeof actual === "number" && typeof expected === "number") {
    return applyComparison(operator, actual < expected ? -1 : actual > expected ? 1 : 0);
  }
  return false;
}
function evaluatePredicate(actual, predicate, today) {
  if ("not" in predicate) return !evaluatePredicate(actual, predicate.not, today);
  if ("eq" in predicate) return actual === resolveOperand(predicate.eq, today);
  for (const operator of COMPARISON_OPERATORS) {
    const rawExpected = predicate[operator];
    if (rawExpected === void 0) continue;
    const expected = resolveOperand(rawExpected, today);
    if (!compareOrdered(actual, operator, expected)) return false;
  }
  return true;
}
function matchesFindClause(fields, clause, today) {
  if (clause.nodeType !== null) {
    const nodeType = fields["node_type"];
    if (typeof nodeType !== "string" || !clause.nodeType.includes(nodeType)) return false;
  }
  for (const [field, predicate] of Object.entries(clause.fields)) {
    if (!evaluatePredicate(fields[field] ?? null, predicate, today)) return false;
  }
  return true;
}
function matchesQualifier(fields, qualifier, today) {
  if (qualifierNeedsGraph(qualifier)) {
    throw new Error(
      "matchesQualifier: this qualifier carries edgeSteps (a one-hop children:/parents: traversal) \u2014 it ranges over a NEIGHBOUR node's fields, which this function does not have. The caller must check qualifierNeedsGraph() and abstain, never call this function to decide."
    );
  }
  if (qualifierNeedsClock(qualifier) && today === void 0) {
    throw new Error(
      "matchesQualifier: this qualifier compares a field against a cycle expression ($cycle_today/$cycle_week_end) and no 'today' was supplied. The caller must check qualifierNeedsClock() and abstain, or supply today, never call this function blind."
    );
  }
  if (!matchesFindClause(fields, qualifier.find, today)) return false;
  return !qualifier.exclude.some((clause) => matchesFindClause(fields, clause, today));
}
var EXTRACTION_SHAPE = {
  date: /^\d{4}-\d{2}-\d{2}$/,
  int: /^-?\d+$/,
  float: /^-?\d+(?:\.\d+)?$/
};
function extractionValue(line, marker) {
  const at = line.indexOf(marker.token);
  if (at === -1) return void 0;
  const after = line.slice(at + marker.token.length);
  const match = /^\s+(\S+)/.exec(after);
  if (match === null) return void 0;
  const token = match[1] ?? "";
  return EXTRACTION_SHAPE[marker.kind].test(token) ? token : void 0;
}
function resolveLineFields(line, section, language) {
  if (qntmIdSpans(line).length > 0) return "already-a-node";
  const match = CHECKBOX.exec(line);
  if (match === null) return "not-a-declared-checkbox";
  const box = match[1] ?? "";
  const tail = match[2] ?? "";
  const status = language.tokens["status"]?.[box];
  if (status === void 0) return "not-a-declared-checkbox";
  if (!carriesContent(line)) return "no-content";
  const fields = { node_type: section.nodeType, domain: null };
  for (const [field, value] of Object.entries(section.defaults ?? {})) fields[field] = value;
  fields["status"] = status;
  const seen = /* @__PURE__ */ new Set();
  for (const span of tagSpans(tail)) {
    for (const field of RESOLVABLE_FIELDS) {
      const value = language.tokens[field]?.[span.text];
      if (value === void 0) continue;
      if (seen.has(field)) return "ambiguous-token";
      seen.add(field);
      fields[field] = value;
    }
  }
  for (const [field, marker] of Object.entries(language.extractionFields)) {
    const raw = extractionValue(tail, marker);
    if (raw === void 0) continue;
    fields[field] = marker.kind === "date" ? raw : Number(raw);
  }
  return fields;
}
function membershipFor(viewId, sectionId, line, language, today) {
  const section = language.sections[viewId]?.[sectionId];
  if (section === void 0) return abstains("no-section-declaration");
  const qualifier = language.predicates[section.qualification];
  if (qualifier === void 0) return abstains("no-section-declaration");
  if (qualifierNeedsGraph(qualifier)) return abstains("needs-graph-traversal");
  if (qualifierNeedsClock(qualifier) && today === void 0) return abstains("needs-clock");
  const fields = resolveLineFields(line, section, language);
  if (typeof fields === "string") return abstains(fields);
  return {
    kind: "answer",
    answer: {
      belongs: matchesQualifier(fields, qualifier, today),
      view: viewId,
      section: sectionId,
      qualification: section.qualification,
      fields,
      sectionName: section.name ?? titleCaseFromId(sectionId)
    }
  };
}

// app/present/rules.ts
var RULES_KEY2 = "rules";
var EMPTY3 = {
  orderEstablished: false,
  order: [],
  rules: {},
  patterns: {},
  fieldMarkers: {},
  dropped: {}
};
function isPlainObject4(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
var shapeOf3 = (value) => Array.isArray(value) ? "an array" : typeof value;
function isFieldValue2(value) {
  return value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}
function readWhen(path, value, problems) {
  if (!isPlainObject4(value)) {
    problems.push(`'${path}' is ${shapeOf3(value)}, not an object`);
    return void 0;
  }
  const op = value.op;
  if (op === "true") return { op: "true" };
  if (op === "null" || op === "eq") {
    if (typeof value.field !== "string" || value.field === "") {
      problems.push(`'${path}.field' is ${JSON.stringify(value.field)}, not a field name`);
      return void 0;
    }
    if (op === "null") return { op: "null", field: value.field };
    if (!isFieldValue2(value.value)) {
      problems.push(`'${path}.value' is ${shapeOf3(value.value)}, not a scalar or null`);
      return void 0;
    }
    return { op: "eq", field: value.field, value: value.value };
  }
  if (op === "not") {
    const inner = readWhen(`${path}.of`, value.of, problems);
    return inner === void 0 ? void 0 : { op: "not", of: inner };
  }
  problems.push(`'${path}.op' is ${JSON.stringify(op)}, not one of true, null, eq, not`);
  return void 0;
}
function readActionSpec(path, value, problems) {
  if (!isPlainObject4(value)) {
    problems.push(`'${path}' is ${shapeOf3(value)}, not an object`);
    return void 0;
  }
  if (value.verb === "retype") {
    if (typeof value.to !== "string" || value.to === "") {
      problems.push(`'${path}.to' is ${JSON.stringify(value.to)}, not a node type`);
      return void 0;
    }
    return { verb: "retype", to: value.to };
  }
  if (value.verb === "set") {
    if (typeof value.field !== "string" || value.field === "") {
      problems.push(`'${path}.field' is ${JSON.stringify(value.field)}, not a field name`);
      return void 0;
    }
    if (!isFieldValue2(value.to)) {
      problems.push(`'${path}.to' is ${shapeOf3(value.to)}, not a scalar or null`);
      return void 0;
    }
    return { verb: "set", field: value.field, to: value.to };
  }
  if (value.verb === "unset") {
    if (typeof value.field !== "string" || value.field === "") {
      problems.push(`'${path}.field' is ${JSON.stringify(value.field)}, not a field name`);
      return void 0;
    }
    return { verb: "unset", field: value.field };
  }
  problems.push(`'${path}.verb' is ${JSON.stringify(value.verb)}, not retype, set or unset`);
  return void 0;
}
function readRuleSpec(path, value, problems) {
  if (!isPlainObject4(value)) {
    problems.push(`'${path}' is ${shapeOf3(value)}, not an object`);
    return void 0;
  }
  if (typeof value.pattern !== "string" || value.pattern === "") {
    problems.push(`'${path}.pattern' is ${JSON.stringify(value.pattern)}, not a pattern name`);
    return void 0;
  }
  const when = readWhen(`${path}.when`, value.when, problems);
  if (when === void 0) return void 0;
  if (typeof value.priority !== "number" || !Number.isInteger(value.priority)) {
    problems.push(`'${path}.priority' is ${JSON.stringify(value.priority)}, not an integer`);
    return void 0;
  }
  if (!Array.isArray(value.actions) || value.actions.length === 0) {
    problems.push(`'${path}.actions' is ${shapeOf3(value.actions)}, not a non-empty array`);
    return void 0;
  }
  const actions = [];
  for (const [i, raw] of value.actions.entries()) {
    const action = readActionSpec(`${path}.actions[${i}]`, raw, problems);
    if (action === void 0) return void 0;
    actions.push(action);
  }
  if (value.partial !== void 0 && typeof value.partial !== "boolean") {
    problems.push(`'${path}.partial' is ${shapeOf3(value.partial)}, not a boolean`);
    return void 0;
  }
  return {
    pattern: value.pattern,
    when,
    priority: value.priority,
    actions,
    ...value.partial === true ? { partial: true } : {}
  };
}
function readFieldPredicate(path, value, problems) {
  if (!isPlainObject4(value)) {
    problems.push(`'${path}' is ${shapeOf3(value)}, not an object`);
    return void 0;
  }
  const keys = Object.keys(value);
  if (keys.length !== 1) {
    problems.push(`'${path}' carries ${keys.length} operators \u2014 exactly one of eq, not`);
    return void 0;
  }
  if (keys[0] === "eq") {
    if (!isFieldValue2(value.eq)) {
      problems.push(`'${path}.eq' is ${shapeOf3(value.eq)}, not a scalar or null`);
      return void 0;
    }
    return { eq: value.eq };
  }
  if (keys[0] === "not") {
    const inner = readFieldPredicate(`${path}.not`, value.not, problems);
    return inner === void 0 ? void 0 : { not: inner };
  }
  problems.push(`'${path}' uses operator '${keys[0]}' \u2014 the operators are eq, not`);
  return void 0;
}
function readFindClause2(path, value, problems) {
  if (!isPlainObject4(value)) {
    problems.push(`'${path}' is ${shapeOf3(value)}, not an object`);
    return void 0;
  }
  let nodeType = null;
  if (value.nodeType !== null && value.nodeType !== void 0) {
    if (!Array.isArray(value.nodeType) || !value.nodeType.every((t) => typeof t === "string" && t !== "")) {
      problems.push(`'${path}.nodeType' is not null and not an array of non-empty strings`);
      return void 0;
    }
    nodeType = value.nodeType;
  }
  const fields = {};
  if (value.fields !== void 0) {
    if (!isPlainObject4(value.fields)) {
      problems.push(`'${path}.fields' is ${shapeOf3(value.fields)}, not an object`);
      return void 0;
    }
    for (const [field, predicate] of Object.entries(value.fields)) {
      const read = readFieldPredicate(`${path}.fields.${field}`, predicate, problems);
      if (read === void 0) return void 0;
      fields[field] = read;
    }
  }
  return { nodeType, fields };
}
var DIRECTIONS3 = ["children", "parents"];
function readEdgeStep2(path, value, problems) {
  if (!isPlainObject4(value)) {
    problems.push(`'${path}' is ${shapeOf3(value)}, not an object`);
    return void 0;
  }
  if (typeof value.direction !== "string" || !DIRECTIONS3.includes(value.direction)) {
    problems.push(`'${path}.direction' is ${JSON.stringify(value.direction)}, not children or parents`);
    return void 0;
  }
  if (typeof value.mustExist !== "boolean") {
    problems.push(`'${path}.mustExist' is ${shapeOf3(value.mustExist)}, not a boolean`);
    return void 0;
  }
  if (!Array.isArray(value.edgeType) || value.edgeType.length === 0 || !value.edgeType.every((t) => typeof t === "string" && t !== "")) {
    problems.push(`'${path}.edgeType' is not a non-empty array of non-empty strings`);
    return void 0;
  }
  const rest = readFindClause2(path, { nodeType: value.nodeType, fields: value.fields }, problems);
  if (rest === void 0) return void 0;
  return {
    direction: value.direction,
    mustExist: value.mustExist,
    edgeType: value.edgeType,
    nodeType: rest.nodeType,
    fields: rest.fields
  };
}
function readPatterns(value, problems) {
  if (!isPlainObject4(value)) {
    problems.push(`'${RULES_KEY2}.patterns' is ${shapeOf3(value)}, not an object`);
    return {};
  }
  const out = {};
  for (const [name, raw] of Object.entries(value)) {
    const path = `${RULES_KEY2}.patterns.${name}`;
    if (!isPlainObject4(raw)) {
      problems.push(`'${path}' is ${shapeOf3(raw)}, not an object`);
      continue;
    }
    const find = readFindClause2(`${path}.find`, raw.find, problems);
    if (find === void 0) continue;
    if (raw.exclude !== void 0 && !Array.isArray(raw.exclude)) {
      problems.push(`'${path}.exclude' is ${shapeOf3(raw.exclude)}, not an array`);
      continue;
    }
    const exclude = [];
    let ok = true;
    for (const [i, clause] of (raw.exclude ?? []).entries()) {
      const read = readFindClause2(`${path}.exclude[${i}]`, clause, problems);
      if (read === void 0) {
        ok = false;
        break;
      }
      exclude.push(read);
    }
    if (!ok) continue;
    if (raw.edgeSteps !== void 0 && !Array.isArray(raw.edgeSteps)) {
      problems.push(`'${path}.edgeSteps' is ${shapeOf3(raw.edgeSteps)}, not an array`);
      continue;
    }
    const edgeSteps = [];
    let edgeOk = true;
    for (const [i, step] of (raw.edgeSteps ?? []).entries()) {
      const read = readEdgeStep2(`${path}.edgeSteps[${i}]`, step, problems);
      if (read === void 0) {
        edgeOk = false;
        break;
      }
      edgeSteps.push(read);
    }
    if (!edgeOk) continue;
    out[name] = edgeSteps.length > 0 ? { find, exclude, edgeSteps } : { find, exclude };
  }
  return out;
}
function readFieldMarkers(value, problems) {
  if (!isPlainObject4(value)) {
    problems.push(`'${RULES_KEY2}.fieldMarkers' is ${shapeOf3(value)}, not an object`);
    return {};
  }
  const out = {};
  const kinds = /* @__PURE__ */ new Set(["date", "int", "float"]);
  for (const [field, raw] of Object.entries(value)) {
    const path = `${RULES_KEY2}.fieldMarkers.${field}`;
    if (!isPlainObject4(raw) || typeof raw.token !== "string" || raw.token === "" || !kinds.has(raw.kind)) {
      problems.push(`'${path}' is not a {token, kind} marker`);
      continue;
    }
    out[field] = { token: raw.token, kind: raw.kind };
  }
  return out;
}
function readReasons2(key, value, problems) {
  if (!isPlainObject4(value)) {
    problems.push(`'${RULES_KEY2}.${key}' is ${shapeOf3(value)}, not an object`);
    return {};
  }
  const out = {};
  for (const [name, reason] of Object.entries(value)) {
    if (typeof reason !== "string") {
      problems.push(`'${RULES_KEY2}.${key}.${name}' is ${shapeOf3(reason)}, not a string`);
      continue;
    }
    out[name] = reason;
  }
  return out;
}
function readRulesDeclaration(document2) {
  if (!isPlainObject4(document2) || !(RULES_KEY2 in document2)) {
    return { rules: EMPTY3, problems: [] };
  }
  const raw = document2[RULES_KEY2];
  const problems = [];
  if (!isPlainObject4(raw)) {
    problems.push(`'${RULES_KEY2}' is ${shapeOf3(raw)}, not an object`);
    return { rules: EMPTY3, problems };
  }
  const rulesRaw = raw.rules;
  const rules = {};
  if (isPlainObject4(rulesRaw)) {
    for (const [id, entry] of Object.entries(rulesRaw)) {
      const spec = readRuleSpec(`${RULES_KEY2}.rules.${id}`, entry, problems);
      if (spec !== void 0) rules[id] = spec;
    }
  } else {
    problems.push(`'${RULES_KEY2}.rules' is ${shapeOf3(rulesRaw)}, not an object`);
  }
  let orderEstablished = false;
  let order = [];
  const orderRaw = raw.order;
  if (isPlainObject4(orderRaw) && orderRaw.established === true) {
    if (Array.isArray(orderRaw.sequence) && orderRaw.sequence.every((id) => typeof id === "string")) {
      order = orderRaw.sequence;
      orderEstablished = true;
    } else {
      problems.push(`'${RULES_KEY2}.order.sequence' is not an array of rule ids`);
    }
  } else if (isPlainObject4(orderRaw) && orderRaw.established === false) {
  } else {
    problems.push(`'${RULES_KEY2}.order' is not a recognised {established, sequence} shape`);
  }
  return {
    rules: {
      orderEstablished,
      order,
      rules,
      patterns: "patterns" in raw ? readPatterns(raw.patterns, problems) : {},
      fieldMarkers: "fieldMarkers" in raw ? readFieldMarkers(raw.fieldMarkers, problems) : {},
      dropped: "dropped" in raw ? readReasons2("dropped", raw.dropped, problems) : {}
    },
    problems
  };
}
function evaluateWhen(when, fields) {
  if (when.op === "true") return true;
  if (when.op === "null") return (fields[when.field] ?? null) === null;
  if (when.op === "eq") return (fields[when.field] ?? null) === when.value;
  return !evaluateWhen(when.of, fields);
}
function applyRuleActions(ruleId, actions, working, today) {
  let next = working;
  const effects = [];
  for (const action of actions) {
    if (action.verb === "retype") {
      next = { ...next, node_type: action.to };
      effects.push({ verb: "retype", ruleId, to: action.to });
      continue;
    }
    if (action.verb === "set") {
      const resolved = resolveRuleValue(action.to, today);
      if (resolved.kind === "unresolvable") continue;
      next = { ...next, [action.field]: resolved.value };
      effects.push({ verb: "set", ruleId, field: action.field, to: resolved.value });
      continue;
    }
    next = { ...next, [action.field]: null };
    effects.push({ verb: "unset", ruleId, field: action.field });
  }
  return { working: next, effects };
}
function applyRules(fields, language, today) {
  let working = { ...fields };
  const applied = [];
  const partial = [];
  const undecidable = [];
  for (const ruleId of language.order) {
    const rule = language.rules[ruleId];
    if (rule === void 0) continue;
    const qualifier = language.patterns[rule.pattern];
    if (qualifier === void 0) continue;
    if (qualifierNeedsGraph(qualifier)) {
      undecidable.push(ruleId);
      continue;
    }
    if (qualifierNeedsClock(qualifier) && today === void 0) {
      undecidable.push(ruleId);
      continue;
    }
    if (!matchesQualifier(working, qualifier, today)) continue;
    if (!evaluateWhen(rule.when, working)) continue;
    if (rule.partial === true) partial.push(ruleId);
    const { working: nextWorking, effects } = applyRuleActions(ruleId, rule.actions, working, today);
    working = nextWorking;
    applied.push(...effects);
  }
  return { fields: working, applied, partial, undecidable };
}
function resolveRuleValue(raw, today) {
  if (typeof raw !== "string" || !raw.startsWith("$")) return { kind: "value", value: raw };
  if (today === void 0) return { kind: "unresolvable" };
  if (raw === "$cycle_today") return { kind: "value", value: today.logicalDate };
  if (raw === "$cycle_week_end") return { kind: "value", value: today.weekEnd };
  return { kind: "unresolvable" };
}
function invertTokenFamily(family) {
  const out = /* @__PURE__ */ new Map();
  for (const token of Object.keys(family).sort()) {
    const value = family[token];
    if (value !== void 0 && !out.has(value)) out.set(value, token);
  }
  return out;
}
function tagFromFamily(line, family) {
  for (const span of tagSpans(line)) {
    if (Object.prototype.hasOwnProperty.call(family, span.text)) return span.text;
  }
  return void 0;
}
function tagSpanFromFamily(line, family) {
  for (const span of tagSpans(line)) {
    if (Object.prototype.hasOwnProperty.call(family, span.text)) return span;
  }
  return void 0;
}
function formatMarkerValue(value) {
  return value === null ? "" : String(value);
}
function orderTags(tags, tagOrder) {
  const index = new Map(tagOrder.canonicalOrder.map((token, i) => [token, i]));
  const ranked = tags.filter((t) => index.has(t));
  const unranked = tags.filter((t) => !index.has(t));
  ranked.sort((a, b) => (index.get(a) ?? 0) - (index.get(b) ?? 0));
  if (tagOrder.unrankedPolicy === "prepend_stable") return [...unranked, ...ranked];
  return [...ranked, ...unranked];
}
function renderRuleEffects(line, effects, nodeTypeTokens, fieldTokens, fieldMarkers, tagOrder) {
  if (effects.length === 0) return { kind: "unchanged" };
  const original = line;
  let text = line;
  const deltaParts = [];
  for (const effect of effects) {
    if (effect.verb === "retype") {
      const byValue = invertTokenFamily(nodeTypeTokens);
      const token = byValue.get(effect.to);
      if (token === void 0) return { kind: "abstains", because: "unrenderable-effect", effect };
      const existingSpan = tagSpanFromFamily(text, nodeTypeTokens);
      if (existingSpan !== void 0 && existingSpan.text === token) continue;
      const boundary = markerSpans(text)[0]?.start ?? text.length;
      const cellSpans = tagSpans(text).filter((s) => s.start < boundary);
      if (cellSpans.length === 0) {
        text = boundary === text.length ? `${text} ${token}` : `${text.slice(0, boundary)}${token} ${text.slice(boundary)}`;
        deltaParts.push(token);
        continue;
      }
      if (existingSpan !== void 0 && tagOrder === void 0) {
        text = text.slice(0, existingSpan.start) + token + text.slice(existingSpan.end);
        deltaParts.push(token);
        continue;
      }
      if (tagOrder === void 0) {
        const cellEnd2 = cellSpans[cellSpans.length - 1]?.end ?? boundary;
        text = text.slice(0, cellEnd2) + ` ${token}` + text.slice(cellEnd2);
        deltaParts.push(token);
        continue;
      }
      const cellStart = cellSpans[0]?.start ?? boundary;
      const cellEnd = cellSpans[cellSpans.length - 1]?.end ?? boundary;
      const keep = cellSpans.filter((s) => existingSpan === void 0 || s.start !== existingSpan.start).map((s) => s.text);
      const reordered = orderTags([...keep, token], tagOrder);
      text = text.slice(0, cellStart) + reordered.join(" ") + text.slice(cellEnd);
      deltaParts.push(token);
      continue;
    }
    if (effect.verb === "set") {
      const enumFamily2 = fieldTokens[effect.field];
      if (enumFamily2 !== void 0) {
        const byValue = invertTokenFamily(enumFamily2);
        const token = byValue.get(effect.to);
        if (token === void 0) return { kind: "abstains", because: "unrenderable-effect", effect };
        const existing = tagFromFamily(original, enumFamily2);
        if (existing === token) continue;
        if (existing !== void 0) return { kind: "abstains", because: "conflicting-token-present", effect };
        text += ` ${token}`;
        deltaParts.push(token);
        continue;
      }
      const marker2 = fieldMarkers[effect.field];
      if (marker2 === void 0) return { kind: "abstains", because: "unrenderable-effect", effect };
      if (original.includes(marker2.token)) {
        return { kind: "abstains", because: "conflicting-token-present", effect };
      }
      const piece = `${marker2.token} ${formatMarkerValue(effect.to)}`;
      text += ` ${piece}`;
      deltaParts.push(piece);
      continue;
    }
    const enumFamily = fieldTokens[effect.field];
    if (enumFamily !== void 0 && tagFromFamily(original, enumFamily) !== void 0) {
      return { kind: "abstains", because: "conflicting-token-present", effect };
    }
    const marker = fieldMarkers[effect.field];
    if (marker !== void 0 && original.includes(marker.token)) {
      return { kind: "abstains", because: "conflicting-token-present", effect };
    }
  }
  return deltaParts.length === 0 ? { kind: "unchanged" } : { kind: "rendered", text, delta: deltaParts.join(" ") };
}

// app/present/express/titlestyle.ts
function nodeLocalContext(node, outgoingEdgeTypes = [], incomingEdgeTypes = []) {
  const count = (types) => {
    const out = {};
    for (const type of types) out[type] = (out[type] ?? 0) + 1;
    return out;
  };
  return {
    node: {
      type: node.type,
      fields: { ...node.fields },
      edge_type_counts: count(outgoingEdgeTypes),
      incoming_edge_type_counts: count(incomingEdgeTypes)
    }
  };
}
function resolvePath(context, path) {
  const segments = path.split(".");
  let cursor = context;
  for (const [index, segment] of segments.entries()) {
    if (cursor === null || typeof cursor !== "object") return void 0;
    const parent = cursor;
    if (!(segment in parent)) {
      const container = segments.slice(0, index).join(".");
      if (container === "node.edge_type_counts" || container === "node.incoming_edge_type_counts") return 0;
      if (container === "node.fields") return null;
      return void 0;
    }
    cursor = parent[segment];
  }
  return cursor;
}
function compare(op, left, right) {
  if (op === "eq") return left === right;
  if (op === "ne") return left !== right;
  if (typeof left !== "number" || typeof right !== "number") return false;
  if (op === "gt") return left > right;
  if (op === "gte") return left >= right;
  if (op === "lt") return left < right;
  if (op === "lte") return left <= right;
  return false;
}
function titleStylePredicateHolds(predicate, context) {
  if ("terms" in predicate) {
    return predicate.op === "and" ? predicate.terms.every((term) => titleStylePredicateHolds(term, context)) : predicate.terms.some((term) => titleStylePredicateHolds(term, context));
  }
  if ("term" in predicate) return !titleStylePredicateHolds(predicate.term, context);
  return compare(predicate.op, resolvePath(context, predicate.path), predicate.value);
}
function titleStyleFor(table, context) {
  for (const row of table.rows) {
    if (titleStylePredicateHolds(row.when, context)) return row.then;
  }
  return table.fallback;
}

// app/present/express/nodeline.ts
var QNTM_ID_LINK = /\s*\[\[qntm:[^\]]+\]\]\s*/g;
function cleanTitle(value) {
  return String(value ?? "").replace(QNTM_ID_LINK, " ").trim();
}
function titleIsCanonical(title, markerGlyphs) {
  const trimmed = title.trim();
  if (trimmed === "") return true;
  for (const wrapper of ["~~", "**", "*"]) {
    if (trimmed.length > wrapper.length * 2 && trimmed.startsWith(wrapper) && trimmed.endsWith(wrapper)) {
      return false;
    }
  }
  if (/\[\[[^\]]*\]\]\s*$/.test(trimmed)) return false;
  for (const glyph of markerGlyphs) {
    if (new RegExp(`${glyph.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s+\\d{4}-\\d{2}-\\d{2})?\\s*$`, "u").test(trimmed)) {
      return false;
    }
  }
  return true;
}
function checkboxGlyph(table, fields) {
  for (const row of table.rows) {
    if (fields[row.when.field] === row.when.equals) return row.then;
  }
  return table.fallback;
}
function tagCells(node, resolution, order) {
  const spelling = resolution.spelling;
  if (spelling === void 0) return [];
  const tags = [];
  const typeToken = spelling.typeTokens[node.type];
  if (typeToken !== void 0) tags.push(typeToken);
  for (const [field, table] of Object.entries(spelling.fieldTags)) {
    const value = node.fields[field];
    if (value === void 0 || value === null) continue;
    const token = table[String(value)];
    if (token !== void 0) tags.push(token);
  }
  return order === void 0 ? tags : orderTags(tags, order);
}
function markerCells(node, resolution, order) {
  const spelling = resolution.spelling;
  if (spelling === void 0) return [];
  const byGlyph = /* @__PURE__ */ new Map();
  for (const [field, table] of Object.entries(spelling.fieldMarkerValues)) {
    const value = node.fields[field];
    if (value === void 0 || value === null) continue;
    const glyph = table[String(value)];
    if (glyph !== void 0) byGlyph.set(glyph, glyph);
  }
  for (const [field, marker] of Object.entries(spelling.fieldMarkers)) {
    const value = node.fields[field];
    if (value === void 0 || value === null || value === "") continue;
    byGlyph.set(marker.token, `${marker.token} ${String(value)}`);
  }
  const glyphs = [...byGlyph.keys()];
  const ordered = order === void 0 ? glyphs : orderTags(glyphs, order);
  return ordered.map((glyph) => byGlyph.get(glyph));
}
function chromeCells(edges, edgeTags, order) {
  const cellsByTag = /* @__PURE__ */ new Map();
  for (const edge of edges) {
    const tag = edgeTags[edge.type];
    if (tag === void 0) continue;
    const title = edge.targetTitle.trim();
    if (title === "") continue;
    const existing = cellsByTag.get(tag.token);
    if (existing === void 0) {
      cellsByTag.set(tag.token, [`${tag.token} [[${title}]]`]);
    } else if (tag.cardinality === "many") {
      existing.push(`${tag.token} [[${title}]]`);
    }
  }
  const tokens = [...cellsByTag.keys()];
  const ordered = order === void 0 ? tokens : orderTags(tokens, order);
  return ordered.flatMap((token) => cellsByTag.get(token));
}
function indent(depth) {
  return "    ".repeat(Math.max(0, depth));
}
function composeNodeLine(node, context) {
  const { resolution } = context;
  const composition = resolution.composition;
  if (composition === void 0) return { ok: false, because: "no-composition" };
  if (resolution.spelling === void 0) return { ok: false, because: "no-spelling" };
  const shape = resolution.chromeShapes[node.type];
  if (shape === void 0) return { ok: false, because: "unknown-node-type" };
  const identity = resolution.identityModes?.[node.type];
  if (identity === void 0) return { ok: false, because: "no-identity-mode" };
  const markerGlyphs = [
    ...Object.values(resolution.spelling.fieldMarkers).map((m) => m.token),
    ...Object.values(resolution.spelling.fieldMarkerValues).flatMap((t) => Object.values(t))
  ];
  if (!titleIsCanonical(cleanTitle(node.fields.title), markerGlyphs)) {
    return { ok: false, because: "title-not-canonical" };
  }
  let checkbox;
  if (shape === "checkbox") {
    if (resolution.renderCheckbox === void 0) return { ok: false, because: "no-checkbox-table" };
    checkbox = checkboxGlyph(resolution.renderCheckbox, node.fields);
  }
  const declared = node.fields.qntm_id;
  const resolvedId = declared === void 0 || declared === null ? node.id : String(declared);
  const stamp = identity.unique || context.writePolicy === "read_only" || resolvedId === "" ? "" : `[[qntm:${resolvedId}]]`;
  const perNode = resolution.renderTitleStyle === void 0 ? [] : titleStyleFor(
    resolution.renderTitleStyle,
    nodeLocalContext(
      { type: node.type, fields: node.fields },
      (context.outgoingEdges ?? []).map((e) => e.type),
      context.incomingEdgeTypes ?? []
    )
  );
  const merged = {
    ...composition,
    titleStyles: [...perNode, ...composition.titleStyles]
  };
  const text = composeLine(
    shape,
    {
      ...checkbox === void 0 ? {} : { checkbox },
      title: cleanTitle(node.fields.title),
      stamp,
      date: "",
      // always "" — the engine's own dissolved cell, kept in the order for faithfulness
      tags: tagCells(node, resolution, resolution.tagOrder),
      markers: markerCells(node, resolution, resolution.markerOrder),
      chrome: chromeCells(context.outgoingEdges ?? [], resolution.spelling.edgeTags, resolution.edgeTagOrder)
    },
    merged,
    context.depth ?? 0
  );
  const continuationLines = [];
  for (const declared2 of resolution.continuationFields?.[node.type] ?? []) {
    const value = node.fields[declared2.field];
    if (typeof value !== "string" || value.trim() === "") continue;
    const tag = declared2.token === null ? "" : ` ${declared2.token}`;
    continuationLines.push(`${indent((context.depth ?? 0) + 1)}${composition.bullet} ${value}${tag}`);
  }
  return { ok: true, line: { text, continuationLines } };
}

// app/present/graphmatch.ts
function resolvedQntmId(node) {
  const raw = node.fields["qntm_id"];
  return String(raw === void 0 || raw === null ? node.id : raw);
}
function candidateFieldsOf(node) {
  return { node_type: node.type, ...node.fields };
}
function neighboursOf(candidateId, edgeType, direction, edgeSourceOf, graph) {
  const touching = graph.edges.filter(
    (e) => e.type === edgeType && (e.source === candidateId || e.target === candidateId)
  );
  if (touching.length === 0) return [];
  const source = edgeSourceOf(edgeType);
  if (source === void 0) return void 0;
  const candidateIsSource = direction === "children" && source === "position" || direction === "parents" && source === "self";
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const neighbourIds = /* @__PURE__ */ new Set();
  for (const edge of touching) {
    if (candidateIsSource) {
      if (edge.source === candidateId) neighbourIds.add(edge.target);
    } else {
      if (edge.target === candidateId) neighbourIds.add(edge.source);
    }
  }
  const out = [];
  for (const id of neighbourIds) {
    const node = byId.get(id);
    if (node === void 0) return void 0;
    out.push(node);
  }
  return out;
}
function edgeStepIsSatisfied(candidateId, step, edgeSourceOf, graph, prospective) {
  const candidates = [];
  for (const edgeType of step.edgeType) {
    const found = neighboursOf(candidateId, edgeType, step.direction, edgeSourceOf, graph);
    if (found === void 0) return void 0;
    for (const node of found) candidates.push(candidateFieldsOf(node));
  }
  if (prospective !== void 0 && step.direction === "children" && step.edgeType.includes(prospective.edgeType)) {
    candidates.push(prospective.fields);
  }
  const clause = { nodeType: step.nodeType, fields: step.fields };
  const anyMatches = candidates.some((fields) => matchesFindClause(fields, clause));
  return step.mustExist ? anyMatches : !anyMatches;
}
function matchesQualifierGraphAware(candidateFields, candidateId, qualifier, graph, edgeSourceOf, prospective, today) {
  if (qualifierNeedsClock(qualifier) && today === void 0) return void 0;
  if (!matchesFindClause(candidateFields, qualifier.find, today)) return false;
  if (qualifier.exclude.some((clause) => matchesFindClause(candidateFields, clause, today))) return false;
  const steps = qualifier.edgeSteps ?? [];
  if (steps.length === 0) return true;
  const id = candidateId ?? "";
  for (const step of steps) {
    const ok = edgeStepIsSatisfied(id, step, edgeSourceOf, graph, prospective);
    if (ok === void 0) return void 0;
    if (!ok) return false;
  }
  return true;
}
function applyGraphAwareRules(fields, candidateId, language, graph, edgeSourceOf, prospective, today) {
  let working = { ...fields };
  const applied = [];
  const partial = [];
  const undecidable = [];
  for (const ruleId of language.order) {
    const rule = language.rules[ruleId];
    if (rule === void 0) continue;
    const qualifier = language.patterns[rule.pattern];
    if (qualifier === void 0) continue;
    const matched = matchesQualifierGraphAware(
      working,
      candidateId,
      qualifier,
      graph,
      edgeSourceOf,
      prospective,
      today
    );
    if (matched === void 0) {
      undecidable.push(ruleId);
      continue;
    }
    if (!matched) continue;
    if (!evaluateWhen(rule.when, working)) continue;
    if (rule.partial === true) partial.push(ruleId);
    const { working: nextWorking, effects } = applyRuleActions(ruleId, rule.actions, working, today);
    working = nextWorking;
    applied.push(...effects);
  }
  return { fields: working, applied, partial, undecidable };
}

// app/present/arrange/keys.ts
function compareCodepoints(a, b) {
  const ac = Array.from(a);
  const bc = Array.from(b);
  const len = Math.min(ac.length, bc.length);
  for (let i = 0; i < len; i += 1) {
    const ca = ac[i]?.codePointAt(0) ?? 0;
    const cb = bc[i]?.codePointAt(0) ?? 0;
    if (ca !== cb) return ca - cb;
  }
  return ac.length - bc.length;
}
function compareByKeys(a, b, keys) {
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    const av = a[i];
    const bv = b[i];
    if (key === void 0 || av === void 0 || bv === void 0) continue;
    if (av.tier !== bv.tier) return av.tier - bv.tier;
    if (av.tier === 1) continue;
    const diff = typeof av.value === "number" && typeof bv.value === "number" ? av.value - bv.value : compareCodepoints(String(av.value), String(bv.value));
    if (diff !== 0) return key.direction === "desc" ? -diff : diff;
  }
  return 0;
}

// app/present/arrange/ordering.ts
var abstains2 = (because) => ({ kind: "abstains", because });
function sectionBounds(lines, lineIndex) {
  let start = 0;
  let headingIndex = null;
  for (let at = lineIndex; at >= 0; at -= 1) {
    if (classifyLine(lines[at] ?? "").kind === "heading") {
      start = at + 1;
      headingIndex = at;
      break;
    }
  }
  let end = lines.length;
  for (let at = lineIndex + 1; at < lines.length; at += 1) {
    if (classifyLine(lines[at] ?? "").kind === "heading") {
      end = at;
      break;
    }
  }
  return { start, end, headingIndex };
}
var INDENTED_CONTENT = /^\s+\S/;
function anyLineIndented(lines, start, end) {
  for (let at = start; at < end; at += 1) {
    if (INDENTED_CONTENT.test(lines[at] ?? "")) return true;
  }
  return false;
}
function parentLineOf(lines, start, end) {
  const parentOf2 = /* @__PURE__ */ new Map();
  const stack = [];
  for (let at = start; at < end; at += 1) {
    const match = /^(\s*)\S/.exec(lines[at] ?? "");
    if (match === null) continue;
    const indent3 = match[1]?.length ?? 0;
    while (stack.length > 0 && (stack[stack.length - 1]?.indent ?? -1) >= indent3) stack.pop();
    const parent = stack[stack.length - 1];
    parentOf2.set(at, parent === void 0 ? null : parent.lineIndex);
    stack.push({ lineIndex: at, indent: indent3 });
  }
  return parentOf2;
}
var DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;
var INT_SHAPE = /^-?\d+$/;
var FLOAT_SHAPE = /^-?\d+(?:\.\d+)?$/;
function shapeMatches(marker, token) {
  if (marker.kind === "date") return DATE_SHAPE.test(token);
  if (marker.kind === "int") return INT_SHAPE.test(token);
  return FLOAT_SHAPE.test(token);
}
function markerValue(line, marker) {
  const at = line.indexOf(marker.token);
  if (at === -1) return void 0;
  const after = line.slice(at + marker.token.length);
  const match = /^\s+(\S+)/.exec(after);
  if (match === null) return void 0;
  const token = match[1] ?? "";
  return shapeMatches(marker, token) ? token : void 0;
}
function tupleFor(line, keys, markers) {
  const values = [];
  for (const key of keys) {
    const marker = markers[key.field];
    if (marker === void 0) return void 0;
    if (marker.kind === "enum") return void 0;
    const value = markerValue(line, marker);
    if (value === void 0) return void 0;
    values.push(value);
  }
  return values;
}
function compareValue(kind, a, b) {
  if (kind === "date") return a < b ? -1 : a > b ? 1 : 0;
  return Number(a) - Number(b);
}
function compareTuples(a, b, keys, markers) {
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (key === void 0) continue;
    const marker = markers[key.field];
    if (marker === void 0) continue;
    const diff = compareValue(marker.kind, a[i] ?? "", b[i] ?? "");
    if (diff !== 0) return key.direction === "desc" ? -diff : diff;
  }
  return 0;
}
function rankOf(target, siblings, keys, markers) {
  let rank2 = 1;
  for (const sibling of siblings) {
    if (compareTuples(sibling, target, keys, markers) < 0) rank2 += 1;
  }
  return rank2;
}
function evaluateSection(viewId, sectionId, source, lineIndex, afterText, ordering, orderingFields) {
  const declared = ordering[viewId]?.[sectionId];
  if (declared === void 0) return { kind: "abstains", because: "no-section-declaration" };
  const keys = declared.ordering;
  if (keys === void 0 || keys.length === 0) return { kind: "abstains", because: "insertion-order" };
  for (const key of keys) {
    const marker = orderingFields[key.field];
    if (marker === void 0 || marker.kind === "enum") {
      return { kind: "abstains", because: "field-not-published" };
    }
  }
  const lines = source.split("\n");
  const { start, end } = sectionBounds(lines, lineIndex);
  const beforeText = lines[lineIndex] ?? "";
  const beforeTuple = tupleFor(beforeText, keys, orderingFields);
  const afterTuple = tupleFor(afterText, keys, orderingFields);
  if (beforeTuple === void 0 || afterTuple === void 0) return { kind: "abstains", because: "no-value" };
  const parentOf2 = parentLineOf(lines, start, end);
  const group = parentOf2.get(lineIndex) ?? null;
  const siblings = [];
  for (let at = start; at < end; at += 1) {
    if (at === lineIndex) continue;
    if (!parentOf2.has(at)) continue;
    if (parentOf2.get(at) !== group) continue;
    const tuple = tupleFor(lines[at] ?? "", keys, orderingFields);
    if (tuple !== void 0) siblings.push({ lineIndex: at, tuple });
  }
  return { kind: "answer", keys, beforeTuple, afterTuple, siblings };
}
function orderingFor(viewId, sectionId, source, lineIndex, afterText, ordering, orderingFields) {
  const evaluation = evaluateSection(viewId, sectionId, source, lineIndex, afterText, ordering, orderingFields);
  if (evaluation.kind === "abstains") return abstains2(evaluation.because);
  const tuples = evaluation.siblings.map((s) => s.tuple);
  const beforeRank = rankOf(evaluation.beforeTuple, tuples, evaluation.keys, orderingFields);
  const afterRank = rankOf(evaluation.afterTuple, tuples, evaluation.keys, orderingFields);
  return {
    kind: "answer",
    answer: {
      moved: beforeRank !== afterRank,
      beforeRank,
      afterRank,
      siblingCount: tuples.length
    }
  };
}
function orderingPlacementFor(viewId, sectionId, source, lineIndex, afterText, ordering, orderingFields) {
  const evaluation = evaluateSection(viewId, sectionId, source, lineIndex, afterText, ordering, orderingFields);
  if (evaluation.kind === "abstains") return { kind: "abstains", because: evaluation.because };
  const { keys, beforeTuple, afterTuple, siblings } = evaluation;
  const tuples = siblings.map((s) => s.tuple);
  const beforeRank = rankOf(beforeTuple, tuples, keys, orderingFields);
  const afterRank = rankOf(afterTuple, tuples, keys, orderingFields);
  const moved = beforeRank !== afterRank;
  const entries = [...siblings];
  const insertAt = entries.findIndex((entry) => entry.lineIndex > lineIndex);
  const currentBeforeLineIndex = insertAt === -1 ? null : entries[insertAt]?.lineIndex ?? null;
  const selfEntry = { lineIndex, tuple: afterTuple };
  if (insertAt === -1) {
    entries.push(selfEntry);
  } else {
    entries.splice(insertAt, 0, selfEntry);
  }
  const sorted = entries.slice().sort((a, b) => compareTuples(a.tuple, b.tuple, keys, orderingFields));
  const at = sorted.findIndex((entry) => entry.lineIndex === lineIndex);
  const next = at === -1 ? void 0 : sorted[at + 1];
  const beforeLineIndex = next === void 0 ? null : next.lineIndex;
  return { kind: "answer", placement: { moved, beforeLineIndex, currentBeforeLineIndex } };
}
function defaultFieldKeyFor(line, field, orderingFields, priorityRank, title) {
  if (field === "title") {
    if (title.kind === "abstains") {
      return title.because === "style-ambiguous" ? "style-ambiguous" : { tier: 1, value: "" };
    }
    return { tier: 0, value: title.text };
  }
  const marker = orderingFields[field];
  if (marker === void 0) return { tier: 1, value: "" };
  if (marker.kind === "enum") {
    let found;
    for (const [token, spelled] of Object.entries(marker.values)) {
      if (!line.includes(token)) continue;
      if (found !== void 0 && found !== spelled) return { tier: 1, value: 0 };
      found = spelled;
    }
    if (found === void 0) return { tier: 1, value: 0 };
    const rank2 = priorityRank[found];
    return rank2 === void 0 ? { tier: 1, value: 0 } : { tier: 0, value: rank2 };
  }
  const raw = markerValue(line, marker);
  if (raw === void 0) return { tier: 1, value: marker.kind === "date" ? "" : 0 };
  return marker.kind === "date" ? { tier: 0, value: raw } : { tier: 0, value: Number(raw) };
}
function defaultTupleFor(line, defaultOrdering, orderingFields, priorityRank) {
  const title = cleanTitleFor(line);
  const tuple = [];
  for (const key of defaultOrdering) {
    const fieldKey = defaultFieldKeyFor(line, key.field, orderingFields, priorityRank, title);
    if (fieldKey === "style-ambiguous") return "style-ambiguous";
    tuple.push(fieldKey);
  }
  return tuple;
}
function compareDefaultTuples(a, b, defaultOrdering) {
  return compareByKeys(a, b, defaultOrdering);
}
function defaultRankOf(target, siblings, defaultOrdering) {
  let rank2 = 1;
  for (const sibling of siblings) {
    if (compareDefaultTuples(sibling, target, defaultOrdering) < 0) rank2 += 1;
  }
  return rank2;
}
var CONTAINER_ORDER_DIRECTIVE = "#order:";
function evaluateDefaultSection(viewId, sectionId, source, lineIndex, afterText, ordering, defaultOrdering, orderingFields, priorityRank, classifyQualifying) {
  if (ordering[viewId]?.[sectionId] !== void 0) {
    return { kind: "abstains", because: "has-declared-ordering" };
  }
  if (defaultOrdering.length === 0) {
    return { kind: "abstains", because: "field-not-published" };
  }
  for (const key of defaultOrdering) {
    if (key.field === "title") continue;
    if (orderingFields[key.field] === void 0) return { kind: "abstains", because: "field-not-published" };
  }
  const lines = source.split("\n");
  const { start, end, headingIndex } = sectionBounds(lines, lineIndex);
  if (headingIndex !== null && (lines[headingIndex] ?? "").includes(CONTAINER_ORDER_DIRECTIVE)) {
    return { kind: "abstains", because: "container-ordering-directive" };
  }
  const beforeText = lines[lineIndex] ?? "";
  const beforeTuple = defaultTupleFor(beforeText, defaultOrdering, orderingFields, priorityRank);
  const afterTuple = defaultTupleFor(afterText, defaultOrdering, orderingFields, priorityRank);
  const siblingsRaw = [];
  if (classifyQualifying === void 0) {
    if (anyLineIndented(lines, start, end)) {
      return { kind: "abstains", because: "nested-section" };
    }
    for (let at = start; at < end; at += 1) {
      if (at === lineIndex) continue;
      siblingsRaw.push({ lineIndex: at, tuple: defaultTupleFor(lines[at] ?? "", defaultOrdering, orderingFields, priorityRank) });
    }
  } else {
    if (classifyQualifying(lineIndex) === false) {
      return { kind: "abstains", because: "not-qualifying" };
    }
    const parentOf2 = parentLineOf(lines, start, end);
    const group = parentOf2.get(lineIndex) ?? null;
    let anyCandidateUnknown = false;
    for (let at = start; at < end; at += 1) {
      if (at === lineIndex) continue;
      if (!parentOf2.has(at)) continue;
      if (parentOf2.get(at) !== group) continue;
      const verdict = classifyQualifying(at);
      if (verdict === void 0) {
        anyCandidateUnknown = true;
        continue;
      }
      if (verdict !== true) continue;
      siblingsRaw.push({ lineIndex: at, tuple: defaultTupleFor(lines[at] ?? "", defaultOrdering, orderingFields, priorityRank) });
    }
    if (siblingsRaw.length === 0 && anyCandidateUnknown) {
      return { kind: "abstains", because: "unclassifiable-siblings" };
    }
  }
  if (beforeTuple === "style-ambiguous" || afterTuple === "style-ambiguous" || siblingsRaw.some((sibling) => sibling.tuple === "style-ambiguous")) {
    return { kind: "abstains", because: "style-ambiguous-title" };
  }
  return {
    kind: "answer",
    beforeTuple,
    afterTuple,
    siblings: siblingsRaw
  };
}
function defaultOrderingFor(viewId, sectionId, source, lineIndex, afterText, ordering, defaultOrdering, orderingFields, priorityRank, classifyQualifying) {
  const evaluation = evaluateDefaultSection(
    viewId,
    sectionId,
    source,
    lineIndex,
    afterText,
    ordering,
    defaultOrdering,
    orderingFields,
    priorityRank,
    classifyQualifying
  );
  if (evaluation.kind === "abstains") return abstains2(evaluation.because);
  const tuples = evaluation.siblings.map((sibling) => sibling.tuple);
  const beforeRank = defaultRankOf(evaluation.beforeTuple, tuples, defaultOrdering);
  const afterRank = defaultRankOf(evaluation.afterTuple, tuples, defaultOrdering);
  return {
    kind: "answer",
    answer: {
      moved: beforeRank !== afterRank,
      beforeRank,
      afterRank,
      siblingCount: tuples.length
    }
  };
}
function defaultOrderingPlacementFor(viewId, sectionId, source, lineIndex, afterText, ordering, defaultOrdering, orderingFields, priorityRank, classifyQualifying) {
  const evaluation = evaluateDefaultSection(
    viewId,
    sectionId,
    source,
    lineIndex,
    afterText,
    ordering,
    defaultOrdering,
    orderingFields,
    priorityRank,
    classifyQualifying
  );
  if (evaluation.kind === "abstains") return { kind: "abstains", because: evaluation.because };
  const { beforeTuple, afterTuple, siblings } = evaluation;
  const tuples = siblings.map((sibling) => sibling.tuple);
  const beforeRank = defaultRankOf(beforeTuple, tuples, defaultOrdering);
  const afterRank = defaultRankOf(afterTuple, tuples, defaultOrdering);
  const moved = beforeRank !== afterRank;
  const entries = [...siblings];
  const insertAt = entries.findIndex((entry) => entry.lineIndex > lineIndex);
  const currentBeforeLineIndex = insertAt === -1 ? null : entries[insertAt]?.lineIndex ?? null;
  const selfEntry = { lineIndex, tuple: afterTuple };
  if (insertAt === -1) {
    entries.push(selfEntry);
  } else {
    entries.splice(insertAt, 0, selfEntry);
  }
  const sorted = entries.slice().sort((a, b) => compareDefaultTuples(a.tuple, b.tuple, defaultOrdering));
  const at = sorted.findIndex((entry) => entry.lineIndex === lineIndex);
  const next = at === -1 ? void 0 : sorted[at + 1];
  const beforeLineIndex = next === void 0 ? null : next.lineIndex;
  return { kind: "answer", placement: { moved, beforeLineIndex, currentBeforeLineIndex } };
}
function resolveOrderingFor(viewId, sectionId, source, lineIndex, afterText, ordering, orderingFields, defaultOrdering, priorityRank, classifyQualifying) {
  if (ordering[viewId]?.[sectionId] !== void 0) {
    return orderingFor(viewId, sectionId, source, lineIndex, afterText, ordering, orderingFields);
  }
  return defaultOrderingFor(
    viewId,
    sectionId,
    source,
    lineIndex,
    afterText,
    ordering,
    defaultOrdering,
    orderingFields,
    priorityRank,
    classifyQualifying
  );
}
function resolveOrderingPlacementFor(viewId, sectionId, source, lineIndex, afterText, ordering, orderingFields, defaultOrdering, priorityRank, classifyQualifying) {
  if (ordering[viewId]?.[sectionId] !== void 0) {
    return orderingPlacementFor(viewId, sectionId, source, lineIndex, afterText, ordering, orderingFields);
  }
  return defaultOrderingPlacementFor(
    viewId,
    sectionId,
    source,
    lineIndex,
    afterText,
    ordering,
    defaultOrdering,
    orderingFields,
    priorityRank,
    classifyQualifying
  );
}

// app/present/select/viewmembers.ts
function fieldsOf(node) {
  return candidateFieldsOf(node);
}
function defaultKeyForField(fields, field, ordering) {
  const raw = fields[field];
  if (field === "title") {
    return typeof raw === "string" && raw.length > 0 ? { tier: 0, value: raw } : { tier: 1, value: "" };
  }
  const marker = ordering.orderingFields[field];
  if (marker === void 0) return { tier: 1, value: "" };
  if (marker.kind === "enum") {
    if (typeof raw !== "string") return { tier: 1, value: 0 };
    const rank2 = ordering.priorityRank[raw];
    return rank2 === void 0 ? { tier: 1, value: 0 } : { tier: 0, value: rank2 };
  }
  if (raw === void 0 || raw === null || raw === "") {
    return { tier: 1, value: marker.kind === "date" ? "" : 0 };
  }
  return marker.kind === "date" ? { tier: 0, value: String(raw) } : { tier: 0, value: Number(raw) };
}
function declaredTupleFor(fields, keys, ordering) {
  const values = [];
  for (const key of keys) {
    const marker = ordering.orderingFields[key.field];
    if (marker === void 0) return void 0;
    if (marker.kind === "enum") return void 0;
    const raw = fields[key.field];
    if (raw === void 0 || raw === null || raw === "") return void 0;
    values.push(String(raw));
  }
  return values;
}
function qualifies(node, qualifier, graph, edgeSourceOf, today) {
  const fields = fieldsOf(node);
  if (!qualifierNeedsGraph(qualifier)) return matchesQualifier(fields, qualifier, today);
  if (graph === void 0 || edgeSourceOf === void 0) return void 0;
  return matchesQualifierGraphAware(fields, node.id, qualifier, graph, edgeSourceOf, void 0, today);
}
function computeViewMembers(viewId, nodes, language, ordering, options) {
  const sectionIds = language.sectionOrder[viewId];
  const declared = language.sections[viewId];
  if (sectionIds === void 0 || declared === void 0) return void 0;
  const graph = options?.graph;
  const edgeSourceOf = options?.edgeSourceOf;
  const today = options?.today;
  const sections = [];
  const uncomputed = [];
  for (const sectionId of sectionIds) {
    const section = declared[sectionId];
    if (section === void 0) continue;
    const name = section.name ?? sectionId;
    const qualifier = language.predicates[section.qualification];
    if (qualifier === void 0) {
      uncomputed.push({ sectionId, name, qualification: section.qualification, because: "no-predicate" });
      continue;
    }
    if (qualifierNeedsClock(qualifier) && today === void 0) {
      uncomputed.push({ sectionId, name, qualification: section.qualification, because: "needs-clock" });
      continue;
    }
    if (qualifierNeedsGraph(qualifier) && (graph === void 0 || edgeSourceOf === void 0)) {
      uncomputed.push({ sectionId, name, qualification: section.qualification, because: "needs-graph" });
      continue;
    }
    const members = [];
    const undecided = [];
    for (const node of nodes) {
      const answer = qualifies(node, qualifier, graph, edgeSourceOf, today);
      if (answer === true) members.push(node);
      else if (answer === void 0) undecided.push(node);
    }
    const declaredOrdering = ordering.ordering[viewId]?.[sectionId];
    const placed = orderMembers(members, declaredOrdering, ordering);
    sections.push({
      sectionId,
      name,
      qualification: section.qualification,
      members: placed.members,
      ordered: placed.ordered,
      ...placed.because === void 0 ? {} : { orderAbstention: placed.because },
      undecided
    });
  }
  return { viewId, sections, uncomputed };
}
function orderMembers(members, declaredOrdering, ordering) {
  if (declaredOrdering !== void 0) {
    const keys2 = declaredOrdering.ordering;
    if (keys2 === void 0 || keys2.length === 0) return { members, ordered: false };
    const tuples2 = /* @__PURE__ */ new Map();
    for (const node of members) {
      const tuple = declaredTupleFor(fieldsOf(node), keys2, ordering);
      if (tuple === void 0) {
        return { members, ordered: false, because: "ordering-field-not-published" };
      }
      tuples2.set(node.id, tuple);
    }
    const sorted2 = [...members].sort(
      (a, b) => compareTuples(tuples2.get(a.id) ?? [], tuples2.get(b.id) ?? [], keys2, ordering.orderingFields)
    );
    return { members: sorted2, ordered: true };
  }
  const keys = ordering.defaultOrdering;
  if (keys.length === 0) return { members, ordered: false };
  const tuples = /* @__PURE__ */ new Map();
  for (const node of members) {
    const fields = fieldsOf(node);
    tuples.set(node.id, keys.map((key) => defaultKeyForField(fields, key.field, ordering)));
  }
  const sorted = [...members].sort(
    (a, b) => compareDefaultTuples(tuples.get(a.id) ?? [], tuples.get(b.id) ?? [], keys)
  );
  return { members: sorted, ordered: true };
}

// app/present/express/viewmarkdown.ts
function countSuffixHeader(sectionId, count) {
  return count === 0 ? sectionId : `${sectionId} (${count})`;
}
var CURRENT_FIELD_PREFIX = "$current.";
function resolveHeaderFieldValue(ref, node) {
  if (!ref.startsWith(CURRENT_FIELD_PREFIX)) return ref;
  const value = node.fields[ref.slice(CURRENT_FIELD_PREFIX.length)];
  return value === void 0 || value === null ? null : String(value);
}
function composeSectionHeader(sectionId, headerValue, members) {
  const count = members.length;
  if (headerValue === void 0 || members.length === 0) return countSuffixHeader(sectionId, count);
  const resolved = resolveHeaderFieldValue(headerValue, members[0]);
  if (resolved === null || resolved.trim() === "" || resolved.includes("\n") || resolved.includes("\r")) {
    return countSuffixHeader(sectionId, count);
  }
  return `${sectionId}: ${resolved}`;
}
function pinnedContainerNode(containerNode, graph) {
  if (containerNode === void 0) return void 0;
  return graph.nodes.find((n) => resolvedQntmId(n) === containerNode) ?? graph.nodes.find((n) => n.id === containerNode);
}
function headingNode(presentation, resolution, graph) {
  const pinned = pinnedContainerNode(presentation.containerNode, graph);
  if (pinned !== void 0) return pinned;
  const name = presentation.name?.trim();
  if (name === void 0 || name === "") return void 0;
  return graph.nodes.find(
    (n) => resolution.identityModes?.[n.type]?.unique === true && String(n.fields.title ?? "").trim() === name
  );
}
function indent2(depth) {
  return "    ".repeat(Math.max(0, depth));
}
function composeSectionHeading(sectionId, presentation, members, resolution, graph, writePolicy) {
  const backing = headingNode(presentation, resolution, graph);
  if (backing !== void 0) {
    const shape = resolution.renderShapes?.[backing.type];
    if (shape === void 0) return { kind: "refused", because: "render-shape-unpublished" };
    if (shape !== "heading") return { kind: "node-line", node: backing };
  }
  const pinned = pinnedContainerNode(presentation.containerNode, graph);
  const pinnedTitle = pinned === void 0 ? "" : String(pinned.fields.title ?? "").trim();
  let text;
  if (pinned !== void 0 && pinnedTitle !== "") {
    const resolved = resolvedQntmId(pinned);
    const stamp = writePolicy === "read_only" || resolved === "" ? "" : `[[qntm:${resolved}]]`;
    text = stamp === "" ? pinnedTitle : `${pinnedTitle} ${stamp}`;
  } else if (presentation.name !== void 0 && presentation.name.trim() !== "") {
    text = presentation.name.trim();
  } else {
    text = composeSectionHeader(sectionId, presentation.headerValue, members);
  }
  const cells = backing === void 0 ? [] : markerCells(backing, resolution, resolution.markerOrder);
  return { kind: "heading", text: cells.length === 0 ? text : `${text} ${cells.join(" ")}` };
}
var HIERARCHY_DIRECTIONS = /* @__PURE__ */ new Set(["child_to_parent", "parent_to_child"]);
function relevantEdgeTypes(viewId, sectionId, structural) {
  const declared = structural?.sections?.[viewId]?.[sectionId]?.edgeTypes;
  if (declared !== void 0) return new Set(declared);
  const registry = structural?.edgeDirectionRegistry;
  if (registry === void 0 || Object.keys(registry).length === 0) return void 0;
  const hierarchy = /* @__PURE__ */ new Set();
  for (const [edgeType, direction] of Object.entries(registry)) {
    if (HIERARCHY_DIRECTIONS.has(direction)) hierarchy.add(edgeType);
  }
  return hierarchy;
}
function touchedIdsForTypes(touchedByType, types) {
  const out = /* @__PURE__ */ new Set();
  for (const type of types) {
    const ids = touchedByType.get(type);
    if (ids === void 0) continue;
    for (const id of ids) out.add(id);
  }
  return out;
}
function composeSectionTreeLines(roots, depth, graph, resolution, placeholder, writePolicy, lines) {
  for (const treeNode of roots) {
    const graphNode = graph.nodes.find((n) => n.id === treeNode.node_id);
    if (graphNode === void 0) {
      return { ok: false, because: "section-tree-node-unresolved" };
    }
    const line = composeNodeLine(graphNode, {
      resolution,
      ...writePolicy === void 0 ? {} : { writePolicy },
      depth
    });
    if (!line.ok) {
      return { ok: false, because: "node-refused", nodeRefusal: line.because };
    }
    lines.push(line.line.text, ...line.line.continuationLines);
    if (treeNode.children.length > 0) {
      const nested = composeSectionTreeLines(
        treeNode.children,
        depth + 1,
        graph,
        resolution,
        placeholder,
        writePolicy,
        lines
      );
      if (!nested.ok) return nested;
    } else if (treeNode.is_qualifying && placeholder !== void 0) {
      lines.push(`${indent2(depth + 1)}- ${placeholder}`);
    }
  }
  return { ok: true };
}
function composeViewMarkdown(viewId, context) {
  const { resolution, graph } = context;
  const presented = resolution.sectionPresentation?.[viewId];
  if (presented === void 0) return { ok: false, because: "no-section-presentation" };
  if (graph === null) return { ok: false, because: "no-graph" };
  const computed = computeViewMembers(viewId, graph.nodes, context.language, context.ordering, {
    graph,
    ...context.today === void 0 ? {} : { today: context.today }
  });
  if (computed === void 0) return { ok: false, because: "view-not-declared" };
  const firstUncomputed = computed.uncomputed[0];
  if (firstUncomputed !== void 0) {
    return { ok: false, because: "section-uncomputed", section: firstUncomputed.sectionId };
  }
  const touched = /* @__PURE__ */ new Set();
  const touchedByType = /* @__PURE__ */ new Map();
  for (const edge of graph.edges) {
    touched.add(edge.source);
    touched.add(edge.target);
    let byType = touchedByType.get(edge.type);
    if (byType === void 0) {
      byType = /* @__PURE__ */ new Set();
      touchedByType.set(edge.type, byType);
    }
    byType.add(edge.source);
    byType.add(edge.target);
  }
  const lines = [];
  for (const section of computed.sections) {
    const presentation = presented[section.sectionId];
    if (presentation === void 0) {
      return { ok: false, because: "section-not-presented", section: section.sectionId };
    }
    if (!section.ordered) {
      return { ok: false, because: "section-order-abstained", section: section.sectionId };
    }
    if (section.undecided.length > 0) {
      return { ok: false, because: "section-undecided-member", section: section.sectionId };
    }
    const heading = composeSectionHeading(
      section.sectionId,
      presentation,
      section.members,
      resolution,
      graph,
      context.writePolicy
    );
    if (heading.kind === "refused") {
      return { ok: false, because: heading.because, section: section.sectionId };
    }
    if (heading.kind === "node-line") {
      const line = composeNodeLine(heading.node, {
        resolution,
        ...context.writePolicy === void 0 ? {} : { writePolicy: context.writePolicy }
      });
      if (!line.ok) {
        return { ok: false, because: "node-refused", section: section.sectionId, nodeRefusal: line.because };
      }
      lines.push(line.line.text, ...line.line.continuationLines);
    } else {
      lines.push(`## ${heading.text}`);
    }
    if (presentation.bodyPolicy !== "full_body") {
      if (presentation.bodyPolicy === void 0) {
        return { ok: false, because: "section-not-presented", section: section.sectionId };
      }
      continue;
    }
    const relevant = relevantEdgeTypes(viewId, section.sectionId, context.structural);
    const sectionTouched = relevant === void 0 ? touched : touchedIdsForTypes(touchedByType, relevant);
    const sectionTouchesAnEdge = section.members.some((member) => sectionTouched.has(member.id));
    if (sectionTouchesAnEdge) {
      const tree = context.sectionTrees?.[section.sectionId];
      if (tree === void 0) {
        return { ok: false, because: "member-touches-an-edge", section: section.sectionId };
      }
      const walked = composeSectionTreeLines(
        tree.roots,
        0,
        graph,
        resolution,
        presentation.emptyChildrenPlaceholder,
        context.writePolicy,
        lines
      );
      if (!walked.ok) {
        return walked.because === "node-refused" ? { ok: false, because: "node-refused", section: section.sectionId, nodeRefusal: walked.nodeRefusal } : { ok: false, because: walked.because, section: section.sectionId };
      }
      continue;
    }
    for (const member of section.members) {
      const line = composeNodeLine(member, {
        resolution,
        ...context.writePolicy === void 0 ? {} : { writePolicy: context.writePolicy }
      });
      if (!line.ok) {
        return { ok: false, because: "node-refused", section: section.sectionId, nodeRefusal: line.because };
      }
      lines.push(line.line.text, ...line.line.continuationLines);
      if (presentation.emptyChildrenPlaceholder !== void 0) {
        lines.push(`${indent2(1)}- ${presentation.emptyChildrenPlaceholder}`);
      }
    }
  }
  return { ok: true, markdown: lines.join("\n") };
}

// app/present/arrange/orderingqualify.ts
var bareId = (id) => String(id).replace(/^qntm:/i, "");
function publishedQualifierFor(viewId, sectionId, qualification) {
  const section = qualification.sections[viewId]?.[sectionId];
  if (section === void 0) return void 0;
  return qualification.predicates[section.qualification];
}
function qualifyingClassifierFor(lines, viewId, sectionId, qualification, graph, edgeSourceOf) {
  const qualifier = publishedQualifierFor(viewId, sectionId, qualification);
  if (qualifier === void 0) return void 0;
  const byId = new Map(graph.nodes.map((node) => [bareId(resolvedQntmId(node)), node]));
  return (lineIndex) => {
    const line = lines[lineIndex] ?? "";
    const stamped = stampSpans(line);
    const first = stamped[0];
    if (first === void 0) return void 0;
    const node = byId.get(bareId(first.id));
    if (node === void 0) return void 0;
    const fields = { node_type: node.type, ...node.fields };
    return matchesQualifierGraphAware(fields, node.id, qualifier, graph, edgeSourceOf, void 0);
  };
}

// app/present/today.ts
var abstains3 = (because) => ({ kind: "abstains", because });
var WEEKDAY_NAMES = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday"
];
var pad2 = (n) => String(n).padStart(2, "0");
var isoDate = (utcMs) => {
  const d = new Date(utcMs);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
};
function localPartsInZone(nowUtcMs, timezone) {
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23"
    });
  } catch {
    return void 0;
  }
  const parts = formatter.formatToParts(new Date(nowUtcMs));
  const get = (type) => parts.find((p) => p.type === type)?.value;
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  const rawHour = Number(get("hour"));
  const hour = rawHour === 24 ? 0 : rawHour;
  if (![year, month, day, hour].every(Number.isFinite)) return void 0;
  return { year, month, day, hour };
}
function resolveLogicalDate(nowUtcMs, boundary) {
  const parts = localPartsInZone(nowUtcMs, boundary.timezone);
  if (parts === void 0) return void 0;
  const asUtcMidnight = Date.UTC(parts.year, parts.month - 1, parts.day);
  const rolled = parts.hour >= boundary.dayStartHour ? asUtcMidnight : asUtcMidnight - 864e5;
  return isoDate(rolled);
}
function resolveWeekEnd(logicalDate, weekStartsOn) {
  const startIndex = WEEKDAY_NAMES.indexOf(
    weekStartsOn.trim().toLowerCase()
  );
  if (startIndex === -1) return void 0;
  const [y, m, d] = logicalDate.split("-").map(Number);
  if (y === void 0 || m === void 0 || d === void 0) return void 0;
  const asUtcMidnight = Date.UTC(y, m - 1, d);
  const jsWeekday = new Date(asUtcMidnight).getUTCDay();
  const pyWeekday = (jsWeekday + 6) % 7;
  const daysSinceWeekStart = ((pyWeekday - startIndex) % 7 + 7) % 7;
  const weekEndMs = asUtcMidnight + (6 - daysSinceWeekStart) * 864e5;
  return isoDate(weekEndMs);
}
function todayFor(nowUtcMs, boundary) {
  const logicalDate = resolveLogicalDate(nowUtcMs, boundary);
  if (logicalDate === void 0) return abstains3("unresolvable-timezone");
  const weekEnd = resolveWeekEnd(logicalDate, boundary.weekStartsOn);
  if (weekEnd === void 0) return abstains3("unknown-week-start");
  return { kind: "answer", answer: { logicalDate, weekEnd } };
}

// app/present/rank.ts
var LIST_NAMES = ["search", "recent", "link", "views", "tags", "markers"];
var RANK_FIELDS = ["kind", "match", "status", "demoted", "recent", "title", "position"];
var CLIENT_KEY = "client";
var STATUS_ORDER = ["open", "in_progress", "*", "scheduled", "waiting", "done", "cancelled"];
var DEFAULT_RANK_POLICIES = {
  search: {
    keys: [
      { field: "kind", order: ["view", "section", "task"] },
      { field: "status", order: STATUS_ORDER },
      { field: "demoted", direction: "asc" },
      { field: "match", direction: "desc" },
      { field: "recent" },
      { field: "position" }
    ]
  },
  // A BLANK `/` (2026-10-10, operator-asked: "even when blank … switch back to prev file"): what
  // was used most recently first, views before tasks on a tie. Only used items are listed.
  recent: { keys: [{ field: "recent" }, { field: "kind", order: ["view", "section", "task"] }] },
  link: {
    minMatch: 1,
    keys: [
      { field: "status", order: STATUS_ORDER },
      { field: "demoted", direction: "asc" },
      { field: "match", direction: "desc" },
      { field: "recent" },
      { field: "position" }
    ]
  },
  views: { keys: [{ field: "match", direction: "desc" }, { field: "title" }] },
  tags: { minMatch: 1, keys: [{ field: "match", direction: "desc" }, { field: "position" }] },
  markers: { minMatch: 2, keys: [{ field: "match", direction: "desc" }, { field: "position" }] }
};
function queryWords(query) {
  return query.toLowerCase().split(/\s+/).filter((w) => w !== "");
}
function matchQuality(item, query) {
  const words2 = queryWords(query);
  if (words2.length === 0) return 3;
  const title = item.title.toLowerCase();
  if (title.startsWith(query.trim().toLowerCase())) return 3;
  const titleWords = title.split(/[\s·/_\-#]+/).filter((w) => w !== "");
  if (words2.every((w) => titleWords.some((t) => t.startsWith(w)))) return 2;
  if (words2.every((w) => title.includes(w))) return 1;
  const all = `${title} ${String(item.also ?? "").toLowerCase()}`;
  if (words2.every((w) => all.includes(w))) return 0;
  return null;
}
function globMatches(glob, text) {
  const pattern = glob.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp(`^${pattern}$`, "i").test(text);
}
var PRESENT = (value) => ({ tier: 0, value });
var ABSENT = { tier: 1, value: 0 };
function orderValue(order, value) {
  if (value === void 0 || value === "") return ABSENT;
  const at = order.indexOf(value);
  if (at !== -1) return PRESENT(at);
  const wild = order.indexOf("*");
  return wild !== -1 ? PRESENT(wild) : ABSENT;
}
function fieldValue(field, key, s, policy) {
  switch (field) {
    case "match":
      return PRESENT(s.match);
    case "position":
      return PRESENT(s.position);
    case "title":
      return PRESENT(s.item.title.toLowerCase());
    case "kind":
      return key.order !== void 0 ? orderValue(key.order, s.item.kind) : s.item.kind ? PRESENT(s.item.kind) : ABSENT;
    case "status":
      return key.order !== void 0 ? orderValue(key.order, s.item.status) : s.item.status ? PRESENT(s.item.status) : ABSENT;
    case "recent":
      return s.item.recent !== void 0 ? PRESENT(s.item.recent) : ABSENT;
    case "demoted": {
      const path = s.item.path ?? "";
      return PRESENT((policy.demote ?? []).some((glob) => globMatches(glob, path)) ? 1 : 0);
    }
    default:
      return ABSENT;
  }
}
function rank(items, describe, query, policy) {
  const minMatch = policy.minMatch ?? 0;
  const scored = [];
  items.forEach((value, position) => {
    const item = describe(value);
    const match = matchQuality(item, query);
    if (match === null || match < minMatch) return;
    scored.push({ value, item, match, position });
  });
  const keys = policy.keys.map((key) => key.order !== void 0 ? { direction: "asc" } : key);
  const tuple = (s) => policy.keys.map((key) => fieldValue(key.field, key, s, policy));
  const tuples = new Map(scored.map((s) => [s, tuple(s)]));
  return scored.sort((a, b) => compareByKeys(tuples.get(a) ?? [], tuples.get(b) ?? [], keys)).map((s) => s.value);
}
function policyFor(list, declared) {
  return declared?.[list] ?? DEFAULT_RANK_POLICIES[list];
}
function readClientDeclaration(document2) {
  const problems = [];
  const lists = {};
  const client = document2?.[CLIENT_KEY];
  if (client === void 0) return { lists, problems };
  const declared = client?.lists;
  if (declared === null || typeof declared !== "object" || Array.isArray(declared)) {
    problems.push(`'${CLIENT_KEY}.lists' is not an object \u2014 every list keeps its built-in order`);
    return { lists, problems };
  }
  for (const [name, value] of Object.entries(declared)) {
    if (!LIST_NAMES.includes(name)) {
      problems.push(`'${CLIENT_KEY}.lists.${name}' is not a list this app has \u2014 ignored`);
      continue;
    }
    const keys = value?.keys;
    const usable = Array.isArray(keys) && keys.length > 0 && keys.every(
      (k) => k !== null && typeof k === "object" && RANK_FIELDS.includes(k.field) && (k.order === void 0 || Array.isArray(k.order))
    );
    if (!usable) {
      problems.push(`'${CLIENT_KEY}.lists.${name}' has no usable keys \u2014 it keeps its built-in order`);
      continue;
    }
    lists[name] = value;
  }
  return { lists, problems };
}

// app/present/context.ts
var PresentationContext = class _PresentationContext {
  #contributions;
  constructor(contributions = {}) {
    const entries = Object.entries(contributions);
    this.#contributions = new Map(
      entries.filter((entry) => entry[1] !== void 0)
    );
  }
  /**
   * What this level says, or `undefined` if it says nothing.
   *
   * The cascade is the only caller. It is a method rather than a public field so that the
   * cascade's read of a level is a real, observable call — `flow-trace` measures calls, and a
   * property read would make the edge between the resolver and the facts it resolves against
   * invisible to the thing that is supposed to be watching it.
   */
  at(level) {
    return this.#contributions.get(level);
  }
  /**
   * The same facts with one level replaced — a NEW context; this one never changes.
   *
   * DERIVED LEVELS NEED THIS AND DECLARED LEVELS DO NOT, which is the whole reason it exists.
   * GLOBAL, USER, VIEW and STRUCTURAL_NODE are read once from somewhere and hold still for the
   * whole paint, so the constructor is enough for them. FOCUS is a fact about ONE LINE AT ONE
   * INSTANT: it is true of the line under the cursor and false of the forty lines around it, and
   * a paint therefore needs forty-one slightly different contexts.
   *
   * Immutable on purpose. A mutable context would let the painter set FOCUS, paint, and forget to
   * unset it — and a resolver whose answer depends on what was asked before it is not a cascade,
   * it is a state machine wearing one. Every context handed to a cascade here is complete.
   */
  with(level, contribution) {
    const next = {};
    for (const [existing, said] of this.#contributions) {
      next[existing] = said;
    }
    if (contribution === void 0) {
      delete next[level];
    } else {
      next[level] = contribution;
    }
    return new _PresentationContext(next);
  }
};
function presentationFromDeclaration(document2) {
  const reading = readDeclaration(document2);
  const structuralReading = readStructuralDeclaration(document2);
  const qualificationReading = readQualificationDeclaration(document2);
  const resolutionReading = readConfigResolutionDeclaration(document2);
  const rulesReading = readRulesDeclaration(document2);
  const clientReading = readClientDeclaration(document2);
  return {
    context: new PresentationContext({ GLOBAL: reading.contribution }),
    indentUnit: reading.indentUnit,
    landingView: reading.landingView,
    structural: structuralReading.structural,
    qualification: qualificationReading.qualification,
    resolution: resolutionReading.resolution,
    rules: rulesReading.rules,
    lists: clientReading.lists,
    problems: [
      ...reading.problems,
      ...structuralReading.problems,
      ...qualificationReading.problems,
      ...resolutionReading.problems,
      ...rulesReading.problems,
      ...clientReading.problems
    ]
  };
}
var NOT_YET_DECLARED = {
  context: new PresentationContext(),
  indentUnit: DEFAULT_INDENT_UNIT,
  landingView: void 0,
  structural: void 0,
  qualification: void 0,
  resolution: void 0,
  rules: void 0,
  lists: {}
};
function declarationFrom(declared) {
  return {
    context: declared.context,
    indentUnit: declared.indentUnit,
    landingView: declared.landingView,
    structural: declared.structural,
    qualification: declared.qualification,
    resolution: declared.resolution,
    rules: declared.rules,
    lists: declared.lists
  };
}

// app/present/relative.ts
var STAMP_TOKEN = /\[\[qntm:[A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?\]\]/g;
function withStampRemoved(arrived, start, end) {
  const before = arrived.slice(0, start);
  const after = before.endsWith(" ") && arrived.slice(end).startsWith(" ") ? arrived.slice(end + 1) : arrived.slice(end);
  return (before + after).trimEnd();
}
function extendsLine(held, arrived) {
  if (arrived === held) {
    return true;
  }
  if (held === "" || held.trimEnd() !== held) {
    return false;
  }
  if (arrived.startsWith(held + " ")) {
    return true;
  }
  for (const match of arrived.matchAll(STAMP_TOKEN)) {
    const start = match.index;
    const stripped = withStampRemoved(arrived, start, start + match[0].length);
    if (stripped === held || stripped.startsWith(held + " ")) {
      return true;
    }
  }
  return false;
}
function boundsOf(places, section) {
  let first = -1;
  let last = -1;
  places.forEach((place, at) => {
    if (place !== null && place.section === section) {
      if (first === -1) {
        first = at;
      }
      last = at;
    }
  });
  return first === -1 ? null : { first, last };
}
function gapBetween(places, section, from, to) {
  const found = [];
  for (let at = Math.max(0, from); at <= Math.min(to, places.length - 1); at += 1) {
    const place = places[at] ?? null;
    if (place !== null && place.section === section) {
      found.push(at);
    }
  }
  return found;
}
function printingsOf(places, node) {
  const found = [];
  places.forEach((place, at) => {
    if (place?.node === node) {
      found.push(at);
    }
  });
  return found;
}
function relativeAnchorFor(places, lines, lineIndex) {
  const place = places[lineIndex] ?? null;
  if (place === null || place.node !== null) {
    return null;
  }
  const section = place.section;
  const bounds = boundsOf(places, section);
  if (bounds === null) {
    return null;
  }
  if (section !== null && bounds.first === lineIndex) {
    return null;
  }
  let above = null;
  let aboveAt = -1;
  for (let at = lineIndex - 1; at >= 0; at -= 1) {
    const other = places[at];
    if (other === null || other === void 0) {
      continue;
    }
    if (other.section !== section) {
      break;
    }
    if (other.node !== null) {
      above = other.node;
      aboveAt = at;
      break;
    }
  }
  let below = null;
  let belowAt = -1;
  for (let at = lineIndex + 1; at < places.length; at += 1) {
    const other = places[at];
    if (other === null || other === void 0) {
      continue;
    }
    if (other.section !== section) {
      break;
    }
    if (other.node !== null) {
      below = other.node;
      belowAt = at;
      break;
    }
  }
  if (above === null && below === null && section === null) {
    return null;
  }
  const from = above === null ? bounds.first : aboveAt + 1;
  const to = below === null ? bounds.last : belowAt - 1;
  const gap = gapBetween(places, section, from, to);
  const offset = gap.indexOf(lineIndex);
  if (offset === -1) {
    return null;
  }
  return { above, below, section, gap: gap.length, offset, text: lines[lineIndex] ?? "" };
}
function resolveRelativeAnchor(anchor, places, lines) {
  const bracket = bracketRung(anchor, places, lines);
  if (bracket.outcome !== "refused") {
    return bracket;
  }
  return textRung(anchor, places, lines, bracket);
}
function bracketRung(anchor, places, lines) {
  let aboveAt = -1;
  if (anchor.above !== null) {
    const printings = printingsOf(places, anchor.above);
    if (printings.length === 0) {
      return { outcome: "refused", because: "above-absent" };
    }
    if (printings.length > 1) {
      return { outcome: "refused", because: "above-ambiguous" };
    }
    aboveAt = printings[0];
  }
  let belowAt = -1;
  if (anchor.below !== null) {
    const printings = printingsOf(places, anchor.below);
    if (printings.length === 0) {
      return { outcome: "refused", because: "below-absent" };
    }
    if (printings.length > 1) {
      return { outcome: "refused", because: "below-ambiguous" };
    }
    belowAt = printings[0];
  }
  const aboveSection = aboveAt === -1 ? null : places[aboveAt]?.section ?? null;
  const belowSection = belowAt === -1 ? null : places[belowAt]?.section ?? null;
  if (aboveAt !== -1 && belowAt !== -1) {
    if (belowAt <= aboveAt || aboveSection !== belowSection) {
      return { outcome: "refused", because: "bracket-crossed" };
    }
  }
  const bracketed = aboveAt !== -1 || belowAt !== -1;
  if (!bracketed && anchor.section === null) {
    return { outcome: "refused", because: "no-landmark" };
  }
  const section = bracketed ? aboveAt !== -1 ? aboveSection : belowSection : anchor.section;
  const bounds = boundsOf(places, section);
  if (bounds === null) {
    return { outcome: "refused", because: bracketed ? "gap-changed" : "section-absent" };
  }
  const from = aboveAt === -1 ? bounds.first : aboveAt + 1;
  const to = belowAt === -1 ? bounds.last : belowAt - 1;
  const gap = gapBetween(places, section, from, to);
  if (gap.length !== anchor.gap) {
    return { outcome: "refused", because: "gap-changed" };
  }
  const candidate = gap[anchor.offset];
  if (candidate === void 0) {
    return { outcome: "refused", because: "gap-changed" };
  }
  if (!extendsLine(anchor.text, lines[candidate] ?? "")) {
    return { outcome: "refused", because: "text-changed" };
  }
  return { outcome: "found", lineIndex: candidate, via: "relative" };
}
function textRung(anchor, places, lines, refusal) {
  const candidates = [];
  places.forEach((place, at) => {
    if (place !== null && extendsLine(anchor.text, lines[at] ?? "")) {
      candidates.push(at);
    }
  });
  if (candidates.length === 1) {
    return { outcome: "found", lineIndex: candidates[0], via: "text" };
  }
  if (candidates.length > 1) {
    return { outcome: "ambiguous", candidates };
  }
  return refusal;
}

// app/present/instance.ts
var HEADING_TOKEN = "\xA7heading";
function nodeStampOf(line) {
  const [first] = qntmIdSpans(line);
  if (first === void 0) {
    return null;
  }
  return line.slice(first.start + 2, first.end - 2);
}
function instancesOf(source, view) {
  const lines = source.split("\n");
  let section = null;
  const raw = lines.map((line) => {
    const shape = classifyLine(line);
    if (shape.kind === "blank") {
      return null;
    }
    if (shape.kind === "heading") {
      section = section === null ? 0 : section + 1;
      const node2 = nodeStampOf(line);
      return { section, node: node2, token: node2 ?? HEADING_TOKEN };
    }
    const node = nodeStampOf(line);
    return { section, node, token: node ?? line };
  });
  const key = (r) => `${r.section ?? "none"}\0${r.token}`;
  const groupSize = /* @__PURE__ */ new Map();
  for (const r of raw) {
    if (r === null) {
      continue;
    }
    const k = key(r);
    groupSize.set(k, (groupSize.get(k) ?? 0) + 1);
  }
  const seen = /* @__PURE__ */ new Map();
  return raw.map((r) => {
    if (r === null) {
      return null;
    }
    const k = key(r);
    const occurrence = (seen.get(k) ?? 0) + 1;
    seen.set(k, occurrence);
    const size = groupSize.get(k) ?? 1;
    const suffix = size > 1 ? `#${occurrence}` : "";
    const sectionToken = r.section === null ? "-" : String(r.section);
    return {
      instance: `${view}/${sectionToken}/${r.token}${suffix}`,
      node: r.node,
      section: r.section
    };
  });
}
function instanceOf(source, lineIndex, view) {
  if (!Number.isInteger(lineIndex) || lineIndex < 0) {
    return null;
  }
  return instancesOf(source, view)[lineIndex] ?? null;
}
var ANCHOR_TRUST = ["instance", "node", "relative", "text"];
function instanceAnchorFor(source, lineIndex, view) {
  const list = instancesOf(source, view);
  const info = list[lineIndex] ?? null;
  if (info === null) {
    return null;
  }
  return {
    instance: info.instance,
    node: info.node,
    takenAt: lineIndex,
    relative: relativeAnchorFor(list, source.split("\n"), lineIndex)
  };
}
function resolveInstanceAnchor(anchor, source, view) {
  const list = instancesOf(source, view);
  const byInstance = list.findIndex((info) => info?.instance === anchor.instance);
  if (byInstance !== -1) {
    return { outcome: "found", lineIndex: byInstance, via: "instance" };
  }
  if (anchor.node !== null) {
    const candidates = [];
    list.forEach((info, at) => {
      if (info?.node === anchor.node) {
        candidates.push(at);
      }
    });
    if (candidates.length === 1) {
      return { outcome: "found", lineIndex: candidates[0], via: "node" };
    }
    if (candidates.length > 1) {
      return { outcome: "ambiguous", candidates };
    }
  }
  if (anchor.relative !== null) {
    const reading = resolveRelativeAnchor(anchor.relative, list, source.split("\n"));
    if (reading.outcome === "found") {
      return { outcome: "found", lineIndex: reading.lineIndex, via: reading.via };
    }
    if (reading.outcome === "ambiguous") {
      return { outcome: "ambiguous", candidates: reading.candidates };
    }
    return { outcome: "absent", because: reading.because };
  }
  return { outcome: "absent" };
}

// app/present/motions.ts
function clampLine(index, lastIndex) {
  const floor = 0;
  const ceiling = lastIndex < 0 ? 0 : lastIndex;
  return Math.max(floor, Math.min(index, ceiling));
}
function clampColumn(column, text) {
  if (!Number.isFinite(column) || column < 0) {
    return 0;
  }
  const at = Math.floor(column);
  if (text === null) {
    return at;
  }
  return Math.min(at, Math.max(0, text.length - 1));
}
var DIGIT = /^[0-9]$/;
var ModeSurface = class {
  #mode = "NORMAL";
  /** Told every time the mode changes — see `onChange`. */
  #listeners = [];
  /**
   * CALL `fn` WHENEVER THE MODE CHANGES (2026-10-08). The mode badge and the phone's touch bar
   * show the mode. They used to be updated by one repaint path, and a line editor's own save
   * repaints by another, so after Escape or Enter the badge could still say INSERT. The surface
   * that changes the mode is now the one that says so.
   */
  onChange(fn) {
    this.#listeners.push(fn);
  }
  #set(mode) {
    const changed = this.#mode !== mode;
    this.#mode = mode;
    if (changed) for (const fn of this.#listeners) fn(mode);
  }
  #count = "";
  #pendingG = false;
  #pendingD = false;
  #pendingY = false;
  #caretHint = void 0;
  get mode() {
    return this.#mode;
  }
  /**
   * Start editing — an `<input>` is about to hold the selected line's characters. Called by
   * `handleKey` for `i`/`Enter`/`a`, and by the DOM wiring for a mouse click, which has meant "edit
   * this line" since before this module existed and goes on meaning it.
   *
   * `caret` IS A COLUMN AND NOTHING ELSE. `i` passes the cursor's own column and `a` passes
   * `column + 1`; a mouse click passes nothing, because a click puts the caret where the person
   * clicked and the painter must not overrule that.
   *
   * IT USED TO ACCEPT `"end"` AS WELL, AND THAT UNION IS GONE ON PURPOSE. `"end"` was shorthand for
   * "the column one past the last character" from a time when NORMAL had no column to be one past
   * — the string was standing in for arithmetic nothing could do yet. Now the cursor HAS a column,
   * `a` is `column + 1`, and a second way of naming a position on the same axis would be exactly
   * the second coordinate system this change is under instruction not to introduce.
   * See `takeCaretHint` for how the painter reads it back.
   */
  enterInsert(caret) {
    this.#caretHint = caret;
    this.#count = "";
    this.#pendingG = false;
    this.#pendingD = false;
    this.#pendingY = false;
    this.#set("INSERT");
  }
  /**
   * The caret hint set by the last `enterInsert`, consumed once and cleared.
   *
   * CONSUMED RATHER THAN JUST READ, so a later repaint of the SAME INSERT session (there is none
   * today — nothing repaints an open `<input>` while it holds focus — but the consume-once shape is
   * what stops one arriving unnoticed and re-applying a stale "jump to the end" over wherever the
   * operator has since moved the caret by hand) cannot reapply it. The painter calls this exactly
   * once, at the moment it builds the `<input>` the hint was for.
   */
  takeCaretHint() {
    const hint = this.#caretHint;
    this.#caretHint = void 0;
    return hint;
  }
  /**
   * Leave editing — the selected line PERSISTS (FocusSurface's `lineIndex` is not touched here;
   * see paint.ts's `settle`, which stops calling `focus.blur()` once a `ModeSurface` is wired in,
   * for exactly this reason). Vim always has a cursor on some line; only whether that line is open
   * for text ever turns off.
   */
  enterNormal() {
    this.#caretHint = void 0;
    this.#count = "";
    this.#pendingG = false;
    this.#pendingD = false;
    this.#pendingY = false;
    this.#set("NORMAL");
  }
  /**
   * One keystroke while in NORMAL mode. No-op (and reports unhandled) while in INSERT — the
   * `<input>`'s own keydown listener owns keys once one is open, and this module never reaches
   * into it.
   *
   * `current`/`lastIndex` are `FocusSurface.lineIndex` (never `null` while vim owns the cursor —
   * the DOM wiring is responsible for giving it a starting value) and the last valid line index
   * for the view being shown.
   *
   * `column` IS THE CURSOR'S OTHER AXIS AND IT IS AN INPUT, NOT A DECISION MADE HERE. It arrives
   * from `FocusSurface.column` exactly as `current` arrives from `FocusSurface.lineIndex`, and this
   * module reads it for `i`/`a` (which open INSERT relative to it) and for nothing else. It
   * defaults to `0` so every caller written before the column existed goes on compiling and goes on
   * meaning what it meant: `i` at column zero is the start of the line.
   *
   * COUNT PREFIX: digits accumulate; `1`-`9` may start one, `0` may only CONTINUE one already
   * started. A BARE `0` IS NOW COLUMN ZERO, which is a change: it was left unbound while the cursor
   * had no column to send to zero, and "left unbound until there is something for it to mean" is
   * what that note in the brief was recording. There is now.
   *
   * `gg`: the one two-key binding. A `g` that is not followed by a second `g` is silently
   * abandoned and the key that broke the pair is processed as an ordinary keystroke — so `g` then
   * `j` moves down by one rather than doing nothing at all.
   */
  /**
   * `column` IS GONE FROM THIS SIGNATURE (2026-08-12) AND ITS ABSENCE IS THE POINT. It existed so
   * `i`/`a` could compute `column` and `column + 1`. This module imports nothing and therefore
   * cannot see the line those numbers index, so computing them here was always arithmetic performed
   * out of sight of its own operand — and the clamp that made `column + 1` safe lived in paint.ts,
   * two modules away. `column.ts` holds both halves now, and once it did, this parameter was read
   * by nothing. A parameter a module cannot use is the same "looks like data, means nothing" shape
   * as the literal `0` this whole change removed from `focus()`; it is deleted for the same reason.
   */
  handleKey(key, current, lastIndex) {
    if (this.#mode !== "NORMAL") {
      return { handled: false, effect: { kind: "none" } };
    }
    if (this.#pendingG) {
      this.#pendingG = false;
      this.#pendingD = false;
      this.#pendingY = false;
      if (key === "g") {
        this.#count = "";
        return { handled: true, effect: { kind: "move", lineIndex: clampLine(0, lastIndex) } };
      }
    }
    if (key === "g") {
      this.#pendingG = true;
      return { handled: false, effect: { kind: "none" } };
    }
    if (this.#pendingD) {
      this.#pendingD = false;
      if (key === "d") {
        this.#count = "";
        return { handled: true, effect: { kind: "delete-line" } };
      }
    }
    if (key === "d") {
      this.#pendingD = true;
      this.#pendingY = false;
      return { handled: true, effect: { kind: "none" } };
    }
    if (this.#pendingY) {
      this.#pendingY = false;
      if (key === "y") {
        this.#count = "";
        return { handled: true, effect: { kind: "yank" } };
      }
    }
    if (key === "y") {
      this.#pendingY = true;
      return { handled: true, effect: { kind: "none" } };
    }
    if (key === "u") {
      this.#count = "";
      return { handled: true, effect: { kind: "undo" } };
    }
    if (key === "p" || key === "P") {
      this.#count = "";
      return { handled: true, effect: { kind: "paste", where: key === "p" ? "below" : "above" } };
    }
    if (DIGIT.test(key)) {
      if (key === "0" && this.#count === "") {
        return { handled: true, effect: { kind: "column", to: "start" } };
      }
      this.#count += key;
      return { handled: true, effect: { kind: "none" } };
    }
    const pending = this.#count === "" ? null : Number(this.#count);
    this.#count = "";
    switch (key) {
      case "j":
      case "ArrowDown":
        return {
          handled: true,
          effect: { kind: "move", lineIndex: clampLine(current + (pending ?? 1), lastIndex) }
        };
      case "k":
      case "ArrowUp":
        return {
          handled: true,
          effect: { kind: "move", lineIndex: clampLine(current - (pending ?? 1), lastIndex) }
        };
      case "G":
        return {
          handled: true,
          effect: {
            kind: "move",
            lineIndex: pending === null ? clampLine(lastIndex, lastIndex) : clampLine(pending - 1, lastIndex)
          }
        };
      case "i":
      case "Enter":
        this.enterInsert("insert");
        return { handled: true, effect: { kind: "enter-insert", caret: "insert" } };
      case "a":
        this.enterInsert("append");
        return { handled: true, effect: { kind: "enter-insert", caret: "append" } };
      case "A":
        this.enterInsert("append-end");
        return { handled: true, effect: { kind: "enter-insert", caret: "append-end" } };
      case "$":
        return { handled: true, effect: { kind: "column", to: "end" } };
      case "o":
        if (pending !== null) {
          return { handled: true, effect: { kind: "none" } };
        }
        return { handled: true, effect: { kind: "open", direction: "below" } };
      case "O":
        if (pending !== null) {
          return { handled: true, effect: { kind: "none" } };
        }
        return { handled: true, effect: { kind: "open", direction: "above" } };
      case "c":
        if (pending !== null) {
          return { handled: true, effect: { kind: "none" } };
        }
        return { handled: true, effect: { kind: "capture" } };
      case "?":
        return { handled: true, effect: { kind: "help" } };
      case "/":
        return { handled: true, effect: { kind: "search" } };
      // BACK AND FORWARD THROUGH VIEWS (2026-10-09, operator request): Vimium's keys. The history is
      // the browser's own (app/shell/viewhistory.ts), so a phone's swipe and ⌘[ / ⌘] agree with them.
      case "H":
        return { handled: true, effect: { kind: "view-back" } };
      case "L":
        return { handled: true, effect: { kind: "view-forward" } };
      case "x":
      case " ":
        if (pending !== null) {
          return { handled: true, effect: { kind: "none" } };
        }
        return { handled: true, effect: { kind: "toggle-done" } };
      case "{":
        return { handled: true, effect: { kind: "boundary", direction: "prev", count: pending ?? 1 } };
      case "}":
        return { handled: true, effect: { kind: "boundary", direction: "next", count: pending ?? 1 } };
      case ">":
        return { handled: true, effect: { kind: "indent", direction: "in", count: pending ?? 1 } };
      case "<":
        return { handled: true, effect: { kind: "indent", direction: "out", count: pending ?? 1 } };
      case "w":
        return { handled: true, effect: { kind: "word", motion: "w", count: pending ?? 1 } };
      case "b":
        return { handled: true, effect: { kind: "word", motion: "b", count: pending ?? 1 } };
      case "e":
        return { handled: true, effect: { kind: "word", motion: "e", count: pending ?? 1 } };
      default:
        return { handled: false, effect: { kind: "none" } };
    }
  }
};

// app/present/word.ts
function wordCaret(line, motion, count, from) {
  const words2 = titleSpans(line);
  if (words2.length === 0) {
    return null;
  }
  const n = Math.max(1, count);
  const last = words2[words2.length - 1];
  const first = words2[0];
  if (motion === "b") {
    const before = words2.map((word2) => word2.start).filter((at) => at < from);
    if (before.length === 0) {
      return first.start;
    }
    return before[Math.max(0, before.length - n)];
  }
  const after = motion === "e" ? words2.map((word2) => word2.end - 1).filter((at) => at > from) : words2.map((word2) => word2.start).filter((at) => at > from);
  if (after.length === 0) {
    return motion === "e" ? last.end - 1 : last.start;
  }
  return after[Math.min(n - 1, after.length - 1)];
}

// app/present/column.ts
function isInsertSpace(instruction) {
  return instruction.kind === "insert" || instruction.kind === "append" || instruction.kind === "append-end" || instruction.kind === "at";
}
function columnFor(instruction, lineText, from) {
  const raw = rawColumnFor(instruction, lineText, from);
  if (raw === null) {
    return null;
  }
  if (!isInsertSpace(instruction)) {
    return clampColumn(raw, lineText);
  }
  if (!Number.isFinite(raw) || raw < 0) {
    return 0;
  }
  const at = Math.floor(raw);
  return lineText === null ? at : Math.min(at, lineText.length);
}
function rawColumnFor(instruction, lineText, from) {
  switch (instruction.kind) {
    case "line-start":
      return 0;
    case "line-end":
      return lineText === null ? 0 : lineText.length;
    case "keep":
    case "insert":
      return from;
    case "append":
      return from + 1;
    case "append-end":
      return lineText === null ? from : lineText.length;
    case "word":
      return lineText === null ? from : wordCaret(lineText, instruction.motion, instruction.count, from);
    case "at":
      return instruction.column;
    case "leave-insert":
      return from - 1;
  }
}

// app/present/focus.ts
function lineTextOf(source, lineIndex) {
  if (source === void 0) {
    return null;
  }
  return source.split("\n")[lineIndex] ?? null;
}
var FOCUSED = Object.freeze(
  Object.fromEntries(RESOLUTION_KEYS.map((key) => [key, "raw"]))
);
var FocusSurface = class {
  #lineIndex = null;
  #anchor = null;
  #column = 0;
  /** The line the cursor is on, or `null` when it is nowhere. */
  get lineIndex() {
    return this.#lineIndex;
  }
  /**
   * WHICH CHARACTER of that line the cursor is on — an offset into the line's own source string,
   * clamped to a character that exists. `0` when the cursor is nowhere.
   *
   * IT IS AN OFFSET INTO THE LINE THE INDEX ALREADY NAMES, NOT A SECOND COORDINATE SYSTEM. The
   * anchor decides WHICH line; this decides WHERE IN IT. Every column that enters this surface is
   * clamped against that line's characters on the way in, which is what makes "clamped to a
   * character that exists" a property of the surface rather than of each of its callers.
   */
  get column() {
    return this.#column;
  }
  /**
   * WHICH line the cursor is on, expressed as identity rather than as a position — or `null` when
   * nothing was anchored. See `focus` below for the two ways that happens.
   */
  get anchor() {
    return this.#anchor;
  }
  isFocused(lineIndex) {
    return this.#lineIndex === lineIndex;
  }
  /**
   * Put the cursor on a line. One line at a time — there is one cursor.
   *
   * `source` IS OPTIONAL AND ITS ABSENCE IS A REAL CONFIGURATION, the same shape `PaintDeps`
   * already draws for `focus`, `mode` and `draft`: without it the cursor is a bare index exactly as
   * it was before this parameter existed, and `reanchor` below reports `unanchored` rather than
   * pretending. Every caller in the shipped app supplies it (`app/index.html`, `paint.ts`); the
   * tests written before anchoring existed do not, and go on painting what they always painted.
   *
   * THE INDEX AND THE ANCHOR ARE SET IN ONE CALL, on purpose. Two setters would be two facts that
   * can disagree about where one cursor is, and "there is one cursor" is the property every motion
   * in this bundle is arithmetic on.
   *
   * `column` DEFAULTS TO ZERO, WHICH IS A DECISION AND NOT AN OMISSION. Landing on a line puts the
   * cursor at its start: `j`, `k`, `gg`, `G`, `{`, `}` and a mouse click all take this default, so a
   * line move resets the column. Vim's own `j`/`k` instead remember a DESIRED column and restore it
   * on a line long enough to hold it — a third piece of state (the desired column is not the actual
   * one) that nothing in this change needs, so it is not built. What IS needed is that `w`/`b`/`e`
   * repeat, and they do not move between lines. The one caller that passes a column is `reanchor`
   * below, which is preserving one rather than choosing one.
   *
   * `view` DEFAULTS TO `""`, THE SAME OPTIONAL-DEPENDENCY POSTURE AS `source`. It is what namespaces
   * the anchor's instance string (`instance.ts`, `${view}/${section}/${token}`) so a future cursor
   * remembered ACROSS views cannot collide two views' section-0 into one key — not a live feature,
   * so most tests never pass it and get `""` consistently, which is harmless as long as `reanchor`
   * is given the SAME view an anchor was taken with. Every real call site is (`app/index.html`,
   * `paint.ts`), because a view's own id is already in hand wherever a line is focused.
   */
  focus(lineIndex, source, view = "") {
    this.place(lineIndex, { kind: "line-start" }, source, view);
  }
  /**
   * MOVE THE CURSOR TO A LINE, SAYING WHAT THE COLUMN SHOULD MEAN THERE.
   *
   * THE COLUMN PARAMETER IS GONE AND THIS IS WHAT REPLACED IT. `focus` used to take
   * `column = 0`, and five of its seven callers passed a literal `0` — not because they meant
   * column zero but because they had nothing to say about the column. Those two things were
   * spelled identically, so the second was invisible: measured 2026-08-12, `j`/`k`, `{`/`}`, a
   * click, the post-edit settle and view entry all silently reset an established column, and the
   * insert path never wrote one at all. Deleting the parameter was tried first and surfaced
   * nothing, because every caller already typed the `0` explicitly (see the backlog row
   * `focus-column-does-not-follow-the-caret`). The only way to make "I have nothing to say"
   * unspellable was to stop accepting a number here and accept an INSTRUCTION instead.
   *
   * SO THIS SURFACE NEVER RECEIVES A POSITION FROM A CALLER THAT ALREADY DECIDED. It receives what
   * the gesture MEANT and asks `columnFor` (column.ts), which is the only code in the application
   * that computes a column. `#column` is assigned in exactly two places, both of them one line
   * long, and both of them assign what `columnFor` returned.
   */
  place(lineIndex, instruction, source, view = "") {
    this.#lineIndex = lineIndex;
    this.#anchor = source === void 0 ? null : instanceAnchorFor(source, lineIndex, view);
    const resolved = columnFor(instruction, lineTextOf(source, lineIndex), this.#column);
    if (resolved !== null) {
      this.#column = resolved;
    }
  }
  /**
   * Move the cursor along the line it is already on — `w`/`b`/`e`/`0`/`$`, and nothing else.
   *
   * IT TAKES THE LINE'S TEXT RATHER THAN LOOKING IT UP, for the same reason `focus` takes a source:
   * this surface holds no copy of the view and must not start holding one. The caller has the string
   * the column was computed against (app/index.html reads it out of the same `v.markdown` it hands
   * `wordCaret`), so passing it is passing the fact, not fetching it twice.
   *
   * IT IS A SEPARATE CALL FROM `focus` AND THAT IS NOT THE "TWO SETTERS" THE NOTE ABOVE REFUSES.
   * That refusal is about two setters for ONE fact — an index and an anchor that could disagree
   * about which line the cursor is on. A column is a different axis: it cannot disagree with the
   * index, only be clamped by it, which is exactly what happens here.
   */
  moveColumn(column, lineText) {
    this.#column = clampColumn(column, lineText);
  }
  /**
   * MOVE THE CURSOR WITHIN THE LINE IT IS ALREADY ON, saying what the gesture meant.
   *
   * The column-only sibling of `place`, and the replacement for `moveColumn`'s number-taking shape
   * on every real caller. `w`/`b`/`e` and `0`/`$` were already CORRECT before this change — they
   * are the only two gestures that were — and they were correct precisely because each of them
   * already ran an answering module (`word.ts`) or the line's own length before writing. Routing
   * them through `columnFor` changes none of their answers; it removes the second entry point by
   * which a caller could write a column it had decided for itself.
   *
   * RETURNS WHETHER THE CURSOR MOVED, which is `wordCaret`'s "this line has no title at all"
   * passed through: the caller repaints on `true` and does nothing on `false`, exactly as it did
   * when it made that test itself.
   */
  moveTo(instruction, lineText) {
    const resolved = columnFor(instruction, lineText, this.#column);
    if (resolved === null) {
      return false;
    }
    this.#column = resolved;
    return true;
  }
  /**
   * THE WORLD ARRIVED. Where is the cursor's line in `source` now, and how did the walk find it?
   *
   * `view` MUST BE THE SAME VIEW THE ANCHOR WAS TAKEN AGAINST — every real caller has it in hand
   * already (`app/index.html`'s `paintView` only ever calls this when `sameView`, i.e. `id` here is
   * the same id the anchor's own `focus()` call used). IT DEFAULTS TO `""`, THE SAME AS `focus()`'s
   * OWN DEFAULT, so a caller that never passes one (every test written before either parameter
   * existed) stays consistent with itself — the anchor was taken with `""` and is resolved with
   * `""` — rather than mismatching against `focus()`'s default and reporting `absent` for a line
   * that is still there.
   *
   * On `found` the cursor MOVES to the line it found and the anchor is taken again against the new
   * projection — a cycle that stamped the line, or rewrote its tail, has changed the token an
   * unstamped line's instance depends on, and an anchor that went on describing the previous
   * projection would be the same defect one repaint later.
   *
   * ON `ambiguous` AND `absent` NOTHING MOVES AND NOTHING IS CLEARED, which is deliberate rather
   * than unfinished. Blurring a cursor whose line has vanished would destroy the one thing row 4
   * (`the-vanished-line-is-parked-not-dropped`) needs in order to park the operator's characters
   * where he can recover them. This row's whole obligation is that the outcome REACHES THE CALLER
   * instead of being silence, and the caller decides.
   *
   * IT IS THE CALLER'S CALL, NOT THE PAINTER'S. `paint` cannot tell a projection arriving from its
   * own optimistic repaint of a source it has already seen, so re-anchoring lives with the code
   * that knows a snapshot landed — the same split `boundaryLine` and `openLine` already have
   * between a pure answer and the wiring that asks for it.
   *
   * THE COLUMN THIS METHOD WAS WARNED ABOUT NOW EXISTS, AND THIS IS THE EXPLICIT DECISION.
   *
   * The warning left here by the row that made the cursor an identity was that a column added as a
   * third field would be SILENTLY RESET on every arrival, because this method moves the cursor by
   * calling `focus()` and `focus()` owns the index and the anchor and nothing else. It does not
   * happen, because the column is passed back through: `focus(lineIndex, source, this.#column, view)`.
   *
   * AND IT IS CLAMPED RATHER THAN CARRIED, which is the fact the warning said was already in hand.
   * `focus` re-takes the anchor against the ARRIVING projection, so it also has that projection's
   * text for the line the cursor landed on, and `clampColumn` (motions.ts) cuts the column down to a
   * character that is really there. A cycle that shortened the line — stripped a marker cell,
   * rewrote a tail — leaves the cursor on that line's LAST character rather than past its end, and a
   * cycle that lengthened it leaves the column exactly where the operator put it. Neither outcome is
   * a guess: both are the same one clamp, applied to whatever arrived.
   *
   * ON `ambiguous` AND `absent` THE COLUMN IS UNTOUCHED, for the same reason the index and the
   * anchor are: nothing about the cursor moves when the world could not tell us where its line went.
   */
  reanchor(source, view = "") {
    const anchor = this.#anchor;
    if (anchor === null) {
      return { outcome: "unanchored" };
    }
    const reading = resolveInstanceAnchor(anchor, source, view);
    if (reading.outcome === "found") {
      this.place(reading.lineIndex, { kind: "keep" }, source, view);
    }
    return reading;
  }
  /** Take the cursor off whatever it was on. */
  blur() {
    this.#lineIndex = null;
    this.#anchor = null;
    this.#column = 0;
  }
  /**
   * The context to resolve ONE line against: the caller's facts, plus FOCUS if this is the line.
   *
   * The level name lives here rather than at the call site so the painter never has to know which
   * rung the cursor sits on — it hands over a line number and a context and gets a context back.
   */
  contextFor(lineIndex, base) {
    return base.with("FOCUS", this.isFocused(lineIndex) ? FOCUSED : void 0);
  }
};

// app/present/base.ts
var BASE_PREFIX = "sha256-";
var K = Uint32Array.from([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
var H0 = Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]);
var rotr = (word2, bits) => word2 >>> bits | word2 << 32 - bits;
var word = (words2, index) => words2[index] ?? 0;
function sha256Hex(bytes) {
  const blocks = new Uint8Array(((bytes.length + 9 + 63) / 64 | 0) * 64);
  blocks.set(bytes);
  blocks[bytes.length] = 128;
  const view = new DataView(blocks.buffer);
  const bits = bytes.length * 8;
  view.setUint32(blocks.length - 8, Math.floor(bits / 4294967296));
  view.setUint32(blocks.length - 4, bits >>> 0);
  const h = Uint32Array.from(H0);
  const w = new Uint32Array(64);
  for (let start = 0; start < blocks.length; start += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(start + i * 4);
    }
    for (let i = 16; i < 64; i += 1) {
      const x = word(w, i - 15);
      const y = word(w, i - 2);
      const s0 = rotr(x, 7) ^ rotr(x, 18) ^ x >>> 3;
      const s1 = rotr(y, 17) ^ rotr(y, 19) ^ y >>> 10;
      w[i] = word(w, i - 16) + s0 + word(w, i - 7) + s1 >>> 0;
    }
    let a = word(h, 0);
    let b = word(h, 1);
    let c = word(h, 2);
    let d = word(h, 3);
    let e = word(h, 4);
    let f = word(h, 5);
    let g = word(h, 6);
    let work = word(h, 7);
    for (let i = 0; i < 64; i += 1) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const choice = e & f ^ ~e & g;
      const t1 = work + s1 + choice + word(K, i) + word(w, i) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const majority = a & b ^ a & c ^ b & c;
      const t2 = s0 + majority >>> 0;
      work = g;
      g = f;
      f = e;
      e = d + t1 >>> 0;
      d = c;
      c = b;
      b = a;
      a = t1 + t2 >>> 0;
    }
    const round = [a, b, c, d, e, f, g, work];
    for (let i = 0; i < 8; i += 1) {
      h[i] = word(h, i) + (round[i] ?? 0) >>> 0;
    }
  }
  return Array.from(h).map((word2) => word2.toString(16).padStart(8, "0")).join("");
}
function baseOf(markdown) {
  return BASE_PREFIX + sha256Hex(new TextEncoder().encode(markdown));
}
var BaseSurface = class {
  #path = null;
  #markdown = null;
  #writing = /* @__PURE__ */ new Map();
  /** The file this surface is holding a base for, or `null` when it holds none. */
  get path() {
    return this.#path;
  }
  /** The markdown the server last sent for that file, or `null` when none was taken. */
  get markdown() {
    return this.#markdown;
  }
  /**
   * THE SERVER SENT THIS FILE. Hold it as the base every write of that file is measured against.
   *
   * Called with the markdown out of the projection being installed — never with a string this app
   * computed. That distinction is the whole detector: the painter repaints OPTIMISTICALLY from its
   * own edited string after a commit (`paint.ts`'s `settle`), so a second edit made before the
   * answer comes back is computed against a string the server has never seen, and the comparison
   * below is what notices.
   */
  take(path, markdown) {
    this.#path = path;
    this.#markdown = markdown;
  }
  /** A write of `path` left for the server and has not answered. */
  open(path) {
    this.#writing.set(path, (this.#writing.get(path) ?? 0) + 1);
  }
  /** It answered, or it failed. Either way it is no longer in the air. */
  close(path) {
    const open = (this.#writing.get(path) ?? 0) - 1;
    if (open > 0) {
      this.#writing.set(path, open);
    } else {
      this.#writing.delete(path);
    }
  }
  /** How many writes of `path` have not answered yet. */
  writing(path) {
    return this.#writing.get(path) ?? 0;
  }
  /**
   * IS THIS WRITE'S BASE THE FILE THE SERVER LAST SENT? `source` is the exact string the edit was
   * applied to — `applyEdit`'s own input, handed up by the painter, never re-derived here.
   *
   * `stale` IS CHECKED BEFORE `writing` because it is the stronger statement: it says this write's
   * base is provably not the served copy, where `writing` only says the server has moved past
   * whatever base it carries. The two overlap (a second line commit inside one cycle is both) and
   * one sentence is what the operator gets, so the more specific one wins.
   */
  read(path, source) {
    if (this.#path !== path || this.#markdown === null) {
      return { outcome: "unknown" };
    }
    if (this.#markdown !== source) {
      return { outcome: "stale" };
    }
    if (this.writing(path) > 0) {
      return { outcome: "writing" };
    }
    return { outcome: "current" };
  }
  /**
   * Forget the base. The pending writes are NOT forgotten — they are still in the air, and a
   * surface that pretended otherwise would report `current` for a save it knows is already
   * superseded.
   */
  drop() {
    this.#path = null;
    this.#markdown = null;
  }
};

// app/present/boundary.ts
function boundaryLine(lines, current, direction, count) {
  let at = current;
  for (let step = 0; step < count; step += 1) {
    const found = direction === "next" ? nextHeading(lines, at) : prevHeading(lines, at);
    if (found === null) {
      return direction === "next" ? Math.max(0, lines.length - 1) : 0;
    }
    at = found;
  }
  return at;
}
function nextHeading(lines, from) {
  for (let at = from + 1; at < lines.length; at += 1) {
    if (classifyLine(lines[at] ?? "").kind === "heading") {
      return at;
    }
  }
  return null;
}
function prevHeading(lines, from) {
  for (let at = from - 1; at >= 0; at -= 1) {
    if (classifyLine(lines[at] ?? "").kind === "heading") {
      return at;
    }
  }
  return null;
}

// app/present/draft.ts
function placeFor(source, lineIndex, view) {
  const above = lineIndex > 0 ? instanceAnchorFor(source, lineIndex - 1, view) : null;
  if (above !== null) {
    return { anchor: above, side: "above" };
  }
  const below = instanceAnchorFor(source, lineIndex, view);
  return below === null ? null : { anchor: below, side: "below" };
}
function carries(source, text) {
  return source.split("\n").some((line) => extendsLine(text, line));
}
function placeDraft(draft, before, after, view) {
  if (draft.typed !== draft.seed && carries(after, draft.typed) && !carries(before, draft.typed)) {
    return { outcome: "arrived" };
  }
  if (draft.place === null) {
    return { outcome: "unplaced", because: "no-place" };
  }
  const reading = resolveInstanceAnchor(draft.place.anchor, after, view);
  if (reading.outcome === "found") {
    const at = draft.place.side === "above" ? reading.lineIndex + 1 : reading.lineIndex;
    return { outcome: "placed", lineIndex: at, via: reading.via };
  }
  return { outcome: "unplaced", because: reading.outcome };
}
var DraftSurface = class {
  #draft = null;
  #generation = 0;
  /** The line being made, or `null` when none is. */
  get draft() {
    return this.#draft;
  }
  /**
   * WHICH ROW THE SURFACE IS ON — a monotonic counter, bumped by every one of the three calls that
   * changes which row exists (`open`, `carry`, `drop`).
   *
   * IT IS THE ONLY THING THAT MAKES A SURVIVING DRAFT SAFE, and it closes a hole that was already
   * there. `paint.ts` builds one `<input>` per row and that element's `blur` listener SETTLES —
   * computing an `insert-line` against the source string the row was opened against and handing it
   * to the page's write path. Removing a focused element is a blur in every browser that fires one.
   * Before this row existed the page dropped the draft and repainted, and the removed element's
   * blur could still post into the view being left; the drop protected the SURFACE and not the
   * ELEMENT. A row that now SURVIVES a projection is repainted as a second element, so the first
   * one has to be answerable for.
   *
   * `paint.ts` captures this number when it builds the element and refuses to settle or abandon
   * when it no longer matches: an element whose row has been dropped, or re-placed, is not the row
   * on screen and its settlement is not this row's settlement.
   */
  get generation() {
    return this.#generation;
  }
  /** Is a line being made AT this index? */
  isDraftAt(lineIndex) {
    return this.#draft?.lineIndex === lineIndex;
  }
  /** Open a line. One at a time — there is one cursor, and a draft always has it.
   *
   * `cursorOffset` is OPTIONAL and additive — see `Draft.cursorOffset`'s own header. Every existing
   * caller that passes only `(lineIndex, seed, place)` keeps getting `undefined`, which `paint.ts`'s
   * `paintDraft` reads as "let the browser place the caret", exactly as it always has. */
  open(lineIndex, seed, place = null, cursorOffset) {
    this.#draft = { lineIndex, seed, typed: seed, place, cursorOffset };
    this.#generation += 1;
  }
  /**
   * The row holds these characters now. Called as they are typed, so a repaint can put them back.
   *
   * A NO-OP WHEN NO ROW IS OPEN, rather than an error: the caller is a DOM listener on an element
   * that may already have been removed, and a listener that can throw during teardown is a
   * listener that takes the page down with it.
   */
  type(text) {
    if (this.#draft === null) {
      return;
    }
    this.#draft = { ...this.#draft, typed: text };
  }
  /**
   * THE ROW SURVIVED A PROJECTION — same characters, same seed, new index and a freshly taken
   * place.
   *
   * The place is re-taken by the caller against the ARRIVING source rather than carried forward,
   * for the reason `focus.reanchor` re-takes its own anchor on a `found`: an anchor that goes on
   * describing the previous projection is an anchor that drifts one cycle at a time.
   */
  carry(lineIndex, place) {
    if (this.#draft === null) {
      return;
    }
    this.#draft = { ...this.#draft, lineIndex, place };
    this.#generation += 1;
  }
  /**
   * Abandon the line being made.
   *
   * NOT A DELETION, and the distinction is the whole point of this module: the line was never in
   * the file, so there is nothing to remove and no source edit to write down. Escape, Backspace on
   * an empty draft, and settling without having typed anything all land here.
   */
  drop() {
    this.#draft = null;
    this.#generation += 1;
  }
};

// app/present/queue.ts
function isNewer(arriving, held) {
  if (arriving === null || held === null) {
    return true;
  }
  const a = Date.parse(arriving);
  const b = Date.parse(held);
  if (Number.isNaN(a) || Number.isNaN(b)) {
    return true;
  }
  return a > b;
}
var ProjectionQueue = class {
  #pending = /* @__PURE__ */ new Map();
  /**
   * THE NEWEST `generated_at` THIS QUEUE HAS EVER ACCEPTED FOR A PATH, whether or not it is still
   * holding it. One entry per file, never removed except by `clear`.
   *
   * ── WHY IT HAS TO OUTLIVE `#pending` ──
   *
   * TWO DIFFERENT ORDERINGS RUN THROUGH THIS CLASS AND ONLY ONE OF THEM WAS SURVIVING.
   *
   *   EDIT ordering — a projection computed before the operator's newest edit no longer describes
   *     the screen. That is what `drop` is for, and it is right.
   *   ARRIVAL ordering — a slower answer must not overwrite a faster, newer one. That is what
   *     `isNewer` is for, and it is right too.
   *
   * `drop` answered its own question by DELETING the entry — and the entry was also the only
   * evidence the second question had. So on the second of two rapid commits, `offer` found an empty
   * map, took the `held === undefined` path, and queued unconditionally: `isNewer` was not
   * consulted because there was nothing left to compare against. An answer that left the server
   * FIRST could then land on screen after one that left it later.
   *
   * The watermark separates the two. `drop` still clears what is HELD; it no longer takes the
   * arrival-ordering evidence with it.
   *
   * ── AND IT CLOSES THE SAME HOLE IN `take`, WHICH IS NOT THE ONE ANYONE WAS LOOKING FOR ──
   *
   * `take` removes the entry too, because the caller is about to install it. Between that removal
   * and the next arrival the map is equally empty, so an answer that overtook the one just applied
   * was accepted for exactly the same reason. Proven by its own test rather than reasoned about.
   *
   * ── EVERY VALUE COMPARED IS THE SERVER'S OWN `generated_at` ──
   *
   * No browser clock enters this, so there is no cross-clock ordering to get wrong. A design that
   * stamped the DROP with the moment of the edit would have had to compare the operator's clock
   * against the server's, and this deliberately does not.
   */
  #highWater = /* @__PURE__ */ new Map();
  /**
   * A PROJECTION ARRIVED FOR `path`. Hold it, unless what is already held is at least as new.
   *
   * It does not install anything and it cannot: installing is a repaint, a repaint needs a DOM, and
   * this module has none. The caller drains.
   */
  offer(path, generatedAt, data) {
    const held = this.#pending.get(path);
    if (this.#highWater.has(path) && !isNewer(generatedAt, this.#highWater.get(path) ?? null)) {
      return { outcome: "stale" };
    }
    this.#highWater.set(path, generatedAt);
    this.#pending.set(path, { path, generatedAt, data });
    return { outcome: held === void 0 ? "queued" : "superseded" };
  }
  /** What is waiting for `path`, without taking it. `null` when nothing is. */
  pending(path) {
    return this.#pending.get(path) ?? null;
  }
  /** Take what is waiting for `path` and stop holding it. `null` when nothing is. */
  take(path) {
    const held = this.#pending.get(path);
    if (held === void 0) {
      return null;
    }
    this.#pending.delete(path);
    return held;
  }
  /** Stop holding anything for `path`, applied or not. */
  drop(path) {
    this.#pending.delete(path);
  }
  /** How many paths have something waiting. One per file, so this is also "how many files". */
  get size() {
    return this.#pending.size;
  }
  /**
   * Forget everything, for the same reason `BaseSurface.drop` exists: the graph went away (a
   * sign-out) and a projection held for a session that has ended is a projection for a file this
   * page may no longer read.
   */
  clear() {
    this.#pending.clear();
    this.#highWater.clear();
  }
};

// app/present/pickup.ts
var PICKUP_DELAYS = [45e3, 2e4, 3e4];
var OWED_LIMIT = 16;
var PickupSchedule = class {
  #delays;
  #waiting = /* @__PURE__ */ new Map();
  constructor(delaysMs = PICKUP_DELAYS) {
    this.#delays = [...delaysMs];
  }
  /** How many attempts one write buys before the schedule gives up. */
  get attempts() {
    return this.#delays.length;
  }
  /**
   * A WRITE WAS ACCEPTED FOR `path` — its answer is owed, so place a read.
   *
   * `token` is the write's own handle (`correlation.ts`'s `mintWriteToken`) or `null` when the
   * browser could not mint one. `since` is the `generated_at` the page was holding as this write
   * left. `owed` is the bodies of the lines it introduced with no stamp (`correlation.ts`'s
   * `stampsOwed`). ALL THREE are held OPAQUELY and only handed back at `attempt` time; nothing here
   * compares any of them to anything.
   */
  schedule(path, token = null, since = null, owed = []) {
    const held = this.#waiting.get(path);
    if (held !== void 0) {
      held.token = token;
      held.since = since;
      held.owed = [.../* @__PURE__ */ new Set([...held.owed, ...owed])].slice(-OWED_LIMIT);
      held.attempt = 0;
      return { outcome: "joined", attempt: 0 };
    }
    this.#waiting.set(path, {
      token,
      since,
      owed: [...new Set(owed)].slice(-OWED_LIMIT),
      attempt: 0
    });
    return { outcome: "scheduled", delayMs: this.#delayFor(0), attempt: 0 };
  }
  /**
   * THE TIMER FIRED. Start the next attempt, or report that there is nothing left to collect.
   *
   * `cancelled` is not a failure: it is what a pickup that has already been satisfied by another
   * route — the re-read button, a later write's own projection — looks like from inside the timer
   * that was still counting.
   */
  attempt(path) {
    const held = this.#waiting.get(path);
    if (held === void 0) {
      return { outcome: "cancelled" };
    }
    held.attempt += 1;
    return {
      outcome: "read",
      attempt: held.attempt,
      token: held.token,
      since: held.since,
      owed: [...held.owed]
    };
  }
  /**
   * THE ATTEMPT ANSWERED. `satisfied` is the PAGE'S judgement that the write this pickup was
   * collecting has been answered — see the header for why it is told rather than decided here.
   *
   * `exhausted` DROPS THE RECORD. There is nothing left to collect and nothing will re-arm on its
   * own; the next read of this file is a gesture the operator makes.
   */
  answered(path, satisfied) {
    const held = this.#waiting.get(path);
    if (held === void 0) {
      return { outcome: "done" };
    }
    if (satisfied) {
      this.#waiting.delete(path);
      return { outcome: "done" };
    }
    if (held.attempt >= this.#delays.length) {
      this.#waiting.delete(path);
      return { outcome: "exhausted" };
    }
    return { outcome: "again", delayMs: this.#delayFor(held.attempt), attempt: held.attempt };
  }
  /** A projection for `path` arrived by some other route. Returns whether one was outstanding. */
  cancel(path) {
    return this.#waiting.delete(path);
  }
  /** The write a pickup for `path` is collecting the answer to, or `null` when there is none. */
  token(path) {
    return this.#waiting.get(path)?.token ?? null;
  }
  /** The stamp a pickup for `path` is waiting to see passed, or `null` when there is none. */
  since(path) {
    return this.#waiting.get(path)?.since ?? null;
  }
  /** The line bodies a pickup for `path` is waiting to see stamped. Empty when there is none. */
  owed(path) {
    return [...this.#waiting.get(path)?.owed ?? []];
  }
  /** Is a pickup outstanding for `path`? */
  waiting(path) {
    return this.#waiting.has(path);
  }
  /** How many paths have a pickup outstanding. */
  get size() {
    return this.#waiting.size;
  }
  /** Every pickup dropped — the graph was dropped, or the session ended. */
  clear() {
    this.#waiting.clear();
  }
  /** The wait before the attempt AFTER `made`, clamped to the last declared delay. */
  #delayFor(made) {
    return this.#delays[Math.min(made, this.#delays.length - 1)] ?? 0;
  }
};

// app/present/accepted.ts
var AcceptedSource = class {
  #path = null;
  #markdown = null;
  /** The file this is about, or `null` when nothing is held. */
  get path() {
    return this.#path;
  }
  /** What the server said that file holds, or `null` when nothing is held. */
  get markdown() {
    return this.#markdown;
  }
  /**
   * THE SERVER ACCEPTED THIS FILE'S CONTENT. Hold it until a projection for the path arrives.
   *
   * Called with the markdown that WENT ON THE WIRE and was answered 200 — never with a string the
   * app merely intends to send, and never with one a write failed or was refused on. A 409 says
   * nothing was written, so nothing may be taken here from one.
   */
  take(path, markdown) {
    this.#path = path;
    this.#markdown = markdown;
  }
  /** What the painter should walk for `path`, or `null` when this surface has nothing to say. */
  sourceFor(path) {
    return this.#path === path ? this.#markdown : null;
  }
  /**
   * A PROJECTION FOR `path` ARRIVED, so this is superseded. Returns whether anything was dropped.
   *
   * PATH-CHECKED RATHER THAN UNCONDITIONAL, because a projection is installed for the painted view
   * and the accepted file may be another one — a write leaves for one path and the operator may be
   * looking at a second by the time it answers.
   */
  drop(path) {
    if (this.#path !== path) {
      return false;
    }
    this.#path = null;
    this.#markdown = null;
    return true;
  }
  /** Everything dropped — the graph was dropped, or the session ended. */
  clear() {
    this.#path = null;
    this.#markdown = null;
  }
};

// app/present/correlation.ts
var WRITE_ECHO_KEY = "writes";
function samePath(path) {
  return path.startsWith("/") ? path.slice(1) : path;
}
var TOKEN_PREFIX = "w1-";
var TOKEN_BYTES = 16;
function mintWriteToken() {
  const source = globalThis.crypto;
  if (source === void 0 || typeof source.getRandomValues !== "function") {
    return null;
  }
  const bytes = source.getRandomValues(new Uint8Array(TOKEN_BYTES));
  let out = TOKEN_PREFIX;
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, "0");
  }
  return out;
}
function isToken(value) {
  return typeof value === "string" && value !== "";
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function readWriteEcho(envelope) {
  if (!isRecord(envelope)) {
    return { outcome: "silent" };
  }
  const places = [envelope[WRITE_ECHO_KEY]];
  const snapshot = envelope["snapshot"];
  if (isRecord(snapshot)) {
    places.push(snapshot[WRITE_ECHO_KEY]);
  }
  const writes = /* @__PURE__ */ new Map();
  let present = false;
  for (const place of places) {
    if (place === void 0) {
      continue;
    }
    present = true;
    if (!isRecord(place)) {
      return {
        outcome: "unrecognised",
        problem: `'${WRITE_ECHO_KEY}' is ${JSON.stringify(place)}, which is not an object of path-to-tokens \u2014 no write is treated as landed from this projection`
      };
    }
    for (const [path, listed] of Object.entries(place)) {
      if (!Array.isArray(listed)) {
        return {
          outcome: "unrecognised",
          problem: `'${WRITE_ECHO_KEY}.${path}' is ${JSON.stringify(listed)}, which is not a list of write tokens \u2014 no write is treated as landed from this projection`
        };
      }
      const into = writes.get(samePath(path)) ?? [];
      for (const one of listed) {
        if (!isToken(one)) {
          return {
            outcome: "unrecognised",
            problem: `'${WRITE_ECHO_KEY}.${path}' contains ${JSON.stringify(one)}, which is not a write token \u2014 no write is treated as landed from this projection`
          };
        }
        into.push(one);
      }
      writes.set(samePath(path), into);
    }
  }
  return present ? { outcome: "echo", writes } : { outcome: "silent" };
}
function lineBody(line) {
  let out = line;
  for (const span of [...stampSpans(line)].reverse()) {
    out = out.slice(0, span.start) + out.slice(span.end);
  }
  return out.replace(/^[\s>]*/, "").replace(/^(?:[-*+]|\d+[.)])\s+/, "").replace(/^\[.\]\s*/, "").replace(/\s+/g, " ").trim();
}
function isStamped(line) {
  return stampSpans(line).length > 0;
}
function stampsOwed(before, after) {
  const had = /* @__PURE__ */ new Set();
  for (const line of (before ?? "").split("\n")) {
    const body = lineBody(line);
    if (body !== "") {
      had.add(body);
    }
  }
  const owed = /* @__PURE__ */ new Set();
  for (const line of after.split("\n")) {
    if (isStamped(line)) {
      continue;
    }
    const body = lineBody(line);
    if (body !== "" && !had.has(body)) {
      owed.add(body);
    }
  }
  return [...owed];
}
function stampsLanded(owed, sources) {
  if (owed.length === 0) {
    return true;
  }
  const unstamped = /* @__PURE__ */ new Set();
  for (const source of sources) {
    for (const line of source.split("\n")) {
      if (isStamped(line)) {
        continue;
      }
      const body = lineBody(line);
      if (body !== "") {
        unstamped.add(body);
      }
    }
  }
  return owed.every((body) => !unstamped.has(body));
}
var GRACE = 3;
var CAPACITY = 64;
var WriteRegister = class {
  #open = /* @__PURE__ */ new Map();
  /** A write left for the server carrying `token`, for `path`. The path is normalised on the way in. */
  open(token, path) {
    if (this.#open.has(token)) {
      return;
    }
    if (this.#open.size >= CAPACITY) {
      const oldest = this.#open.keys().next();
      if (!oldest.done) {
        this.#open.delete(oldest.value);
      }
    }
    this.#open.set(token, { path: samePath(path), grace: GRACE });
  }
  /**
   * A PROJECTION ARRIVED. Say which outstanding writes it acknowledges, and which have run out.
   *
   * `writes` is the echo read off the envelope — `{path: [token, …]}` — and it is asked about BOTH
   * halves of the question, which is what makes this narrow rather than convenient.
   *
   * ── MATCHING IS PER PATH, BECAUSE THE SERVER'S CLAIM IS PER PATH ──
   *
   * The echo says exactly one thing: "this server accepted a write carrying this token FOR THIS
   * PATH". So a token is matched only when it appears under the path the write that minted it went
   * to. A token found under some other file's key acknowledges some other write, and the whole
   * point of a token is that the browser learns MY write landed rather than that some write did —
   * so this is the one comparison that must not be loosened for convenience.
   *
   * A TOKEN IN THE ECHO THAT THIS REGISTER NEVER OPENED IS IGNORED, SILENTLY AND ON PURPOSE. It is
   * a write some other session made, or one this page made before a reload.
   *
   * ── GIVING UP NEEDS THE ARRIVAL TO HAVE SPOKEN ABOUT THE FILE ──
   *
   * Grace is spent only when the echo LISTS the write's own path and does not list its token. An
   * arrival that says nothing about that file had no occasion to acknowledge the write, and reading
   * evidence out of that silence is exactly what the server's own caps and TTL make wrong.
   */
  arrive(writes) {
    const matched = [];
    const gaveUp = [];
    for (const [token, record] of this.#open) {
      const named = writes.get(record.path);
      if (named === void 0) {
        continue;
      }
      if (named.includes(token)) {
        matched.push(token);
        continue;
      }
      record.grace -= 1;
      if (record.grace <= 0) {
        gaveUp.push(token);
      }
    }
    for (const token of matched) {
      this.#open.delete(token);
    }
    for (const token of gaveUp) {
      this.#open.delete(token);
    }
    return { matched, gaveUp };
  }
  /**
   * STOP WAITING FOR THIS ONE. The caller knows the write will never be acknowledged — the server
   * refused it (a 409 means nothing was written, so there is nothing to echo).
   *
   * IT RELEASES NOTHING AND PROVES NOTHING. Same as `arrive`'s `gaveUp`: this is the register
   * forgetting, never the strip letting go. Returns whether the token was outstanding.
   *
   * KEPT, UNCHANGED, FOR THE CALLER THAT HAS NOTHING AT STAKE. `toggleTask`'s own 409 branch
   * (`app/index.html`) puts the checkbox back BEFORE this runs — a tick has no characters to lose,
   * so "releases nothing and proves nothing" was already the complete, correct answer there and
   * `design-the-two-rules.md` §3 does not name it as a gap. `concludeGiveUp`, below, is for the two
   * callers where something IS at stake and a silent forget is exactly the gap that document names.
   */
  giveUp(token) {
    return this.#open.delete(token);
  }
  /**
   * A WRITE'S WAIT ENDED WITH NO MATCH — THE TERMINAL ACT, NAMED, WHERE `giveUp` ABOVE ONLY EVER
   * NAMED THE FORGETTING.
   *
   * `design-the-two-rules.md` §2.2: AN OPERATION COMPLETES, and a token that gives up is one of
   * the two places this class used to let that happen silently — the other was `collect()`
   * (`app/index.html`) not calling anything at all when a pickup's own bounded retries ran out.
   * Both callers now go through here, and both now get the same answer to "what happened", rather
   * than one silent `Map.delete` and one nothing.
   *
   * ── WHY THE ANSWER IS ALWAYS `"return-to-row"`, NEVER "reread" OR "restore" ──
   *
   * `design-the-two-rules.md` §2.2 names three ACTS in order — re-read, restore last-known-good,
   * hand back to the row — but this class only ever knows the THIRD one, because it holds nothing
   * a "re-read" or a "restore" could be computed from: no markdown, no view, no DOM. Its one fact is
   * "this token will never be matched", and the only thing that follows from that fact ALONE is
   * that whatever the operator typed is not going anywhere new — it stays exactly where it already
   * is, `app/present/rows.ts`'s `RowStore`, which is why this never needs a payload: the row already
   * holds the string (`paint.ts`'s own optimistic repaint records it there before the write is even
   * sent), and closing the token here changes nothing about that. A caller that wanted "re-read" or
   * "restore" instead has to decide that itself, with facts this register does not have — which is
   * exactly the shape `commitLine`'s 409 branch and `collect`'s exhausted branch already are:
   * neither needed a NEW way to keep the operator's characters, both needed this class to stop being
   * silent about the token.
   *
   * `null` MEANS THERE WAS NOTHING TO CONCLUDE — the token was never opened here, or something
   * already matched or gave it up. A caller that gets `null` has learned nothing new and does
   * nothing further; there is no second write to make this true retroactively.
   */
  concludeGiveUp(token) {
    return this.#open.delete(token) ? "return-to-row" : null;
  }
  /** How many writes are outstanding — all of them, or just those for `path`. */
  outstanding(path = null) {
    if (path === null) {
      return this.#open.size;
    }
    let count = 0;
    const wanted = samePath(path);
    for (const record of this.#open.values()) {
      if (record.path === wanted) {
        count += 1;
      }
    }
    return count;
  }
  /** Is this token still outstanding? Exported for a test to assert the lifecycle, not for a caller. */
  waiting(token) {
    return this.#open.has(token);
  }
  /** Forget everything. Sign-out only — the same posture every other per-session surface takes. */
  clear() {
    this.#open.clear();
  }
};

// app/present/newline.ts
function seedFor(source, lineIndex, declared) {
  const lines = source.split("\n");
  if (!Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex > lines.length) {
    return null;
  }
  const sectionId = declared === void 0 ? null : sectionForInsertAt(source, lineIndex, declared.view, declared.sectionOrder);
  const chrome = chromeFor(lines, lineIndex, declared, sectionId);
  if (chrome === null) {
    return null;
  }
  const implied = new Set(declared?.impliedTokens ?? []);
  const tokens = (sectionId === null || declared === void 0 ? [] : declared.sectionRegistration?.[declared.view]?.[sectionId]?.tokens ?? []).filter((token) => !implied.has(token));
  if (declared?.composition !== void 0) {
    const indentMatch = /^\s*/.exec(chrome.text);
    const indent3 = indentMatch === null ? "" : indentMatch[0];
    const known = chrome.shape === "checkbox" ? { checkbox: "[ ]", tags: tokens } : { tags: tokens };
    const seed = composeSeed(chrome.shape, known, declared.composition, 0);
    return {
      text: `${indent3}${seed.text}`,
      level: chrome.level,
      tokens,
      cursorOffset: indent3.length + seed.cursorOffset
    };
  }
  const text = tokens.length === 0 ? chrome.text : `${chrome.text}${tokens.join(" ")} `;
  return { text, level: chrome.level, tokens, cursorOffset: text.length };
}
function chromeFor(lines, lineIndex, declared, sectionId) {
  for (let at = lineIndex - 1; at >= 0; at -= 1) {
    const line = lines[at] ?? "";
    if (classifyLine(line).kind === "heading") {
      break;
    }
    const chrome = chromeOf(line);
    if (chrome !== null) {
      return {
        text: chrome,
        level: at === lineIndex - 1 ? "LINE" : "STRUCTURAL_NODE",
        shape: shapeOfChrome(chrome)
      };
    }
  }
  for (let at = lineIndex; at < lines.length; at += 1) {
    const line = lines[at] ?? "";
    if (classifyLine(line).kind === "heading") {
      break;
    }
    const chrome = chromeOf(line);
    if (chrome !== null) {
      return { text: chrome.trimStart(), level: "STRUCTURAL_NODE", shape: shapeOfChrome(chrome) };
    }
  }
  for (const line of lines) {
    const chrome = chromeOf(line);
    if (chrome !== null) {
      return { text: chrome.trimStart(), level: "VIEW", shape: shapeOfChrome(chrome) };
    }
  }
  if (declared !== void 0 && sectionId !== null) {
    const nodeType = declared.sections[declared.view]?.[sectionId]?.nodeType ?? declared.sectionRegistration?.[declared.view]?.[sectionId]?.nodeType;
    const shape = nodeType === void 0 ? void 0 : declared.chromeShapes[nodeType];
    if (shape !== void 0) {
      return { text: shape === "checkbox" ? "- [ ] " : "- ", level: "GLOBAL", shape };
    }
  }
  return null;
}
function shapeOfChrome(chrome) {
  return chrome.endsWith("[ ] ") ? "checkbox" : "plain_line";
}
function openLine(from, lineIndex, draft, onDeclined, declared, view) {
  const seed = seedFor(from, lineIndex, declared);
  if (seed === null) {
    onDeclined?.(lineIndex);
    return false;
  }
  draft.open(
    lineIndex,
    seed.text,
    placeFor(from, lineIndex, view ?? declared?.view ?? ""),
    seed.cursorOffset
  );
  return true;
}

// app/present/source.ts
var CHECKBOX_GLYPH2 = /^(\s*- \[)[ xX](\] .*)$/;
var ANY_CHECKBOX_GLYPH = /^(\s*- \[)(.)(\] .*)$/;
var escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function applyEdit(source, edit) {
  const lines = source.split("\n");
  if (edit.kind === "insert-line") {
    if (!Number.isInteger(edit.lineIndex) || edit.lineIndex < 0 || edit.lineIndex > lines.length) {
      return null;
    }
    if (edit.text.includes("\n") || edit.text.includes("\r")) {
      return null;
    }
    if (!carriesContent(edit.text)) {
      return null;
    }
    lines.splice(edit.lineIndex, 0, edit.text);
    return lines.join("\n");
  }
  if (edit.kind === "delete-lines") {
    const unique = [...new Set(edit.lineIndexes)].sort((a, b) => b - a);
    for (const index of unique) {
      const target = lines[index];
      if (target === void 0) return null;
      const trimmed = target.trim();
      if (trimmed === "" || /^#{1,6}\s/.test(trimmed)) return null;
      lines.splice(index, 1);
    }
    return unique.length === 0 ? null : lines.join("\n");
  }
  const line = lines[edit.lineIndex];
  if (line === void 0) {
    return null;
  }
  if (edit.kind === "move-line") {
    const trimmed = line.trim();
    if (trimmed === "" || /^#{1,6}\s/.test(trimmed)) return null;
    if (!Number.isInteger(edit.to) || edit.to < 0 || edit.to > lines.length) return null;
    if (edit.to === edit.lineIndex || edit.to === edit.lineIndex + 1) return null;
    lines.splice(edit.lineIndex, 1);
    lines.splice(edit.to > edit.lineIndex ? edit.to - 1 : edit.to, 0, line);
    return lines.join("\n");
  }
  if (edit.kind === "delete-line") {
    const trimmed = line.trim();
    if (trimmed === "" || /^#{1,6}\s/.test(trimmed)) {
      return null;
    }
    lines.splice(edit.lineIndex, 1);
    return lines.join("\n");
  }
  if (edit.kind === "set-line") {
    if (edit.text === line) {
      return null;
    }
    if (edit.text.includes("\n") || edit.text.includes("\r")) {
      return null;
    }
    lines[edit.lineIndex] = edit.text;
    return lines.join("\n");
  }
  if (edit.kind !== "set-checkbox") {
    return null;
  }
  let head;
  let rest;
  const match = CHECKBOX_GLYPH2.exec(line);
  if (match !== null) {
    head = match[1] ?? "";
    rest = match[2] ?? "";
  } else {
    const other = edit.statuses === void 0 ? null : ANY_CHECKBOX_GLYPH.exec(line);
    if (other === null || edit.statuses?.[`[${other[2] ?? ""}]`] === void 0) {
      return null;
    }
    head = other[1] ?? "";
    rest = other[3] ?? "";
  }
  if (edit.completion !== void 0) {
    const token = edit.completion.token;
    const stamp = new RegExp(`\\s*${escapeRegExp(token)}\\s*\\d{4}-\\d{2}-\\d{2}`, "g");
    if (edit.checked) {
      if (!rest.includes(token)) rest = `${rest.replace(/\s+$/, "")} ${token} ${edit.completion.date}`;
    } else {
      rest = rest.replace(stamp, "");
    }
  }
  lines[edit.lineIndex] = head + (edit.checked ? "x" : " ") + rest;
  return lines.join("\n");
}
function lineOps(kind, lineIndex, markdown) {
  if (!Number.isInteger(lineIndex) || lineIndex < 0) return null;
  const lines = markdown.split("\n");
  if (kind === "delete-line") return [[lineIndex, lineIndex + 1, []]];
  if (kind === "move-line" || kind === "delete-lines") return null;
  if (lineIndex >= lines.length) return null;
  const replacement = [lines[lineIndex]];
  return kind === "insert-line" ? [[lineIndex, lineIndex, replacement]] : [[lineIndex, lineIndex + 1, replacement]];
}

// app/present/rebase.ts
function rebaseLineEdit(view, base, lineIndex, edited, current) {
  const anchor = instanceAnchorFor(base, lineIndex, view);
  if (anchor === null) {
    return { outcome: "refused", reason: "no-anchor" };
  }
  const reading = resolveInstanceAnchor(anchor, current, view);
  if (reading.outcome === "ambiguous") {
    return { outcome: "refused", reason: "ambiguous" };
  }
  if (reading.outcome !== "found") {
    return { outcome: "refused", reason: "not-found" };
  }
  const original = base.split("\n")[lineIndex] ?? "";
  const serverLine = current.split("\n")[reading.lineIndex] ?? "";
  if (serverLine !== original) {
    return { outcome: "refused", reason: "line-changed" };
  }
  const markdown = applyEdit(current, { kind: "set-line", lineIndex: reading.lineIndex, text: edited });
  if (markdown === null) {
    return { outcome: "refused", reason: "no-edit" };
  }
  return { outcome: "rebased", markdown, lineIndex: reading.lineIndex };
}
function rebaseLineDelete(view, base, lineIndex, current) {
  const anchor = instanceAnchorFor(base, lineIndex, view);
  if (anchor === null) return { outcome: "refused", reason: "no-anchor" };
  const reading = resolveInstanceAnchor(anchor, current, view);
  if (reading.outcome === "ambiguous") return { outcome: "refused", reason: "ambiguous" };
  if (reading.outcome !== "found") return { outcome: "refused", reason: "not-found" };
  const markdown = applyEdit(current, { kind: "delete-line", lineIndex: reading.lineIndex });
  if (markdown === null) return { outcome: "refused", reason: "no-edit" };
  return { outcome: "rebased", markdown, lineIndex: reading.lineIndex };
}

// app/present/express/cascade.ts
var PresentationCascade = class {
  #context;
  constructor(context) {
    this.#context = context;
  }
  /**
   * Resolve one key. Most specific level that says anything wins; DEFAULT if none does.
   *
   * Deliberately the same shape as the engine's `ResolutionCascade.resolve` on the ingest side.
   * A reader who has understood one has understood both, and divergence between the two halves is
   * the failure this whole arc exists to avoid.
   */
  resolve(key) {
    for (const level of SPECIFICITY) {
      const contribution = this.#context.at(level);
      if (isSilent(contribution)) {
        continue;
      }
      const rendition = contribution?.[key];
      if (rendition === void 0) {
        continue;
      }
      return { rendition, level };
    }
    return { rendition: DEFAULT[key], level: "GLOBAL" };
  }
};

// app/present/undo.ts
var STAMP = /\[\[qntm:([^\]]+)\]\]/;
var CYCLE_ADDED = /\s*\[\[qntm:[^\]]+\]\]|\s*🆕\s*\d{4}-\d{2}-\d{2}/gu;
var plain = (line) => line.replace(CYCLE_ADDED, "").replace(/\s+/g, " ").trim();
function findLine(source, line) {
  const lines = source.split("\n");
  const unique = (test) => {
    let found = -1;
    for (let i = 0; i < lines.length; i += 1) {
      if (!test(lines[i] ?? "")) continue;
      if (found !== -1) return -2;
      found = i;
    }
    return found;
  };
  const exact = unique((candidate) => candidate === line);
  if (exact >= 0) return exact;
  const stamp = STAMP.exec(line)?.[1];
  if (stamp !== void 0) {
    const byStamp = unique((candidate) => STAMP.exec(candidate)?.[1] === stamp);
    if (byStamp >= 0) return byStamp;
  }
  const wanted = plain(line);
  if (wanted === "") return -1;
  const byText = unique((candidate) => plain(candidate) === wanted);
  return byText >= 0 ? byText : -1;
}
function changeOf(view, commit) {
  if (commit.markdown === null) return null;
  const before = commit.source.split("\n");
  const after = commit.markdown.split("\n");
  const i = commit.lineIndex;
  switch (commit.kind) {
    case "set-line":
      return before[i] === after[i] ? null : { view, before: before[i] ?? null, after: after[i] ?? null, neighbour: null };
    case "insert-line":
      return { view, before: null, after: after[i] ?? null, neighbour: i > 0 ? after[i - 1] ?? null : null };
    case "delete-line":
      return { view, before: before[i] ?? null, after: null, neighbour: i > 0 ? before[i - 1] ?? null : null };
    case "move-line":
    case "delete-lines":
      return null;
  }
}
function apply(source, from, to, neighbour) {
  if (from !== null && to !== null) {
    const at = findLine(source, from);
    if (at < 0) return null;
    const markdown = applyEdit(source, { kind: "set-line", lineIndex: at, text: to });
    return markdown === null ? null : { lineIndex: at, text: to, markdown, source, kind: "set-line" };
  }
  if (from !== null) {
    const at = findLine(source, from);
    if (at < 0) return null;
    const markdown = applyEdit(source, { kind: "delete-line", lineIndex: at });
    return markdown === null ? null : { lineIndex: at, text: "", markdown, source, kind: "delete-line" };
  }
  if (to !== null) {
    const text = to.replace(/\s*\[\[qntm:[^\]]+\]\]/g, "");
    const above = neighbour === null ? -1 : findLine(source, neighbour);
    const at = above >= 0 ? above + 1 : 0;
    const markdown = applyEdit(source, { kind: "insert-line", lineIndex: at, text });
    return markdown === null ? null : { lineIndex: at, text, markdown, source, kind: "insert-line" };
  }
  return null;
}
var LIMIT = 100;
var UndoHistory = class {
  #done = /* @__PURE__ */ new Map();
  #undone = /* @__PURE__ */ new Map();
  /** A new change in `change.view`. It clears that view's redo list, as every editor does. */
  record(change) {
    const done = this.#done.get(change.view) ?? [];
    done.push(change);
    if (done.length > LIMIT) done.shift();
    this.#done.set(change.view, done);
    this.#undone.set(change.view, []);
  }
  /** The edit that undoes the last change in `view`, against `source` as it is now — or `null`
   *  when there is nothing to undo, or the line cannot be found for certain (the change is then
   *  kept, so a later `u` can try again). Taking it moves the change to the redo list. */
  undo(view, source) {
    const done = this.#done.get(view) ?? [];
    const change = done[done.length - 1];
    if (change === void 0) return null;
    const edit = apply(source, change.after, change.before, change.neighbour);
    if (edit === null) return null;
    done.pop();
    const undone = this.#undone.get(view) ?? [];
    undone.push(change);
    this.#undone.set(view, undone);
    return edit;
  }
  /** The edit that redoes the last undone change in `view`, the same way. */
  redo(view, source) {
    const undone = this.#undone.get(view) ?? [];
    const change = undone[undone.length - 1];
    if (change === void 0) return null;
    const edit = apply(source, change.before, change.after, change.neighbour);
    if (edit === null) return null;
    undone.pop();
    const done = this.#done.get(view) ?? [];
    done.push(change);
    this.#done.set(view, done);
    return edit;
  }
};

// app/present/register.ts
var STAMP2 = /\s*\[\[qntm:[^\]]+\]\]/g;
var LineRegister = class {
  #text = void 0;
  /** view -> the marked lines' text, oldest first. */
  #marks = /* @__PURE__ */ new Map();
  /** `yy` — the line's text, as a copy. */
  yank(text) {
    this.#text = text;
  }
  /** `dd` — mark `text` in `view`, or unmark it if it is marked. Answers whether it is now marked. */
  toggleMark(view, text) {
    const marks = this.#marks.get(view) ?? [];
    const at = marks.indexOf(text);
    if (at !== -1) {
      marks.splice(at, 1);
      this.#marks.set(view, marks);
      return false;
    }
    marks.push(text);
    this.#marks.set(view, marks);
    this.#text = text;
    return true;
  }
  /** Where the marks in `view` are in `source` now; a mark that cannot be found is dropped. */
  markedLines(view, source) {
    const marks = this.#marks.get(view) ?? [];
    const kept = [];
    const found = [];
    for (const text of marks) {
      const at = findLine(source, text);
      if (at < 0) continue;
      kept.push(text);
      found.push(at);
    }
    this.#marks.set(view, kept);
    return found;
  }
  /** The same lines, read only — for the painter's cross. Drops nothing. */
  markedLinesIn(view, source) {
    const out = /* @__PURE__ */ new Set();
    for (const text of this.#marks.get(view) ?? []) {
      const at = findLine(source, text);
      if (at >= 0) out.add(at);
    }
    return out;
  }
  /** The views that have a mark. */
  markedViews() {
    return [...this.#marks].filter(([, marks]) => marks.length > 0).map(([view]) => view);
  }
  /** `u` with marks pending: unmark the last one. Answers whether there was one. */
  unmarkLast(view) {
    const marks = this.#marks.get(view) ?? [];
    if (marks.length === 0) return false;
    marks.pop();
    return true;
  }
  /** `p`: the last mark's line in `source`, taken off the marks; `undefined` if none is found. */
  takeLast(view, source) {
    const marks = this.#marks.get(view) ?? [];
    while (marks.length > 0) {
      const text = marks.pop();
      const at = findLine(source, text);
      if (at >= 0) return at;
    }
    return void 0;
  }
  /** Every mark in `view`, found in `source` and taken off; the page deletes them in one write. */
  takeAll(view, source) {
    const found = this.markedLines(view, source);
    this.#marks.set(view, []);
    return found;
  }
  /** What `p` puts down when no line is marked: the text as a NEW line — its identity stamp
   *  removed, so the engine mints a new node rather than seeing one node on two lines. */
  copyText() {
    return this.#text?.replace(STAMP2, "");
  }
};
function deleteLinesCommit(source, lineIndexes) {
  if (lineIndexes.length === 0) return null;
  const markdown = applyEdit(source, { kind: "delete-lines", lineIndexes });
  const first = Math.min(...lineIndexes);
  return markdown === null ? null : { lineIndex: first, text: "", markdown, source, kind: "delete-lines" };
}
function moveCommit(source, from, to) {
  const markdown = applyEdit(source, { kind: "move-line", lineIndex: from, to });
  if (markdown === null) return null;
  const landed = to > from ? to - 1 : to;
  return { lineIndex: landed, text: markdown.split("\n")[landed] ?? "", markdown, source, kind: "move-line" };
}
function insertCommit(source, at, text) {
  const markdown = applyEdit(source, { kind: "insert-line", lineIndex: at, text });
  return markdown === null ? null : { lineIndex: at, text, markdown, source, kind: "insert-line" };
}

// app/present/settle.ts
var SettleSurface = class {
  #view = "";
  /** One entry per row with an unconfirmed placement, keyed by that row's OWN identity string
   * (`InstanceAnchor.instance`, taken at arm time) — never a second entry for the same physical row;
   * see `arm()`. The class header states the bound this gives the map's size. */
  #pending = /* @__PURE__ */ new Map();
  /**
   * Arm a placement, computed elsewhere, against the identity of the row it is about — not the
   * exact string it was computed from, and not against whatever else is currently pending for OTHER
   * rows. `source`/`view` are still required: they are what `instanceAnchorFor` needs to TAKE the
   * anchor in the first place, exactly once, here.
   *
   * REPLACES ONLY THIS ROW'S OWN PRIOR ENTRY, keyed by `moving.instance` — a second arm for a row
   * already holding a pending claim describes a NEWER prediction about the SAME row (the one case
   * "there is one cursor" ever meant), and overwrites it; every OTHER row's own pending entry is
   * untouched. This is the whole of the fix: the single-slot version overwrote regardless of WHICH
   * row the new arm was about, discarding a still-correct claim about a row nothing here has
   * touched — see the class header for the reproduction.
   *
   * A DIFFERENT VIEW THAN THE ONE CURRENTLY HELD clears every pending entry before arming this one
   * — see the class header's "A VIEW CHANGE" condition.
   *
   * IF EITHER ROW HAS NO IDENTITY TO TAKE — `placement.lineIndex` or a non-null
   * `placement.beforeLineIndex` names a blank line or a line out of range — NOTHING IS ARMED FOR
   * THIS PLACEMENT, and every OTHER row's own pending entry is left exactly as it was.
   * `orderingPlacementFor` never returns such an index (a blank line has no marker value to rank),
   * so this is a defensive floor, not a live path; it exists so an unrealistic caller fails by
   * arming nothing rather than by arming a placement this class could never re-find.
   */
  arm(source, view, placement) {
    const moving = instanceAnchorFor(source, placement.lineIndex, view);
    if (moving === null) {
      return;
    }
    let before = null;
    if (placement.beforeLineIndex !== null) {
      before = instanceAnchorFor(source, placement.beforeLineIndex, view);
      if (before === null) {
        return;
      }
    }
    if (view !== this.#view) {
      this.#pending.clear();
      this.#view = view;
    }
    this.#pending.set(moving.instance, {
      moving,
      hasBefore: placement.beforeLineIndex !== null,
      before,
      animated: false
    });
  }
  /**
   * What THIS repaint of `source`/`view` should do — one `SettleInstruction` per row that still has
   * a live, re-resolvable claim, in no particular order (`paint.ts` applies each independently by
   * the LINE INDEX it carries, not by array position). `[]` for "nothing to do" — no rows armed, a
   * view that does not match, or every armed row's own claim now fails to resolve — never `null`;
   * an empty list and "nothing happened" are the same fact stated as a length.
   *
   * A ROW THAT CANNOT BE RE-FOUND IS DELETED FROM `#pending` HERE, not merely skipped — see the
   * class header's "THE ROW LEAVING THE VIEW" condition. Every OTHER row's entry, found or not,
   * is judged independently and never affects this one.
   *
   * THE LINE INDICES RETURNED ARE THIS REPAINT'S OWN, NEVER THE ONES ARMED AGAINST — recomputed
   * fresh, every call, from `resolveInstanceAnchor`'s current answer. A caller can act on them
   * without knowing anything moved.
   */
  take(source, view) {
    if (view !== this.#view || this.#pending.size === 0) {
      return [];
    }
    const instructions = [];
    for (const [key, entry] of this.#pending) {
      const movingReading = resolveInstanceAnchor(entry.moving, source, view);
      if (movingReading.outcome !== "found") {
        this.#pending.delete(key);
        continue;
      }
      let beforeLineIndex = null;
      if (entry.hasBefore) {
        if (entry.before === null) {
          this.#pending.delete(key);
          continue;
        }
        const beforeReading = resolveInstanceAnchor(entry.before, source, view);
        if (beforeReading.outcome !== "found") {
          this.#pending.delete(key);
          continue;
        }
        beforeLineIndex = beforeReading.lineIndex;
      }
      const animate = !entry.animated;
      entry.animated = true;
      instructions.push({
        placement: { lineIndex: movingReading.lineIndex, beforeLineIndex },
        animate
      });
    }
    return instructions;
  }
  /**
   * A LINE IS ABOUT TO BE COMMITTED — discard the ONE pending entry that describes THIS row, if
   * there is one; every other row's own pending entry is untouched.
   *
   * Called from `commitLine` (app/index.html), before the resolver walk that might re-arm, on
   * EVERY commit — the same "always called" posture `armPredict` already has, for the identical
   * reason: an un-rearmed claim about a row that just changed again is a claim about a value the
   * row no longer carries, and `armSettle` only re-arms when a FRESH placement was computed, which
   * a same-row edit that now sorts correctly (no placement) will not produce. Left unchecked, the
   * OLD placement's anchor is still the row's own identity — untouched by a same-row text edit that
   * does not touch its stamp — so it would keep resolving and could fire a motion for a value that
   * is no longer true. This is the one case a plain identity key reopens that the old string key
   * closed by accident (ANY edit changed the string, so ANY edit discarded the arm); this closes it
   * on purpose, narrowly, without giving up the tolerance the rest of this class exists to add.
   *
   * `source`/`lineIndex` ARE THE COMMIT'S OWN "BEFORE" — `commit.source`/`commit.lineIndex`, the
   * file and the position as they stood the instant before this edit landed, which is the same
   * source each currently-armed anchor would resolve against if nothing else had happened since it
   * was armed. Every entry is checked; the first (and, by construction, only) one that resolves to
   * that exact line is the row this commit is re-touching, and it alone is removed. An edit that
   * resolves nowhere, or to a different line, is about a DIFFERENT row, and every standing entry is
   * left exactly as it was.
   *
   * CALL THIS ONLY FOR A `"set-line"` COMMIT. `LineCommit.source`'s own header states why: for
   * `"insert-line"`, `source.split("\n")[lineIndex]` is a DIFFERENT, unrelated line about to be
   * pushed down to make room for the new row, not that row's own before-state — comparing an armed
   * anchor's resolved position against that index would risk clearing a live arm on the coincidence
   * of a new row being opened at the slot an already-armed row currently occupies, which is exactly
   * the "a row still being typed is never the row this moves" hazard `paint.ts` already guards on
   * the read side. A brand-new row cannot be "the same row" as anything already armed — it did not
   * exist when the arm was taken — so `"insert-line"` never needs this call at all.
   */
  supersede(source, view, lineIndex) {
    if (view !== this.#view) {
      return;
    }
    for (const [key, entry] of this.#pending) {
      const reading = resolveInstanceAnchor(entry.moving, source, view);
      if (reading.outcome === "found" && reading.lineIndex === lineIndex) {
        this.#pending.delete(key);
        return;
      }
    }
  }
};

// app/present/predict.ts
var PredictSurface = class {
  #source = null;
  #view = "";
  #predictions = [];
  #animated = false;
  /**
   * Arm a set of predictions, computed elsewhere, against the EXACT source they describe and the
   * view they belong to. Overwrites whatever was armed before, even an empty list — see this
   * class's own header for why an empty arm must still happen.
   */
  arm(source, view, predictions) {
    this.#source = source;
    this.#view = view;
    this.#predictions = predictions;
    this.#animated = false;
  }
  /**
   * What THIS repaint of `source`/`view` should do.
   *
   *   `null` — nothing is armed for this view at all, or nothing is armed for this exact source and
   *   nothing was armed for this view either (there is nothing to show and nothing to reconcile).
   *
   *   `source` matches exactly — the armed predictions are still live; returns them, `animate` true
   *   only the first time.
   *
   *   `view` matches but `source` does not — the file this view shows has genuinely changed since
   *   the arm (the cycle answered, or the operator moved past this state some other way). Reconciled
   *   ONCE: every armed prediction whose text is not found anywhere in the new `source` comes back as
   *   `withdrawn`; the arm is then cleared, so this can never fire twice for the same claim. A
   *   prediction that WAS found reports nothing — see this class's own header for why silence is the
   *   right answer for "this came true".
   */
  take(source, view) {
    if (this.#source === null || this.#view !== view) {
      return null;
    }
    if (this.#source === source) {
      if (this.#predictions.length === 0) {
        return null;
      }
      const animate = !this.#animated;
      this.#animated = true;
      return { predictions: this.#predictions, withdrawn: [], animate };
    }
    const armed = this.#predictions;
    this.#source = null;
    this.#view = "";
    this.#predictions = [];
    this.#animated = false;
    const withdrawn = armed.filter((prediction) => !source.includes(prediction.text));
    if (withdrawn.length === 0) {
      return null;
    }
    return { predictions: [], withdrawn, animate: true };
  }
};

// app/present/rows.ts
function engineOf(identity) {
  return identity.kind === "reconciled" ? identity.engine : null;
}
function trustOf(via) {
  return ANCHOR_TRUST.indexOf(via);
}
var RowStore = class {
  #view = null;
  /** THE STRING THE PAINTER WALKED. The only fact this class exists to make addressable. */
  #source = null;
  /**
   * THE NEWEST STRING THE SERVER HAS SAID, as last handed to `showing`. Held so that "has the world
   * moved past the browser's own edit" is a comparison rather than a guess — the identical key
   * `SettleSurface`/`PredictSurface` use, and for the identical reason: a claim about one version of
   * a file stops being a claim the moment that version is not what the server has.
   */
  #served = null;
  /**
   * THE BROWSER'S OWN EDIT, if it has one that the server has not answered yet. `null` whenever the
   * screen is showing the server's own string.
   */
  #local = null;
  #rows = [];
  #selected = null;
  /** The source `#selected` was chosen against — see `carry` for the one thing it decides. */
  #seatedIn = null;
  /** The line index `#selected` was seated at — see `carry` for the one thing it decides. */
  #seatedAt = null;
  #minted = 0;
  /** The view these rows belong to, or `null` when nothing is held. */
  get view() {
    return this.#view;
  }
  /** THE STRING ON SCREEN, or `null` before anything has painted. */
  get source() {
    return this.#source;
  }
  /** Every printed row of that string, in line order. Blank lines get no row — they print none. */
  get rows() {
    return this.#rows;
  }
  /** The selected row, or `null` when nothing is selected or the selected row did not survive. */
  get selected() {
    const local = this.#selected;
    if (local === null) {
      return null;
    }
    return this.#rows.find((row) => row.id.local === local) ?? null;
  }
  /** The row printed at `lineIndex` of the held source, or `null` (out of range, or a blank line). */
  rowAt(lineIndex) {
    return this.#rows.find((row) => row.lineIndex === lineIndex) ?? null;
  }
  /** The row carrying `local`, or `null` when it did not survive the last resolve. */
  rowOf(local) {
    return this.#rows.find((row) => row.id.local === local) ?? null;
  }
  /**
   * THE BROWSER EDITED THE FILE AND IS ABOUT TO PAINT THE RESULT — the optimistic half.
   *
   * Called from `paint.ts`'s own `repaint` closure, which is the one place a settlement's new
   * string reaches the screen. It is a RECORD, not a decision: the painter has already computed
   * `source` (from `applyEdit`, against the string it was handed) and this is told what it will
   * draw.
   *
   * A STRING THE SERVER HAS ALREADY SAID IS NOT A LOCAL CLAIM. Repainting the same file — a click,
   * an abandoned row, a mode change — leaves `#local` null, so nothing has to remember to clear it.
   */
  edited(view, source) {
    if (view !== this.#view) {
      this.#reset(view);
    }
    this.#local = source === this.#served ? null : source;
    this.#install(view, source);
  }
  /**
   * WHAT TO PAINT FOR `view`, GIVEN THE NEWEST STRING THE SERVER HAS SAID — the read every repaint
   * makes, and the write that keeps the table honest.
   *
   * THE RULE, IN ONE SENTENCE: the browser's own edit survives until the server says something
   * newer, and then it does not.
   *
   *   the server's string is the one this store was already measuring against — nothing new has
   *     landed, so the browser's own edit is still on top of the world and is what to paint.
   *   the server's string has MOVED — a projection installed, an ack taken, a refusal adopted. The
   *     engine is entitled to rewrite what it ingests, so the arriving string wins unconditionally
   *     and the local claim is dropped. This is `AcceptedSource.drop`'s own posture, one layer up.
   *
   * A DIFFERENT VIEW DISCARDS EVERYTHING. `paintView` already drops the draft and forces NORMAL for
   * exactly this reason, and a row table that crossed a view change would be the one construct in
   * this app that outlived the boundary those two respect.
   */
  showing(view, served) {
    if (view !== this.#view) {
      this.#reset(view);
    }
    if (served !== this.#served) {
      this.#served = served;
      this.#local = null;
    }
    const source = this.#local ?? served;
    this.#install(view, source);
    return source;
  }
  /**
   * THE FRAME THAT DREW `source` SHOWED THE CURSOR ON THIS LINE — the selection, recorded as the
   * ROW it landed on rather than as the number it landed at.
   *
   * ── WHY THE PAINTER RECORDS IT AND NOT THE GESTURE ──
   *
   * Six things move the cursor (a click, five vim effects, a draft returning it, a projection
   * re-anchoring it, a refusal adopting a file) and every one of them is followed immediately by a
   * paint — because moving the cursor is only visible if something redraws. Recording the seat at
   * each of the six would be six places to keep in step with one fact; recording it in the ONE
   * function they all end in is one place, and it cannot go stale, because a seat that was never
   * drawn was never the selection.
   *
   * IT IS REFUSED WHEN IT DOES NOT DESCRIBE WHAT THIS STORE IS HOLDING. A frame that drew another
   * view, or a string this store has already moved past, is describing a screen that is gone; its
   * seat would be a fact about the wrong file. Refusing is what lets the painter call this
   * unconditionally without knowing what the store is holding.
   *
   * `null` CLEARS THE SEAT. `o`/`O` blur `focus` on purpose while a draft row is open, and a seat
   * that survived that would put the selection back on a real line the instant the row settled —
   * the "two editable rows at once" defect `repaintCurrentView`'s own header records measuring.
   */
  seat(view, source, lineIndex) {
    if (view !== this.#view || source !== this.#source) {
      return;
    }
    this.#selected = lineIndex === null ? null : this.rowAt(lineIndex)?.id.local ?? null;
    this.#seatedIn = source;
    this.#seatedAt = lineIndex;
  }
  /**
   * WHERE THE SELECTED ROW IS NOW — `null` when this store has nothing better to say than the
   * caller already knows.
   *
   * ── THE DISCRIMINATOR IS "DID THE SOURCE MOVE SINCE THE SEAT WAS TAKEN" ──
   *
   * There are two reasons a repaint asks where the cursor goes, and they want opposite answers:
   *
   *   A MOTION MOVED IT. `j`, `k`, `gg`, a click. The string is the one the seat was taken against,
   *     so the caller's own index is the newer fact and this store must not overrule it. `null`.
   *   THE WORLD MOVED THE ROW. A projection, an ack, an optimistic edit, an adopted refusal. The
   *     string is a DIFFERENT one, so the caller's index describes a file that is not on screen any
   *     more, and the seated ROW is the newer fact — this answers where it went.
   *
   * A motion cannot change the source and a resolve always does, so the test is not a proxy for the
   * distinction: it is the distinction.
   *
   * ── IT ANSWERS ONLY WHERE THE CALLER HAS NOT, AND THAT IS WHY THERE ARE NOT TWO ANSWERS ──
   *
   * `lineIndex` is where the caller's cursor is NOW. If it has moved off the seat since the seat was
   * taken, something has ALREADY re-anchored it — `paintView` calls `focus.reanchor` before it
   * repaints, and so does `healFromRefusal` — and that answer is the newer one. This declines.
   *
   * So the two surfaces compose rather than compete: on a projection arrival `focus` answers and
   * this is silent; on the paths where nothing re-anchors at all — an ack repainting from the string
   * the browser posted, a settlement repainting into its own optimistic edit — `focus` had only a
   * NUMERIC clamp, and this answers by identity instead. That clamp is not a hypothetical hazard:
   * `healFromRefusal`'s own header records it overwriting one of the operator's tasks in place on
   * 2026-08-03, because "a raw clamp reinterprets that index against whatever real content now sits
   * at the same position."
   *
   * WHEN IT DOES ANSWER, IT CANNOT CONTRADICT `resolveInstanceAnchor`. The anchor this store holds
   * for the seated row is built exactly as `instanceAnchorFor` builds `focus`'s — same instance,
   * same node, same relative bracket — so the two walks agree by construction. Where this one is
   * `null` because a STRONGER claim took the line (see `#carryInto`), the caller falls back to its
   * own clamp. This can move the cursor by identity; it can never move it somewhere no surface named.
   */
  carry(lineIndex) {
    if (this.#selected === null || this.#seatedIn === this.#source || lineIndex !== this.#seatedAt) {
      return null;
    }
    return this.selected?.lineIndex ?? null;
  }
  /**
   * THE BROWSER'S OWN EDIT IS SUPERSEDED — drop the claim, keep the table.
   *
   * Called from `paintView`, one statement after `accepted.drop`, and for the identical reason that
   * one gives: a view is being chosen or re-read from the server, and what the server sends is the
   * newer truth than anything this browser computed. A local claim is strictly WEAKER than an
   * accepted source — the server has said nothing about it at all — so it cannot be the one thing
   * that outlives a re-read that discards even the accepted one.
   *
   * IT IS NOT REACHED BY THE ONE PATH THAT MUST KEEP THE CLAIM. A 409 leaves the operator's
   * characters on screen deliberately ("your characters are still on this line") and `commitLine`
   * returns WITHOUT repainting, so `paintView` never runs and this is never called. The claim
   * survives exactly as long as the screen showing it does.
   *
   * THE TABLE IS KEPT because the rows are still the rows: `showing` is about to reconcile them
   * against whatever arrived, and throwing the handles away first would mint a fresh set for
   * content that has not changed identity at all.
   */
  forget() {
    this.#local = null;
  }
  /** Everything dropped — the graph was dropped, or the session ended. */
  clear() {
    this.#reset(null);
    this.#served = null;
  }
  #reset(view) {
    this.#view = view;
    this.#source = null;
    this.#served = null;
    this.#local = null;
    this.#rows = [];
    this.#selected = null;
    this.#seatedIn = null;
    this.#seatedAt = null;
  }
  /** A handle no row in this store has ever had. The counter never rewinds. */
  #mint() {
    this.#minted += 1;
    return `row:${String(this.#minted)}`;
  }
  /**
   * Reconcile the table against `source` and hold it. Idempotent by construction: an unchanged
   * string is the fast path, and re-running it on a changed one carries the same rows to the same
   * places because `resolveInstanceAnchor` is pure.
   */
  #install(view, source) {
    if (this.#view === view && this.#source === source) {
      return;
    }
    const instances = instancesOf(source, view);
    const lines = source.split("\n");
    const held = this.#source === null ? [] : this.#rows;
    const carried = this.#carryInto(held, source, view);
    const rows = [];
    instances.forEach((info, at) => {
      if (info === null) {
        return;
      }
      const previous = carried.get(at) ?? null;
      rows.push({
        id: this.#identityFor(previous, info),
        lineIndex: at,
        text: lines[at] ?? "",
        instance: info.instance,
        anchor: {
          instance: info.instance,
          node: info.node,
          takenAt: at,
          relative: relativeAnchorFor(instances, lines, at)
        }
      });
    });
    this.#view = view;
    this.#source = source;
    this.#rows = rows;
  }
  /**
   * WHICH HELD ROW, IF ANY, CONTINUES AT EACH LINE OF `source`.
   *
   * ── ASSIGNED IN TRUST ORDER, AND A LINE IS CLAIMED ONCE ──
   *
   * Every held row is resolved independently — `resolveInstanceAnchor` is pure and cannot see the
   * others — so two rows may name one line. The stronger claim wins, by `ANCHOR_TRUST` and nothing
   * else, and the loser dies rather than being moved somewhere plausible. That is the same refusal
   * `resolveInstanceAnchor` itself makes on `ambiguous`: a rung that finds too many stops rather
   * than picking.
   *
   * TIES ARE BROKEN BY EVIDENCE, NOT BY ARRAY ORDER — see `Claim.evidence`. Where even that ties
   * (two rows with the same characters, which `instancesOf` has already separated with a `#N`
   * suffix so they cannot both reach the text rung anyway) the held order stands;
   * `Array.prototype.sort` is stable in every engine this ships to, ES2019 requires it, so that is
   * a stated property rather than a hope.
   */
  #carryInto(held, source, view) {
    const claims = [];
    for (const row of held) {
      const reading = resolveInstanceAnchor(row.anchor, source, view);
      if (reading.outcome === "found") {
        claims.push({ row, at: reading.lineIndex, rank: trustOf(reading.via), evidence: row.text.length });
      }
    }
    claims.sort((a, b) => a.rank === b.rank ? b.evidence - a.evidence : a.rank - b.rank);
    const taken = /* @__PURE__ */ new Map();
    const spent = /* @__PURE__ */ new Set();
    for (const claim of claims) {
      if (taken.has(claim.at) || spent.has(claim.row.id.local)) {
        continue;
      }
      taken.set(claim.at, claim.row);
      spent.add(claim.row.id.local);
    }
    return taken;
  }
  /**
   * THE IDENTITY THE ROW AT THIS LINE GETS — and this is the one function where a provisional
   * handle becomes a reconciled one.
   *
   * NO PREVIOUS ROW: a fresh handle. Already stamped when this browser first saw it, so it is
   * `reconciled` from birth — it was never provisional to anybody, and saying otherwise would make
   * the two arms mean "when did we notice" rather than "does the engine know about it".
   *
   * A PREVIOUS ROW, AND THE LINE IS NOW STAMPED: the SAME local handle, plus the engine's id. The
   * hop the acceptance test is about.
   *
   * A PREVIOUS ROW ALREADY BOUND TO A DIFFERENT ENGINE ID: refused. The carry landed on a line this
   * row is provably not, so the row is dropped and the line gets a fresh handle. A handle that
   * quietly starts addressing different content is worse than a handle that dies.
   *
   * A PREVIOUS ROW AND NO STAMP: the identity stands. A reconciled row keeps its engine id — the
   * engine named it once and this browser has no evidence it un-named it, only that this printing
   * carries no stamp.
   */
  #identityFor(previous, info) {
    const node = info.node;
    if (previous === null) {
      const local = this.#mint();
      return node === null ? { kind: "provisional", local } : { kind: "reconciled", local, engine: node };
    }
    const bound = engineOf(previous.id);
    if (bound !== null && node !== null && bound !== node) {
      const local = this.#mint();
      return { kind: "reconciled", local, engine: node };
    }
    if (node === null) {
      return previous.id;
    }
    return { kind: "reconciled", local: previous.id.local, engine: node };
  }
};

// app/present/resolve.ts
function graphSnapshotOf(graphData, blob) {
  const graph = graphData?.snapshot?.graph ?? blob?.graph;
  if (graph === void 0 || graph === null) {
    return null;
  }
  const { nodes, edges } = graph;
  if (!Array.isArray(nodes) || !Array.isArray(edges)) {
    return null;
  }
  return { nodes, edges };
}
var COMPLETE = { kind: "complete" };
function coverageOf(unconsulted) {
  return unconsulted.length === 0 ? COMPLETE : { kind: "partial", unconsulted };
}
var NOT_EVALUATED = { kind: "not-evaluated" };
var ARMS_NOTHING = { kind: "answer", coverage: COMPLETE, armings: [] };
function diagnosticOf(spec, reading) {
  const text = spec.show(reading);
  if (text === "") {
    return null;
  }
  return { badge: spec.badge, text, abstained: text.startsWith(`${spec.id}: abstained`) };
}
function armDiagnosticOf(spec, armed) {
  if (armed.kind !== "abstains") {
    return null;
  }
  return { badge: spec.badge, text: `${spec.id}: abstained \u2014 arm-${armed.because}`, abstained: true };
}
function defineResolver(spec) {
  return {
    id: spec.id,
    run(ctx) {
      const reading = spec.read(ctx);
      const armed = spec.arm === void 0 ? NOT_EVALUATED : spec.arm(ctx, reading);
      return {
        id: spec.id,
        note: spec.say(reading),
        diagnostic: diagnosticOf(spec, reading),
        armDiagnostic: armDiagnosticOf(spec, armed),
        armings: armed.kind === "answer" ? armed.armings : []
      };
    }
  };
}
function runResolvers(resolvers, ctx) {
  const runs = [];
  const notes = [];
  const diagnostics = [];
  const placements = [];
  const predictions = [];
  for (const resolver of resolvers) {
    const run = resolver.run(ctx);
    runs.push(run);
    if (run.note !== "") {
      notes.push(run.note);
    }
    if (run.diagnostic !== null) {
      diagnostics.push(run.diagnostic);
    }
    if (run.armDiagnostic !== null) {
      diagnostics.push(run.armDiagnostic);
    }
    for (const arming of run.armings) {
      if (arming.surface === "settle") {
        placements.push(arming.placement);
      } else {
        predictions.push(arming.prediction);
      }
    }
  }
  return { runs, notes, diagnostics, placements, predictions };
}
function abstentionsOf(diagnostics) {
  return diagnostics.filter((diagnostic) => diagnostic.abstained);
}
function armSettle(surface, base, viewId, placements) {
  if (base === null) {
    return;
  }
  for (const placement of placements) {
    surface.arm(base, viewId, placement);
  }
}
function armPredict(surface, base, viewId, predictions) {
  if (base === null) {
    return;
  }
  surface.arm(base, viewId, predictions);
}

// app/present/resolvers/membership.ts
var membershipSpec = {
  id: "membership",
  badge: "membershipBadge",
  read(ctx) {
    const { view, commit } = ctx;
    const qualification = ctx.declared.qualification;
    if (qualification === void 0 || commit.kind !== "set-line") {
      return NOT_EVALUATED;
    }
    const sectionOrder = sectionOrderFor(view, qualification.sectionOrder);
    const sectionId = sectionAt(commit.source, commit.lineIndex, view.id, sectionOrder);
    if (sectionId === null) {
      return NOT_EVALUATED;
    }
    const resolution = ctx.declared.resolution;
    let today;
    if (resolution !== void 0) {
      const reading = todayFor(ctx.now(), resolution.dayBoundary);
      today = reading.kind === "answer" ? reading.answer : void 0;
    }
    const beforeLine = commit.source.split("\n")[commit.lineIndex] ?? "";
    const before = membershipFor(view.id, sectionId, beforeLine, qualification, today);
    if (before.kind !== "answer") {
      return { kind: "abstains", because: before.because };
    }
    const after = membershipFor(view.id, sectionId, commit.text, qualification, today);
    if (after.kind !== "answer") {
      return { kind: "abstains", because: after.because };
    }
    return { kind: "answer", coverage: COMPLETE, before: before.answer, after: after.answer };
  },
  say(reading) {
    if (reading.kind !== "answer") {
      return "";
    }
    if (reading.before.belongs && !reading.after.belongs) {
      return `this line will leave ${reading.after.sectionName}`;
    }
    return "";
  },
  show(reading) {
    if (reading.kind === "not-evaluated") {
      return "";
    }
    if (reading.kind === "abstains") {
      return `membership: abstained \u2014 ${reading.because}`;
    }
    return "membership: decided";
  }
};

// app/present/resolvers/promotion.ts
var WAITING_FOR_TAG_BINDING = {
  tag: "#waiting-for",
  edgeType: "WAITING_FOR",
  edgeSource: "position"
};
function edgeSourceOfFor(structural) {
  return (edgeType) => {
    const indent3 = structural?.indent;
    if (indent3 !== void 0 && indent3.edgeType === edgeType) {
      return indent3.edgeSource;
    }
    if (WAITING_FOR_TAG_BINDING.edgeType === edgeType) {
      return WAITING_FOR_TAG_BINDING.edgeSource;
    }
    return void 0;
  };
}
function prospectiveEdgeBinding(line, structural) {
  if (tagSpans(line).some((span) => span.text === WAITING_FOR_TAG_BINDING.tag)) {
    return { edgeType: WAITING_FOR_TAG_BINDING.edgeType };
  }
  const indent3 = structural?.indent;
  if (indent3 === void 0) {
    return void 0;
  }
  return { edgeType: indent3.edgeType };
}
function structuralParentLineIndex(lines, lineIndex) {
  const leadingWhitespace = (line) => (/^\s*/.exec(line) ?? [""])[0].length;
  const childIndent = leadingWhitespace(lines[lineIndex] ?? "");
  for (let i = lineIndex - 1; i >= 0; i -= 1) {
    const line = lines[i] ?? "";
    if (line.trim() === "") continue;
    if (leadingWhitespace(line) < childIndent) return i;
  }
  return null;
}
var bareId2 = (id) => String(id).replace(/^qntm:/i, "");
function structuralNodeCandidateFor(line, section, snapshot, qualification, notFoundPrefix) {
  const stamped = stampSpans(line);
  const first = stamped[0];
  if (first !== void 0) {
    if (snapshot === null) {
      return { abstain: "graph-not-loaded" };
    }
    const wanted = bareId2(first.id);
    const node = snapshot.nodes.find((n) => bareId2(resolvedQntmId(n)) === wanted);
    if (node === void 0) {
      return { abstain: `${notFoundPrefix}-not-in-graph` };
    }
    return { id: node.id, fields: { node_type: node.type, ...node.fields } };
  }
  const fields = resolveLineFields(line, section, qualification);
  if (typeof fields === "string") {
    return { abstain: `${notFoundPrefix}-${fields}` };
  }
  return { id: null, fields };
}
function parentCandidateFor(parentLine, parentSection, snapshot, qualification) {
  return structuralNodeCandidateFor(parentLine, parentSection, snapshot, qualification, "parent");
}
function childCandidateFor(childLine, childSection, snapshot, qualification) {
  return structuralNodeCandidateFor(childLine, childSection, snapshot, qualification, "child");
}
function structuralRelationshipChangeFor(commit, afterParentLineIndex) {
  const beforeParentLineIndex = commit.kind === "set-line" ? structuralParentLineIndex(commit.source.split("\n"), commit.lineIndex) : null;
  if (beforeParentLineIndex === afterParentLineIndex) {
    return { kind: "unchanged" };
  }
  if (afterParentLineIndex === null) {
    return { kind: "lost" };
  }
  return { kind: "gained", parentLineIndex: afterParentLineIndex };
}
var promotionSpec = {
  id: "parent",
  badge: "parentBadge",
  read(ctx) {
    const { view, commit } = ctx;
    const { structural, qualification, resolution, rules: rulesTable } = ctx.declared;
    if (rulesTable === void 0 || qualification === void 0 || resolution === void 0) {
      return NOT_EVALUATED;
    }
    if (commit.markdown === null) {
      return NOT_EVALUATED;
    }
    const lines = commit.markdown.split("\n");
    const parentLineIndex = structuralParentLineIndex(lines, commit.lineIndex);
    const relationship = structuralRelationshipChangeFor(commit, parentLineIndex);
    if (relationship.kind === "unchanged") {
      return NOT_EVALUATED;
    }
    if (relationship.kind === "lost") {
      return { kind: "abstains", because: "structural-relationship-removed" };
    }
    const parentAt = relationship.parentLineIndex;
    const sectionOrder = sectionOrderFor(view, qualification.sectionOrder);
    const childSectionId = sectionAt(commit.markdown, commit.lineIndex, view.id, sectionOrder);
    const childSection = childSectionId === null ? void 0 : qualification.sections[view.id]?.[childSectionId];
    if (childSection === void 0) {
      return { kind: "abstains", because: "no-section-declaration" };
    }
    const childLine = lines[commit.lineIndex] ?? "";
    const snapshot = ctx.graph;
    const childCandidate = childCandidateFor(childLine, childSection, snapshot, qualification);
    if ("abstain" in childCandidate) {
      return { kind: "abstains", because: childCandidate.abstain };
    }
    const childFieldsRaw = childCandidate.fields;
    const binding = prospectiveEdgeBinding(childLine, structural);
    if (binding === void 0) {
      return NOT_EVALUATED;
    }
    const parentSectionId = sectionAt(commit.markdown, parentAt, view.id, sectionOrder);
    const parentSection = parentSectionId === null ? void 0 : qualification.sections[view.id]?.[parentSectionId];
    if (parentSection === void 0) {
      return { kind: "abstains", because: "no-section-declaration" };
    }
    const parentLine = lines[parentAt] ?? "";
    const parentCandidate = parentCandidateFor(parentLine, parentSection, snapshot, qualification);
    if ("abstain" in parentCandidate) {
      return { kind: "abstains", because: parentCandidate.abstain };
    }
    const childPass = applyRules(childFieldsRaw, rulesTable, void 0);
    const prospective = { edgeType: binding.edgeType, fields: childPass.fields };
    const pass = applyGraphAwareRules(
      parentCandidate.fields,
      parentCandidate.id,
      rulesTable,
      snapshot ?? { nodes: [], edges: [] },
      edgeSourceOfFor(structural),
      prospective,
      void 0
    );
    if (pass.applied.length === 0 && pass.undecidable.length > 0) {
      return { kind: "abstains", because: "graph-match-undecidable" };
    }
    const retypes = pass.applied.filter((effect) => effect.verb === "retype");
    const render = retypes.length === 0 ? { kind: "unchanged" } : renderRuleEffects(parentLine, retypes, qualification.tokens.node_type ?? {}, {}, {}, resolution.tagOrder);
    return {
      kind: "answer",
      coverage: coverageOf(pass.undecidable),
      parentLineIndex: parentAt,
      applied: pass.applied,
      partial: pass.partial.length > 0,
      render
    };
  },
  say(reading) {
    if (reading.kind !== "answer" || reading.applied.length === 0) {
      return "";
    }
    const words2 = reading.applied.map((effect) => {
      if (effect.verb === "retype") return `becomes ${effect.to}`;
      if (effect.verb === "set") return `sets ${effect.field}`;
      return `clears ${effect.field}`;
    });
    return `the row above ${words2.join(", ")}`;
  },
  show(reading) {
    if (reading.kind === "not-evaluated") {
      return "";
    }
    if (reading.kind === "abstains") {
      return `parent: abstained \u2014 ${reading.because}`;
    }
    if (reading.applied.length === 0) {
      return "parent: decided \u2014 no change";
    }
    if (reading.render.kind === "abstains") {
      return `parent: abstained \u2014 rendering-${reading.render.because}`;
    }
    return reading.partial ? "parent: decided (partial \u2014 action(s) not modelled)" : "parent: decided";
  },
  /**
   * THE PARENT'S OWN PREDICTION — the row ABOVE `commit`, decorated with the retype a promotion rule
   * decided for it, when `read` above could spell that retype onto a line at all. All of the
   * rendering happened in `read` (`reading.render`); this only ever turns a `"rendered"` outcome
   * into an `Arming`, or arms nothing.
   *
   * ALWAYS `"answer"`, NEVER `"abstains"` — see `ArmResult`'s own header (resolve.ts). A genuine
   * render refusal is `reading.render.kind === "abstains"`, already surfaced through `show` above
   * (`"parent: abstained — rendering-..."`), which is WHY this fix (#149) moved the render call into
   * `read`: there is no second, independent computation left in here for `arm` itself to refuse.
   */
  arm(_ctx, reading) {
    if (reading.kind !== "answer" || reading.applied.length === 0) {
      return ARMS_NOTHING;
    }
    if (reading.render.kind !== "rendered") {
      return ARMS_NOTHING;
    }
    return {
      kind: "answer",
      coverage: reading.coverage,
      armings: [
        {
          surface: "predict",
          prediction: { lineIndex: reading.parentLineIndex, text: reading.render.delta, fullText: reading.render.text }
        }
      ]
    };
  }
};

// app/present/resolvers/ordering.ts
function classifierFor(ctx, viewId, sectionId, source) {
  const { qualification, structural } = ctx.declared;
  if (qualification === void 0 || ctx.graph === null) {
    return void 0;
  }
  return qualifyingClassifierFor(source.split("\n"), viewId, sectionId, qualification, ctx.graph, edgeSourceOfFor(structural));
}
var SIBLINGS_DROPPED_UNREPORTED = {
  kind: "unknown",
  because: "ordering-drops-unreadable-siblings-without-reporting-them"
};
var orderingSpec = {
  id: "ordering",
  badge: "orderingBadge",
  read(ctx) {
    const { view, commit } = ctx;
    const { qualification, resolution } = ctx.declared;
    if (resolution === void 0 || qualification === void 0 || commit.kind !== "set-line") {
      return NOT_EVALUATED;
    }
    const sectionOrder = sectionOrderFor(view, qualification.sectionOrder);
    const sectionId = sectionAt(commit.source, commit.lineIndex, view.id, sectionOrder);
    if (sectionId === null) {
      return NOT_EVALUATED;
    }
    const reading = resolveOrderingFor(
      view.id,
      sectionId,
      commit.source,
      commit.lineIndex,
      commit.text,
      resolution.ordering,
      resolution.orderingFields,
      resolution.defaultOrdering,
      resolution.priorityRank,
      classifierFor(ctx, view.id, sectionId, commit.source)
    );
    if (reading.kind === "abstains") {
      return { kind: "abstains", because: reading.because };
    }
    return {
      kind: "answer",
      coverage: SIBLINGS_DROPPED_UNREPORTED,
      answer: reading.answer,
      sectionName: resolution.ordering[view.id]?.[sectionId]?.name ?? sectionId
    };
  },
  say(reading) {
    if (reading.kind !== "answer" || !reading.answer.moved) {
      return "";
    }
    return `this line will move within ${reading.sectionName}`;
  },
  show(reading) {
    if (reading.kind === "not-evaluated") {
      return "";
    }
    if (reading.kind === "abstains") {
      return `ordering: abstained \u2014 ${reading.because}`;
    }
    return "ordering: decided";
  },
  /**
   * THE PLACEMENT — computed from `ctx`, NOT from `reading`, and that asymmetry is real rather than
   * an oversight. `read` answers "did the rank change" (`resolveOrderingFor`); this answers "which
   * row does it now sit before" (`resolveOrderingPlacementFor`) — a different published function
   * against a different address source for an insert. The two questions do not reduce to one, so
   * `arm` takes the context and asks its own. It is still PURE, and it still runs exactly once per
   * commit, which is what the shared-reading rule is actually protecting.
   *
   * ── THE ONE PLACE THIS RESOLVER CAN GENUINELY SAY `"abstains"` (2026-08-07, step 3) ──
   *
   * `resolveOrderingPlacementFor` is the SECOND, INDEPENDENT computation `ArmResult`'s own header
   * (resolve.ts) warns about — for an `insert-line` commit, `read` above never calls it at all
   * (`read` only handles `"set-line"`, so `reading` is `NOT_EVALUATED`), so THIS call is the only
   * place this app ever asks "where does the freshly typed row belong", and its own abstention
   * (`OrderingAbstention` — `"unclassifiable-siblings"`, `"nested-section"`, …) used to vanish into
   * a bare `return []`, exactly the mechanism `promotion.ts` had before #149. Found live, unreported,
   * by this leg: `tests/present-resolver-arm-refusal.test.mjs`, RED against unmodified `main` through
   * a real `o`/type/`Enter` gesture. `"not-evaluated"` covers the two PRECONDITION gates above (no
   * declaration, no section) — this resolver was never asked, not refused; `"abstains"` covers the
   * genuine refusal, now carried rather than dropped.
   */
  arm(ctx) {
    const { view, commit } = ctx;
    const { qualification, resolution } = ctx.declared;
    if (resolution === void 0 || qualification === void 0 || commit.markdown === null) {
      return { kind: "not-evaluated" };
    }
    const sectionOrder = sectionOrderFor(view, qualification.sectionOrder);
    const addressSource = commit.kind === "insert-line" ? commit.markdown : commit.source;
    const sectionId = sectionAt(addressSource, commit.lineIndex, view.id, sectionOrder);
    if (sectionId === null) {
      return { kind: "not-evaluated" };
    }
    const placement = resolveOrderingPlacementFor(
      view.id,
      sectionId,
      addressSource,
      commit.lineIndex,
      commit.text,
      resolution.ordering,
      resolution.orderingFields,
      resolution.defaultOrdering,
      resolution.priorityRank,
      classifierFor(ctx, view.id, sectionId, addressSource)
    );
    if (placement.kind !== "answer") {
      return { kind: "abstains", because: placement.because };
    }
    const needsPlacement = commit.kind === "insert-line" ? placement.placement.currentBeforeLineIndex !== placement.placement.beforeLineIndex : placement.placement.moved;
    if (!needsPlacement) {
      return ARMS_NOTHING;
    }
    return {
      kind: "answer",
      coverage: COMPLETE,
      armings: [
        {
          surface: "settle",
          placement: { lineIndex: commit.lineIndex, beforeLineIndex: placement.placement.beforeLineIndex }
        }
      ]
    };
  }
};

// app/present/resolvers/rules.ts
var rulesSpec = {
  id: "rules",
  badge: "rulesBadge",
  read(ctx) {
    const { view, commit } = ctx;
    const { qualification, resolution, rules: rulesTable } = ctx.declared;
    if (rulesTable === void 0 || qualification === void 0 || resolution === void 0) {
      return NOT_EVALUATED;
    }
    if (commit.kind !== "insert-line" || commit.markdown === null) {
      return NOT_EVALUATED;
    }
    const sectionOrder = sectionOrderFor(view, qualification.sectionOrder);
    const sectionId = sectionAt(commit.markdown, commit.lineIndex, view.id, sectionOrder);
    if (sectionId === null) {
      return NOT_EVALUATED;
    }
    const section = qualification.sections[view.id]?.[sectionId];
    if (section === void 0) {
      return NOT_EVALUATED;
    }
    const line = commit.markdown.split("\n")[commit.lineIndex] ?? "";
    const fields = resolveLineFields(line, section, qualification);
    if (typeof fields === "string") {
      return { kind: "abstains", because: fields };
    }
    const today = todayFor(ctx.now(), resolution.dayBoundary);
    const pass = applyRules(fields, rulesTable, today.kind === "answer" ? today.answer : void 0);
    if (pass.applied.length === 0) {
      if (pass.undecidable.length > 0) {
        return { kind: "abstains", because: "rule-pattern-needs-graph-traversal" };
      }
      return { kind: "answer", coverage: COMPLETE, applied: [], text: null, partial: false };
    }
    const rendered = renderRuleEffects(
      line,
      pass.applied,
      qualification.tokens.node_type ?? {},
      qualification.tokens,
      rulesTable.fieldMarkers,
      resolution.tagOrder
    );
    if (rendered.kind === "abstains") {
      return { kind: "abstains", because: `rendering-${rendered.because}` };
    }
    return {
      kind: "answer",
      // THE SEVEN THIS PASS COULD NOT CONSULT, CARRIED RATHER THAN DROPPED — see this module's
      // header for the measurement, and `Coverage`'s own header for why it rides on the answer.
      coverage: coverageOf(pass.undecidable),
      applied: pass.applied,
      text: rendered.kind === "rendered" ? rendered.text : null,
      partial: pass.partial.length > 0
    };
  },
  say(reading) {
    if (reading.kind !== "answer" || reading.applied.length === 0 || reading.text === null) {
      return "";
    }
    const words2 = reading.applied.map((effect) => {
      if (effect.verb === "retype") return `becomes ${effect.to}`;
      if (effect.verb === "set") return `sets ${effect.field}`;
      return `clears ${effect.field}`;
    });
    return `this line ${words2.join(", ")}`;
  },
  show(reading) {
    if (reading.kind === "not-evaluated") {
      return "";
    }
    if (reading.kind === "abstains") {
      return `rules: abstained \u2014 ${reading.because}`;
    }
    return reading.partial ? "rules: decided (partial \u2014 action(s) not modelled)" : "rules: decided";
  },
  /**
   * THE CHILD'S OWN PREDICTION — the row `commit` just became, decorated with what this pass says
   * it will carry once the cycle answers.
   *
   * SCOPED TO EXACTLY THE CASES `read` ALREADY CALLS "answer", NEVER TO AN ABSTENTION.
   * `reading.text === null` is the third silent case: a pass ran and genuinely decided nothing (an
   * `unset` on a field that was never set), a real answer with no characters to show.
   *
   * THE TEXT IS THE DELTA, NOT THE WHOLE LINE. `reading.text` is `renderRuleEffects`'s own
   * `line + appended`, so the characters the operator already typed are sliced back off — the row
   * already shows them, and repeating them would be the chip doubling the line rather than adding.
   *
   * ALWAYS `"answer"`, NEVER `"abstains"` — see `ArmResult`'s own header (resolve.ts). Every fact
   * this needs already lives on `reading`, itself already classified by `read` above; there is no
   * SECOND, independent computation in here for arm's own logic to refuse.
   */
  arm(ctx, reading) {
    const { commit } = ctx;
    if (commit.kind !== "insert-line" || commit.markdown === null) {
      return ARMS_NOTHING;
    }
    if (reading.kind !== "answer" || reading.text === null) {
      return ARMS_NOTHING;
    }
    const line = commit.markdown.split("\n")[commit.lineIndex] ?? "";
    const delta = reading.text.slice(line.length).trim();
    if (delta === "") {
      return ARMS_NOTHING;
    }
    return { kind: "answer", coverage: COMPLETE, armings: [{ surface: "predict", prediction: { lineIndex: commit.lineIndex, text: delta } }] };
  }
};

// app/present/resolvers/registry.ts
var RESOLVERS = [
  defineResolver(membershipSpec),
  defineResolver(orderingSpec),
  defineResolver(rulesSpec),
  defineResolver(promotionSpec)
];

// app/present/graph.ts
function createGraphBlobCache(deps) {
  let graphBlob = null;
  let graphBlobEtag = null;
  let graphBlobInFlight = null;
  async function refreshGraphBlob() {
    if (!deps.token()) return;
    if (graphBlobInFlight) return graphBlobInFlight;
    graphBlobInFlight = (async () => {
      try {
        const headers = { Authorization: "Bearer " + deps.token() };
        if (graphBlobEtag) headers["If-None-Match"] = graphBlobEtag;
        const res = await fetch(deps.api + "/app/graph/blob", { method: "GET", headers });
        if (res.status === 304 || !res.ok) return;
        const data = await res.json().catch(() => null);
        if (!data || !data.snapshot) return;
        graphBlob = data.snapshot;
        graphBlobEtag = res.headers.get("ETag") || graphBlobEtag;
      } catch {
      } finally {
        graphBlobInFlight = null;
      }
    })();
    return graphBlobInFlight;
  }
  return {
    refresh: refreshGraphBlob,
    blob: () => graphBlob,
    etag: () => graphBlobEtag,
    setBlob(next) {
      graphBlob = next;
    },
    setEtag(next) {
      graphBlobEtag = next;
    },
    reset() {
      graphBlob = null;
      graphBlobEtag = null;
    }
  };
}

// app/present/commit.ts
function resolveAndArm(deps, view, commit) {
  const outcome = runResolvers(RESOLVERS, deps.buildContext(view, commit));
  deps.reportAbstentions(outcome.diagnostics);
  return outcome;
}
function createCommitLine(deps) {
  async function commitLine(view, commit) {
    if (commit.markdown === null) {
      queueMicrotask(deps.drainPainted);
      return;
    }
    if (commit.kind === "set-line") {
      deps.settle.supersede(commit.source, view.id, commit.lineIndex);
    }
    resolveAndArm(deps, view, commit);
    deps.queued.drop(view.path);
    const token = mintWriteToken();
    try {
      const ops = lineOps(commit.kind, commit.lineIndex, commit.markdown);
      const data = await deps.writeFile(view, commit.markdown, commit.source, token, ops);
      deps.arrive(view.path, data, { markdown: commit.markdown, token, source: commit.source });
    } catch (error) {
      const e = error;
      if (e?.status === 409) {
        if (commit.text.trim() === "" && commit.kind !== "delete-line") {
          if (token !== null) {
            deps.writes.concludeGiveUp(token);
          }
          deps.healFromRefusal(view.path, e.current);
          return;
        }
        const refusedCurrent = typeof e.current === "string" ? e.current : null;
        const rebase = refusedCurrent === null ? null : commit.kind === "set-line" ? rebaseLineEdit(view.id, commit.source, commit.lineIndex, commit.text, refusedCurrent) : commit.kind === "delete-line" ? rebaseLineDelete(view.id, commit.source, commit.lineIndex, refusedCurrent) : null;
        if (rebase?.outcome === "rebased" && refusedCurrent !== null) {
          if (token !== null) {
            deps.writes.concludeGiveUp(token);
          }
          const retryToken = mintWriteToken();
          try {
            const retryOps = lineOps(commit.kind === "delete-line" ? "delete-line" : "set-line", rebase.lineIndex, rebase.markdown);
            const data = await deps.writeFile(view, rebase.markdown, refusedCurrent, retryToken, retryOps);
            deps.arrive(view.path, data, {
              markdown: rebase.markdown,
              token: retryToken,
              source: refusedCurrent
            });
          } catch (retryFailure) {
            const retryError = retryFailure;
            if (retryError?.status === 409 && retryToken !== null) {
              deps.writes.concludeGiveUp(retryToken);
            }
            if (retryError?.status !== 409) {
              deps.repaintArrived();
            } else {
              commit.onRefusalIsFinal?.(retryError.current);
            }
          }
          return;
        }
        if (commit.kind === "delete-line") deps.healFromRefusal(view.path, e.current);
        if (token !== null) {
          deps.writes.concludeGiveUp(token);
        }
        commit.onRefusalIsFinal?.(e.current);
        return;
      }
      deps.repaintArrived();
    }
  }
  return commitLine;
}

// app/present/graph-refresh-retry.ts
var GraphRefreshRetrySurface = class {
  #source = null;
  #view = "";
  #commit = null;
  #etag = null;
  /**
   * `commit` (committed against `view`, producing `source` — `commit.markdown`, the same base
   * `armSettle`/`armPredict` key against) ran its resolver walk against the graph blob at `etag`
   * (`graphCache.etag()` at the moment `commit`'s own context was built). Called on EVERY commit,
   * unconditionally — see this class's own header for why there is no gate on what any resolver
   * decided. Overwrites whatever was pending before.
   */
  arm(source, view, commit, etag) {
    this.#source = source;
    this.#view = view;
    this.#commit = commit;
    this.#etag = etag;
  }
  /**
   * The commit pending retry for the EXACT `source`/`view` still on screen, when the graph blob's
   * OWN etag has genuinely moved since that commit's context was built — or `null` when there is
   * nothing pending, the pending retry belongs to a different view, the operator has typed
   * something else since, or (`currentEtag` unchanged) the graph has not actually moved and
   * re-deriving would only repeat the identical walk. Does not clear on its own — the caller
   * clears once it has actually used the answer (see `createGraphRefreshRetry`).
   */
  pending(source, view, currentEtag) {
    if (this.#source !== source || this.#view !== view) {
      return null;
    }
    if (this.#etag === currentEtag) {
      return null;
    }
    return this.#commit;
  }
  /** The retry ran (whatever it found), or the operator moved on some other way this class was
   * not built to detect on its own. Nothing left pending for a later refresh to find. */
  clear() {
    this.#source = null;
    this.#view = "";
    this.#commit = null;
    this.#etag = null;
  }
};
function createGraphRefreshRetry(deps) {
  function retryGraphRefresh() {
    const view = deps.currentView();
    if (view === null) {
      return;
    }
    const currentEtag = deps.currentEtag();
    const pending = deps.retrySurface.pending(deps.paintedSource(), view.id, currentEtag);
    if (pending === null) {
      return;
    }
    resolveAndArm(deps, view, pending);
    deps.retrySurface.clear();
    deps.repaint();
  }
  return retryGraphRefresh;
}

// app/present/recent.ts
var RECENT_LIMIT = 50;
var viewKey = (viewId) => `view:${viewId}`;
var taskKey = (qntmId) => `task:${qntmId}`;
function lineKey(line) {
  const stamp = stampSpans(line)[0];
  return stamp === void 0 ? null : taskKey(stamp.id);
}
function noteUse(list, key) {
  return [key, ...list.filter((k) => k !== key)].slice(0, RECENT_LIMIT);
}
function recentIndex(list) {
  return new Map(list.map((key, index) => [key, index]));
}

// app/present/search.ts
function hitKey(hit) {
  if (hit.kind === "view") return viewKey(hit.viewId);
  if (hit.kind === "task") return taskKey(hit.qntmId);
  return null;
}
function folderWords(path) {
  const parts = String(path ?? "").split("/").slice(0, -1);
  return parts.join(" ").replace(/[-_]/g, " ");
}
function folderLabel(path) {
  return String(path ?? "").split("/").slice(0, -1).join(" / ");
}
function searchCandidates(views, options = {}) {
  const prefer = options.prefer ?? null;
  const ordered = [...views.filter((v) => v.id === prefer), ...views.filter((v) => v.id !== prefer)];
  const hits = [];
  for (const view of ordered) {
    const title = view.title ?? view.id;
    const where = folderLabel(view.path);
    hits.push({
      kind: "view",
      qntmId: "",
      text: where === "" ? title : `${where} \u203A ${title}`,
      title,
      status: "",
      viewId: view.id,
      viewTitle: title,
      viewPath: view.path ?? "",
      lineIndex: 0
    });
  }
  const sections = /* @__PURE__ */ new Set();
  for (const view of ordered) {
    const lines = view.markdown.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? "";
      const shape = classifyLine(line, options.statuses);
      if (shape.kind === "heading") {
        const heading = shape.text.trim();
        const key = `${view.id}\0${heading}`;
        if (shape.hashes.length < 2 || heading === "" || sections.has(key)) continue;
        sections.add(key);
        hits.push({
          kind: "section",
          qntmId: "",
          text: heading,
          title: heading,
          status: "",
          viewId: view.id,
          viewTitle: view.title ?? view.id,
          viewPath: view.path ?? "",
          lineIndex: index
        });
        continue;
      }
      const stamp = stampSpans(line)[0];
      if (stamp === void 0) continue;
      const content = contentOf(line) ?? "";
      const title = cleanTitleFor(line);
      hits.push({
        kind: "task",
        qntmId: stamp.id,
        text: content.split(stamp.text).join("").replace(/\s+/g, " ").trim(),
        title: title.kind === "title" ? title.text : "",
        status: shape.kind === "checkbox" ? shape.status : "",
        viewId: view.id,
        viewTitle: view.title ?? view.id,
        viewPath: view.path ?? "",
        lineIndex: index
      });
    }
  }
  return hits;
}
function describeHit(hit, recent = /* @__PURE__ */ new Map()) {
  const key = hitKey(hit);
  const used = key === null ? void 0 : recent.get(key);
  if (hit.kind === "view") return { title: hit.viewTitle, also: folderWords(hit.viewPath), kind: "view", path: hit.viewPath, recent: used };
  if (hit.kind === "section") return { title: hit.text, kind: "section", path: hit.viewPath };
  return { title: hit.title, also: hit.text, kind: "task", status: hit.status, path: hit.viewPath, recent: used };
}
function bestCopyOfEachTask(hits, key, policy) {
  const choose = { keys: [{ field: "demoted", direction: "asc" }, { field: "position" }], demote: policy.demote };
  const seen = /* @__PURE__ */ new Set();
  const kept = new Set(
    rank(hits, (hit) => ({ title: "", path: hit.viewPath }), "", choose).filter((hit) => {
      if (hit.kind !== "task") return true;
      const k = key(hit);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
  );
  return hits.filter((hit) => kept.has(hit));
}
function searchViews(views, query, options = {}) {
  const policy = options.policy ?? DEFAULT_RANK_POLICIES.search;
  const recent = recentIndex(options.recent ?? []);
  const copies = bestCopyOfEachTask(searchCandidates(views, options), (hit) => hit.qntmId, policy);
  if (query.trim() === "") return recentHits(copies, recent, options);
  return rank(copies, (hit) => describeHit(hit, recent), query, policy).slice(0, options.limit ?? 30);
}
function recentHits(copies, recent, options) {
  const used = copies.filter((hit) => {
    const key = hitKey(hit);
    if (key === null || !recent.has(key)) return false;
    return !(hit.kind === "view" && hit.viewId === options.prefer);
  });
  const policy = options.recentPolicy ?? DEFAULT_RANK_POLICIES.recent;
  return rank(used, (hit) => describeHit(hit, recent), "", policy).slice(0, options.limit ?? 12);
}
function linkTargets(views, query, options = {}) {
  if (query.trim() === "") return [];
  const tasks = searchCandidates(views, options).filter((hit) => hit.kind === "task" && hit.title !== "");
  const policy = options.policy ?? DEFAULT_RANK_POLICIES.link;
  const recent = recentIndex(options.recent ?? []);
  const describe = (hit) => ({
    title: hit.title,
    kind: "task",
    status: hit.status,
    path: hit.viewPath,
    recent: recent.get(taskKey(hit.qntmId))
  });
  const copies = bestCopyOfEachTask(tasks, (hit) => hit.title.toLowerCase(), policy);
  return rank(copies, describe, query, policy).slice(0, options.limit ?? 8);
}
function findLinkTarget(views, target, options = {}) {
  const id = stampSpans(`[[${target.trim()}]]`)[0]?.id;
  const want = target.trim().toLowerCase();
  for (const hit of searchCandidates(views, options)) {
    if (hit.kind !== "task") continue;
    if (id !== void 0 ? hit.qntmId === id : hit.title.toLowerCase() === want) return hit;
  }
  return null;
}

// app/present/linkcomplete.ts
function linkQueryAt(text, caret) {
  const before = text.slice(0, caret);
  const start = before.lastIndexOf("[[");
  if (start === -1) return null;
  const query = before.slice(start + 2);
  if (query.includes("]]") || query.includes("[")) return null;
  return { start, query };
}
function linkSource(views, preferViewId, statuses = () => void 0, policy = () => void 0) {
  return (text, caret) => {
    const open = linkQueryAt(text, caret);
    if (open === null || open.query.trim() === "") return null;
    const end = text.startsWith("]]", caret) ? caret + 2 : caret;
    const items = linkTargets(views(), open.query, { prefer: preferViewId(), statuses: statuses(), policy: policy() }).map((hit) => ({
      label: `${hit.title}  \xB7  ${hit.viewTitle}`,
      insert: `[[${hit.title}]]`
    }));
    return { start: open.start, end, items };
  };
}

// app/present/tagcomplete.ts
function tagVocabulary(sources) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  const add = (token) => {
    if (typeof token !== "string" || !/^#[^\s#]+$/.test(token) || seen.has(token)) return;
    seen.add(token);
    out.push(token);
  };
  for (const token of sources.resolution?.tagOrder?.canonicalOrder ?? []) add(token);
  const fields = sources.qualification?.tokens ?? {};
  for (const field of Object.keys(fields).sort()) {
    for (const token of Object.keys(fields[field] ?? {}).sort()) add(token);
  }
  return out;
}
function tagQueryAt(text, caret) {
  if (caret < 0 || caret > text.length) return null;
  let start = caret;
  while (start > 0 && !/\s/.test(text[start - 1] ?? "")) start -= 1;
  if (text[start] !== "#") return null;
  let end = caret;
  while (end < text.length && !/\s/.test(text[end] ?? "")) end += 1;
  const typed = text.slice(start + 1, caret);
  if (typed.includes("#")) return null;
  return { start, end, prefix: typed.toLowerCase() };
}
function matchingTags(vocabulary, query, limit = 8, policy = DEFAULT_RANK_POLICIES.tags) {
  return rank(vocabulary, (tag) => ({ title: tag.slice(1) }), query.prefix, policy).slice(0, limit);
}

// app/present/completion.ts
function completeWith(sources, text, caret) {
  for (const source of sources) {
    const answer = source(text, caret);
    if (answer !== null && answer.items.length > 0) return answer;
  }
  return null;
}
function applyCompletion(text, completion, insert) {
  const after = text.slice(completion.end);
  const spacer = after.startsWith(" ") ? "" : " ";
  return {
    text: text.slice(0, completion.start) + insert + spacer + after,
    caret: completion.start + insert.length + 1
  };
}
function tagSource(vocabulary, policy) {
  return (text, caret) => {
    const query = tagQueryAt(text, caret);
    if (query === null) return null;
    const items = matchingTags(vocabulary, query, 8, policy).map((tag) => ({ label: tag, insert: tag }));
    return { start: query.start, end: query.end, items };
  };
}

// app/present/datecomplete.ts
function dateMarkers(sources) {
  const out = [];
  for (const [field, marker] of Object.entries(sources.qualification?.extractionFields ?? {})) {
    if (field === "created_at" || field === "completed_at") continue;
    if (marker?.kind === "date" && typeof marker.token === "string" && marker.token !== "") out.push(marker.token);
  }
  return out;
}
var WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
function addDays(date, days) {
  const [y, m, d] = date.split("-").map(Number);
  const at = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) + days * 864e5);
  return at.toISOString().slice(0, 10);
}
function addMonths(date, months) {
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d ?? 1, last));
  return target.toISOString().slice(0, 10);
}
function dateChoices(today, weekStartsOn) {
  const [y, m, d] = today.split("-").map(Number);
  const weekday = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay();
  const startIndex = Math.max(0, WEEKDAYS.indexOf(weekStartsOn.toLowerCase()));
  const toWeekStart = (startIndex - weekday + 7) % 7 || 7;
  const startName = (WEEKDAYS[startIndex] ?? "monday").replace(/^./, (c) => c.toUpperCase());
  return [
    { label: "Today", date: today },
    { label: "Tomorrow", date: addDays(today, 1) },
    { label: `Next ${startName}`, date: addDays(today, toWeekStart) },
    { label: "In a week", date: addDays(today, 7) },
    { label: "In 2 weeks", date: addDays(today, 14) },
    { label: "In a month", date: addMonths(today, 1) }
  ];
}
function dateSource(markers, today, weekStartsOn) {
  return (text, caret) => {
    const before = text.slice(0, caret);
    for (const marker of markers) {
      const at = before.lastIndexOf(marker);
      if (at === -1) continue;
      const tail = before.slice(at + marker.length);
      const typed = /^ ([0-9-]*)$/.exec(tail);
      if (typed === null) continue;
      const day = today();
      if (day === void 0) return null;
      const start = at + marker.length + 1;
      let end = caret;
      while (end < text.length && /[0-9-]/.test(text[end] ?? "")) end += 1;
      const prefix = typed[1] ?? "";
      const items = dateChoices(day, weekStartsOn).filter((choice) => choice.date.startsWith(prefix)).map((choice) => ({ label: `${choice.label} \xB7 ${choice.date}`, insert: choice.date }));
      return { start, end, items };
    }
    return null;
  };
}

// app/present/markercomplete.ts
var words = (field) => field.replace(/_/g, " ");
function markerVocabulary(sources) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const add = (token, name) => {
    if (token === "" || seen.has(token)) return;
    seen.add(token);
    out.push({ token, name });
  };
  for (const [field, marker] of Object.entries(sources.qualification?.extractionFields ?? {})) {
    if (typeof marker?.token === "string") add(marker.token, words(field));
  }
  for (const [field, spellings] of Object.entries(sources.qualification?.tokens ?? {})) {
    for (const [token, value] of Object.entries(spellings ?? {})) {
      if (token.startsWith("#") || token.startsWith("[")) continue;
      add(token, `${words(String(value))} \xB7 ${words(field)}`);
    }
  }
  return out;
}
function markerQueryAt(text, caret) {
  const match = /(^|\s):([a-z0-9_ ]{0,24})$/i.exec(text.slice(0, caret));
  if (match === null) return null;
  const query = match[2] ?? "";
  if (query.startsWith(" ")) return null;
  return { start: caret - query.length - 1, query: query.toLowerCase() };
}
function markerSource(markers, policy = DEFAULT_RANK_POLICIES.markers) {
  return (text, caret) => {
    const at = markerQueryAt(text, caret);
    if (at === null) return null;
    const items = rank(markers, (marker) => ({ title: marker.name }), at.query.replace(/_/g, " "), policy).map(
      (marker) => ({ label: `${marker.token}  ${marker.name}`, insert: marker.token })
    );
    return { start: at.start, end: caret, items };
  };
}

// app/present/keyhelp.ts
var KEY_HELP = [
  {
    title: "Move",
    rows: [
      { keys: ["j", "\u2193"], does: "Next line" },
      { keys: ["k", "\u2191"], does: "Previous line" },
      { keys: ["gg", "G"], does: "First / last line" },
      { keys: ["{", "}"], does: "Previous / next section" },
      { keys: ["w", "b", "e"], does: "Next word / back a word / end of word" },
      { keys: ["0", "$"], does: "Start / end of the line" },
      { keys: ["3j"], does: "A number before a move repeats it" }
    ]
  },
  {
    title: "Edit",
    rows: [
      { keys: ["i", "Enter"], does: "Edit the line (cursor where it is)" },
      { keys: ["a"], does: "Edit the line, after the cursor" },
      { keys: ["A"], does: "Edit the line, at the end" },
      { keys: ["click the selected line"], does: "Edit it (on a phone: tap it)" },
      { keys: ["o", "O"], does: "New line below / above" },
      { keys: ["c"], does: "Capture a new line into the Inbox, from any view" },
      { keys: ["x", "Space"], does: "Tick / untick (adds or removes \u2705 today)" },
      { keys: ["dd"], does: "Mark the line for deletion (again to unmark). Marked lines are deleted on Cycle" },
      { keys: ["yy"], does: "Copy the line" },
      { keys: ["u", "\u2318Z"], does: "Undo this view's last change" },
      { keys: ["Ctrl-r", "\u21E7\u2318Z"], does: "Redo" },
      { keys: ["p", "P"], does: "Move the last marked line (or put a copy) below / above" },
      { keys: [">", "<"], does: "Indent / outdent (make or unmake a child)" }
    ]
  },
  {
    title: "While editing a line",
    rows: [
      { keys: ["Enter"], does: "Save the line and stop editing" },
      { keys: ["Shift+Enter"], does: "Save the line and start a new one below" },
      { keys: ["Escape"], does: "Stop editing (keeps what you typed)" },
      { keys: ["#"], does: "Suggest tags from your config" },
      { keys: [":"], does: "Suggest markers by name (:sched \u2192 \u23F3)" },
      { keys: ["\u{1F4C5} \u23F3 \u{1F6EB} + space"], does: "Suggest dates" },
      { keys: ["\u2191", "\u2193", "Tab"], does: "Choose a suggestion" }
    ]
  },
  {
    title: "App",
    rows: [
      { keys: ["\\"], does: "Open the views list" },
      { keys: ["H", "Ctrl-o", "\u2318["], does: "Back to the previous view" },
      { keys: ["L", "Ctrl-i", "\u2318]"], does: "Forward to the next view" },
      { keys: ["/"], does: "Search; blank, it lists what you used recently \u2014 Enter goes back" },
      { keys: ["\u2318S", "Ctrl+S"], does: "Cycle (saves an open line first)" },
      { keys: ["?"], does: "This help" },
      { keys: ["Escape"], does: "Close a panel, or get out of a stuck edit" }
    ]
  }
];

// app/present/unconfirmed.ts
function unconfirmedLines(painted, served) {
  const out = /* @__PURE__ */ new Set();
  if (served === void 0 || painted === served) return out;
  const known = new Set(served.split("\n"));
  painted.split("\n").forEach((line, index) => {
    if (line.trim() !== "" && !known.has(line)) out.add(index);
  });
  return out;
}

// app/shell/caret.ts
function placeCaret(element, at) {
  element.setSelectionRange?.(at, at);
}

// app/shell/landing.ts
function landPrediction(el, predictable, prediction, animate) {
  const because = prediction.fullText === void 0 ? "no-full-text" : predictable === void 0 ? "row-not-predictable" : void 0;
  const replaced = predictable !== void 0 && prediction.fullText !== void 0 ? replacePredictedSwap(predictable, prediction.fullText, prediction.text, "pending") : false;
  if (!replaced) {
    appendPrediction(el, prediction.text, "pending", animate);
  }
  const landing = replaced ? { kind: "swapped" } : { kind: "appended", because: because ?? "swap-refused" };
  el.dataset["predictionLanding"] = landing.kind === "swapped" ? "swapped" : `appended:${landing.because}`;
  return landing;
}

// app/shell/paint.ts
function existingLineCommit(source, lineIndex, markdown, onRefusalIsFinal) {
  const text = (markdown ?? source).split("\n")[lineIndex] ?? "";
  return { lineIndex, text, markdown, source, kind: "set-line", onRefusalIsFinal };
}
function rawText(source) {
  const div = document.createElement("div");
  div.textContent = source;
  return div;
}
var VIM_BLOCK_CLASS = "vim-block";
var paintGeneration = 0;
var EMPTY_CELL = "\xA0";
function normalLine(lineSource, column) {
  const div = document.createElement("div");
  div.className = "rawline " + VIM_SELECTED_CLASS;
  const head = document.createElement("span");
  head.textContent = lineSource.slice(0, column);
  const cell = document.createElement("span");
  cell.className = VIM_BLOCK_CLASS;
  cell.textContent = lineSource.slice(column, column + 1) || EMPTY_CELL;
  const tail = document.createElement("span");
  tail.textContent = lineSource.slice(column + 1);
  div.append(head, cell, tail);
  return div;
}
function holdHeight(body) {
  const height = body.offsetHeight;
  if (typeof height !== "number" || height <= 0 || body.style === void 0) return;
  body.style.minHeight = `${height}px`;
  queueMicrotask(() => {
    body.style.minHeight = "";
  });
}
function lineEditor(text) {
  const box = document.createElement("textarea");
  box.className = "rawline";
  box.rows = 1;
  box.value = text;
  const fit = () => {
    if (typeof box.scrollHeight !== "number" || box.style === void 0) return;
    box.style.height = "auto";
    box.style.height = `${box.scrollHeight}px`;
  };
  box.addEventListener("input", () => {
    if (box.value.includes("\n")) {
      const at = box.selectionStart ?? box.value.length;
      box.value = box.value.replace(/\r?\n/g, " ");
      placeCaret(box, at);
    }
    fit();
  });
  box.addEventListener("focus", fit);
  return box;
}
function rawInput(lineSource, lineIndex, fileSource, focus, deps, repaint, openLineAt) {
  const input = lineEditor(lineSource);
  const mode = deps.mode;
  const leaveInsert = () => {
    if (mode !== void 0) {
      mode.enterNormal();
    } else {
      focus.blur();
    }
  };
  let settlement = "open";
  const settle = (openBelow = false) => {
    if (settlement !== "open") {
      return;
    }
    settlement = "committed";
    const wasFocused = focus.isFocused(lineIndex);
    const text = input.value;
    const markdown = applyEdit(fileSource, { kind: "set-line", lineIndex, text });
    deps.onLineCommit?.({ lineIndex, text, markdown, source: fileSource, kind: "set-line" });
    const next = markdown ?? fileSource;
    const opened = openBelow ? openLineAt(lineIndex + 1, next) : false;
    if (opened) {
      focus.blur();
    }
    if (wasFocused) {
      if (opened && mode !== void 0) {
        mode.enterInsert();
      } else {
        focus.moveTo({ kind: "leave-insert" }, markdown === null ? lineSource : text);
        leaveInsert();
      }
    }
    if (markdown !== null || wasFocused || opened) {
      repaint(next);
    }
  };
  input.addEventListener("input", () => {
    focus.moveTo({ kind: "at", column: input.selectionStart ?? 0 }, input.value);
  });
  input.addEventListener("blur", () => settle());
  input.addEventListener("keydown", (event) => {
    const key = event?.key;
    if (key === "Enter") {
      event?.preventDefault?.();
      settle(event?.shiftKey === true);
    } else if (key === "Escape") {
      event?.preventDefault?.();
      settle();
    }
  });
  return input;
}
function draftInput(lineIndex, seed, typed, fileSource, draft, deps, repaint) {
  const input = lineEditor(typed);
  let settled = false;
  const generation = draft.generation;
  const stale = () => draft.generation !== generation;
  const returnToVim = (source) => {
    if (deps.mode === void 0) {
      return;
    }
    deps.mode.enterNormal();
    if (deps.focus !== void 0) {
      const last = Math.max(0, source.split("\n").length - 1);
      deps.focus.place(Math.min(lineIndex, last), { kind: "keep" }, source, deps.view);
    }
  };
  const abandon = () => {
    if (settled || stale()) {
      return;
    }
    settled = true;
    draft.drop();
    returnToVim(fileSource);
    repaint(fileSource);
  };
  const settle = () => {
    if (settled || stale()) {
      return;
    }
    settled = true;
    const text = input.value;
    draft.drop();
    const markdown = applyEdit(fileSource, { kind: "insert-line", lineIndex, text });
    deps.onLineCommit?.({ lineIndex, text, markdown, source: fileSource, kind: "insert-line" });
    returnToVim(markdown ?? fileSource);
    repaint(markdown ?? fileSource);
  };
  input.addEventListener("input", () => {
    draft.type(input.value);
    deps.focus?.moveTo({ kind: "at", column: input.selectionStart ?? 0 }, input.value);
  });
  input.addEventListener("blur", settle);
  input.addEventListener("keydown", (event) => {
    const key = event?.key;
    if (key === "Enter") {
      event?.preventDefault?.();
      settle();
    } else if (key === "Escape") {
      event?.preventDefault?.();
      settle();
    } else if (key === "Backspace" && input.value === seed) {
      event?.preventDefault?.();
      abandon();
    }
  });
  return input;
}
var TAG_CHIP_CLASS = "tagchip";
var CHIP_OPEN = `<span class="${TAG_CHIP_CLASS}">`;
var CHIP_CLOSE = "</span>";
var LINK_CHIP_CLASS = "linkchip";
var LINK_OPEN = `<span class="${LINK_CHIP_CLASS}">`;
var IDENTITY = /^\[\[qntm:\d+\]\]$/i;
var STAMP_MARK_CLASS = "stampmark";
var STAMP_OPEN = `<span class="${STAMP_MARK_CLASS}"`;
var STAMP_MARK_GLYPH = "\u2022";
var stampMark = (id) => `${STAMP_OPEN} title="qntm:${id}">${STAMP_MARK_GLYPH}</span>`;
var VIM_SELECTED_CLASS = "vim-selected";
function renderTokens(text, tags, stamp, render) {
  const injections = [];
  if (stamp === "wired") {
    for (const span of stampSpans(text)) {
      injections.push({ start: span.start, end: span.end, text: span.text, html: stampMark(span.id) });
    }
  }
  if (tags === "wired") {
    for (const span of tagSpans(text)) {
      injections.push({
        start: span.start,
        end: span.end,
        text: span.text,
        html: CHIP_OPEN + span.text + CHIP_CLOSE
      });
    }
    for (const span of wikiLinkSpans(text)) {
      const whole = text.slice(span.start, span.end);
      if (IDENTITY.test(whole)) continue;
      injections.push({ start: span.start, end: span.end, text: whole, html: LINK_OPEN + whole + CHIP_CLOSE });
    }
  }
  if (injections.length === 0) {
    return render(text);
  }
  const claimed = [];
  for (const injection of injections) {
    if (!claimed.some((c) => injection.start >= c.start && injection.start < c.end)) {
      claimed.push(injection);
    }
  }
  claimed.sort((a, b) => a.start - b.start);
  let injected = "";
  let at = 0;
  for (const injection of claimed) {
    injected += text.slice(at, injection.start) + injection.html;
    at = injection.end;
  }
  injected += text.slice(at);
  const html = render(injected);
  const survived = (open) => html.split(open).length - 1;
  const wanted = (open) => claimed.filter((c) => c.html.startsWith(open)).length;
  const intact = survived(CHIP_OPEN) === wanted(CHIP_OPEN) && survived(STAMP_OPEN) === wanted(STAMP_OPEN) && survived(LINK_OPEN) === wanted(LINK_OPEN);
  return intact ? html : render(text);
}
var SETTLE_CLASS = "settle-move";
function settleRow(moving, before, body, animate) {
  const first = animate && typeof moving.getBoundingClientRect === "function" ? moving.getBoundingClientRect() : null;
  body.insertBefore(moving, before);
  if (first === null) {
    return;
  }
  const last = moving.getBoundingClientRect();
  const dy = first.top - last.top;
  if (dy === 0) {
    return;
  }
  moving.className = moving.className === "" ? SETTLE_CLASS : `${moving.className} ${SETTLE_CLASS}`;
  moving.style.transition = "none";
  moving.style.transform = `translateY(${dy}px)`;
  const settled = () => {
    moving.style.transition = "";
    moving.style.transform = "";
  };
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(settled);
  } else {
    settled();
  }
}
var PREDICT_CLASS = "row-prediction";
var PREDICT_WITHDRAWN_CLASS = "row-prediction-withdrawn";
function appendPrediction(row, text, kind, animate) {
  if (row.tagName.toLowerCase() === "textarea") {
    return;
  }
  const span = document.createElement("span");
  const classes = [PREDICT_CLASS];
  if (kind === "withdrawn") {
    classes.push(PREDICT_WITHDRAWN_CLASS);
  }
  span.className = classes.join(" ");
  span.textContent = text;
  span.title = kind === "withdrawn" ? "predicted \u2014 the engine answered differently" : "predicted \u2014 not yet confirmed by the engine";
  row.append(span);
  if (kind === "pending" && animate) {
    span.style.transition = "none";
    span.style.opacity = "0";
    span.style.transform = "translateY(-.2em)";
    const settled = () => {
      span.style.transition = "";
      span.style.opacity = "";
      span.style.transform = "";
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(settled);
    } else {
      settled();
    }
  }
}
function markDeltaIn(span, delta, kind) {
  const text = span.textContent ?? "";
  const at = delta === "" ? -1 : text.indexOf(delta);
  if (at === -1) {
    return span;
  }
  const before = text.slice(0, at);
  const after = text.slice(at + delta.length);
  span.textContent = "";
  if (before !== "") {
    span.appendChild(document.createTextNode(before));
  }
  const mark = document.createElement("span");
  mark.className = kind === "withdrawn" ? PREDICT_WITHDRAWN_CLASS : PREDICT_CLASS;
  mark.textContent = delta;
  span.appendChild(mark);
  if (after !== "") {
    span.appendChild(document.createTextNode(after));
  }
  return span;
}
function replacePredictedSwap(entry, fullText, delta, kind) {
  if (entry.cursorColumn !== void 0) {
    const rebuilt = normalLine(fullText, entry.cursorColumn);
    entry.contentEl.innerHTML = "";
    for (const child of Array.from(rebuilt.children)) {
      entry.contentEl.appendChild(markDeltaIn(child, delta, kind));
    }
    return true;
  }
  const shape = classifyLine(fullText);
  const rebuiltSource = shape.kind === "checkbox" ? shape.tail : shape.kind === "heading" ? shape.text : shape.kind === "prose" ? shape.source : null;
  if (rebuiltSource === null) return false;
  const html = renderTokens(rebuiltSource, entry.tagsRendition, entry.stampRendition, entry.render);
  const oldChip = CHIP_OPEN + delta + CHIP_CLOSE;
  const chipIndex = html.indexOf(oldChip);
  if (chipIndex === -1) return false;
  const classes = [PREDICT_CLASS];
  if (kind === "withdrawn") classes.push(PREDICT_WITHDRAWN_CLASS);
  const titleAttr = kind === "withdrawn" ? "predicted \u2014 the engine answered differently" : "predicted \u2014 not yet confirmed by the engine";
  const newChip = `<span class="${classes.join(" ")}" title="${titleAttr}">${delta}</span>`;
  entry.contentEl.innerHTML = html.slice(0, chipIndex) + newChip + html.slice(chipIndex + oldChip.length);
  return true;
}
function paint(body, source, context, deps) {
  paintGeneration += 1;
  const mine = paintGeneration;
  const superseded = () => paintGeneration !== mine;
  const focus = deps.focus;
  const draft = deps.draft;
  const mode = deps.mode;
  const instances = deps.view === void 0 ? void 0 : instancesOf(source, deps.view);
  const stampInstance = (element, lineIndex) => {
    const info = instances?.[lineIndex];
    if (info !== void 0 && info !== null) {
      element.dataset.instance = info.instance;
    }
  };
  const markLineIndex = (element, lineIndex) => {
    element.dataset.lineIndex = String(lineIndex);
    if (deps.cutLines?.has(lineIndex) === true) element.classList.add("cut");
  };
  const repaint = (nextSource) => {
    if (deps.view !== void 0) {
      deps.rows?.edited(deps.view, nextSource);
    }
    paint(body, nextSource, context, deps);
  };
  const focusable = (element, lineIndex) => {
    if (focus === void 0) {
      return;
    }
    element.addEventListener("click", (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      focus.place(lineIndex, { kind: "line-start" }, source, deps.view);
      repaint(source);
    });
  };
  const openLineAt = (lineIndex, from) => {
    if (draft === void 0 || focus === void 0) {
      return false;
    }
    return openLine(from, lineIndex, draft, deps.onNewLineDeclined, deps.declared, deps.view);
  };
  const raw = (lineSource, lineIndex) => {
    if (focus === void 0) {
      const text = rawText(lineSource);
      stampInstance(text, lineIndex);
      markLineIndex(text, lineIndex);
      body.append(text);
      rowsByLineIndex.set(lineIndex, text);
      return;
    }
    if (mode !== void 0 && mode.mode === "NORMAL" && focus.isFocused(lineIndex)) {
      const line = normalLine(lineSource, focus.column);
      focusable(line, lineIndex);
      stampInstance(line, lineIndex);
      markLineIndex(line, lineIndex);
      body.append(line);
      rowsByLineIndex.set(lineIndex, line);
      predictableByLineIndex.set(lineIndex, {
        contentEl: line,
        // A BLOCK-CURSOR ROW RENDERS NO TOKENS AT ALL — `normalLine` writes raw characters into
        // three spans — so these two carry `raw` rather than a resolved value, and the rebuild
        // below never consults them. Stated rather than left as a plausible-looking lookup.
        tagsRendition: "raw",
        stampRendition: "raw",
        render: (markdown) => deps.markdown.render(markdown),
        cursorColumn: focus.column
      });
      return;
    }
    const input = rawInput(lineSource, lineIndex, source, focus, deps, repaint, openLineAt);
    stampInstance(input, lineIndex);
    markLineIndex(input, lineIndex);
    body.append(input);
    rowsByLineIndex.set(lineIndex, input);
    if (focus.isFocused(lineIndex)) {
      input.focus?.();
      if (superseded()) {
        return;
      }
      const asked = mode?.takeCaretHint();
      if (asked !== void 0) {
        focus.moveTo({ kind: asked }, lineSource);
        placeCaret(input, focus.column);
      }
    }
  };
  holdHeight(body);
  body.innerHTML = "";
  if (superseded()) {
    return;
  }
  let draftPainted = false;
  const paintDraft = () => {
    const open = draft?.draft;
    if (open === void 0 || open === null || draftPainted) {
      return;
    }
    draftPainted = true;
    const input = draftInput(
      open.lineIndex,
      open.seed,
      open.typed,
      source,
      draft,
      deps,
      repaint
    );
    body.append(input);
    input.focus?.();
    if (superseded()) {
      return;
    }
    if (open.typed !== open.seed) {
      placeCaret(input, open.typed.length);
      deps.focus?.moveTo({ kind: "at", column: open.typed.length }, open.typed);
      return;
    }
    if (open.cursorOffset !== void 0) {
      placeCaret(input, open.cursorOffset);
      deps.focus?.moveTo({ kind: "at", column: open.cursorOffset }, open.seed);
    }
  };
  let lastPaintedIndex = -1;
  const rowsByLineIndex = /* @__PURE__ */ new Map();
  const predictableByLineIndex = /* @__PURE__ */ new Map();
  source.split("\n").forEach((line, index) => {
    if (superseded()) {
      return;
    }
    if (draft?.isDraftAt(index) === true) {
      paintDraft();
    }
    const shape = classifyLine(line, deps.checkboxStatuses);
    if (shape.kind === "blank") {
      if (mode !== void 0 && mode.mode === "NORMAL" && focus !== void 0 && focus.isFocused(index)) {
        const mark = document.createElement("div");
        mark.className = VIM_SELECTED_CLASS;
        body.append(mark);
      }
      return;
    }
    lastPaintedIndex = index;
    const focusLive = focus !== void 0;
    const cascade = new PresentationCascade(focusLive ? focus.contextFor(index, context) : context);
    if (shape.kind === "checkbox") {
      if (cascade.resolve("checkbox").rendition === "raw") {
        raw(shape.source, index);
        return;
      }
      const row = document.createElement("label");
      row.className = "task" + (shape.done ? " done" : "") + (deps.unconfirmed?.has(index) ? " unconfirmed" : "");
      row.style.marginLeft = shape.indent.length / 2 * 1.2 + "rem";
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = shape.done;
      row.dataset["status"] = shape.status;
      if (shape.status !== "open" && shape.status !== "done") {
        row.classList.add(`status-${shape.status}`);
        box.title = shape.status;
      }
      box.addEventListener("change", () => {
        const completion = deps.completion?.();
        const markdown = applyEdit(source, {
          kind: "set-checkbox",
          lineIndex: index,
          checked: box.checked,
          statuses: deps.checkboxStatuses,
          ...completion === void 0 ? {} : { completion }
        });
        deps.onCheckboxToggle?.({ lineIndex: index, checked: box.checked, markdown, source, box, row });
      });
      const span = document.createElement("span");
      const checkboxTagsRendition = cascade.resolve("tags").rendition;
      const checkboxStampRendition = cascade.resolve("stamp").rendition;
      const checkboxRender = (markdown) => deps.markdown.renderInline(markdown);
      span.innerHTML = renderTokens(shape.tail, checkboxTagsRendition, checkboxStampRendition, checkboxRender);
      focusable(span, index);
      stampInstance(row, index);
      markLineIndex(row, index);
      row.append(box, span);
      body.append(row);
      rowsByLineIndex.set(index, row);
      predictableByLineIndex.set(index, {
        contentEl: span,
        tagsRendition: checkboxTagsRendition,
        stampRendition: checkboxStampRendition,
        render: checkboxRender
      });
      return;
    }
    if (shape.kind === "heading") {
      if (cascade.resolve("heading").rendition === "raw") {
        raw(shape.source, index);
        return;
      }
      const el = document.createElement("h" + String(Math.min(shape.hashes.length + 1, 6)));
      const headingTagsRendition = cascade.resolve("tags").rendition;
      const headingStampRendition = cascade.resolve("stamp").rendition;
      const headingRender = (markdown) => deps.markdown.renderInline(markdown);
      el.innerHTML = renderTokens(shape.text, headingTagsRendition, headingStampRendition, headingRender);
      focusable(el, index);
      stampInstance(el, index);
      markLineIndex(el, index);
      body.append(el);
      rowsByLineIndex.set(index, el);
      predictableByLineIndex.set(index, {
        contentEl: el,
        tagsRendition: headingTagsRendition,
        stampRendition: headingStampRendition,
        render: headingRender
      });
      return;
    }
    if (cascade.resolve("prose").rendition === "raw") {
      raw(shape.source, index);
      return;
    }
    const div = document.createElement("div");
    const proseTagsRendition = cascade.resolve("tags").rendition;
    const proseStampRendition = cascade.resolve("stamp").rendition;
    const proseRender = (markdown) => deps.markdown.render(markdown);
    div.innerHTML = renderTokens(shape.source, proseTagsRendition, proseStampRendition, proseRender);
    focusable(div, index);
    stampInstance(div, index);
    markLineIndex(div, index);
    body.append(div);
    rowsByLineIndex.set(index, div);
    predictableByLineIndex.set(index, {
      contentEl: div,
      tagsRendition: proseTagsRendition,
      stampRendition: proseStampRendition,
      render: proseRender
    });
  });
  if (superseded()) {
    return;
  }
  const settle = deps.settle;
  if (settle !== void 0) {
    for (const instruction of settle.take(source, deps.view ?? "")) {
      const movingEl = rowsByLineIndex.get(instruction.placement.lineIndex);
      const beforeLineIndex = instruction.placement.beforeLineIndex;
      const beforeEl = beforeLineIndex === null ? null : rowsByLineIndex.get(beforeLineIndex) ?? null;
      if (movingEl !== void 0) {
        settleRow(movingEl, beforeEl, body, instruction.animate);
      }
    }
  }
  const predict = deps.predict;
  if (predict !== void 0) {
    const instruction = predict.take(source, deps.view ?? "");
    if (instruction !== null) {
      for (const prediction of instruction.predictions) {
        const el = rowsByLineIndex.get(prediction.lineIndex);
        if (el === void 0) continue;
        landPrediction(
          el,
          prediction.fullText === void 0 ? void 0 : predictableByLineIndex.get(prediction.lineIndex),
          prediction,
          instruction.animate
        );
      }
      for (const withdrawn of instruction.withdrawn) {
        const el = rowsByLineIndex.get(withdrawn.lineIndex);
        if (el !== void 0) {
          appendPrediction(el, withdrawn.text, "withdrawn", true);
        }
      }
    }
  }
  paintDraft();
  if (superseded()) {
    return;
  }
  if (draft !== void 0 && focus !== void 0) {
    const below = document.createElement("div");
    below.className = "newline";
    below.addEventListener("click", (event) => {
      event?.preventDefault?.();
      openLineAt(lastPaintedIndex + 1, source);
      repaint(source);
    });
    body.append(below);
  }
  if (deps.view !== void 0) {
    deps.rows?.seat(deps.view, source, focus?.lineIndex ?? null);
  }
}
function visualLineOrder(body) {
  const order = [];
  for (const child of Array.from(body.children)) {
    const raw = child.dataset?.lineIndex;
    if (raw !== void 0) {
      order.push(Number(raw));
    }
  }
  return order;
}
function revealSelection(body, block = "nearest") {
  const row = body.querySelector?.(`.${VIM_SELECTED_CLASS}`) ?? body.querySelector?.("textarea.rawline");
  row?.scrollIntoView?.({ block, inline: "nearest" });
}

// app/shell/drawer.ts
var viewsPolicy = (deps) => deps.policy?.() ?? DEFAULT_RANK_POLICIES.views;
var folderOf = (path) => {
  const at = String(path ?? "").lastIndexOf("/");
  return at === -1 ? "" : String(path).slice(0, at);
};
function foldersOf(views) {
  const root = { name: "", folders: /* @__PURE__ */ new Map(), views: [] };
  for (const v of views) {
    const segments = String(v.path ?? "").split("/");
    let node = root;
    for (const segment of segments.slice(0, -1)) {
      let child = node.folders.get(segment);
      if (!child) {
        child = { name: segment, folders: /* @__PURE__ */ new Map(), views: [] };
        node.folders.set(segment, child);
      }
      node = child;
    }
    node.views.push(v);
  }
  return root;
}
var viewsUnder = (node) => node.views.length + [...node.folders.values()].reduce((n, f) => n + viewsUnder(f), 0);
var holdsView = (node, id) => node.views.some((v) => v.id === id) || [...node.folders.values()].some((f) => holdsView(f, id));
var drawerStops = [];
var viewButtons = /* @__PURE__ */ new Map();
var drawerIsOpen = false;
function treeRow(className, glyph, name, count) {
  const button = document.createElement("button");
  button.className = className;
  button.type = "button";
  if (glyph !== null) {
    const chev = document.createElement("span");
    chev.className = "chev";
    chev.textContent = glyph;
    button.append(chev);
  }
  const label = document.createElement("span");
  label.className = "rowname";
  label.textContent = name;
  button.append(label);
  if (count !== null) {
    const tally = document.createElement("span");
    tally.className = "count";
    tally.textContent = String(count);
    button.append(tally);
  }
  return button;
}
function paintFolder(deps, node, into, currentViewId) {
  for (const folder of rank([...node.folders.values()], (f) => ({ title: f.name }), "", viewsPolicy(deps))) {
    const box = document.createElement("div");
    const open = holdsView(folder, currentViewId);
    box.className = open ? "fold" : "fold shut";
    const head = treeRow("foldbtn", "\u203A", folder.name, viewsUnder(folder));
    head.setAttribute("aria-expanded", open ? "true" : "false");
    head.addEventListener("click", () => {
      const shut = box.classList.toggle("shut");
      head.setAttribute("aria-expanded", shut ? "false" : "true");
    });
    const kids = document.createElement("div");
    kids.className = "foldkids";
    box.append(head, kids);
    into.append(box);
    drawerStops.push(head);
    paintFolder(deps, folder, kids, currentViewId);
  }
  for (const v of rank([...node.views], (x) => ({ title: x.title, path: x.path ?? "" }), "", viewsPolicy(deps))) {
    const button = treeRow("viewbtn", null, v.title, null);
    button.addEventListener("click", () => {
      deps.onChoose(v.id);
      closeDrawer(deps);
    });
    into.append(button);
    drawerStops.push(button);
    viewButtons.set(v.id, button);
  }
}
var shownViews = [];
var shownCurrent = null;
function filterViews(views, query, policy = DEFAULT_RANK_POLICIES.views) {
  if (query.trim() === "") return views;
  return rank(views, (v) => ({ title: v.title, also: folderOf(v.path), path: v.path ?? "" }), query, policy);
}
function paintMatches(deps, query) {
  drawerStops.length = 0;
  viewButtons.clear();
  drawerStops.push(deps.closeButton);
  deps.tree.innerHTML = "";
  const matches = filterViews(shownViews, query, viewsPolicy(deps));
  for (const v of matches) {
    const button = treeRow("viewbtn", null, v.title, null);
    const where = document.createElement("span");
    where.className = "count";
    where.textContent = folderOf(v.path);
    button.append(where);
    if (v.id === shownCurrent) button.classList.add("current");
    button.addEventListener("click", () => {
      deps.onChoose(v.id);
      closeDrawer(deps);
    });
    deps.tree.append(button);
    drawerStops.push(button);
    viewButtons.set(v.id, button);
  }
  if (matches.length === 0) {
    const note = document.createElement("p");
    note.className = "treenote";
    note.textContent = "No view matches.";
    deps.tree.append(note);
  }
  drawerStops.forEach((stop, index) => stop.addEventListener("keydown", (e) => drawerKey(deps, e, index)));
}
var wiredFilters = /* @__PURE__ */ new WeakSet();
function wireFilter(deps) {
  const filter = deps.filter;
  if (filter === void 0 || wiredFilters.has(filter)) return;
  wiredFilters.add(filter);
  filter.addEventListener("input", () => {
    if (filter.value.trim() === "") buildDrawer(deps, shownViews, shownCurrent);
    else paintMatches(deps, filter.value);
  });
  filter.addEventListener("keydown", (e) => {
    const key = e.key;
    if (key === "ArrowDown") drawerStops[1]?.focus();
    else if (key === "Enter") drawerStops[1]?.click();
    else if (key === "Escape") {
      if (filter.value !== "") {
        filter.value = "";
        buildDrawer(deps, shownViews, shownCurrent);
      } else closeDrawer(deps);
    } else return;
    e.preventDefault();
    e.stopPropagation();
  });
}
function buildDrawer(deps, views, currentViewId) {
  shownViews = views;
  shownCurrent = currentViewId;
  wireFilter(deps);
  if (deps.filter !== void 0 && deps.filter.value.trim() !== "") {
    paintMatches(deps, deps.filter.value);
    markWhereWeAre(deps, views, currentViewId);
    return;
  }
  drawerStops.length = 0;
  viewButtons.clear();
  drawerStops.push(deps.closeButton);
  deps.tree.innerHTML = "";
  if (views.length === 0) {
    const note = document.createElement("p");
    note.className = "treenote";
    note.textContent = "No views yet.";
    deps.tree.append(note);
    deps.note.textContent = "";
  } else {
    const root = foldersOf(views);
    paintFolder(deps, root, deps.tree, currentViewId);
    const folders = root.folders.size;
    deps.note.textContent = `${views.length} views \xB7 ${folders} folder${folders === 1 ? "" : "s"} \xB7 \\ opens, Esc closes`;
  }
  drawerStops.forEach((stop, index) => stop.addEventListener("keydown", (e) => drawerKey(deps, e, index)));
  markWhereWeAre(deps, views, currentViewId);
}
var parentOf = (el) => el.parentElement ?? el._parent ?? null;
function isReachable(stop) {
  let node = stop;
  for (; ; ) {
    if (node === null) return true;
    const parent = parentOf(node);
    if (!parent) return true;
    if (String(parent.className ?? "").split(/\s+/).includes("foldkids")) {
      const foldBox = parentOf(parent);
      if (String(foldBox?.className ?? "").split(/\s+/).includes("shut")) return false;
      node = foldBox;
      continue;
    }
    node = parent;
  }
}
function moveTo(index, delta) {
  if (drawerStops.length === 0) return;
  let next = index;
  for (let step = 0; step < drawerStops.length; step += 1) {
    next = (next + delta + drawerStops.length) % drawerStops.length;
    const candidate = drawerStops[next];
    if (candidate && isReachable(candidate)) {
      candidate.focus();
      return;
    }
  }
}
function drawerKey(deps, e, index) {
  if (e.key === "Escape") {
    e.preventDefault();
    closeDrawer(deps);
    return;
  }
  if (e.key === "ArrowDown" || e.key === "j") {
    e.preventDefault();
    moveTo(index, 1);
    return;
  }
  if (e.key === "ArrowUp" || e.key === "k") {
    e.preventDefault();
    moveTo(index, -1);
    return;
  }
  if (e.key === "Enter") {
    e.preventDefault();
    e.stopPropagation();
    drawerStops[index]?.click();
    return;
  }
  if (deps.filter !== void 0 && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    deps.filter.focus();
    deps.filter.value += e.key;
    paintMatches(deps, deps.filter.value);
    return;
  }
  if (e.key !== "Tab" || drawerStops.length === 0) return;
  const last = drawerStops.length - 1;
  if (e.shiftKey && index === 0) {
    e.preventDefault();
    drawerStops[last]?.focus();
  } else if (!e.shiftKey && index === last) {
    e.preventDefault();
    drawerStops[0]?.focus();
  }
}
function openDrawer(deps, currentViewId) {
  drawerIsOpen = true;
  deps.panel.classList.add("open");
  deps.scrim.classList.add("open");
  deps.panel.setAttribute("aria-hidden", "false");
  deps.openButton.setAttribute("aria-expanded", "true");
  document.body.classList.add("noscroll");
  if (deps.filter !== void 0) {
    if (deps.filter.value !== "") {
      deps.filter.value = "";
      buildDrawer(deps, shownViews, currentViewId);
    }
    deps.filter.focus();
    const filter = deps.filter;
    setTimeout(() => {
      if (drawerIsOpen && document.activeElement !== filter) filter.focus();
    }, 0);
    return;
  }
  const target = (currentViewId === null ? void 0 : viewButtons.get(currentViewId)) ?? drawerStops[0] ?? deps.panel;
  target.focus();
}
function closeDrawer(deps) {
  const wasOpen = drawerIsOpen;
  drawerIsOpen = false;
  deps.panel.classList.remove("open");
  deps.scrim.classList.remove("open");
  deps.panel.setAttribute("aria-hidden", "true");
  deps.openButton.setAttribute("aria-expanded", "false");
  document.body.classList.remove("noscroll");
  if (wasOpen) deps.openButton.focus();
}
function markWhereWeAre(deps, views, currentViewId) {
  const v = views.find((x) => x.id === currentViewId) ?? null;
  deps.barFolder.textContent = v ? folderOf(v.path) : "";
  deps.barView.textContent = v ? v.title : "";
  for (const [id, button] of viewButtons) button.classList.toggle("current", id === currentViewId);
}

// app/shell/keys.ts
var typingIn = (target) => {
  const tag = String(target?.tagName ?? "").toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
};
function globalKey(deps, e) {
  if (e.defaultPrevented) return;
  if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (e.key === "s" || e.key === "S")) {
    e.preventDefault();
    if (typingIn(e.target)) {
      e.target.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    }
    deps.cycle?.();
    return;
  }
  if (e.key === "Escape" && deps.drawerIsOpen()) {
    e.preventDefault();
    deps.closeDrawer();
    return;
  }
  if (e.key === "\\" && !deps.drawerIsOpen() && !typingIn(e.target)) {
    e.preventDefault();
    deps.openDrawer();
    return;
  }
  if (e.key === "Escape" && deps.mode.mode !== "NORMAL" && !typingIn(e.target)) {
    e.preventDefault();
    deps.mode.enterNormal();
    deps.repaintCurrentView();
    return;
  }
  deps.drainPainted();
  const viewId = deps.currentViewId();
  if (deps.mode.mode !== "NORMAL" || deps.drawerIsOpen() || typingIn(e.target) || viewId === null) return;
  const v = deps.viewOf(viewId);
  if (v === void 0) return;
  let source = deps.showing(v.id, deps.sourceFor(v.path) ?? v.markdown);
  let current = deps.focus.lineIndex ?? 0;
  const visualOrder = visualLineOrder(deps.viewBody);
  const visualPos = visualOrder.indexOf(current);
  const visualCurrent = visualPos === -1 ? 0 : visualPos;
  const visualLastIndex = Math.max(0, visualOrder.length - 1);
  const command = e.metaKey || e.ctrlKey;
  const historyKey = command && (e.key === "z" || e.key === "Z") ? e.shiftKey ? "redo" : "undo" : e.ctrlKey && !e.metaKey && e.key === "r" ? "redo" : null;
  const jumpKey = e.ctrlKey && !e.metaKey && e.key === "o" ? "view-back" : e.ctrlKey && !e.metaKey && e.key === "i" ? "view-forward" : null;
  const outcome = jumpKey !== null ? { handled: true, effect: { kind: jumpKey } } : historyKey !== null ? { handled: true, effect: { kind: historyKey } } : command ? { handled: false, effect: { kind: "none" } } : deps.mode.handleKey(e.key, visualCurrent, visualLastIndex);
  if (!outcome.handled) return;
  e.preventDefault();
  const effect = outcome.effect;
  const register = deps.register;
  if (effect.kind === "move") {
    deps.focus.place(visualOrder[effect.lineIndex] ?? current, { kind: "line-start" }, source, v.id);
    deps.repaintCurrentView();
    revealSelection(deps.viewBody);
  } else if (effect.kind === "boundary") {
    deps.focus.place(
      boundaryLine(source.split("\n"), current, effect.direction, effect.count),
      // LINE-START, for the same reason `j`/`k` uses it: this app resets the column on a line
      // move, and `{`/`}` is a line move. Declared rather than typed as a bare `0`.
      { kind: "line-start" },
      source,
      v.id
    );
    deps.repaintCurrentView();
    revealSelection(deps.viewBody);
  } else if (effect.kind === "open") {
    const targetIndex = effect.direction === "below" ? current + 1 : current;
    const opened = openLine(
      source,
      targetIndex,
      deps.draftLine,
      void 0,
      deps.globalRegistrationFor(v.id),
      // THE VIEW THE ROW'S PLACE IS TAKEN IN, passed explicitly because it must be the same id
      // `paintView` resolves against and `globalRegistrationFor` can return nothing at all (no
      // declaration read yet), in which case there would be no view id inside it to fall back to.
      v.id
    );
    if (opened) {
      deps.focus.blur();
      deps.mode.enterInsert();
    }
    deps.repaintCurrentView();
  } else if (effect.kind === "capture") {
    const target = deps.captureViewId?.();
    if (target === void 0) return;
    if (target !== v.id) deps.chooseView?.(target);
    const tv = deps.viewOf(target);
    if (tv === void 0) return;
    const targetSource = deps.showing(tv.id, deps.sourceFor(tv.path) ?? tv.markdown);
    const lines = targetSource.split("\n");
    let end = lines.length;
    while (end > 0 && (lines[end - 1] ?? "").trim() === "") end -= 1;
    const opened = openLine(
      targetSource,
      end,
      deps.draftLine,
      void 0,
      deps.globalRegistrationFor(tv.id),
      tv.id
    );
    if (opened) {
      deps.focus.blur();
      deps.mode.enterInsert();
    }
    deps.repaintCurrentView();
  } else if (effect.kind === "help") {
    deps.toggleHelp?.();
  } else if (effect.kind === "search") {
    deps.openSearch?.();
  } else if (effect.kind === "view-back") {
    deps.viewBack?.();
  } else if (effect.kind === "view-forward") {
    deps.viewForward?.();
  } else if (effect.kind === "toggle-done") {
    const line = source.split("\n")[current] ?? "";
    const statuses = deps.declaration().qualification?.tokens["status"];
    const shape = classifyLine(line, statuses);
    if (shape.kind === "checkbox") {
      const completion = deps.completion?.();
      const markdown = applyEdit(source, {
        kind: "set-checkbox",
        lineIndex: current,
        checked: !shape.done,
        statuses,
        ...completion === void 0 ? {} : { completion }
      });
      if (markdown !== null) {
        deps.commitLine(v, existingLineCommit(source, current, markdown));
      }
    }
  } else if (effect.kind === "delete-line" && register !== void 0) {
    const line = source.split("\n")[current] ?? "";
    if (applyEditable(source, current)) register.toggleMark(v.id, line);
    deps.repaintCurrentView();
  } else if (effect.kind === "undo" || effect.kind === "redo") {
    if (effect.kind === "undo" && register?.unmarkLast(v.id) === true) {
      deps.repaintCurrentView();
      return;
    }
    (effect.kind === "undo" ? deps.undo : deps.redo)?.(v, source);
    deps.repaintCurrentView();
  } else if (effect.kind === "yank") {
    const line = source.split("\n")[current] ?? "";
    if (line.trim() !== "") register?.yank(line);
  } else if (effect.kind === "paste") {
    const to = effect.where === "below" ? current + 1 : current;
    const moving = register?.takeLast(v.id, source);
    if (register !== void 0 && moving !== void 0) {
      const move = moveCommit(source, moving, to);
      if (move !== null) deps.commitLine(v, move);
    } else {
      const text = register?.copyText();
      const put = text === void 0 ? null : insertCommit(source, to, text);
      if (put !== null) deps.commitLine(v, put);
    }
    deps.repaintCurrentView();
  } else if (effect.kind === "delete-line") {
    const markdown = applyEdit(source, { kind: "delete-line", lineIndex: current });
    if (markdown !== null) {
      deps.commitLine(v, { lineIndex: current, text: "", markdown, source, kind: "delete-line" });
    }
  } else if (effect.kind === "indent") {
    const line = source.split("\n")[current] ?? "";
    const text = indentedLine(line, effect.direction, effect.count, deps.declaration().indentUnit);
    const markdown = applyEdit(source, { kind: "set-line", lineIndex: current, text });
    if (markdown !== null) {
      deps.commitLine(v, existingLineCommit(source, current, markdown));
    }
  } else if (effect.kind === "word") {
    const line = source.split("\n")[current] ?? "";
    if (deps.focus.moveTo({ kind: "word", motion: effect.motion, count: effect.count }, line)) {
      deps.repaintCurrentView();
    }
  } else if (effect.kind === "column") {
    const line = source.split("\n")[current] ?? "";
    deps.focus.moveTo({ kind: effect.to === "start" ? "line-start" : "line-end" }, line);
    deps.repaintCurrentView();
  } else {
    deps.repaintCurrentView();
  }
}
function installGlobalKeys(deps, on = document) {
  on.addEventListener("keydown", (e) => globalKey(deps, e));
  if (typeof KeyboardEvent === "function") {
    deps.viewBody.addEventListener("click", (event) => {
      if (typingIn(event.target)) return;
      const row = event.target?.closest?.(".vim-selected");
      if (row == null) return;
      const column = columnAtPoint(row, event.clientX, event.clientY);
      if (column !== null) deps.focus.moveTo({ kind: "at", column }, row.textContent ?? "");
      event.preventDefault();
      event.stopPropagation();
      globalKey(deps, new KeyboardEvent("keydown", { key: "i", cancelable: true }));
    }, true);
  }
}
function columnAtPoint(row, x, y) {
  const doc = row.ownerDocument;
  const position = doc.caretPositionFromPoint?.(x, y);
  const range = position == null ? doc.caretRangeFromPoint?.(x, y) : null;
  const node = position?.offsetNode ?? range?.startContainer;
  const offset = position?.offset ?? range?.startOffset;
  if (node == null || offset == null || !row.contains(node)) return null;
  let column = 0;
  const walker = doc.createTreeWalker(row, NodeFilter.SHOW_TEXT);
  for (let text = walker.nextNode(); text !== null; text = walker.nextNode()) {
    if (text === node) return column + offset;
    column += text.textContent?.length ?? 0;
  }
  return null;
}
function applyEditable(source, index) {
  const line = (source.split("\n")[index] ?? "").trim();
  return line !== "" && !/^#{1,6}\s/.test(line);
}
function flushMarks(deps) {
  const register = deps.register;
  if (register === void 0) return Promise.resolve();
  const sent = [];
  for (const viewId of register.markedViews()) {
    const v = deps.viewOf(viewId);
    if (v === void 0) continue;
    const source = deps.showing(v.id, deps.sourceFor(v.path) ?? v.markdown);
    const removal = deleteLinesCommit(source, register.takeAll(v.id, source));
    if (removal !== null) sent.push(deps.commitLine(v, removal));
  }
  deps.repaintCurrentView();
  return Promise.all(sent).then(() => void 0);
}

// app/shell/completer.ts
var isLineEditor = (target) => typeof HTMLTextAreaElement !== "undefined" && target instanceof HTMLTextAreaElement && target.classList.contains("rawline");
function placeSuggestionList(list, editor) {
  const view = editor.ownerDocument.defaultView;
  const box = editor.getBoundingClientRect();
  const visual = view?.visualViewport;
  const visibleTop = visual ? visual.offsetTop : 0;
  const visibleBottom = visual ? visual.offsetTop + visual.height : view?.innerHeight ?? 0;
  const visibleRight = visual ? visual.offsetLeft + visual.width : view?.innerWidth ?? 0;
  const gap = 6;
  const height = list.offsetHeight;
  const below = visibleBottom - box.bottom - gap;
  const above = box.top - visibleTop - gap;
  const top = height <= below || below >= above ? box.bottom + gap : box.top - gap - Math.min(height, above);
  const left = Math.max(8, Math.min(box.left, visibleRight - list.offsetWidth - 8));
  list.style.top = `${Math.round(top)}px`;
  list.style.left = `${Math.round(left)}px`;
  list.style.maxHeight = `${Math.max(96, Math.round(Math.min(256, top >= box.bottom ? below : above)))}px`;
}
function installCompleter(deps) {
  let made = null;
  const listEl = (doc) => {
    if (made !== null) return made;
    made = doc.createElement("ul");
    made.className = "tag-picker";
    made.setAttribute("role", "listbox");
    made.setAttribute("aria-label", "Suggestions");
    made.hidden = true;
    doc.body.append(made);
    return made;
  };
  const isOpen = () => made !== null && !made.hidden;
  let active = null;
  let offer = null;
  let selected = 0;
  const close = () => {
    if (made !== null) made.hidden = true;
    offer = null;
    if (following !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(following);
    following = null;
  };
  let following = null;
  const follow = () => {
    following = null;
    if (!isOpen() || active === null) return;
    if (!active.isConnected || active.ownerDocument.activeElement !== active) {
      close();
      return;
    }
    placeSuggestionList(made, active);
    following = requestAnimationFrame(follow);
  };
  const accept = (index) => {
    const item = offer?.items[index];
    if (active === null || offer === null || item === void 0) return;
    const out = applyCompletion(active.value, offer, item.insert);
    active.value = out.text;
    active.setSelectionRange(out.caret, out.caret);
    close();
    active.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const render = () => {
    if (active === null || offer === null) return;
    const list = listEl(active.ownerDocument);
    list.replaceChildren(
      ...offer.items.map((item, index) => {
        const row = active.ownerDocument.createElement("li");
        row.textContent = item.label;
        row.setAttribute("role", "option");
        row.setAttribute("aria-selected", String(index === selected));
        row.addEventListener("mousedown", (event) => {
          event.preventDefault();
          accept(index);
        });
        return row;
      })
    );
    list.hidden = false;
    placeSuggestionList(list, active);
    if (following === null && typeof requestAnimationFrame === "function") following = requestAnimationFrame(follow);
  };
  const refresh = (input) => {
    active = input;
    offer = completeWith(deps.sources(), input.value, input.selectionStart ?? input.value.length);
    if (offer === null) {
      close();
      return;
    }
    selected = Math.min(selected, offer.items.length - 1);
    render();
  };
  deps.viewBody.addEventListener("input", (event) => {
    if (!isLineEditor(event.target)) return;
    selected = 0;
    refresh(event.target);
  });
  deps.viewBody.addEventListener(
    "keydown",
    (event) => {
      if (!isOpen() || event.target !== active || offer === null) return;
      const count = offer.items.length;
      const key = event.key;
      if (key === "ArrowDown") {
        selected = (selected + 1) % count;
        render();
      } else if (key === "ArrowUp") {
        selected = (selected - 1 + count) % count;
        render();
      } else if (key === "Tab") {
        accept(selected);
      } else if (key === "Enter") {
        accept(selected);
        return;
      } else if (key === "Escape") {
        close();
      } else {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true
  );
  deps.viewBody.addEventListener("focusout", (event) => {
    if (event.target === active) close();
  });
}

// app/shell/help.ts
function installKeyHelp(doc = document) {
  let overlay = null;
  const close = () => {
    if (overlay !== null) overlay.hidden = true;
  };
  const make = () => {
    const root = doc.createElement("div");
    root.className = "key-help";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Keyboard help");
    const panel = doc.createElement("div");
    panel.className = "key-help-panel";
    const heading = doc.createElement("h2");
    heading.textContent = "Keys";
    panel.append(heading);
    for (const group of KEY_HELP) {
      const title = doc.createElement("h3");
      title.textContent = group.title;
      const table = doc.createElement("dl");
      for (const row of group.rows) {
        const dt = doc.createElement("dt");
        for (const key of row.keys) {
          const kbd = doc.createElement("kbd");
          kbd.textContent = key;
          dt.append(kbd);
        }
        const dd = doc.createElement("dd");
        dd.textContent = row.does;
        table.append(dt, dd);
      }
      panel.append(title, table);
    }
    root.append(panel);
    root.addEventListener("click", (event) => {
      if (event.target === root) close();
    });
    doc.addEventListener(
      "keydown",
      (event) => {
        if (root.hidden) return;
        if (event.key === "Escape" || event.key === "?") {
          event.preventDefault();
          event.stopImmediatePropagation();
          close();
        }
      },
      true
    );
    doc.body.append(root);
    return root;
  };
  return () => {
    if (overlay === null) {
      overlay = make();
      return;
    }
    overlay.hidden = !overlay.hidden;
  };
}

// app/shell/search.ts
function installSearch(deps, doc = document) {
  let root = null;
  let input = null;
  let list = null;
  let hits = [];
  let selected = 0;
  const close = () => {
    if (root !== null) root.hidden = true;
  };
  const choose = (index) => {
    const hit = hits[index];
    if (hit === void 0) return;
    close();
    deps.used?.(hit);
    deps.go(hit.viewId, hit.lineIndex);
  };
  const render = () => {
    if (list === null) return;
    list.replaceChildren(
      ...hits.map((hit, index) => {
        const row = doc.createElement("li");
        row.setAttribute("role", "option");
        row.setAttribute("aria-selected", String(index === selected));
        const kind = doc.createElement("em");
        kind.className = `search-kind search-kind-${hit.kind}`;
        kind.textContent = hit.kind === "view" ? "View" : hit.kind === "section" ? "Section" : "Task";
        if (index === 0 && hit.kind === "view" && input?.value.trim() === "") kind.textContent = "Back to";
        if (hit.status === "done") row.classList.add("search-done");
        const text = doc.createElement("span");
        text.textContent = hit.text;
        const where = doc.createElement("small");
        where.textContent = hit.viewTitle;
        row.append(kind, text, where);
        row.addEventListener("mousedown", (event) => {
          event.preventDefault();
          choose(index);
        });
        return row;
      })
    );
  };
  const search = () => {
    hits = searchViews(deps.views(), input?.value ?? "", {
      prefer: deps.currentViewId(),
      statuses: deps.statuses?.(),
      policy: deps.policy?.(),
      recent: deps.recent?.(),
      recentPolicy: deps.recentPolicy?.()
    });
    selected = 0;
    render();
  };
  const make = () => {
    root = doc.createElement("div");
    root.className = "search-box";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", "Search");
    input = doc.createElement("input");
    input.type = "search";
    input.placeholder = "Recent \u2014 type to search views, sections and tasks\u2026";
    input.setAttribute("aria-label", "Search views, sections and tasks");
    list = doc.createElement("ul");
    list.setAttribute("role", "listbox");
    root.append(input, list);
    input.addEventListener("input", () => search());
    input.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" && hits.length > 0) selected = (selected + 1) % hits.length;
      else if (event.key === "ArrowUp" && hits.length > 0) selected = (selected - 1 + hits.length) % hits.length;
      else if (event.key === "Enter") choose(selected);
      else if (event.key === "Escape") close();
      else return;
      event.preventDefault();
      event.stopPropagation();
      render();
    });
    input.addEventListener("blur", () => close());
    doc.body.append(root);
  };
  return () => {
    if (root === null) make();
    root.hidden = false;
    input.value = "";
    search();
    input.focus();
  };
}

// app/shell/links.ts
function installLinks(deps) {
  deps.viewBody.addEventListener(
    "click",
    (event) => {
      const chip = event.target?.closest?.(".linkchip");
      if (chip == null) return;
      event.preventDefault();
      event.stopPropagation();
      const target = (chip.textContent ?? "").replace(/^\[\[|\]\]$/g, "");
      const hit = findLinkTarget(deps.views(), target, { prefer: deps.currentViewId(), statuses: deps.statuses?.() });
      if (hit === null) {
        console.info(`[qntm] no view has a task called ${JSON.stringify(target)}`);
        return;
      }
      deps.go(hit.viewId, hit.lineIndex);
    },
    true
  );
}

// app/shell/viewhistory.ts
var PREFIX = "#view=";
var entryOf = (state) => state !== null && typeof state === "object" && typeof state.qntmView === "string" ? state : null;
function viewFromHash(hash) {
  if (!hash.startsWith(PREFIX)) return null;
  try {
    const id = decodeURIComponent(hash.slice(PREFIX.length));
    return id === "" ? null : id;
  } catch {
    return null;
  }
}
function installViewHistory(deps) {
  const { history, location } = deps.win;
  if (history === void 0 || location === void 0 || deps.win.addEventListener === void 0) {
    return { visited() {
    }, back() {
    }, forward() {
    } };
  }
  let restoring = false;
  deps.win.addEventListener("popstate", (event) => {
    const entry = entryOf(event.state);
    if (entry === null) return;
    restoring = true;
    try {
      deps.show(entry.qntmView);
    } finally {
      restoring = false;
    }
  });
  return {
    visited(viewId) {
      if (restoring) return;
      const current = entryOf(history.state);
      if (current?.qntmView === viewId) return;
      const url = `${location.pathname}${location.search}${PREFIX}${encodeURIComponent(viewId)}`;
      if (current === null) history.replaceState({ qntmView: viewId, depth: 0 }, "", url);
      else history.pushState({ qntmView: viewId, depth: current.depth + 1 }, "", url);
    },
    back() {
      if ((entryOf(history.state)?.depth ?? 0) > 0) history.back();
    },
    forward() {
      history.forward();
    }
  };
}

// app/shell/touchbar.ts
var KEYBOARD_MIN_PX = 120;
function keyboardBarTop(viewport, innerHeight, barHeight) {
  const covered = innerHeight - viewport.height - viewport.offsetTop;
  if (covered < KEYBOARD_MIN_PX) return null;
  return Math.round(viewport.offsetTop + viewport.height - barHeight);
}
var TOUCH_KEYS = [
  { label: "\u25C0", name: "Back to the previous view (H)", modes: ["NORMAL"], keys: ["H"] },
  { label: "\u25B6", name: "Forward to the next view (L)", modes: ["NORMAL"], keys: ["L"] },
  { label: "Edit", name: "Edit the line, at the end (A)", modes: ["NORMAL"], keys: ["A"] },
  { label: "New", name: "New line below (o)", modes: ["NORMAL"], keys: ["o"] },
  { label: "\u2713", name: "Tick or untick (x)", modes: ["NORMAL"], keys: ["x"] },
  { label: "\u2192", name: "Indent (>)", modes: ["NORMAL"], keys: [">"] },
  { label: "\u2190", name: "Outdent (<)", modes: ["NORMAL"], keys: ["<"] },
  { label: "Del", name: "Mark for deletion on Cycle (dd)", modes: ["NORMAL"], keys: ["d", "d"] },
  { label: "Undo", name: "Undo (u)", modes: ["NORMAL"], keys: ["u"] },
  { label: "Find", name: "Search (/)", modes: ["NORMAL"], keys: ["/"] },
  { label: "Done", name: "Save the line and stop editing (Escape)", modes: ["INSERT"], keys: ["Escape"] },
  { label: "New", name: "Save and start a new line below (Shift+Enter)", modes: ["INSERT"], keys: ["Enter"], shift: true },
  { label: "#", name: "Tag", modes: ["INSERT"], text: "#" },
  { label: ":", name: "Marker by name", modes: ["INSERT"], text: ":" },
  { label: "[[", name: "Link", modes: ["INSERT"], text: "[[" }
];
var lineEditorIn = (body) => body.querySelector("textarea.rawline");
function installTouchBar(deps) {
  const doc = deps.bar.ownerDocument ?? document;
  for (const key of TOUCH_KEYS) {
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "touchkey";
    button.textContent = key.label;
    button.setAttribute("aria-label", key.name);
    button.setAttribute("data-modes", key.modes.join(" "));
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => press(key));
    deps.bar.append(button);
  }
  const press = (key) => {
    const editor = lineEditorIn(deps.viewBody);
    if (deps.mode() === "INSERT" && editor !== null) {
      if (key.text !== void 0) {
        const start = editor.selectionStart ?? editor.value.length;
        const end = editor.selectionEnd ?? start;
        editor.setRangeText(key.text, start, end, "end");
        editor.dispatchEvent(new Event("input", { bubbles: true }));
        return;
      }
      for (const name of key.keys ?? []) {
        editor.dispatchEvent(
          new KeyboardEvent("keydown", { key: name, shiftKey: key.shift === true, bubbles: true, cancelable: true })
        );
      }
      return;
    }
    for (const name of key.keys ?? []) {
      deps.pressNormal(new KeyboardEvent("keydown", { key: name, shiftKey: key.shift === true, cancelable: true }));
    }
  };
  const win = doc.defaultView;
  const viewport = win?.visualViewport;
  if (viewport != null) {
    const place = () => {
      const top = keyboardBarTop(viewport, win?.innerHeight ?? 0, deps.bar.offsetHeight ?? 0);
      if (top === null) deps.bar.style?.removeProperty?.("top");
      else deps.bar.style?.setProperty?.("top", `${top}px`);
      deps.bar.toggleAttribute?.("data-keyboard", top !== null);
    };
    viewport.addEventListener("resize", place);
    viewport.addEventListener("scroll", place);
    doc.addEventListener?.("focusin", () => {
      for (const ms of [50, 300, 600]) setTimeout(place, ms);
    });
    place();
  }
}
function showTouchMode(bar, mode) {
  bar.setAttribute?.("data-mode", mode);
}
export {
  ANCHOR_TRUST,
  AcceptedSource,
  BaseSurface,
  CLIENT_KEY,
  COMPLETE,
  DEFAULT,
  DEFAULT_INDENT_UNIT,
  DEFAULT_RANK_POLICIES,
  DEFAULT_TRAVERSAL_DEPTH,
  DraftSurface,
  FocusSurface,
  GraphRefreshRetrySurface,
  INDENT_UNIT,
  KEY_HELP,
  LANDING_VIEW_KEY,
  LIST_NAMES,
  LineRegister,
  ModeSurface,
  NOT_EVALUATED,
  NOT_YET_DECLARED,
  OWED_LIMIT,
  PICKUP_DELAYS,
  PickupSchedule,
  PredictSurface,
  PresentationCascade,
  PresentationContext,
  ProjectionQueue,
  QUALIFICATION_KEY,
  RANK_FIELDS,
  RECENT_LIMIT,
  RESOLUTION_KEYS,
  RESOLUTION_TABLE_KEY,
  RESOLVABLE_FIELDS,
  RESOLVERS,
  RULES_KEY2 as RULES_KEY,
  RowStore,
  SPECIFICITY,
  STRUCTURAL_KEY,
  SettleSurface,
  TOUCH_KEYS,
  UndoHistory,
  WAITING_FOR_TAG_BINDING,
  WRITE_ECHO_KEY,
  WriteRegister,
  abstentionsOf,
  addDays,
  applyCompletion,
  applyEdit,
  applyGraphAwareRules,
  applyRuleActions,
  applyRules,
  armPredict,
  armSettle,
  baseOf,
  boundaryLine,
  buildDrawer,
  carriesContent,
  changeOf,
  chromeOf,
  clampColumn,
  clampLine,
  classifyLine,
  cleanTitleFor,
  closeDrawer,
  columnFor,
  compareByKeys,
  compareCodepoints,
  completeWith,
  composeLine,
  composeNodeLine,
  composeSectionHeading,
  composeSeed,
  composeViewMarkdown,
  compositionFor,
  computeViewMembers,
  contentOf,
  coverageOf,
  createCommitLine,
  createGraphBlobCache,
  createGraphRefreshRetry,
  dateChoices,
  dateMarkers,
  dateSource,
  declarationFrom,
  defaultOrderingFor,
  defaultOrderingPlacementFor,
  defineResolver,
  deleteLinesCommit,
  diagnosticOf,
  drawerIsOpen,
  drawerStops,
  edgeSourceOfFor,
  engineOf,
  evaluateWhen,
  existingLineCommit,
  extendsLine,
  findLine,
  findLinkTarget,
  flushMarks,
  folderOf,
  foldersOf,
  globalKey,
  graphSnapshotOf,
  hitKey,
  holdHeight,
  indentedLine,
  installCompleter,
  installGlobalKeys,
  installKeyHelp,
  installLinks,
  installSearch,
  installTouchBar,
  installViewHistory,
  instanceAnchorFor,
  instanceOf,
  instancesOf,
  isSilent,
  keyboardBarTop,
  lineBody,
  lineKey,
  lineOps,
  linkQueryAt,
  linkSource,
  linkTargets,
  markWhereWeAre,
  markerCells,
  markerQueryAt,
  markerSource,
  markerSpans,
  markerValue,
  markerVocabulary,
  matchQuality,
  matchesFindClause,
  matchesQualifier,
  matchesQualifierGraphAware,
  matchingTags,
  membershipFor,
  membershipSpec,
  mintWriteToken,
  nodeLocalContext,
  noteUse,
  openDrawer,
  openLine,
  orderingFor,
  orderingPlacementFor,
  orderingSpec,
  paint,
  parentCandidateFor,
  placeDraft,
  placeFor,
  placeSuggestionList as placeSuggestions,
  policyFor,
  presentationFromDeclaration,
  promotionSpec,
  prospectiveEdgeBinding,
  publishedQualifierFor,
  qntmIdSpans,
  qualifierNeedsGraph,
  qualifyingClassifierFor,
  queryWords,
  rank,
  readClientDeclaration,
  readConfigResolutionDeclaration,
  readDeclaration,
  readQualificationDeclaration,
  readRulesDeclaration,
  readStructuralDeclaration,
  readWriteEcho,
  rebaseLineEdit,
  recentIndex,
  relativeAnchorFor,
  renderRuleEffects,
  resolveAndArm,
  resolveInstanceAnchor,
  resolveLineFields,
  resolveLogicalDate,
  resolveOrderingFor,
  resolveOrderingPlacementFor,
  resolveRelativeAnchor,
  resolveWeekEnd,
  resolvedQntmId,
  revealSelection,
  rulesSpec,
  runResolvers,
  searchCandidates,
  searchViews,
  sectionAt,
  sectionForInsertAt,
  sectionOrderFor,
  sectionOrdinalAt,
  seedFor,
  showTouchMode,
  stampSpans,
  stampsLanded,
  stampsOwed,
  structuralParentLineIndex,
  structuralRelationshipChangeFor,
  tagQueryAt,
  tagSource,
  tagSpans,
  tagVocabulary,
  taskKey,
  titleSpans,
  titleStyleFor,
  titleStylePredicateHolds,
  todayFor,
  unconfirmedLines,
  viewButtons,
  viewFromHash,
  viewKey,
  visualLineOrder,
  wikiLinkSpans,
  wordCaret
};
//# sourceMappingURL=present.js.map
