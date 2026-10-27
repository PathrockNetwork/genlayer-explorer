import { CalldataAddress } from "genlayer-js/types";
/** Native GenLayer data. EVM hashes and consensus IDs are deliberately distinct. */
import { abi } from "genlayer-js";
import { fromRlp, hexToBytes, type Hex } from "viem";
import { RpcError, type JsonRpc } from "./rpc";

// Bradbury Phase 2 manifest, verified against NewTransaction logs on chain 4221.
// https://docs.genlayer.com/validators/bradbury.protocol-manifest.json
export const GENLAYER_DEPLOYMENT = {
  genesis: 47930,
  consensus: "0x2e2766cbc3e5e61ce93bbcdcbb3eacb82082a019",
  registry: "0x3f71ae080bd6270a91dbcc7960d88797828538e0",
  transactions: "0xace5e4191bf408957538caa9493abb64f63d92c4",
} as const;
export const NEW_TRANSACTION =
  "0xdab9102861c7483a187584d6371d88316f005af507982ccf95c110879f3ed5a5";
export const INTERNAL_MESSAGE =
  "0xfcd4925545581224af98ce36b42d51bb88917ea0c3fe675c27e1df1a22282555";
export const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
export const HEX_HASH = /^0x[0-9a-fA-F]{64}$/;
export const hex = (n: number) => `0x${n.toString(16)}`;
export function jsonSafe(value: any): any {
  if (value instanceof CalldataAddress)
    return `0x${Buffer.from(value.bytes).toString("hex")}`;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Uint8Array)
    return `0x${Buffer.from(value).toString("hex")}`;
  if (value instanceof Map)
    return Object.fromEntries(
      [...value].map(([k, v]) => [String(k), jsonSafe(v)]),
    );
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, jsonSafe(v)]),
    );
  return value;
}
export function decodeCalldata(data: string): any {
  try {
    return jsonSafe(
      abi.calldata.decode(
        hexToBytes((data.startsWith("0x") ? data : `0x${data}`) as Hex),
      ),
    );
  } catch {
    return null;
  }
}
export function decodeNativeInput(data: string | null | undefined): {
  kind: string;
  method: string | null;
  args: any;
  kwargs: any;
} {
  try {
    const parts = fromRlp((data?.startsWith("0x") ? data : `0x${data}`) as Hex);
    if (!Array.isArray(parts) || ![2, 3].includes(parts.length))
      throw new Error("unknown envelope");
    const deploy = parts.length === 3;
    const decoded = decodeCalldata(parts[deploy ? 1 : 0] as string);
    // Current GenVM compact calls use the empty key with a $-prefixed method.
    const method =
      decoded?.method ??
      (typeof decoded?.[""] === "string"
        ? decoded[""].replace(/^\$/, "")
        : null);
    return {
      kind: deploy ? "deploy" : "call",
      method: deploy ? "constructor" : method,
      args: decoded?.args ?? [],
      kwargs: decoded?.kwargs ?? {},
    };
  } catch {
    return { kind: "unknown", method: null, args: null, kwargs: null };
  }
}
export function submissionFromLog(log: any) {
  if (
    log.removed ||
    log.address?.toLowerCase() !== GENLAYER_DEPLOYMENT.consensus ||
    ![NEW_TRANSACTION, INTERNAL_MESSAGE].includes(log.topics?.[0])
  )
    return null;
  if (
    !HEX_HASH.test(log.topics?.[1] ?? "") ||
    !/^0x0{24}[0-9a-fA-F]{40}$/.test(log.topics?.[2] ?? "") ||
    !HEX_HASH.test(log.transactionHash ?? "")
  )
    return null;
  const block = Number(log.blockNumber);
  if (!Number.isSafeInteger(block) || block < GENLAYER_DEPLOYMENT.genesis)
    return null;
  return {
    id: log.topics[1].toLowerCase(),
    recipient: `0x${log.topics[2].slice(-40)}`.toLowerCase(),
    submission_hash: log.transactionHash.toLowerCase(),
    block_number: block,
  };
}
const statuses = [
  "Uninitialized",
  "Pending",
  "Proposing",
  "Committing",
  "Revealing",
  "Accepted",
  "Undetermined",
  "Finalized",
  "Canceled",
  "AppealRevealing",
  "AppealCommitting",
  "ValidatorsTimeout",
  "LeaderTimeout",
  "LeaderRevealing",
];
export function normalizeReceipt(raw: any) {
  if (
    !raw ||
    Number(raw.status) === 0 ||
    !HEX_ADDRESS.test(raw.recipient ?? "") ||
    /^0x0{40}$/.test(raw.recipient)
  )
    return null;
  const rounds = (raw.roundData ?? []).map((r: any) => {
    const votes =
      typeof r.validatorVotes === "string"
        ? [
            ...Buffer.from(
              r.validatorVotes.replace(/^0x/, ""),
              r.validatorVotes.startsWith("0x") ? "hex" : "base64",
            ),
          ]
        : (r.validatorVotes ?? []);
    return {
      ...r,
      validators: (r.roundValidators ?? []).map(
        (address: string, i: number) => ({
          address,
          leader: i === Number(r.leaderIndex),
          vote: votes[i] ?? null,
          result_hash: r.validatorResultHash?.[i] ?? null,
        }),
      ),
    };
  });
  return {
    ...raw,
    statusName: raw.statusName ?? statuses[Number(raw.status)] ?? "Unknown",
    roundData: rounds,
    input: decodeNativeInput(raw.txCallData),
  };
}
export function notFound(err: unknown) {
  return err instanceof RpcError && err.code === -32001;
}
export async function getNativeCode(
  rpc: JsonRpc,
  address: string,
  state: "decided" | "finalized" = "decided",
) {
  const encoded = await rpc.call<string>("gen_getContractCode", [
    { address, status: state },
  ]);
  if (typeof encoded !== "string")
    throw new Error("Invalid contract source response");
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length > 1_000_000)
    throw Object.assign(
      new Error("Contract source exceeds the explorer's 1 MB display limit"),
      { statusCode: 413 },
    );
  return { encoded, source: bytes.toString("utf8"), size: bytes.length };
}
export function encodeRead(
  method: string,
  args: any[],
  kwargs: Record<string, any>,
) {
  // GenVM 0.3 uses the empty key. SDK 1.1.8 still emits the legacy "method" key.
  // https://sdk.genlayer.com/main/spec/04-contract-interface/02-abi.html
  const entry = {
    "": method,
    ...(args.length ? { args } : {}),
    ...(Object.keys(kwargs).length ? { kwargs } : {}),
  };
  return abi.transactions.serialize([abi.calldata.encode(entry), false]);
}

