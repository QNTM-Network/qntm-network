/**
 * yaml-subset — a small, FAIL-LOUD reader for the exact YAML the monorepo's config uses.
 *
 * `generate-structural-declaration.mjs` needed three fields from three files and answered with a
 * targeted line scan, for a reason its header states well: "adding [a YAML dependency] to read
 * three fields nested a few levels deep is a bigger surface than a targeted, indentation-aware
 * line scan."
 *
 * `generate-qualification-declaration.mjs` needs something the line scan cannot give it: whole
 * `root.find` and `steps` VALUES, arbitrarily nested, across 138 pattern files, in block AND flow
 * form (`root: { find: { node_type: header, title: "On-track accuracy (today)" } }` is real config).
 * A predicate read approximately is a browser that says a line stays when the engine will move it,
 * so "extract the field I recognise" is not available here — the whole value must be read exactly.
 *
 * So this is a PARSER, not a scan; but it is a parser for a SUBSET, and everything outside that
 * subset THROWS rather than being silently approximated. Supported: block mappings, block
 * sequences, flow mappings, flow sequences, single/double-quoted scalars (including multi-line),
 * plain scalars (including multi-line), `null`/`~`/empty, integers, floats, booleans, and comments.
 * Rejected loudly: tabs, anchors and aliases (`&`/`*`), block scalars (`|`/`>`), multi-document
 * streams (`---`), merge keys (`<<`), and explicit keys (`? `). None of those appear in the config
 * today; a config that starts using one gets an exception, not a wrong answer.
 *
 * THE PARSER IS NOT THE PROOF. `tests/qualification-agreement.test.mjs` measures what this reader
 * produces against the ENGINE'S OWN pattern machinery over the operator's real graph. A mis-read
 * predicate does not survive that comparison, which is why a hand-rolled reader is an acceptable
 * risk here and a hand-TRANSCRIBED declaration would not be.
 */

export class YamlSubsetError extends Error {}

const KEY = /^(?:"(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^:#{}[\],&*!|>@`]+?)\s*:(?:\s|$)/;

/** Strip a trailing `#` comment, honouring quotes. Returns the code portion of the line. */
function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote === '"') {
      if (ch === "\\") i += 1;
      else if (ch === '"') quote = null;
    } else if (quote === "'") {
      if (ch === "'" && line[i + 1] === "'") i += 1;
      else if (ch === "'") quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "#" && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i);
    }
  }
  return line;
}

/** True when the quotes in `text` are all closed — used to join a multi-line quoted scalar. */
function quotesBalanced(text) {
  let quote = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote === '"') {
      if (ch === "\\") i += 1;
      else if (ch === '"') quote = null;
    } else if (quote === "'") {
      if (ch === "'" && text[i + 1] === "'") i += 1;
      else if (ch === "'") quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    }
  }
  return quote === null;
}

/** True when the flow brackets in `text` are all closed. Quotes are honoured. */
function bracketsBalanced(text) {
  let quote = null;
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (quote === '"' && ch === "\\") i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "{" || ch === "[") depth += 1;
    else if (ch === "}" || ch === "]") depth -= 1;
  }
  return depth === 0;
}

/**
 * Fold the raw text into logical lines: `{ indent, text, line }`, comments removed, blank lines
 * dropped, and any line whose quotes or flow brackets are still open joined with the ones that
 * complete it.
 */
function logicalLines(text, path) {
  if (text.includes("\t")) {
    throw new YamlSubsetError(`${path}: contains a TAB — this reader does not guess at tab indent`);
  }
  const raw = text.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < raw.length; i += 1) {
    const original = raw[i];
    const trimmedStart = original.trimStart();
    if (trimmedStart.startsWith("---") || trimmedStart.startsWith("...")) {
      throw new YamlSubsetError(`${path}:${i + 1}: multi-document streams are not supported`);
    }
    let code = stripComment(original);
    if (code.trim() === "") continue;
    const indent = code.length - code.trimStart().length;
    let lineNo = i + 1;
    while ((!quotesBalanced(code) || !bracketsBalanced(code)) && i + 1 < raw.length) {
      i += 1;
      code += "\n" + stripComment(raw[i]);
    }
    if (!quotesBalanced(code) || !bracketsBalanced(code)) {
      throw new YamlSubsetError(`${path}:${lineNo}: unterminated quote or bracket`);
    }
    const body = code.trim();
    for (const bad of ["&", "*", "<<", "? ", "|", ">"]) {
      if (body.startsWith(bad)) {
        throw new YamlSubsetError(`${path}:${lineNo}: unsupported YAML construct '${bad}'`);
      }
    }
    out.push({ indent, text: body, line: lineNo });
  }
  return out;
}

