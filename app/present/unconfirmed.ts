/**
 * Which lines on screen the server has not confirmed yet (2026-10-07, operator-directed: "save
 * status per line").
 *
 * PURE. A line is unconfirmed when the source being painted holds it and the server's last
 * projection of the view does not: an edit, a new line or a tick that has been saved but whose
 * cycle has not yet sent the view back. When the server's version arrives the two agree and the
 * set is empty again — so this needs no write tracking of its own, and covers every kind of edit
 * the same way. Blank lines are never marked.
 */
export function unconfirmedLines(painted: string, served: string | undefined): ReadonlySet<number> {
  const out = new Set<number>();
  if (served === undefined || painted === served) return out;
  const known = new Set(served.split("\n"));
  painted.split("\n").forEach((line, index) => {
    if (line.trim() !== "" && !known.has(line)) out.add(index);
  });
  return out;
}
