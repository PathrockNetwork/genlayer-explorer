import { describe, it, expect } from "vitest";
import {
  executionResult,
  explainExecution,
  sourceProfile,
  receiptVotes,
} from "../src/observatory";
describe("contract observatory evidence", () => {
  it("does not infer execution success from finality or missing outcomes", () => {
    expect(
      executionResult({ statusName: "Finalized", txExecutionResult: 2 }),
    ).toBe("error");
    expect(
      explainExecution({ statusName: "Finalized", txExecutionResult: 2 }),
    ).toMatchObject({ outcome: "error", consensus: "Finalized" });
    for (const v of [undefined, null, 0, 6, "Absent", "", 1.5])
      expect(executionResult({ txExecutionResult: v })).toBe("unknown");
    expect(
      executionResult({ statusName: "Canceled", txExecutionResult: 1 }),
    ).toBe("returned");
  });
  it("extracts contract identity, docstrings and public methods without executing source", () => {
    const source = `class Helper(object):\n    pass\nclass Weather(gl.Contract):\n    """Weather observations from public sources."""\n    @gl.public.view\n    def latest(self):\n        return self.data\n    @gl.public.write\n    @gl.public.payable\n    def refresh(self):\n        gl.nondet.exec_prompt('weather')\n    def private(self): pass\n`;
    const p = sourceProfile(source);
    expect(p).toMatchObject({
      name: "Weather",
      description: "Weather observations from public sources.",
      inferred: true,
      methods: [
        { name: "latest", readonly: true },
        { name: "refresh", readonly: false },
      ],
      tags: ["LLM"],
    });
    expect(p.sha256).toHaveLength(64);
    expect(sourceProfile(source + "\n").sha256).not.toBe(p.sha256);
  });
  it("does not invent project information for source without declarations", () => {
    const p = sourceProfile("# undecodable source");
    expect(p.name).toBeNull();
    expect(p.methods).toEqual([]);
    expect(p.description_origin).toBe("method summary");
  });
  it("preserves missing votes separately from not-voted and execution error", () => {
    const votes = receiptVotes("tx", {
      roundData: [
        {
          round: 2,
          result: 1,
          validators: [
            { address: "0xAB", leader: true, vote: 2, result_hash: "hash" },
            { address: "0xcd", vote: 0 },
            { address: "0xef", vote: null },
          ],
        },
      ],
    });
    expect(votes.map((x) => x.vote)).toEqual([2, 0, null]);
    expect(votes[0]).toMatchObject({
      address: "0xab",
      round: 2,
      leader: true,
      result_hash: "hash",
      consensus_result: 1,
    });
  });
});