// ── scalars ──────────────────────────────────────────────────────────────────────────────────

function parseScalar(token, path, lineNo) {
  const t = token.trim();
  if (t === "" || t === "null" || t === "~" || t === "Null" || t === "NULL") return null;
  if (t === "true" || t === "True" || t === "TRUE") return true;
  if (t === "false" || t === "False" || t === "FALSE") return false;
  if (t.startsWith('"')) {
    if (!t.endsWith('"') || t.length < 2) {
      throw new YamlSubsetError(`${path}:${lineNo}: unterminated double-quoted scalar: ${t}`);
    }
    // A multi-line quoted scalar folds its newlines to single spaces (YAML flow folding).
    return t
      .slice(1, -1)
      .replace(/\\(["\\/nrt])/g, (_, c) =>
        c === "n" ? "\n" : c === "r" ? "\r" : c === "t" ? "\t" : c,
      )
      .replace(/\s*\n\s*/g, " ");
  }
  if (t.startsWith("'")) {
    if (!t.endsWith("'") || t.length < 2) {
      throw new YamlSubsetError(`${path}:${lineNo}: unterminated single-quoted scalar: ${t}`);
    }
    return t.slice(1, -1).replace(/''/g, "'").replace(/\s*\n\s*/g, " ");
  }
  if (/^-?\d+$/.test(t)) return Number.parseInt(t, 10);
  if (/^-?\d*\.\d+$/.test(t)) return Number.parseFloat(t);
  return t.replace(/\s*\n\s*/g, " ");
}

// ── flow collections ─────────────────────────────────────────────────────────────────────────

/** Split a flow collection's body on top-level commas, honouring nesting and quotes. */
function splitFlow(body) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let current = "";
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (quote) {
      current += ch;
      if (quote === '"' && ch === "\\") {
        current += body[++i] ?? "";
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (ch === "{" || ch === "[") {
      depth += 1;
      current += ch;
    } else if (ch === "}" || ch === "]") {
      depth -= 1;
      current += ch;
    } else if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim() !== "") parts.push(current);
  return parts.map((p) => p.trim()).filter((p) => p !== "");
}

/** Split `key: value` at the first top-level colon-space (or trailing colon). */
function splitKey(text) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (quote === '"' && ch === "\\") i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "{" || ch === "[") depth += 1;
    else if (ch === "}" || ch === "]") depth -= 1;
    else if (ch === ":" && depth === 0 && (i + 1 === text.length || /\s/.test(text[i + 1]))) {
      return [text.slice(0, i).trim(), text.slice(i + 1).trim()];
    }
  }
  return null;
}

function parseFlow(token, path, lineNo) {
  const t = token.trim();
  if (t.startsWith("{")) {
    if (!t.endsWith("}")) throw new YamlSubsetError(`${path}:${lineNo}: unterminated flow mapping`);
    const map = {};
    for (const part of splitFlow(t.slice(1, -1))) {
      const kv = splitKey(part);
      if (kv === null) {
        throw new YamlSubsetError(`${path}:${lineNo}: flow mapping entry without a key: ${part}`);
      }
      map[String(parseScalar(kv[0], path, lineNo))] = parseValueToken(kv[1], path, lineNo);
    }
    return map;
  }
  if (!t.endsWith("]")) throw new YamlSubsetError(`${path}:${lineNo}: unterminated flow sequence`);
  return splitFlow(t.slice(1, -1)).map((p) => parseValueToken(p, path, lineNo));
}

function parseValueToken(token, path, lineNo) {
  const t = token.trim();
  if (t.startsWith("{") || t.startsWith("[")) return parseFlow(t, path, lineNo);
  return parseScalar(t, path, lineNo);
}

