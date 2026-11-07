import { describe, expect, it, vi } from "vitest";
import { encodeIdentityFixture as encoded } from "./fixtures/validatorIdentity";
import { getValidatorMoniker, normalizeValidatorMoniker } from "../src/validatorIdentity";
import type { JsonRpc } from "../src/rpc";
const address = "0x" + "ab".repeat(20);
describe("validator wallet monikers", () => {
  it("reads the finalized wallet identity, including empty names", async () => {
    const call = vi.fn().mockResolvedValueOnce(encoded("NODERS")).mockResolvedValueOnce(encoded(""));
    const rpc = { call } as unknown as JsonRpc;
    expect(await getValidatorMoniker(rpc, address)).toBe("NODERS");
    expect(call.mock.calls[0]).toEqual(["eth_call", [{ to: address, data: expect.stringMatching(/^0x[0-9a-f]{8}$/) }, "finalized"]]);
    expect(await getValidatorMoniker(rpc, address)).toBeNull();
  });
  it("preserves Unicode labels, removes control characters and bounds their length", () => {
    expect(normalizeValidatorMoniker("  Cafe\u0301 🌍\u202e\n  ")).toBe("Café 🌍");
    expect(normalizeValidatorMoniker(" \u0000 ")).toBeNull();
    expect(Array.from(normalizeValidatorMoniker("🌍".repeat(150))!)).toHaveLength(128);
  });
  it("rejects invalid addresses, malformed replies and oversized metadata without treating failures as empty names", async () => {
    const call = vi.fn(); const rpc = { call } as unknown as JsonRpc;
    await expect(getValidatorMoniker(rpc, "invalid")).rejects.toThrow("Invalid validator address");
    expect(call).not.toHaveBeenCalled();
    for (const value of ["0x", "0x00", "0xgg", "0x" + "ab".repeat(65537)]) {
      call.mockResolvedValueOnce(value); await expect(getValidatorMoniker(rpc, address)).rejects.toThrow();
    }
    call.mockRejectedValueOnce(new Error("RPC unavailable"));
    await expect(getValidatorMoniker(rpc, address)).rejects.toThrow("RPC unavailable");
  });
});
