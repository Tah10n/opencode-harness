export const PROVISIONAL_DOSSIER_PHRASE = "provisional Engineering Dossier draft";

export const HIGH_CRITICAL_PREIMPLEMENTATION_SEQUENCE = Object.freeze([
  Object.freeze({ id: "session_registration", description: "register the primary session" }),
  Object.freeze({ id: "risk_and_strategy", description: "classify risk and select the minimum context strategy" }),
  Object.freeze({ id: "provisional_dossier", description: "create the provisional dossier and impact graph" }),
  Object.freeze({ id: "context_receipts", description: "collect runner-owned context receipts" }),
  Object.freeze({ id: "serialized_read_only_children", description: "settle serialized read-only child evidence" }),
  Object.freeze({ id: "dossier_refinement", description: "refine the dossier and impact graph" }),
  Object.freeze({ id: "context_report_refinement", description: "refine the Whole-System Context Report" }),
  Object.freeze({ id: "context_report_finalization", description: "finalize the current Whole-System Context Report" }),
  Object.freeze({ id: "context_sufficiency_decision", description: "wait for the current runner-owned sufficient context decision" }),
  Object.freeze({ id: "current_plan_challenges", description: "record architect and reviewer challenges against the canonical current subject" }),
  Object.freeze({ id: "dossier_gate", description: "finalize the dossier and compute the existing quality gate" }),
  Object.freeze({ id: "mutation_authorization", description: "authorize mutation only after a passed gate" }),
]);

export const CONTEXT_EXECUTION_MODE_CONTRACT = Object.freeze({
  instrumented: Object.freeze({
    context_operations: "serialized",
    read_only_children: "serialized",
    parallel_child_correlation: false,
  }),
  profile_only: Object.freeze({
    context_operations: "host_defined",
    read_only_children: "host_defined",
    optional_parallel_read_only_fanout: true,
    computational_receipt_chain: false,
  }),
});

function markerMatch(text, marker, offset) {
  if (typeof marker === "string") {
    const index = text.indexOf(marker, offset);
    return index === -1 ? null : { index, length: marker.length };
  }
  if (!(marker instanceof RegExp)) throw new TypeError("semantic sequence marker must be a string or RegExp");
  const flags = marker.flags.replaceAll("g", "").replaceAll("y", "");
  const match = new RegExp(marker.source, flags).exec(text.slice(offset));
  return match === null ? null : { index: offset + match.index, length: match[0].length };
}

export function assertSemanticSequence(text, markerByStage, { label = "semantic sequence" } = {}) {
  if (typeof text !== "string") throw new TypeError(`${label} text must be a string`);
  const stageIds = HIGH_CRITICAL_PREIMPLEMENTATION_SEQUENCE.map((entry) => entry.id);
  const suppliedIds = Object.keys(markerByStage ?? {});
  const missing = stageIds.filter((stageId) => !suppliedIds.includes(stageId));
  const unknown = suppliedIds.filter((stageId) => !stageIds.includes(stageId));
  if (missing.length > 0 || unknown.length > 0) {
    throw new Error(`${label} marker registry mismatch; missing=${missing.join(",") || "none"}; unknown=${unknown.join(",") || "none"}`);
  }

  let offset = 0;
  const positions = [];
  for (const stage of HIGH_CRITICAL_PREIMPLEMENTATION_SEQUENCE) {
    const alternatives = Array.isArray(markerByStage[stage.id]) ? markerByStage[stage.id] : [markerByStage[stage.id]];
    let selected = null;
    for (const marker of alternatives) {
      const candidate = markerMatch(text, marker, offset);
      if (candidate !== null && (selected === null || candidate.index < selected.index)) selected = candidate;
    }
    if (selected === null) throw new Error(`${label} is missing ordered stage ${stage.id} after byte ${offset}`);
    positions.push(Object.freeze({ stage_id: stage.id, index: selected.index }));
    offset = selected.index + Math.max(selected.length, 1);
  }
  return Object.freeze(positions);
}