// ── block structure ──────────────────────────────────────────────────────────────────────────

/** Parse the block of lines[i..] whose indent is >= `indent`, returning [value, nextIndex]. */
function parseBlock(lines, start, indent, path) {
  if (start >= lines.length || lines[start].indent < indent) return [null, start];
  return lines[start].text.startsWith("- ") || lines[start].text === "-"
    ? parseSequence(lines, start, lines[start].indent, path)
    : parseMapping(lines, start, lines[start].indent, path);
}

function parseMapping(lines, start, indent, path) {
  const map = {};
  let i = start;
  while (i < lines.length && lines[i].indent >= indent) {
    if (lines[i].indent > indent) {
      throw new YamlSubsetError(`${path}:${lines[i].line}: unexpected indent in mapping`);
    }
    const { text, line } = lines[i];
    const kv = splitKey(text);
    if (kv === null) {
      throw new YamlSubsetError(`${path}:${line}: expected 'key: value', got: ${text}`);
    }
    const key = String(parseScalar(kv[0], path, line));
    const inline = kv[1];
    i += 1;
    if (inline !== "") {
      // An inline value may still be continued by MORE-indented plain lines (a multi-line plain
      // scalar). Quoted and flow values were already folded into one logical line above.
      let scalarText = inline;
      if (!inline.startsWith("{") && !inline.startsWith("[") && !/^["']/.test(inline)) {
        while (i < lines.length && lines[i].indent > indent && splitKey(lines[i].text) === null &&
               !lines[i].text.startsWith("- ")) {
          scalarText += " " + lines[i].text;
          i += 1;
        }
      }
      map[key] = parseValueToken(scalarText, path, line);
      continue;
    }
    const [value, next] = parseBlock(lines, i, indent + 1, path);
    map[key] = value;
    i = next;
  }
  return [map, i];
}

function parseSequence(lines, start, indent, path) {
  const seq = [];
  let i = start;
  while (i < lines.length && lines[i].indent === indent && (lines[i].text.startsWith("- ") || lines[i].text === "-")) {
    const { text, line } = lines[i];
    const rest = text === "-" ? "" : text.slice(2).trim();
    i += 1;
    if (rest === "") {
      const [value, next] = parseBlock(lines, i, indent + 1, path);
      seq.push(value);
      i = next;
      continue;
    }
    const kv = splitKey(rest);
    if (kv === null || rest.startsWith("{") || rest.startsWith("[") || /^["']/.test(rest)) {
      seq.push(parseValueToken(rest, path, line));
      continue;
    }
    // `- key: value` opens a mapping whose remaining keys sit at the dash's column + 2.
    const entry = {};
    const entryIndent = indent + 2;
    entry[String(parseScalar(kv[0], path, line))] =
      kv[1] === ""
        ? (() => {
            const [value, next] = parseBlock(lines, i, entryIndent + 1, path);
            i = next;
            return value;
          })()
        : parseValueToken(kv[1], path, line);
    while (i < lines.length && lines[i].indent === entryIndent && !lines[i].text.startsWith("- ")) {
      const inner = splitKey(lines[i].text);
      if (inner === null) {
        throw new YamlSubsetError(`${path}:${lines[i].line}: expected 'key: value' in sequence entry`);
      }
      const innerKey = String(parseScalar(inner[0], path, lines[i].line));
      const innerLine = lines[i].line;
      i += 1;
      if (inner[1] !== "") {
        entry[innerKey] = parseValueToken(inner[1], path, innerLine);
      } else {
        const [value, next] = parseBlock(lines, i, entryIndent + 1, path);
        entry[innerKey] = value;
        i = next;
      }
    }
    seq.push(entry);
  }
  return [seq, i];
}

/** Parse a whole YAML document from the supported subset. Throws `YamlSubsetError` otherwise. */
export function parseYamlSubset(text, path = "<yaml>") {
  const lines = logicalLines(text, path);
  if (lines.length === 0) return {};
  const [value, next] = parseBlock(lines, 0, 0, path);
  if (next !== lines.length) {
    throw new YamlSubsetError(`${path}:${lines[next].line}: trailing content this reader cannot place`);
  }
  return value;
}
