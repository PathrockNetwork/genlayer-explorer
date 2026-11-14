import type { NativeTransaction } from "./genlayer";
import { decisionStages } from "./contractDirectoryState";

export function decisionLifecycle(t: NativeTransaction) {
  const stages = decisionStages(t), time = t.progress?.timestamps;
  return [
    { ...stages[0], label: "Submitted", time: time?.Created ?? t.created_at ?? null },
    { label: "Proposed", state: time?.Proposed ? "done" : t.status === "Proposing" ? "active" : "unknown", detail: time?.Proposed ? "Proposal recorded in the receipt" : "Proposal time is unavailable", time: time?.Proposed ?? null },
    { ...stages[1], state: ["Pending", "Proposing"].includes(t.status) ? "waiting" : t.status === "Unknown" ? "unknown" : stages[1].state, time: null },
    { ...stages[2], time: null },
    { ...stages[3], label: "Finalized", time: null },
  ];
}
export const decisionStatuses = ["Pending","Proposing","Committing","Revealing","Accepted","Finalized","Canceled","Undetermined","AppealCommitting","AppealRevealing","ValidatorsTimeout","LeaderTimeout","LeaderRevealing","Unknown"];
export const outcomeNames: Record<string, string> = { returned: "Returned", error: "Execution error", timeout: "Timeout", disagreement: "Disagreement", violation: "Violation", unknown: "Unavailable" };
export function decisionTone(status: string) { return status === "Finalized" ? "finalized" : status === "Accepted" ? "accepted" : ["Canceled","Undetermined","LeaderTimeout","ValidatorsTimeout"].includes(status) ? "failed" : "pending"; }
