import { requireAdminPage } from "@/lib/auth/admin";
import { loadOutputs, readOutput } from "@/lib/company/load";
import { buildOverview, okrTree, type Output } from "@/lib/company/overview";
import type { Report } from "@/lib/company/report";
import { agentTree, readCompany } from "@/lib/company/roster";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { Activity } from "./activity";
import { AgentDetail } from "./agent-detail";
import { HarnessCopy, SetupNotice } from "./harness";
import { Hero } from "./hero";
import { NeedsYou } from "./inbox";
import { AgentSheet } from "./interactive";
import { Okrs } from "./okrs";
import { OrgChart, type Flags } from "./org-chart";

export const runtime = "nodejs";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function CompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ agent?: string | string[]; file?: string | string[] }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  await requireAdminPage("company", locale);
  const query = await searchParams;

  const company = readCompany();
  const root = agentTree(company.agents);
  if (!root) throw new Error("company/agents has no Agent 0");

  const outputs = await loadOutputs();
  const ok = outputs.state === "ok";
  const drive = ok && outputs.source === "drive";
  const overview = buildOverview(company, ok ? outputs.files : [], ok ? outputs.reports : new Map<string, Report>(), new Date());
  const views = new Map(overview.agents.map((v) => [v.agent.id, v]));
  const names = new Map(company.agents.map((a) => [a.id, a.name]));

  const asking = new Set([...overview.decisions.map((d) => d.agent), ...overview.alerts.filter((a) => a.severity === "critical" || a.severity === "high").map((a) => a.agent)]);
  const flags: Flags = {
    attention: new Set(overview.agents.filter((v) => ["failed", "missed", "degraded"].includes(v.health) || asking.has(v.agent.id)).map((v) => v.agent.id)),
    quiet: new Set(overview.agents.filter((v) => v.agent.kind !== "dept" && (v.agent.status !== "Live" || v.health === "none")).map((v) => v.agent.id)),
  };

  const selected = views.get(one(query.agent) ?? "") ?? null;
  const fileId = one(query.file);
  const shown: Output | null = selected ? (selected.outputs.find((o) => o.file.id === fileId) ?? selected.latest ?? null) : null;
  const content = shown ? await readOutput(shown.file) : null;
  const chain: string[] = [];
  for (let id = selected?.agent.parent ?? null; id; id = views.get(id)?.agent.parent ?? null) chain.unshift(names.get(id) ?? id);
  const outputCount = ok ? outputs.files.filter((f) => !f.folder.startsWith("_company")).length : 0;

  return (
    <div className="w-full max-w-[1440px] space-y-10 pb-14">
      <Hero overview={overview} outputs={outputs} teams={root.children.length} />
      {outputs.state !== "ok" ? <SetupNotice outputs={outputs} /> : null}
      {drive ? <HarnessCopy copies={overview.copies} outputs={outputs} /> : null}
      <OrgChart root={root} views={views} selected={selected?.agent.id ?? null} flags={flags} outputCount={outputCount} copies={overview.copies} driveOk={drive} />
      <NeedsYou decisions={overview.decisions} alerts={overview.alerts} drafts={overview.drafts} who={{ names, health: new Map(overview.agents.map((v) => [v.agent.id, v.health])) }} />
      <Activity feed={overview.feed} days={overview.activity} names={names} />
      <Okrs branches={okrTree(company.okrs)} values={overview.okrValues} />
      {selected ? (
        <AgentSheet title={selected.agent.name} description={selected.agent.mission ?? "Agent details and its newest report"}>
          <AgentDetail view={selected} chain={chain.length ? chain : ["Ivan"]} shown={shown} content={content} okrs={company.okrs} values={overview.okrValues} />
        </AgentSheet>
      ) : null}
    </div>
  );
}
