import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { z } from "zod/v4";
import { requireAdminContext } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { touchLastUsed } from "@/lib/media-assets";
import {
  SectionContentSchema,
  SlugSchema,
  isCustomSectionType,
  sectionContentErrors,
} from "@/lib/page-builder/validation";
import { formatCopyFitIssues, validateSectionCopy } from "@/lib/page-builder/copy-fit";

export const runtime = "nodejs";

const PatchSchema = z.object({
  visible: z.boolean().optional(),
  content: SectionContentSchema.optional(),
  slug: SlugSchema.optional(),
});

/**
 * PATCH /api/landing-sections/[id]
 * Updates a section's visible, content, or slug.
 *
 * `slug` is only editable on custom sections: built-in components branch on it to
 * pick their copy, image and CTA, and it is also the journey-analytics anchor, so
 * renaming one silently blanks the section and orphans historical exit links.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let ctx;
  try {
    ctx = await requireAdminContext("page-builder");
  } catch (res) {
    return res as NextResponse;
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = PatchSchema.parse(body);

    const admin = supabaseAdmin();

    const { data: before, error: beforeError } = await admin
      .from("landing_sections")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (beforeError) {
      return NextResponse.json({ error: beforeError.message }, { status: 500 });
    }
    if (!before) {
      return NextResponse.json({ error: "Section not found" }, { status: 404 });
    }

    if (parsed.slug !== undefined && parsed.slug !== before.slug && !isCustomSectionType(before.section_type)) {
      return NextResponse.json(
        {
          error:
            `"${before.slug}" is a built-in section, so its name is fixed. ` +
            `Its layout and its analytics links both depend on it.`,
        },
        { status: 409 },
      );
    }

    if (parsed.content !== undefined) {
      // Copy-fit and banned-claim bands (CONTEXT.md "Copy fit"). Already enforced over
      // the i18n literals; the CMS override is the string that actually ships.
      const issues = validateSectionCopy(before.section_type, parsed.content);
      if (issues.length > 0) {
        return NextResponse.json(
          { error: formatCopyFitIssues(issues), issues },
          { status: 400 },
        );
      }

      const contentErrors = sectionContentErrors(before.section_type, parsed.content);
      if (contentErrors.length > 0) {
        return NextResponse.json({ error: contentErrors.join(" ") }, { status: 400 });
      }
    }

    // Edits land in the Section draft, not on the live page. Slug is the exception:
    // it is structural (analytics anchor, uniqueness) rather than content, and is only
    // editable on custom sections anyway.
    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (parsed.visible !== undefined) update.draft_visible = parsed.visible;
    if (parsed.content !== undefined) update.draft_content = parsed.content;
    if (parsed.slug !== undefined) update.slug = parsed.slug;

    const { data, error } = await admin
      .from("landing_sections")
      .update(update)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "A section with this slug already exists" }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Section not found" }, { status: 404 });
    }

    // Drafts count as Used (CONTEXT.md), so a pending image is still marked in the DAM.
    if (parsed.content) {
      // The section's own image, plus any cards that carry one (a TikTok video's cover).
      const holders = [
        parsed.content,
        ...(Array.isArray(parsed.content.videos) ? (parsed.content.videos as unknown[]) : []),
      ].filter((h): h is Record<string, unknown> => Boolean(h) && typeof h === "object");
      const urls = holders
        .map((h) => h.image)
        .filter((u): u is string => typeof u === "string" && u.startsWith("http"));
      const assetIds = holders
        .map((h) => h.media_asset_id)
        .filter((id): id is string => typeof id === "string");
      await touchLastUsed({ urls, assetIds }).catch(() => {});
    }

    await recordAdminAction({
      actor: ctx,
      action: "landing_section.update",
      entityType: "landing_section",
      entityId: id,
      before: { slug: before.slug, draft_visible: before.draft_visible, draft_content: before.draft_content },
      after: { slug: data.slug, draft_visible: data.draft_visible, draft_content: data.draft_content },
    });

    return NextResponse.json({ ok: true, section: data });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/landing-sections/[id]
 * Custom sections only — built-ins are seeded and the page expects them.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let ctx;
  try {
    ctx = await requireAdminContext("page-builder");
  } catch (res) {
    return res as NextResponse;
  }

  const { id } = await params;
  const admin = supabaseAdmin();

  const { data: before, error: beforeError } = await admin
    .from("landing_sections")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (beforeError) {
    return NextResponse.json({ error: beforeError.message }, { status: 500 });
  }
  if (!before) {
    return NextResponse.json({ error: "Section not found" }, { status: 404 });
  }
  if (!isCustomSectionType(before.section_type)) {
    return NextResponse.json(
      { error: `"${before.slug}" is a built-in section and cannot be deleted. Hide it instead.` },
      { status: 409 },
    );
  }

  // Marked for removal by the next Publish rather than deleted now, so the deletion is
  // reviewable in Preview mode and Discard can undo it.
  const { error } = await admin
    .from("landing_sections")
    .update({ draft_deleted: true, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await recordAdminAction({
    actor: ctx,
    action: "landing_section.mark_deleted",
    entityType: "landing_section",
    entityId: id,
    before: {
      slug: before.slug,
      section_type: before.section_type,
      position: before.position,
      visible: before.visible,
      content: before.content,
    },
  });

  return NextResponse.json({ ok: true });
}
