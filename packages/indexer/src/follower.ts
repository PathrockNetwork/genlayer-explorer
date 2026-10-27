import type { ParsedBlock } from "@genlayer-explorer/core";

export type Follower = {
  finalized: () => Promise<number>;
  head: () => number | null;
  setHead: (n: number) => void;
  setFinalized: (n: number) => void;
  fetch: (numbers: number[]) => Promise<ParsedBlock[]>;
  persist: (block: ParsedBlock) => Promise<void>;
  saveState: () => Promise<void>;
  stopping: () => boolean;
  batchSize: number;
};

/** Follow one finalized-head observation, including a heartbeat on idle polls. */
export async function pollFinalized(ctx: Follower): Promise<void> {
  const finalized = await ctx.finalized();
  ctx.setFinalized(finalized);
  if (ctx.head() === null) ctx.setHead(finalized - 1);
  while (!ctx.stopping() && ctx.head()! < finalized) {
    const head = ctx.head()!;
    const numbers = Array.from({ length: Math.min(ctx.batchSize, finalized - head) }, (_, i) => head + 1 + i);
    for (const block of await ctx.fetch(numbers)) {
      await ctx.persist(block);
      ctx.setHead(block.block.number);
    }
    await ctx.saveState();
  }
  if (!ctx.stopping()) await ctx.saveState();
}
