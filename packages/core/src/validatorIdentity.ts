import { decodeFunctionResult, encodeFunctionData, type Hex } from "viem";
import { HEX_ADDRESS } from "./genlayer";
import type { JsonRpc } from "./rpc";

/** ValidatorWallet.getIdentity(), matching the GenLayer SDK's public wallet ABI. */
export const VALIDATOR_IDENTITY_ABI = [{
  name: "getIdentity", type: "function", stateMutability: "view", inputs: [],
  outputs: [{ name: "", type: "tuple", components: [
    { name: "moniker", type: "string" }, { name: "logoUri", type: "string" },
    { name: "website", type: "string" }, { name: "description", type: "string" },
    { name: "email", type: "string" }, { name: "twitter", type: "string" },
    { name: "telegram", type: "string" }, { name: "github", type: "string" },
    { name: "extraCid", type: "bytes" },
  ] }],
}] as const;
const identityCall = encodeFunctionData({ abi: VALIDATOR_IDENTITY_ABI, functionName: "getIdentity" });

export function normalizeValidatorMoniker(value: string): string | null {
  // Preserve Unicode names while removing control characters and bidi overrides.
  const clean = value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, "").trim().normalize("NFC");
  return Array.from(clean).slice(0, 128).join("") || null;
}
export async function getValidatorMoniker(rpc: Pick<JsonRpc, "call">, address: string): Promise<string | null> {
  if (!HEX_ADDRESS.test(address)) throw new Error("Invalid validator address");
  const encoded = await rpc.call<string>("eth_call", [{ to: address.toLowerCase(), data: identityCall }, "finalized"]);
  if (typeof encoded !== "string" || !/^0x(?:[0-9a-fA-F]{2})+$/.test(encoded) || encoded.length > 131074)
    throw new Error("Invalid validator identity response");
  const identity = decodeFunctionResult({ abi: VALIDATOR_IDENTITY_ABI, functionName: "getIdentity", data: encoded as Hex });
  return normalizeValidatorMoniker(identity.moniker);
}
