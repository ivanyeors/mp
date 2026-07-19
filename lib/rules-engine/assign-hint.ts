/**
 * Assign-page hint source: engine-recommended template vs size Default FT.
 * Assist mix is the Result truth when present; engine stays reference-only.
 */

export type AssignHintSource = "engine" | "default";

export type AssignHintInput = {
  /** Engine recommendation_record.templateId (string or numeric). */
  engineTemplateId: string | number | null | undefined;
  /**
   * Operator changed size/tier/length away from the suggested card —
   * fall back to that size's Default Filling Template (existing behavior).
   */
  sizeScopeChanged: boolean;
  /** Staff assist left a filling snapshot on the Result. */
  hasAssistFillingSnapshot: boolean;
};

/**
 * Which template id to surface as the assign "hint".
 * Assist snapshot does not change the hint source — engine (if any) remains
 * the suggested pick; UI shows assist as truth separately.
 */
function numericTemplateId(
  id: string | number | null | undefined,
): number | null {
  if (id == null || String(id).trim() === "") return null;
  const n = Number(id);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function selectAssignHintSource(input: AssignHintInput): AssignHintSource {
  if (input.sizeScopeChanged) return "default";
  // Live seeds store numeric bom_templates ids; stub string ids fall back to default.
  if (numericTemplateId(input.engineTemplateId) != null) return "engine";
  return "default";
}

export function resolveAssignHintTemplateId(input: AssignHintInput & {
  defaultTemplateId: number | null;
}): number | null {
  const source = selectAssignHintSource(input);
  if (source === "engine") return numericTemplateId(input.engineTemplateId);
  return input.defaultTemplateId;
}
