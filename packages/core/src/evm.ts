/**
 * Pure EVM decoding helpers: raw JSON-RPC block + receipts → table rows.
 * No I/O here, so it is the unit-tested core of the indexer.
 */

/** keccak256("Transfer(address,address,uint256)") — shared by ERC-20 and ERC-721. */
export const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";



export const GEN_DECIMALS = 18;

export const hexToNumber = (h: string | null | undefined): number => (h ? Number.parseInt(h, 16) : 0);
export const hexToBig = (h: string | null | undefined): bigint => (h && h !== "0x" ? BigInt(h) : 0n);

/** Last 20 bytes of a 32-byte topic, as a lowercase address. */
export const topicToAddress = (topic: string): string => `0x${topic.slice(-40)}`.toLowerCase();

export const isAddress = (s: string): boolean => /^0x[0-9a-fA-F]{40}$/.test(s);
export const isHash = (s: string): boolean => /^0x[0-9a-fA-F]{64}$/.test(s);

export type BlockRow = {
  number: number;
  hash: string;
  parentHash: string;
  time: Date;
  miner: string;
  gasUsed: number;
  gasLimit: number;
  baseFeePerGas: string | null;
  txCount: number;
  size: number | null;
  /** GenLayer L1 anchor: the L1 block height this block commits to, or null. */
  l1BlockNumber: number | null;
  /** Number of consensus messages batched into the L1 anchor. */
  sendCount: number | null;
  /** Root committing the batched messages on L1. */
  sendRoot: string | null;
};

export type TxRow = {
  hash: string;
  blockNumber: number;
  txIndex: number;
  time: Date;
  from: string;
  to: string | null;
  contractAddress: string | null;
  value: string;
  nonce: number;
  type: number;
  gasLimit: number;
  gasUsed: number;
  effectiveGasPrice: string;
  fee: string;
  status: number;
  method: string | null;
  inputSize: number;
  logCount: number;
};

export type TransferRow = {
  txHash: string;
  logIndex: number;
  blockNumber: number;
  time: Date;
  token: string;
  from: string;
  to: string;
  value: string;
  standard: "erc20" | "erc721";
};


export type ParsedBlock = { block: BlockRow; txs: TxRow[]; transfers: TransferRow[] };

/** 32-byte words of a log's data field. */
const words = (data: string): bigint[] => {
  const hex = (data ?? "0x").slice(2);
  return Array.from({ length: Math.floor(hex.length / 64) }, (_, i) => BigInt(`0x${hex.slice(i * 64, i * 64 + 64)}`));
};


/**
 * Decode a `Transfer` log. ERC-20 carries the amount in data (3 topics);
 * ERC-721 indexes the token id (4 topics). Anything else sharing the topic
 * (malformed or non-standard emitters) is skipped rather than guessed at.
 */
export function decodeTransfer(log: any): Omit<TransferRow, "txHash" | "blockNumber" | "time"> | null {
  const topics: string[] = log.topics ?? [];
  if (topics[0]?.toLowerCase() !== TRANSFER_TOPIC) return null;
  const base = { logIndex: hexToNumber(log.logIndex), token: String(log.address).toLowerCase() };
  if (topics.length === 3 && typeof log.data === "string" && log.data.length === 66) {
    return { ...base, from: topicToAddress(topics[1]!), to: topicToAddress(topics[2]!), value: hexToBig(log.data).toString(), standard: "erc20" };
  }
  if (topics.length === 4) {
    return { ...base, from: topicToAddress(topics[1]!), to: topicToAddress(topics[2]!), value: hexToBig(topics[3]).toString(), standard: "erc721" };
  }
  return null;
}

/**
 * Join `eth_getBlockByNumber(n, true)` with `eth_getBlockReceipts(n)`.
 * Receipts are matched by hash, not position, and a missing receipt throws:
 * persisting a transaction without its status and gas would be silently wrong.
 */
