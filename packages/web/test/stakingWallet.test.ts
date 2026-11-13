import { describe, expect, it } from "vitest";
import { abi, chains } from "genlayer-js";
import { decodeFunctionData, type Abi } from "viem";
import { connectWallet, stakingWallet, STAKING_ADDRESS, type WalletProvider } from "../src/stakingWallet";

const account = "0x6359e7e85d6b0783e0199a915e48f3c353fc9785",
  validator = "0x" + "12".repeat(20),
  bradbury = "0x107d";

function wallet(options: { chainId?: string; knowsChain?: boolean; accounts?: string[]; code?: string } = {}) {
  let chainId = options.chainId ?? bradbury;
  const calls: { method: string; params?: any }[] = [];
  const provider: WalletProvider = {
    request: async (args) => {
      calls.push(args as any);
      switch (args.method) {
        case "eth_requestAccounts": return options.accounts ?? [account];
        case "eth_chainId": return chainId;
        case "wallet_switchEthereumChain":
          if (options.knowsChain === false) throw Object.assign(new Error("Unrecognized chain"), { code: 4902 });
          chainId = bradbury; return null;
        case "wallet_addEthereumChain": chainId = bradbury; return null;
        case "eth_getCode": return options.code ?? "0x6080";
        case "eth_sendTransaction": return "0x" + "ab".repeat(32);
        default: throw new Error(`unexpected ${args.method}`);
      }
    },
  };
  return { provider, calls, methods: () => calls.map((c) => c.method) };
}

describe("staking wallet", () => {
  it("asks the wallet for account access instead of reading already-shared accounts", async () => {
    const w = wallet();
    expect(await connectWallet(w.provider)).toBe(account.toLowerCase());
    expect(w.methods()).toEqual(["eth_requestAccounts", "eth_chainId"]);
  });
  it("switches a wallet on another network to Bradbury", async () => {
    const w = wallet({ chainId: "0x1" });
    await connectWallet(w.provider);
    expect(w.methods()).toContain("wallet_switchEthereumChain");
    expect(w.methods()).not.toContain("wallet_addEthereumChain");
  });
  it("adds Bradbury when the wallet does not know the network", async () => {
    const w = wallet({ chainId: "0x1", knowsChain: false });
    await connectWallet(w.provider);
    const add = w.calls.find((c) => c.method === "wallet_addEthereumChain")!;
    expect(add.params[0]).toMatchObject({ chainId: bradbury, rpcUrls: chains.testnetBradbury.rpcUrls.default.http });
  });
  it("reports a wallet that shares no account", async () => {
    await expect(connectWallet(wallet({ accounts: [] }).provider)).rejects.toThrow("did not share an account");
  });
  it("sends a delegation to the staking contract with the amount as value", async () => {
    const w = wallet();
    const hash = await stakingWallet(account, w.provider).delegatorJoin({ validator, amount: "42000000000000000000" });
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
    const tx = w.calls.find((c) => c.method === "eth_sendTransaction")!.params[0];
    expect(tx.from).toBe(account);
    expect(tx.to).toBe(STAKING_ADDRESS);
    expect(BigInt(tx.value)).toBe(42n * 10n ** 18n);
    const call = decodeFunctionData({ abi: abi.STAKING_ABI as Abi, data: tx.data });
    expect(call.functionName).toBe("delegatorJoin");
    expect(String(call.args?.[0]).toLowerCase()).toBe(validator);
  });
  it("refuses to send anything to an address without contract code", async () => {
    const w = wallet({ code: "0x" });
    await expect(stakingWallet(account, w.provider).delegatorJoin({ validator, amount: "42000000000000000000" })).rejects.toThrow("No contract found");
    expect(w.methods()).not.toContain("eth_sendTransaction");
  });
  it("claims for the connected account by default and sends owner actions to the validator wallet", async () => {
    const w = wallet(), actions = stakingWallet(account, w.provider);
    await actions.delegatorClaim({ validator });
    await actions.setIdentity({ validator, moniker: "Node" });
    await actions.validatorExit({ validator, shares: "5" });
    const [claim, identity, exit] = w.calls.filter((c) => c.method === "eth_sendTransaction").map((c) => c.params[0]);
    const claimCall = decodeFunctionData({ abi: abi.STAKING_ABI as Abi, data: claim.data });
    expect(claimCall.args?.map((a) => String(a).toLowerCase())).toEqual([account.toLowerCase(), validator]);
    expect(claim.value).toBeUndefined();
    expect(identity.to).toBe(validator);
    expect(decodeFunctionData({ abi: abi.VALIDATOR_WALLET_ABI as Abi, data: identity.data }).args?.[0]).toBe("Node");
    expect(exit.to).toBe(validator);
    expect(decodeFunctionData({ abi: abi.VALIDATOR_WALLET_ABI as Abi, data: exit.data }).args).toEqual([5n]);
  });
});
