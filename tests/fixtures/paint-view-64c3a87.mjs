/**
 * THE REFERENCE PAINTER — `paintView` exactly as it stood at 64c3a87, the commit this branch is
 * based on, lifted verbatim out of the git history and frozen here.
 *
 * WHY A FROZEN COPY RATHER THAN A LIVE READ. tests/present-golden.test.mjs re-derives this text
 * from git when the blob is reachable and asserts it is byte-identical to what is below, so a
 * local run proves the copy is honest. It is committed as well because a CI checkout is not
 * guaranteed to carry the base commit, and a golden master that silently skips when it cannot
 * find its reference is a green you cannot make go red.
 *
 * Re-derive it yourself:
 *
 *   git show 64c3a87:app.html | sed -n '234,269p'
 *
 * NOTHING HERE IS TIDIED. It is dead code kept alive for one purpose: to be run beside the new
 * painter, against the same fixtures and the same markdown-it instance, so that "byte-identical"
 * is a comparison rather than a claim. If it is ever edited to make a test pass, the test has
 * stopped measuring anything.
 */

/** The verbatim source of app.html:234-269 @ 64c3a87. */
export const PAINT_VIEW_SOURCE = String.raw`
function paintView(id) {
  currentViewId = id;
  const v = graphData?.snapshot?.views.find((x) => x.id === id);
  const body = $("viewBody");
  body.innerHTML = "";
  if (!v) return;
  v.markdown.split("\n").forEach((line, i) => {
    const task = line.match(/^(\s*)- \[( |x|X)\] (.*)$/);
    if (task) {
      const done = task[2].toLowerCase() === "x";
      const row = document.createElement("label");
      row.className = "task" + (done ? " done" : "");
      row.style.marginLeft = (task[1].length / 2) * 1.2 + "rem";
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = done;
      box.addEventListener("change", () => toggleTask(v, i, box, row));
      const span = document.createElement("span");
      span.innerHTML = md.renderInline(task[3]);
      row.append(box, span);
      body.append(row);
      return;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const el = document.createElement("h" + Math.min(h[1].length + 1, 6));
      el.innerHTML = md.renderInline(h[2]);
      body.append(el);
      return;
    }
    if (line.trim() === "") return;
    const div = document.createElement("div");
    div.innerHTML = md.render(line);
    body.append(div);
  });
}
`.trim();

/**
 * Rebuild the original painter with its five free variables supplied.
 *
 * `paintView` closed over module state in the page (`graphData`, `currentViewId`, `md`, `$`,
 * `toggleTask`, `document`). Passing them in as Function parameters is the only change made to
 * how it runs, and it changes nothing about what it does.
 */
export function makeOriginalPaintView({ document, graphData, viewBody, md, toggleTask }) {
  const factory = new Function(
    "document",
    "graphData",
    "$",
    "md",
    "toggleTask",
    "let currentViewId = null;\n" + PAINT_VIEW_SOURCE + "\nreturn paintView;",
  );
  return factory(document, graphData, () => viewBody, md, toggleTask);
}