export function parseBlock(rawBlock: any, rawReceipts: any[]): ParsedBlock {
  const number = hexToNumber(rawBlock.number);
  const time = new Date(hexToNumber(rawBlock.timestamp) * 1000);
  const receipts = new Map<string, any>(rawReceipts.map((r) => [String(r.transactionHash).toLowerCase(), r]));

  const txs: TxRow[] = [];
  const transfers: TransferRow[] = [];
  const l1BlockNumber = rawBlock.l1BlockNumber != null ? hexToNumber(rawBlock.l1BlockNumber) : null;
  const sendCount = rawBlock.sendCount != null ? hexToNumber(rawBlock.sendCount) : null;
  const sendRoot = rawBlock.sendRoot ? String(rawBlock.sendRoot).toLowerCase() : null;
  for (const tx of rawBlock.transactions as any[]) {
    const hash = String(tx.hash).toLowerCase();
    const rc = receipts.get(hash);
    if (!rc) throw new Error(`block ${number}: no receipt for ${hash}`);
    const gasUsed = hexToBig(rc.gasUsed);
    const price = hexToBig(rc.effectiveGasPrice ?? tx.gasPrice);
    const input: string = tx.input ?? "0x";
    const logs: any[] = rc.logs ?? [];
    txs.push({
      hash,
      blockNumber: number,
      txIndex: hexToNumber(tx.transactionIndex),
      time,
      from: String(tx.from).toLowerCase(),
      to: tx.to ? String(tx.to).toLowerCase() : null,
      contractAddress: rc.contractAddress ? String(rc.contractAddress).toLowerCase() : null,
      value: hexToBig(tx.value).toString(),
      nonce: hexToNumber(tx.nonce),
      type: hexToNumber(tx.type),
      gasLimit: hexToNumber(tx.gas),
      gasUsed: Number(gasUsed),
      effectiveGasPrice: price.toString(),
      fee: (gasUsed * price).toString(),
      status: hexToNumber(rc.status),
      method: input.length >= 10 ? input.slice(0, 10).toLowerCase() : null,
      inputSize: Math.max(0, (input.length - 2) / 2),
      logCount: logs.length,
    });
    for (const log of logs) {
      const t = decodeTransfer(log);
      if (t) transfers.push({ ...t, txHash: hash, blockNumber: number, time });
    }
  }

  return {
    block: {
      number,
      hash: String(rawBlock.hash).toLowerCase(),
      parentHash: String(rawBlock.parentHash).toLowerCase(),
      time,
      miner: String(rawBlock.miner).toLowerCase(),
      gasUsed: hexToNumber(rawBlock.gasUsed),
      gasLimit: hexToNumber(rawBlock.gasLimit),
      baseFeePerGas: rawBlock.baseFeePerGas ? hexToBig(rawBlock.baseFeePerGas).toString() : null,
      txCount: (rawBlock.transactions as any[]).length,
      size: rawBlock.size ? hexToNumber(rawBlock.size) : null,
      l1BlockNumber,
      sendCount,
      sendRoot,
    },
    txs,
    transfers,
  };
}

/**
 * Decode an eth_call result for `name()` / `symbol()`. Standard tokens return
 * an ABI-encoded string; some early ones (MKR-style) return bytes32. Returns
 * null for anything that is neither, and strips control characters so a
 * hostile token cannot inject markup-looking junk into the UI.
 */
export function decodeAbiString(hex: string | null | undefined): string | null {
  if (!hex || hex === "0x") return null;
  const data = hex.slice(2);
  try {
    let text: string;
    if (data.length === 64) {
      text = Buffer.from(data, "hex").toString("utf8").replace(/\0+$/, "");
    } else {
      if (data.length < 128) return null;
      const offset = Number.parseInt(data.slice(0, 64), 16) * 2;
      const len = Number.parseInt(data.slice(offset, offset + 64), 16);
      if (!Number.isFinite(len) || len > 256) return null;
      text = Buffer.from(data.slice(offset + 64, offset + 64 + len * 2), "hex").toString("utf8");
    }
    const clean = text.replace(/[\u0000-\u001f\u007f�]/g, "").trim();
    return clean ? clean.slice(0, 64) : null;
  } catch {
    return null;
  }
}

/** Decode a uint8 `decimals()` result; null when absent or implausible. */
export function decodeDecimals(hex: string | null | undefined): number | null {
  if (!hex || hex === "0x" || hex.length !== 66) return null;
  const n = hexToBig(hex);
  return n <= 36n ? Number(n) : null;
}

/** Format a wei-like integer string with `decimals`, trimming trailing zeros. */
export function formatUnits(value: string | bigint, decimals = GEN_DECIMALS, maxFraction = 6): string {
  const v = typeof value === "bigint" ? value : BigInt(value);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = (abs % base).toString().padStart(decimals, "0").slice(0, maxFraction).replace(/0+$/, "");
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${wholeStr}${frac ? `.${frac}` : ""}`;
}
