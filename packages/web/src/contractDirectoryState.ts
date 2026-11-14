import type { NativeTransaction } from "./genlayer";
export type DecisionStage = { label: string; state: "done" | "active" | "failed" | "unknown" | "waiting"; detail: string };

/** These are observed states, not invented stage timestamps or successful execution. */
export function decisionStages(t: Pick<NativeTransaction, "status" | "rounds" | "execution_result">): DecisionStage[] {
  const decided = t.status === "Accepted" || t.status === "Finalized";
  const stopped = t.status === "Canceled" || t.status === "Undetermined" || t.status === "LeaderTimeout";
  const returned = t.execution_result === "returned";
  const failed = ["error", "timeout", "disagreement", "violation"].includes(t.execution_result ?? "");
  return [
    { label: "Submit", state: "done", detail: "Submission observed by the explorer" },
    { label: "Consensus", state: decided ? "done" : stopped ? "failed" : (t.rounds ?? 0) > 0 ? "active" : "waiting", detail: `Current consensus status: ${t.status}` },
    { label: "Execution", state: returned ? "done" : failed ? "failed" : "unknown", detail: returned ? "Execution returned a result" : failed ? `Execution outcome: ${t.execution_result}` : "Execution result is unavailable" },
    { label: "Finalize", state: t.status === "Finalized" ? "done" : "waiting", detail: t.status === "Finalized" ? "Contract decision finalized; submission-block finality is separate" : "Contract decision is not finalized" },
  ];
}
