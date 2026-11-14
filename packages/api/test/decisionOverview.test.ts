import { describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { decisionProgress, registerDecisionOverview } from "../src/decisionOverview";
import { registerGenLayerRoutes } from "../src/genlayer";
import type { Deps } from "../src/routes";

describe("recorded decision progress", () => {
  it("keeps absent rounds, timing and votes unavailable", () => {
    expect(decisionProgress(null)).toBeNull();
    expect(decisionProgress({round:null,timestamps:{Created:0,LastVote:0}})).toMatchObject({round:null,assigned:null,revealed:null,last_vote_seconds:null});
  });
  it("uses latest-round counters and last-vote timing without inventing finality", () => {
    expect(decisionProgress({round:{round:2,validators:[{}, {}, {}],votesRevealed:2},timestamps:{Created:100,LastVote:107,Proposed:103}})).toMatchObject({round:2,assigned:3,revealed:2,last_vote_seconds:7,timestamps:{Proposed:"1970-01-01T00:01:43.000Z"}});
    expect(decisionProgress({round:{round:0,roundValidators:["a"],votesRevealed:2},timestamps:{Created:100,LastVote:99}})).toMatchObject({revealed:null,last_vote_seconds:null});
  });
});
describe("decision summary and filters", () => {
  it("rejects unbounded windows, searches and progress pages before database work", async () => {
    const app=Fastify(),query=vi.fn(),call=vi.fn();
    registerGenLayerRoutes(app,{pool:{query},rpc:{call}} as unknown as Deps);
    try {
      for(const path of ['/decisions/overview?days=100','/transactions?include_progress=1&limit=26','/transactions?include_progress=yes','/transactions?q=%00','/transactions?q='+"x".repeat(129)])expect((await app.inject('/api/v1/genlayer'+path)).statusCode).toBe(400);
      expect(query).not.toHaveBeenCalled();expect(call).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });
  it("keeps summary states and execution separate and zero-fills missing participation buckets", async () => {
    const app=Fastify();const query=vi.fn(async(sql:string)=>({rows:sql.includes('GROUP BY status,execution_result')?[{status:'Finalized',execution_result:'error',count:2},{status:'Finalized',execution_result:'unknown',count:3}]:[]}));
    registerDecisionOverview(app,{pool:{query}} as unknown as Deps);
    try {const r=await app.inject('/api/v1/genlayer/decisions/overview');expect(r.statusCode).toBe(200);const d=r.json();expect(d.total).toBe(5);expect(d.statuses).toEqual([{status:'Finalized',count:5}]);expect(d.outcomes).toContainEqual({outcome:'error',count:2});expect(d.participation.points).toHaveLength(25);expect(d.participation.points.every((p:any)=>p.assigned===0&&p.voted===0)).toBe(true);expect(d.featured).toBeNull();}finally{await app.close();}
  });
  it("parameterizes literal search and strips raw receipt evidence from enriched rows", async () => {
    const app=Fastify();const query=vi.fn(async(sql:string)=>({rows:sql.includes('SELECT count(*)::int count')?[{count:1}]:[{id:'test',block_number:'12',evidence:{round:{round:0,validators:[{}],votesRevealed:1},timestamps:{Created:100,LastVote:104}}}]}));
    registerGenLayerRoutes(app,{pool:{query},rpc:{call:vi.fn()}} as unknown as Deps);
    try {const r=await app.inject('/api/v1/genlayer/transactions?q=%27%25&include_progress=1&limit=5');expect(r.statusCode).toBe(200);expect(r.json().transactions[0]).toMatchObject({progress:{assigned:1,revealed:1,last_vote_seconds:4}});expect(r.json().transactions[0]).not.toHaveProperty('evidence');const calls=query.mock.calls as unknown as [string,unknown[]][];expect(calls[0][1][9]).toBe("'%");expect(calls[1][1][7]).toBe("'%");expect(calls.every(([sql])=>!sql.includes("'%"))).toBe(true);}finally{await app.close();}
  });
});
