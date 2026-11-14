import { describe, expect, it } from "vitest";
import { decisionLifecycle } from "../src/decisionState";
import type { NativeTransaction } from "../src/genlayer";
const transaction=(values:Partial<NativeTransaction>)=>({status:'Finalized',execution_result:'unknown',rounds:1,created_at:'2026-11-14T12:00:00Z',...values}) as NativeTransaction;
describe('decision lifecycle evidence',()=>{
  it('does not turn finalized consensus into successful execution or a retained proposal',()=>{const stages=decisionLifecycle(transaction({}));expect(stages.find(s=>s.label==='Execution')?.state).toBe('unknown');expect(stages.find(s=>s.label==='Proposed')?.state).toBe('unknown');expect(stages.find(s=>s.label==='Finalized')).toMatchObject({state:'done',time:null});});
  it('keeps consensus awaiting while a proposal is being produced',()=>{const stages=decisionLifecycle(transaction({status:'Proposing'}));expect(stages.find(s=>s.label==='Proposed')?.state).toBe('active');expect(stages.find(s=>s.label==='Consensus')?.state).toBe('waiting');});
  it('retains execution errors even when the decision finalized',()=>{expect(decisionLifecycle(transaction({execution_result:'error'})).find(s=>s.label==='Execution')?.state).toBe('failed');});
  it('shows actual proposal evidence without inventing later timestamps',()=>{const stages=decisionLifecycle(transaction({status:'Committing',progress:{round:0,assigned:5,revealed:0,last_vote_seconds:null,timestamps:{Proposed:'2026-11-14T12:00:10Z'}}}));expect(stages.find(s=>s.label==='Proposed')).toMatchObject({state:'done',time:'2026-11-14T12:00:10Z'});expect(stages.find(s=>s.label==='Finalized')).toMatchObject({state:'waiting',time:null});});
});
