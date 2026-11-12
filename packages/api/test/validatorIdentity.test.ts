import { describe, expect, it, vi } from "vitest";
import { withValidatorMonikers } from "../src/validatorIdentity";
import type { Deps } from "../src/routes";
describe("receipt validator labels", () => {
  it("uses cached names by normalized wallet address without mutating receipt evidence", async () => {
    const a = "0x" + "ab".repeat(20), b = "0x" + "cd".repeat(20);
    const query = vi.fn(async () => ({ rows: [{ address: a, moniker: "Example" }] }));
    const receipt = { roundData: [{ validators: [{ address: a.toUpperCase(), vote: 1 }, { address: b, vote: 2 }] }, { validators: [{ address: a, vote: 0 }] }] };
    const result = await withValidatorMonikers({ query } as unknown as Deps["pool"], receipt);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]).toEqual([expect.any(String), [[a, b]]]);
    expect(result.roundData[0].validators).toEqual([{ address: a.toUpperCase(), vote: 1, moniker: "Example" }, { address: b, vote: 2, moniker: null }]);
    expect(result.roundData[1].validators[0].moniker).toBe("Example");
    expect(receipt.roundData[0].validators[0]).not.toHaveProperty("moniker");
  });
});
