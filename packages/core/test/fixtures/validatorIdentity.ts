import { encodeFunctionResult } from "viem";
import { VALIDATOR_IDENTITY_ABI } from "../../src/validatorIdentity";

export const encodeIdentityFixture = (moniker: string) => encodeFunctionResult({
  abi: VALIDATOR_IDENTITY_ABI, functionName: "getIdentity", result: {
    moniker, logoUri: "", website: "https://example.com", description: "",
    email: "", twitter: "", telegram: "", github: "", extraCid: "0x",
  },
});
