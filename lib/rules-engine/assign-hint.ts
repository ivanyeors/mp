export type AssignHintSource = "engine" | "default";

export type AssignHintInput = {
  engineTemplateId: string | number | null | undefined;
  sizeScopeChanged: boolean;
  hasAssistFillingSnapshot: boolean;
};

function numericTemplateId(
  id: string | number | null | undefined,
): number | null {
  if (id == null || String(id).trim() === "") return null;
  const n = Number(id);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function selectAssignHintSource(input: AssignHintInput): AssignHintSource {
  if (input.sizeScopeChanged) return "default";
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
