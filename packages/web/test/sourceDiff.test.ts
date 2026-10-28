import { describe, it, expect } from "vitest";
import { sourceDiff } from "../src/sourceDiff";
function reconstruct(
  diff: ReturnType<typeof sourceDiff>,
  side: "before" | "after",
) {
  return diff
    .filter((x) =>
      side === "before" ? x.kind !== "added" : x.kind !== "removed",
    )
    .map((x) => x.text)
    .join("\n");
}
describe("source version comparison", () => {
  it("preserves both sources, including blank lines and repeated lines", () => {
    const a = "class A:\n\n    x=1\n    x=1\n",
      b = "class A:\n    x=2\n    x=1\n";
    const d = sourceDiff(a, b);
    expect(reconstruct(d, "before")).toBe(a);
    expect(reconstruct(d, "after")).toBe(b);
    expect(d.some((x) => x.kind === "removed")).toBe(true);
    expect(d.some((x) => x.kind === "added")).toBe(true);
  });
  it("keeps identical sources unchanged", () =>
    expect(sourceDiff("a\nb", "a\nb").map((x) => x.kind)).toEqual([
      "same",
      "same",
    ]));
  it("bounds large comparisons while preserving the exact replacement", () => {
    const a = Array.from({ length: 1500 }, (_, i) => String(i)).join("\n"),
      b = a.replace("\n750\n", "\nchanged\n");
    const d = sourceDiff(a, b);
    expect(reconstruct(d, "before")).toBe(a);
    expect(reconstruct(d, "after")).toBe(b);
    expect(d.filter((x) => x.kind === "added")).toHaveLength(1);
  });
});
