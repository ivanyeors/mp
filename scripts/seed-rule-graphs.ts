/**
 * Seed + publish v1 Rule graphs for Premium / Basic / Mbolster.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/seed-rule-graphs.ts
 *   npx tsx --env-file=.env.local scripts/seed-rule-graphs.ts --force   # publish next version even if v1 exists
 */
import { supabaseAdmin } from "@/lib/supabase/server";
import { getDefaultFillingTemplateId } from "@/lib/results/composed-sellable";
import {
  assertPublishable,
  basicSeedGraph,
  mbolsterSeedGraph,
  premiumSeedGraph,
  saveDraft,
  publishDraft,
  listVersions,
  type PillowTemplateIds,
  type BolsterTemplateIds,
} from "@/lib/rules-engine";
import { PILLOW_SIZES, type PillowSize } from "@/lib/rules-engine/types";

async function pillowTemplates(
  tier: "basic" | "premium",
): Promise<PillowTemplateIds> {
  const admin = supabaseAdmin();
  const out = {} as PillowTemplateIds;
  for (const size of PILLOW_SIZES) {
    const id = await getDefaultFillingTemplateId(admin, {
      productType: "pillow",
      size: size as PillowSize,
      tier,
    });
    if (id == null) {
      throw new Error(`Missing Default Filling Template for ${tier} ${size}`);
    }
    out[size] = String(id);
  }
  return out;
}

async function bolsterTemplates(): Promise<BolsterTemplateIds> {
  const admin = supabaseAdmin();
  const out = {} as BolsterTemplateIds;
  for (const length of ["short", "medium", "long"] as const) {
    const id = await getDefaultFillingTemplateId(admin, {
      productType: "bolster",
      length,
    });
    if (id == null) {
      throw new Error(`Missing Default Filling Template for bolster ${length}`);
    }
    out[length] = String(id);
  }
  return out;
}

async function seedFlow(
  flow: "premium-mpillow" | "basic-mpillow" | "mbolster",
  graph: ReturnType<typeof premiumSeedGraph>,
  force: boolean,
) {
  const versions = await listVersions(flow);
  if (versions.length > 0 && !force) {
    console.log(`skip ${flow}: already has published v${versions[0]!.version} (${versions[0]!.id})`);
    return;
  }

  const check = assertPublishable(flow, graph);
  if (!check.ok) {
    console.error(flow, check.errors);
    throw new Error(`Seed graph for ${flow} failed publish validation`);
  }

  await saveDraft(flow, graph, null);
  const pub = await publishDraft(flow, null);
  if (!pub.ok) {
    console.error(pub);
    throw new Error(`Failed to publish ${flow}`);
  }
  console.log(`published ${flow} v${pub.published.version} ${pub.published.id}`);
}

async function main() {
  const force = process.argv.includes("--force");
  const premiumTpl = await pillowTemplates("premium");
  const basicTpl = await pillowTemplates("basic");
  const bolsterTpl = await bolsterTemplates();

  await seedFlow("premium-mpillow", premiumSeedGraph(premiumTpl), force);
  await seedFlow("basic-mpillow", basicSeedGraph(basicTpl), force);
  await seedFlow("mbolster", mbolsterSeedGraph(bolsterTpl), force);
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