/** Convert JSON form input to native types without silently rounding integers. */
export function typedValue(type: any, value: any, depth = 0): any {
  if (depth > 24) throw new Error("Arguments are nested too deeply");
  if (type === "int") {
    if (typeof value === "number" && Number.isSafeInteger(value))
      return BigInt(value);
    if (typeof value === "string" && /^-?\d+$/.test(value))
      return BigInt(value);
    throw new Error(
      "Use a whole number, or a quoted decimal string for large integers",
    );
  }
  if (type === "address") {
    if (typeof value === "string" && HEX_ADDRESS.test(value))
      return new CalldataAddress(hexToBytes(value as Hex));
    throw new Error("Expected a 0x address");
  }
  if (type === "bytes") {
    if (typeof value === "string" && /^0x([a-fA-F0-9]{2})*$/.test(value))
      return hexToBytes(value as Hex);
    throw new Error("Expected even-length 0x bytes");
  }
  if (
    (type === "bool" && typeof value === "boolean") ||
    ((type === "string" || type === "str") && typeof value === "string") ||
    (type === "null" && value === null)
  )
    return value;
  if (type === "any") {
    if (typeof value === "number" && !Number.isSafeInteger(value))
      throw new Error("Use exact integers");
    if (Array.isArray(value))
      return value.map((x) => typedValue("any", x, depth + 1));
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [
          k,
          typedValue("any", v, depth + 1),
        ]),
      );
    return value;
  }
  if (Array.isArray(type) && Array.isArray(value)) {
    if (type.length === 1 && type[0]?.$rep)
      return value.map((v) => typedValue(type[0].$rep, v, depth + 1));
    if (type.length !== value.length)
      throw new Error("Tuple length does not match the method schema");
    return value.map((v, i) => typedValue(type[i], v, depth + 1));
  }
  if (type && typeof type === "object" && !Array.isArray(type)) {
    if (Array.isArray(type.$or)) {
      for (const alternative of type.$or) {
        try {
          return typedValue(alternative, value, depth + 1);
        } catch {}
      }
      throw new Error("Value does not match any declared type");
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => {
          if (!type.$dict && !Object.hasOwn(type, k))
            throw new Error(`Unknown field: ${k}`);
          return [k, typedValue(type.$dict ?? type[k], v, depth + 1)];
        }),
      );
    }
  }
  if (
    (type === "array" && Array.isArray(value)) ||
    (type === "dict" &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value))
  )
    return typedValue("any", value, depth + 1);
  throw new Error(`Value does not match schema type ${JSON.stringify(type)}`);
}
export function typedReadArgs(schema: any, method: string, args: any[]): any[] {
  return (schema.methods[method].params ?? []).map((p: any, i: number) =>
    typedValue(p[1], args[i]),
  );
}
