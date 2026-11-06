import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { requireAdminContext } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { touchLastUsed } from "@/lib/media-assets";
import { HEADER_SLUG, mediaReferences, type SlideInSectionContent } from "@/lib/slide-in-pages/content";
import { isSlideInPageKey, SLIDE_IN_PAGES } from "@/lib/slide-in-pages/pages";
import {
  isSlideInSlug,
  slideInSectionType,
  slideInSectionViews,
  type SlideInSectionRow,
} from "@/lib/slide-in-pages/sections";
import {
  formatSlideInCopyIssues,
  knownSlideCopy,
  SlideInContentSchema,
  validateSlideInCopy,
} from "@/lib/slide-in-pages/validation";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

const PatchSchema = z
  .object({
    visible: z.boolean().optional(),
    content: SlideInContentSchema.optional(),
  })
  .strict();

/** Key-order-independent JSON, for "is this draft the same as what is live?". */
function canonical(value: unknown): string {
  return JSON.stringify(value ?? {}, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)))
      : v,
  );
}

/**
 * PATCH /api/slide-in-sections/[page]/[slug]
 * Saves a **Slide-in section**'s content or visibility as a draft. The section is code;
 * its row is created on first edit, published as its code default so nothing changes
 * live until Publish.
 *
 * A draft equal to what is live is stored as no draft, so the pending count only counts
 * real changes — undoing an edit by hand clears it.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ page: string; slug: string }> },
) {
  let ctx;
  try {
    ctx = await requireAdminContext("page-builder");
  } catch (res) {
    return res as NextResponse;
  }

  const { page, slug } = await params;
  if (!isSlideInPageKey(page) || !isSlideInSlug(page, slug)) {
    return NextResponse.json({ error: "No such section" }, { status: 404 });
  }

  try {
    const parsed = PatchSchema.parse(await req.json());
    const sectionType = slideInSectionType(page, slug)!;

    if (slug === HEADER_SLUG && parsed.visible !== undefined) {
      return NextResponse.json({ error: "The sheet header is always shown." }, { status: 400 });
    }

    if (parsed.content !== undefined) {
      const issues = validateSlideInCopy(sectionType, parsed.content, knownSlideCopy(page));
      if (issues.length > 0) {
        return NextResponse.json({ error: formatSlideInCopyIssues(issues), issues }, { status: 400 });
      }
    }

    const admin = supabaseAdmin();
    const { data: before, error: readError } = await admin
      .from("slide_in_sections")
      .select("*")
      .eq("page", page)
      .eq("slug", slug)
      .maybeSingle();
    if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });

    const existing = before as SlideInSectionRow | null;
    const liveContent = existing?.content ?? {};
    const liveVisible = existing?.visible ?? true;

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (parsed.content !== undefined) {
      update.draft_content = canonical(parsed.content) === canonical(liveContent) ? null : parsed.content;
    }
    if (parsed.visible !== undefined) {
      update.draft_visible = parsed.visible === liveVisible ? null : parsed.visible;
    }

    let saved: SlideInSectionRow;
    if (existing) {
      const { data, error } = await admin
        .from("slide_in_sections")
        .update(update)
        .eq("id", existing.id)
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      saved = data as SlideInSectionRow;
    } else {
      const codeIndex = SLIDE_IN_PAGES[page].sections.findIndex((s) => s.key === slug);
      const { data, error } = await admin
        .from("slide_in_sections")
        .insert({
          page,
          slug,
          section_type: sectionType,
          // Published as the code default: live is unchanged until Publish.
          position: codeIndex,
          visible: true,
          content: {},
          draft_content: update.draft_content ?? null,
          draft_visible: update.draft_visible ?? null,
        })
        .select()
        .single();
      if (error) {
        // Two Staff saving the same untouched section at once: the other insert won.
        const status = error.code === "23505" ? 409 : 500;
        const message = status === 409 ? "Someone else just saved this section. Reload and try again." : error.message;
        return NextResponse.json({ error: message }, { status });
      }
      saved = data as SlideInSectionRow;
    }

    // Drafts count as Used (CONTEXT.md), so a pending image is still marked in the DAM.
    if (parsed.content) {
      const refs = mediaReferences(parsed.content as SlideInSectionContent);
      await touchLastUsed({
        urls: refs.urls.filter((u) => u.startsWith("http")),
        assetIds: refs.assetIds,
      }).catch(() => {});
    }

    await recordAdminAction({
      actor: ctx,
      action: "slide_in_section.update",
      entityType: "slide_in_section",
      entityId: saved.id,
      before: existing
        ? { page, slug, draft_visible: existing.draft_visible, draft_content: existing.draft_content }
        : { page, slug },
      after: { page, slug, draft_visible: saved.draft_visible, draft_content: saved.draft_content },
    });

    const section = slideInSectionViews(page, [saved], "draft").find((v) => v.slug === slug);
    return NextResponse.json({ ok: true, section });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid content", issues: err.issues }, { status: 400 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
