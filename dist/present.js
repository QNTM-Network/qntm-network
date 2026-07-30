// app/present/levels.ts
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

// app/present/resolution.ts
var RESOLUTION_KEYS = ["checkbox", "heading"];
var DEFAULT = Object.freeze({
  checkbox: "wired",
  heading: "wired"
});
var TASK = /^(\s*)- \[( |x|X)\] (.*)$/;
var HEADING = /^(#{1,6})\s+(.*)$/;
function classifyLine(line) {
  const task = TASK.exec(line);
  if (task !== null) {
    return {
      kind: "checkbox",
      source: line,
      indent: task[1] ?? "",
      done: (task[2] ?? "").toLowerCase() === "x",
      tail: task[3] ?? ""
    };
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

// app/present/declaration.ts
var NOTE = "note";
var RENDITIONS = ["raw", "wired"];
function isRendition(value) {
  return typeof value === "string" && RENDITIONS.includes(value);
}
function readDeclaration(document2) {
  const problems = [];
  if (typeof document2 !== "object" || document2 === null || Array.isArray(document2)) {
    return {
      contribution: {},
      problems: [
        `the declaration is ${Array.isArray(document2) ? "an array" : typeof document2}, not an object \u2014 every key stays silent and every line falls through to the default`
      ]
    };
  }
  const entries = Object.entries(document2);
  const contribution = {};
  for (const [key, value] of entries) {
    if (key === NOTE) {
      if (typeof value !== "string") {
        problems.push(`'${NOTE}' is ${typeof value}, not a string \u2014 it is prose, not a key`);
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
  return { contribution, problems };
}

// app/present/context.ts
var PresentationContext = class {
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
};
function presentationFromDeclaration(document2) {
  const reading = readDeclaration(document2);
  return {
    context: new PresentationContext({ GLOBAL: reading.contribution }),
    problems: reading.problems
  };
}

// app/present/cascade.ts
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

// app/present/source.ts
var CHECKBOX_GLYPH = /^(\s*- \[)[ xX](\] .*)$/;
function applyEdit(source, edit) {
  const lines = source.split("\n");
  const line = lines[edit.lineIndex];
  if (line === void 0) {
    return null;
  }
  const match = CHECKBOX_GLYPH.exec(line);
  if (match === null) {
    return null;
  }
  lines[edit.lineIndex] = (match[1] ?? "") + (edit.checked ? "x" : " ") + (match[2] ?? "");
  return lines.join("\n");
}

// app/present/paint.ts
function rawLine(source) {
  const div = document.createElement("div");
  div.textContent = source;
  return div;
}
function paint(body, source, context, deps) {
  const cascade = new PresentationCascade(context);
  body.innerHTML = "";
  source.split("\n").forEach((line, index) => {
    const shape = classifyLine(line);
    if (shape.kind === "checkbox") {
      if (cascade.resolve("checkbox").rendition === "raw") {
        body.append(rawLine(shape.source));
        return;
      }
      const row = document.createElement("label");
      row.className = "task" + (shape.done ? " done" : "");
      row.style.marginLeft = shape.indent.length / 2 * 1.2 + "rem";
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = shape.done;
      box.addEventListener("change", () => {
        const markdown = applyEdit(source, {
          kind: "set-checkbox",
          lineIndex: index,
          checked: box.checked
        });
        deps.onCheckboxToggle?.({ lineIndex: index, checked: box.checked, markdown, box, row });
      });
      const span = document.createElement("span");
      span.innerHTML = deps.markdown.renderInline(shape.tail);
      row.append(box, span);
      body.append(row);
      return;
    }
    if (shape.kind === "heading") {
      if (cascade.resolve("heading").rendition === "raw") {
        body.append(rawLine(shape.source));
        return;
      }
      const el = document.createElement("h" + String(Math.min(shape.hashes.length + 1, 6)));
      el.innerHTML = deps.markdown.renderInline(shape.text);
      body.append(el);
      return;
    }
    if (shape.kind === "blank") {
      return;
    }
    const div = document.createElement("div");
    div.innerHTML = deps.markdown.render(shape.source);
    body.append(div);
  });
}
export {
  DEFAULT,
  PresentationCascade,
  PresentationContext,
  RESOLUTION_KEYS,
  SPECIFICITY,
  applyEdit,
  classifyLine,
  isSilent,
  paint,
  presentationFromDeclaration,
  readDeclaration
};
//# sourceMappingURL=present.js.map
