import { describe, it, expect } from "vitest";
import { fromRlp } from "viem";
import { abi } from "genlayer-js";
import {
  GENLAYER_DEPLOYMENT,
  NEW_TRANSACTION,
  submissionFromLog,
  normalizeReceipt,
  decodeNativeInput,
  decodeCalldata,
  encodeRead,
  typedReadArgs,
  typedValue,
} from "../src/genlayer";
const id = "0x" + "ab".repeat(32),
  address = "0x" + "12".repeat(20),
  evm = "0x" + "cd".repeat(32);
describe("GenLayer protocol semantics", () => {
  it("decodes real GenVM 0.3 calls and keeps consensus IDs distinct from EVM hashes", () => {
    expect(decodeNativeInput("c9870e00246265617400")).toMatchObject({
      kind: "call",
      method: "beat",
    });
    expect(
      submissionFromLog({
        address: GENLAYER_DEPLOYMENT.consensus,
        topics: [NEW_TRANSACTION, id, "0x" + "0".repeat(24) + address.slice(2)],
        transactionHash: evm,
        blockNumber: "0x2d003",
      }),
    ).toMatchObject({
      id,
      submission_hash: evm,
      recipient: address,
      block_number: 184323,
    });
  });
  it("rejects spoofed emitters, removed events and malformed topics", () => {
    const l = {
      address: GENLAYER_DEPLOYMENT.consensus,
      topics: [NEW_TRANSACTION, id, "0x" + "0".repeat(24) + address.slice(2)],
      transactionHash: evm,
      blockNumber: "0x2d003",
    };
    expect(submissionFromLog({ ...l, address })).toBeNull();
    expect(submissionFromLog({ ...l, removed: true })).toBeNull();
    expect(
      submissionFromLog({ ...l, topics: [NEW_TRANSACTION, id, address] }),
    ).toBeNull();
  });
  it("encodes reads with the current empty-key convention and no write prefix", () => {
    const parts = fromRlp(encodeRead("count", [], {}));
    expect(parts).toEqual(["0x0e002c636f756e74", "0x00"]);
    expect(decodeCalldata(parts[0] as string)).toEqual({ "": "count" });
  });
  it("preserves big integers and constructor distinction", () => {
    const schema: any = {
      methods: {
        balance: {
          params: [["n", "int"]],
          kwparams: {},
          readonly: true,
          ret: "int",
        },
      },
    };
    expect(typedReadArgs(schema, "balance", ["9007199254740993"])[0]).toBe(
      9007199254740993n,
    );
    expect(() =>
      typedReadArgs(schema, "balance", [9007199254740993]),
    ).toThrow();
    expect(typedValue("address", address).bytes).toHaveLength(20);
    expect(typedValue("bytes", "0x1234")).toEqual(Uint8Array.from([18, 52]));
    const deploy = abi.transactions.serialize([
      new TextEncoder().encode("class Contract: pass"),
      abi.calldata.encode({ args: [] }),
      false,
    ]);
    expect(decodeNativeInput(deploy)).toMatchObject({
      kind: "deploy",
      method: "constructor",
    });
  });
  it("handles zero receipts, missing votes and base64 vote bytes without inferring finality", () => {
    expect(normalizeReceipt({ status: 0, recipient: address })).toBeNull();
    const r = normalizeReceipt({
      status: 5,
      statusName: "Accepted",
      recipient: address,
      roundData: [
        {
          round: 0,
          roundValidators: [address, address],
          leaderIndex: 0,
          validatorVotes: "AQ==",
        },
      ],
    });
    expect(r.statusName).toBe("Accepted");
    expect(r.roundData[0].validators).toMatchObject([
      { leader: true, vote: 1 },
      { leader: false, vote: null },
    ]);
  });
});
