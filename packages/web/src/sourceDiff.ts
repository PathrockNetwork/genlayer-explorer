export type DiffLine = {
  kind: "same" | "added" | "removed";
  text: string;
  before?: number;
  after?: number;
};
/** Bounded line diff; large replacements use a prefix/suffix fallback instead of freezing the UI. */
export function sourceDiff(before: string, after: string): DiffLine[] {
  const a = before.split("\n"),
    b = after.split("\n"),
    out: DiffLine[] = [];
  let i = 0,
    j = 0;
  const add = () => out.push({ kind: "added", text: b[j], after: ++j });
  const remove = () => out.push({ kind: "removed", text: a[i], before: ++i });
  const same = () =>
    out.push({ kind: "same", text: a[i], before: ++i, after: ++j });
  if (a.length * b.length > 1000000) {
    while (i < a.length && j < b.length && a[i] === b[j]) same();
    let suffix = 0;
    while (
      a.length - suffix > i &&
      b.length - suffix > j &&
      a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
    )
      suffix++;
    while (i < a.length - suffix) remove();
    while (j < b.length - suffix) add();
    while (i < a.length) same();
    return out;
  }
  const dp = Array.from(
    { length: a.length + 1 },
    () => new Uint32Array(b.length + 1),
  );
  for (let x = a.length - 1; x >= 0; x--)
    for (let y = b.length - 1; y >= 0; y--)
      dp[x][y] =
        a[x] === b[y]
          ? dp[x + 1][y + 1] + 1
          : Math.max(dp[x + 1][y], dp[x][y + 1]);
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) same();
    else if (j < b.length && (i === a.length || dp[i][j + 1] > dp[i + 1][j]))
      add();
    else remove();
  }
  return out;
}
