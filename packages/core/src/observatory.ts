import { createHash } from "node:crypto";
export const EXECUTION_RESULTS = [
  "unknown",
  "returned",
  "error",
  "timeout",
  "disagreement",
  "violation",
] as const;
export function executionResult(
  receipt: any,
): (typeof EXECUTION_RESULTS)[number] {
  const n = Number(receipt?.txExecutionResult);
  return Number.isInteger(n) && n >= 1 && n <= 5
    ? EXECUTION_RESULTS[n]
    : "unknown";
}
export function explainExecution(receipt: any) {
  const outcome = executionResult(receipt);
  const messages: Record<string, string> = {
    returned:
      "The leader execution returned a value without an execution error.",
    error: "The leader execution ended with a contract error.",
    timeout: "The leader execution exceeded its allowed time.",
    disagreement: "The execution reported a nondeterministic disagreement.",
    violation: "The execution reported a deterministic violation.",
    unknown: "The receipt does not contain a classified execution outcome.",
  };
  return {
    outcome,
    summary: messages[outcome],
    consensus: receipt?.statusName ?? "Unknown",
    finality_note:
      "Consensus finality records a settled outcome; it does not imply successful contract execution.",
  };
}
export function sourceProfile(source: string) {
  const classes = [...source.matchAll(/^class\s+(\w+)\s*\(([^\n]*)\)\s*:/gm)];
  const chosen = classes.find((x) => /\bContract\b/.test(x[2])) ?? classes[0];
  const name = chosen?.[1] ?? null;
  let description: string | null = null;
  if (chosen) {
    const after = source.slice((chosen.index ?? 0) + chosen[0].length);
    const doc = after.match(
      /^\s*\n[ \t]+(?:"""([\s\S]*?)"""|'''([\s\S]*?)''')/,
    );
    description =
      (doc?.[1] ?? doc?.[2] ?? "").trim().replace(/\s+/g, " ").slice(0, 600) ||
      null;
  }
  const methods = [
    ...source.matchAll(
      /@(?:\w+\.)*public\.(view|write)[^\n]*\n(?:[ \t]*@[^\n]*\n)*[ \t]*(?:async\s+)?def\s+(\w+)\s*\(/g,
    ),
  ].map((x) => ({ name: x[2], readonly: x[1] === "view" }));
  // These are source references, never claims that a particular execution used an LLM or website.
  const tags = [
    [/\b(?:exec_prompt|llm)\b/, "LLM"],
    [/\b(?:get_webpage|web\.get|web\.render|fetch)\b/, "Web"],
    [/\b(?:get_contract_at|get_at|emit_message)\b/, "Cross-contract"],
  ]
    .filter(([re]) => (re as RegExp).test(source))
    .map(([, name]) => name as string);
  return {
    name,
    description:
      description ??
      `GenVM contract exposing ${methods.filter((x) => x.readonly).length} read and ${methods.filter((x) => !x.readonly).length} write methods.`,
    description_origin: description ? "contract docstring" : "method summary",
    methods,
    tags,
    sha256: createHash("sha256").update(source).digest("hex"),
    origin: "on-chain source",
    inferred: true,
  };
}
export function receiptVotes(id: string, receipt: any) {
  return (receipt?.roundData ?? []).flatMap((r: any) =>
    (r.validators ?? []).map((v: any, position: number) => ({
      tx_id: id,
      round: Number(r.round),
      position,
      address: String(v.address).toLowerCase(),
      leader: !!v.leader,
      vote: v.vote == null ? null : Number(v.vote),
      result_hash: v.result_hash ?? null,
      consensus_result: r.result == null ? null : Number(r.result),
    })),
  );
}
