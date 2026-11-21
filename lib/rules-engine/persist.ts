import { supabaseAdmin } from "@/lib/supabase/server";
import { assertPublishable } from "./validate";
import type { RuleFlow, RuleGraphJson, RuleGraphRow, RuleGraphSummary } from "./types";
import { RULE_FLOWS } from "./types";

export function isRuleFlow(v: string): v is RuleFlow {
  return (RULE_FLOWS as readonly string[]).includes(v);
}

function row(data: Record<string, unknown>): RuleGraphRow {
  return {
    id: String(data.id),
    flow: data.flow as RuleFlow,
    version: data.version == null ? null : Number(data.version),
    status: data.status as "draft" | "published",
    graph: data.graph as RuleGraphJson,
    author_id: data.author_id == null ? null : String(data.author_id),
    created_at: String(data.created_at),
    updated_at: String(data.updated_at),
    published_at: data.published_at == null ? null : String(data.published_at),
  };
}

export async function getDraft(flow: RuleFlow): Promise<RuleGraphRow | null> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("rule_graphs")
    .select("*")
    .eq("flow", flow)
    .eq("status", "draft")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? row(data) : null;
}

export async function saveDraft(
  flow: RuleFlow,
  graph: RuleGraphJson,
  authorId: string | null,
): Promise<RuleGraphRow> {
  const admin = supabaseAdmin();
  const existing = await getDraft(flow);
  if (existing) {
    const { data, error } = await admin
      .from("rule_graphs")
      .update({ graph, author_id: authorId })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row(data);
  }
  const { data, error } = await admin
    .from("rule_graphs")
    .insert({
      flow,
      status: "draft",
      version: null,
      graph,
      author_id: authorId,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return row(data);
}

export async function listVersions(flow: RuleFlow): Promise<RuleGraphSummary[]> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("rule_graphs")
    .select("id, flow, version, status, author_id, created_at, updated_at, published_at")
    .eq("flow", flow)
    .eq("status", "published")
    .order("version", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((d) => {
    const { graph: _graph, ...summary } = row({ ...(d as Record<string, unknown>), graph: null });
    void _graph;
    return summary;
  });
}

export async function getPublishedVersion(
  flow: RuleFlow,
  versionId: string,
): Promise<RuleGraphRow | null> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("rule_graphs")
    .select("*")
    .eq("flow", flow)
    .eq("status", "published")
    .eq("id", versionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? row(data) : null;
}

export async function getLatestPublished(flow: RuleFlow): Promise<RuleGraphRow | null> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("rule_graphs")
    .select("*")
    .eq("flow", flow)
    .eq("status", "published")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? row(data) : null;
}

export async function publishDraft(
  flow: RuleFlow,
  authorId: string | null,
): Promise<
  | { ok: true; published: RuleGraphRow }
  | { ok: false; error: string; errors?: import("./types").ValidationError[] }
> {
  const draft = await getDraft(flow);
  if (!draft) return { ok: false, error: "No draft to publish" };

  const check = assertPublishable(flow, draft.graph);
  if (!check.ok) return { ok: false, error: "Validation failed", errors: check.errors };

  const versions = await listVersions(flow);
  const nextVersion = versions.length === 0 ? 1 : Math.max(...versions.map((v) => v.version ?? 0)) + 1;

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("rule_graphs")
    .insert({
      flow,
      status: "published",
      version: nextVersion,
      graph: draft.graph,
      author_id: authorId,
      published_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return { ok: true, published: row(data) };
}

export async function restoreToDraft(
  flow: RuleFlow,
  versionId: string,
  authorId: string | null,
): Promise<RuleGraphRow | { error: string }> {
  const published = await getPublishedVersion(flow, versionId);
  if (!published) return { error: "Published version not found" };

  const copy = structuredClone(published.graph);
  return saveDraft(flow, copy, authorId);
}
