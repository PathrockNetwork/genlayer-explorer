/**
 * Browser-wallet path for staking writes. genlayer-js signs staking
 * transactions with a local private-key account only, so its staking actions
 * cannot be used from an injected wallet. The same contract calls are encoded
 * here and handed to the wallet with eth_sendTransaction; the explorer never
 * sees a key.
 */
import { abi, chains } from "genlayer-js";
import { encodeFunctionData, type Abi } from "viem";

export type WalletProvider = { request: (args: { method: string; params?: unknown }) => Promise<any> };

const chain = chains.testnetBradbury;
const CHAIN_ID_HEX = `0x${chain.id.toString(16)}`;
const STAKING_ADDRESS = (chain.stakingContract as { address: string }).address;
const STAKING_ABI = abi.STAKING_ABI as Abi;
const VALIDATOR_WALLET_ABI = abi.VALIDATOR_WALLET_ABI as Abi;

export function injectedWallet(): WalletProvider {
  const eth = (globalThis as any).ethereum as WalletProvider | undefined;
  if (!eth) throw new Error("No browser wallet detected. Install MetaMask and try again.");
  return eth;
}

/** Switch the wallet to Bradbury, offering to add the network when it is unknown. */
export async function ensureBradbury(eth: WalletProvider): Promise<void> {
  if ((await eth.request({ method: "eth_chainId" })) === CHAIN_ID_HEX) return;
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_ID_HEX }] });
  } catch (e) {
    // 4902: the wallet does not know this chain yet.
    if ((e as { code?: number }).code !== 4902) throw e;
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: CHAIN_ID_HEX,
        chainName: chain.name,
        rpcUrls: chain.rpcUrls.default.http,
        nativeCurrency: chain.nativeCurrency,
        blockExplorerUrls: chain.blockExplorers?.default.url ? [chain.blockExplorers.default.url] : undefined,
      }],
    });
  }
  if ((await eth.request({ method: "eth_chainId" })) !== CHAIN_ID_HEX)
    throw new Error(`Switch your wallet to ${chain.name} to continue.`);
}

/** Ask the wallet for account access (this is what opens the wallet prompt) and select Bradbury. */
export async function connectWallet(eth: WalletProvider = injectedWallet()): Promise<string> {
  const accounts: string[] = await eth.request({ method: "eth_requestAccounts" });
  if (!accounts?.[0]) throw new Error("The wallet did not share an account.");
  await ensureBradbury(eth);
  return accounts[0].toLowerCase();
}

/** Staking writes signed by `from` in the wallet. Each resolves to the transaction hash. */
export function stakingWallet(from: string, eth: WalletProvider = injectedWallet()) {
  const send = async (to: string, data: string, value?: bigint): Promise<string> => {
    await ensureBradbury(eth);
    return eth.request({
      method: "eth_sendTransaction",
      params: [{ from, to, data, ...(value === undefined ? {} : { value: `0x${value.toString(16)}` }) }],
    });
  };
  const staking = (functionName: string, args: unknown[], value?: bigint) =>
    send(STAKING_ADDRESS, encodeFunctionData({ abi: STAKING_ABI, functionName, args }), value);
  const validatorWallet = (validator: string, functionName: string, args: unknown[]) =>
    send(validator, encodeFunctionData({ abi: VALIDATOR_WALLET_ABI, functionName, args }));
  return {
    delegatorJoin: (o: { validator: string; amount: string | bigint }) => staking("delegatorJoin", [o.validator], BigInt(o.amount)),
    delegatorClaim: (o: { validator: string; delegator?: string }) => staking("delegatorClaim", [o.delegator || from, o.validator]),
    validatorPrime: (o: { validator: string }) => staking("validatorPrime", [o.validator]),
    validatorExit: (o: { validator: string; shares: string | bigint }) => validatorWallet(o.validator, "validatorExit", [BigInt(o.shares)]),
    setIdentity: (o: { validator: string; moniker: string; logoUri?: string; website?: string; description?: string }) =>
      validatorWallet(o.validator, "setIdentity", [o.moniker, o.logoUri || "", o.website || "", o.description || "", "", "", "", "", "0x"]),
  };
}
export type StakingWallet = ReturnType<typeof stakingWallet>;
