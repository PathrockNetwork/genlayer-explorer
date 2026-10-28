import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import {
  GENLAYER_DEPLOYMENT,
  NEW_TRANSACTION,
  createDb,
} from "@genlayer-explorer/core";
import { indexNativeRange } from "../../indexer/src/genlayer";
import { persistReceipt } from "../../indexer/src/observatory";
import { registerGenLayerRoutes } from "../src/genlayer";
import type { Ctx } from "../../indexer/src/context";
// Explicitly restricted to the isolated preview DB; every fixture is rolled back.
const url = process.env.DATABASE_URL,
  enabled = !!url && new URL(url).pathname === "/genlayer_features_preview";
describe.skipIf(!enabled)("native reconciliation with PostgreSQL", () => {
  it("orphans replaced submissions, resets their execution, promotes canonical history and retains exact analytics", async () => {
    const { pool } = createDb(),
      client = await pool.connect(),
      app = Fastify();
    const id = "0x" + "fa".repeat(32),
      address = "0x" + "fa".repeat(20),
      validator = "0x" + "fc".repeat(20);
    let logs: any[] = [];
    const proxy = {
      query: (sql: string, args?: any[]) =>
        client.query(
          sql === "BEGIN"
            ? "SAVEPOINT native_test"
            : sql === "COMMIT"
              ? "RELEASE SAVEPOINT native_test"
              : sql === "ROLLBACK"
                ? "ROLLBACK TO SAVEPOINT native_test"
                : sql,
          args,
        ),
      release: () => {},
    };
    const ctx = {
      pool: { query: client.query.bind(client), connect: async () => proxy },
      rpc: {
        call: async (method: string) =>
          method === "eth_getLogs" ? logs : { hash: "anchor" },
      },
      stopping: () => false,
    } as unknown as Ctx;
    try {
      await client.query("BEGIN");
      logs = [
        {
          address: GENLAYER_DEPLOYMENT.consensus,
          topics: [
            NEW_TRANSACTION,
            id,
            "0x" + "0".repeat(24) + address.slice(2),
          ],
          transactionHash: "0x" + "fb".repeat(32),
          blockNumber: "0x989680",
          blockHash: "first",
        },
      ];
      await indexNativeRange(ctx, 10000000, 10000000, ctx.rpc, {
        confirmation: "provisional",
        anchor: "anchor",
      });
      expect(
        (
          await client.query("SELECT * FROM gen_contracts WHERE address=$1", [
            address,
          ])
        ).rows,
      ).toHaveLength(0);
      const receipt = {
        statusName: "Finalized",
        txExecutionResult: 2,
        sender: validator,
        timestamps: {
          Created: Math.floor(Date.now() / 1000) - 60,
          LastVote: Math.floor(Date.now() / 1000) - 20,
        },
        input: { kind: "call", method: "run" },
        roundData: [
          {
            round: 0,
            result: 1,
            validators: [
              {
                address: validator,
                leader: true,
                vote: 2,
                result_hash: "0x01",
              },
            ],
          },
        ],
        fees: {
          consumed: {
            executionConsumed: "90071992547409931234",
            storageFeeUsed: "0",
            messageFeesConsumed: "0",
          },
        },
      };
      await persistReceipt(ctx, id, receipt);
      expect(
        (
          await client.query(
            "SELECT execution_result FROM gen_transactions WHERE id=$1",
            [id],
          )
        ).rows[0].execution_result,
      ).toBe("error");
      logs = [];
      await indexNativeRange(ctx, 10000000, 10000000, ctx.rpc, {
        confirmation: "provisional",
        anchor: "anchor",
      });
      await persistReceipt(ctx, id, { ...receipt, txExecutionResult: 1 });
      expect(
        (
          await client.query(
            "SELECT confirmation,execution_result FROM gen_transactions WHERE id=$1",
            [id],
          )
        ).rows[0],
      ).toEqual({ confirmation: "orphaned", execution_result: "error" });
      logs = [
        {
          address: GENLAYER_DEPLOYMENT.consensus,
          topics: [
            NEW_TRANSACTION,
            id,
            "0x" + "0".repeat(24) + address.slice(2),
          ],
          transactionHash: "0x" + "fd".repeat(32),
          blockNumber: "0x989680",
          blockHash: "replacement",
        },
      ];
      await indexNativeRange(ctx, 10000000, 10000000, ctx.rpc, {
        confirmation: "provisional",
        anchor: "anchor",
      });
      expect(
        (
          await client.query(
            "SELECT receipt,execution_result,checked_at FROM gen_transactions WHERE id=$1",
            [id],
          )
        ).rows[0],
      ).toEqual({
        receipt: null,
        execution_result: "unknown",
        checked_at: null,
      });
      await indexNativeRange(ctx, 10000000, 10000000);
      await persistReceipt(ctx, id, receipt);
      await indexNativeRange(ctx, 10000000, 10000000, ctx.rpc, {
        confirmation: "provisional",
        anchor: "anchor",
      });
      expect(
        (
          await client.query(
            "SELECT confirmation FROM gen_transactions WHERE id=$1",
            [id],
          )
        ).rows[0].confirmation,
      ).toBe("confirmed");
      registerGenLayerRoutes(app, { pool: ctx.pool, rpc: ctx.rpc } as any);
      const analytics = await app.inject(
        `/api/v1/contracts/${address}/analytics?days=1`,
      );
      expect(analytics.statusCode).toBe(200);
      expect(analytics.json().summary).toMatchObject({
        transactions: 1,
        returned: 0,
        failed: 1,
        unknown: 0,
        execution_cost: "90071992547409931234",
        p50_vote_seconds: 40,
      });
      const filtered = await app.inject(
        `/api/v1/genlayer/transactions?address=${address}&execution=failed&confirmation=confirmed`,
      );
      expect(filtered.json().transactions).toHaveLength(1);
      const votes = await app.inject(
        `/api/v1/genlayer/validators/${validator}`,
      );
      expect(votes.json().summary).toMatchObject({
        assignments: 1,
        errors: 1,
        recorded_votes: 1,
      });
      // A changed receipt replaces the round observations, so retries cannot inflate participation.
      await persistReceipt(ctx, id, { ...receipt, roundData: [] });
      expect(
        (await app.inject(`/api/v1/genlayer/validators/${validator}`)).json()
          .summary.assignments,
      ).toBe(0);
    } finally {
      await app.close();
      await client.query("ROLLBACK");
      client.release();
      await pool.end();
    }
  }, 30000);
});
