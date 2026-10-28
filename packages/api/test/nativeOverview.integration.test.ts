import { describe, it, expect } from "vitest";
import { createDb } from "@genlayer-explorer/core";
import Fastify from "fastify";
import { nativeOverviewActivity } from "../src/nativeOverview";
import { registerGenLayerRoutes } from "../src/genlayer";
const enabled =
  !!process.env.DATABASE_URL &&
  new URL(process.env.DATABASE_URL).pathname === "/genlayer_features_preview";
describe.skipIf(!enabled)("overview counts and drill-downs", () => {
  it("uses the same bounded native window for cards and hourly execution outcomes", async () => {
    const { pool } = createDb(),
      client = await pool.connect();
    const since = new Date("2001-01-01T12:30:00Z"),
      until = new Date("2001-01-02T12:30:00Z");
    try {
      await client.query("BEGIN");
      const fixtures = [
        ["12:30", "returned", "confirmed"],
        ["13:00", "error", "confirmed"],
        ["14:00", "unknown", "provisional"],
        ["15:00", "timeout", "orphaned"],
        ["12:29", "returned", "confirmed"],
      ];
      for (let i = 0; i < fixtures.length; i++) {
        const [time, outcome, confirmation] = fixtures[i];
        await client.query(
          `INSERT INTO gen_transactions(id,recipient,sender,submission_hash,block_number,created_at,execution_result,confirmation) VALUES($1,$2,$3,$1,9999999,$4,$5,$6)`,
          [
            "0x" + "ee".repeat(31) + String(i).padStart(2, "0"),
            "0x" + "ee".repeat(20),
            "0x" + "ed".repeat(20),
            `2001-01-01T${time}:00Z`,
            outcome,
            confirmation,
          ],
        );
      }
      const result = await nativeOverviewActivity(
        { query: client.query.bind(client) } as any,
        since,
        until,
      );
      expect(result).toMatchObject({
        calls_24h: 3,
        active_24h: 1,
        callers_24h: 1,
        returned_24h: 1,
        failed_24h: 1,
        unknown_24h: 1,
      });
      expect(result.points.reduce((n: number, p: any) => n + p.txs, 0)).toBe(
        result.calls_24h,
      );
      for (const p of result.points)
        expect(p.returned + p.failed + p.unknown).toBe(p.txs);
    } finally {
      await client.query("ROLLBACK");
      client.release();
      await pool.end();
    }
  });
  it("preserves the past-day filter on failure drill-downs", async () => {
    const { pool } = createDb(),
      client = await pool.connect(),
      app = Fastify(),
      address = "0x" + "e1".repeat(20);
    try {
      await client.query("BEGIN");
      for (const [i, hours] of [1, 25].entries())
        await client.query(
          `INSERT INTO gen_transactions(id,recipient,submission_hash,block_number,created_at,execution_result) VALUES($1,$2,$1,9999999,now()-$3::int*interval '1 hour','error')`,
          ["0x" + "e1".repeat(31) + String(i).padStart(2, "0"), address, hours],
        );
      registerGenLayerRoutes(app, {
        pool: { query: client.query.bind(client) },
        rpc: {},
      } as any);
      const response = await app.inject(
        `/api/v1/genlayer/transactions?address=${address}&days=1&execution=failed`,
      );
      expect(response.statusCode).toBe(200);
      expect(response.json().total).toBe(1);
      expect(response.json().transactions).toHaveLength(1);
      expect(
        (
          await app.inject(
            `/api/v1/genlayer/transactions?address=${address}&execution=failed`,
          )
        ).json().total,
      ).toBe(2);
    } finally {
      await app.close();
      await client.query("ROLLBACK");
      client.release();
      await pool.end();
    }
  });
});
