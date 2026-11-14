import { describe, expect, it } from "vitest";
import { decisionStages } from "../src/contractDirectoryState";
describe("observed contract decision progress", () => {
  it("does not turn a finalized decision with unavailable execution into a successful execution", () => {
    const stages = decisionStages({ status: "Finalized", rounds: 2, execution_result: "unknown" });
    expect(stages.map(s => s.state)).toEqual(["done", "done", "unknown", "done"]);
  });
  it("does not confuse a returned execution with finality", () => {
    expect(decisionStages({ status: "Accepted", rounds: 2, execution_result: "returned" }).map(s => s.state)).toEqual(["done", "done", "done", "waiting"]);
  });
  it("preserves execution failures independently of consensus finality", () => {
    expect(decisionStages({ status: "Finalized", rounds: 2, execution_result: "error" }).map(s => s.state)).toEqual(["done", "done", "failed", "done"]);
  });
  it("keeps cancelled and not-yet-observed stages unfinished", () => {
    expect(decisionStages({ status: "Canceled", rounds: 0, execution_result: "unknown" }).map(s => s.state)).toEqual(["done", "failed", "unknown", "waiting"]);
    expect(decisionStages({ status: "Unknown", rounds: null, execution_result: "unknown" })[1].state).toBe("waiting");
  });
});
