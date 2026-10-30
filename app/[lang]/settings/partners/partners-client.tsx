"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useTheme } from "next-themes";
import { DragDropProvider } from "@dnd-kit/react";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ImagePicker } from "@/components/ui/image-picker";
import { SortableRow } from "@/components/ui/sortable-row";
import { Switch } from "@/components/ui/switch";
import {
  PartnerLocationsFields,
  locationDraftsToPayload,
  toLocationDrafts,
  type LocationDraft,
} from "@/components/partner/partner-locations-fields";
import { branchesByParent, formatLocationAddress } from "@/lib/locations/branches";
import {
  DEFAULT_AGREEMENT_MD,
  DEFAULT_WORK_WITH_US,
  type PartnerRow,
  type PartnersPageRow,
  type WorkWithUsContent,
} from "@/lib/partners/types";
import { AGREEMENT_VERSION } from "@/lib/partner-application";
import { sortableMove, type SortableDragEndEvent } from "@/lib/dnd/sortable-move";
import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/locales";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { usePathname } from "next/navigation";
import { InfoTip } from "@/components/ui/info-tip";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  MOBILE_MD_COMMANDS,
  MOBILE_MD_EXTRA_COMMANDS,
} from "@/components/settings/markdown-toolbar";

const MDEditor = dynamic(
  () => import("@uiw/react-md-editor").then((mod) => mod.default),
  { ssr: false },
);

const menuItemClassName = "max-md:min-h-11";

function emptyWorkWithUs(): WorkWithUsContent {
  return {
    title: "",
    subtitle: "",
    body: "",
    benefitCards: [
      { title: "", description: "" },
      { title: "", description: "" },
      { title: "", description: "" },
    ],
    ctaTitle: "",
    ctaSubtitle: "",
    ctaButtonLabel: "",
    ctaButtonUrl: "/partner/apply",
    showMarquee: true,
  };
}

// ponytail: "Partner" naming kept from the legacy `partners` table; these are Locations.
type LocationType = "own" | "partner";

type PartnerForm = {
  id?: string;
  name: string;
  type: LocationType;
  /** The main location, then a partner's other clinics (ADR 0037). */
  locations: LocationDraft[];
  logo_url: string;
  media_asset_id: string | null;
  website_url: string;
  description: string;
  visible: boolean;
};

const emptyPartnerForm = (): PartnerForm => ({
  name: "",
  type: "partner",
  locations: toLocationDrafts({}),
  logo_url: "",
  media_asset_id: null,
  website_url: "",
  description: "",
  visible: true,
});

/** Merge a stored partners_page row onto the per-locale defaults. */
function mergeWorkWithUs(
  row: PartnersPageRow | null,
): Record<string, WorkWithUsContent> {
  const merged: Record<string, WorkWithUsContent> = {};
  for (const loc of SUPPORTED_LOCALES) {
    merged[loc] = {
      ...emptyWorkWithUs(),
      ...DEFAULT_WORK_WITH_US[loc],
      ...(row?.content?.[loc] ?? {}),
    };
  }
  return merged;
}

/** A route's error as text: a message, or the first zod issue's. */
function errorText(json: { error?: unknown }, fallback: string): string {
  if (typeof json.error === "string") return json.error;
  const first = Array.isArray(json.error) ? (json.error[0] as { message?: unknown }) : null;
  return typeof first?.message === "string" ? first.message : fallback;
}

/** The `/api/partners-page` + `/api/partners` payloads the page mounts with. */
export type PartnersInitialData = {
  page: { ok: true; row: PartnersPageRow | null };
  partners: { ok: true; partners: PartnerRow[] };
};

export default function PartnersSettingsPage({
  initialData,
}: {
  initialData?: PartnersInitialData;
}) {
  const pathname = usePathname() ?? "/";
  const locale = getLocaleFromPathname(pathname) ?? "en-US";
  const to = (href: string) => withLocale(href, locale as Locale);
  const { resolvedTheme } = useTheme();
  const isMobile = useIsMobile();

  const initialPageRow = initialData?.page.row ?? null;

  const [loading, setLoading] = useState(!initialData);
  const [savingPage, setSavingPage] = useState(false);
  const [activeLocale, setActiveLocale] = useState<Locale>("en-US");
  const [content, setContent] = useState<Record<string, WorkWithUsContent>>(() =>
    initialData ? mergeWorkWithUs(initialPageRow) : {},
  );
  const [heroImage, setHeroImage] = useState(
    initialPageRow?.content?.["en-US"]?.heroImage ?? "",
  );
  const [heroAssetId, setHeroAssetId] = useState<string | null>(
    initialPageRow?.content?.["en-US"]?.media_asset_id ?? null,
  );

  const [partners, setPartners] = useState<PartnerRow[]>(
    initialData?.partners.partners ?? [],
  );
  // Branches are a partner's other clinics: listed under it, edited in its dialog.
  const mainRows = useMemo(() => partners.filter((p) => !p.parent_id), [partners]);
  const branchMap = useMemo(() => branchesByParent(partners), [partners]);
  const [partnerDialogOpen, setPartnerDialogOpen] = useState(false);
  const [partnerForm, setPartnerForm] = useState<PartnerForm>(emptyPartnerForm);
  const [savingPartner, setSavingPartner] = useState(false);

  const [agreementMd, setAgreementMd] = useState(
    initialData ? (initialPageRow?.agreement_md ?? DEFAULT_AGREEMENT_MD) : "",
  );
  const [savingAgreement, setSavingAgreement] = useState(false);
  // The server already loaded the page row and the locations; edits still reload.
  const skipFirstFetch = useRef(initialData != null);

  const activeContent = content[activeLocale] ?? emptyWorkWithUs();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [pageRes, partnersRes] = await Promise.all([
        fetch("/api/partners-page"),
        fetch("/api/partners"),
      ]);
      const pageJson = await pageRes.json();
      const partnersJson = await partnersRes.json();

      setContent(mergeWorkWithUs(pageJson.row ?? null));
      setAgreementMd(pageJson.row?.agreement_md ?? DEFAULT_AGREEMENT_MD);

      const enHero = pageJson.row?.content?.["en-US"]?.heroImage ?? "";
      setHeroImage(enHero);
      setHeroAssetId(pageJson.row?.content?.["en-US"]?.media_asset_id ?? null);

      if (partnersJson.ok) {
        setPartners(partnersJson.partners ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (skipFirstFetch.current) {
      skipFirstFetch.current = false;
      return;
    }
    loadData();
  }, [loadData]);

  const updateActiveContent = (patch: Partial<WorkWithUsContent>) => {
    setContent((prev) => ({
      ...prev,
      [activeLocale]: { ...activeContent, ...patch },
    }));
  };

  const updateBenefitCard = (idx: number, field: "title" | "description", value: string) => {
    const cards = [...(activeContent.benefitCards ?? [])];
    while (cards.length < 3) cards.push({ title: "", description: "" });
    cards[idx] = { ...cards[idx], [field]: value };
    updateActiveContent({ benefitCards: cards });
  };

  const handleSavePage = async () => {
    setSavingPage(true);
    try {
      const payload = {
        content: Object.fromEntries(
          SUPPORTED_LOCALES.map((loc) => [
            loc,
            {
              ...content[loc],
              heroImage: loc === "en-US" ? heroImage : content[loc]?.heroImage ?? heroImage,
              media_asset_id:
                loc === "en-US" ? heroAssetId : content[loc]?.media_asset_id ?? heroAssetId,
            },
          ]),
        ),
      };

      const res = await fetch("/api/partners-page", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.ok) {
        toast.error(typeof json.error === "string" ? json.error : "Couldn't save the page content.");
        return;
      }
      toast.success("Work With Us content saved");
      loadData();
    } finally {
      setSavingPage(false);
    }
  };

  const handleSaveAgreement = async () => {
    setSavingAgreement(true);
    try {
      const res = await fetch("/api/partners-page", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agreement_md: agreementMd }),
      });
      const json = await res.json();
      if (!json.ok) {
        toast.error(typeof json.error === "string" ? json.error : "Couldn't save the agreement.");
        return;
      }
      toast.success("Partner Agreement saved");
      loadData();
    } finally {
      setSavingAgreement(false);
    }
  };

  const openPartnerDialog = (partner?: PartnerRow) => {
    if (partner) {
      setPartnerForm({
        id: partner.id,
        name: partner.name,
        type: (partner.type ?? "partner") as LocationType,
        locations: toLocationDrafts(partner, branchMap.get(partner.id)),
        logo_url: partner.logo_url ?? "",
        media_asset_id: partner.media_asset_id ?? null,
        website_url: partner.website_url ?? "",
        description: partner.description ?? "",
        visible: partner.visible,
      });
    } else {
      setPartnerForm(emptyPartnerForm());
    }
    setPartnerDialogOpen(true);
  };

  const setMainLocation = (patch: Partial<LocationDraft>) =>
    setPartnerForm((f) => ({
      ...f,
      locations: f.locations.map((l, i) => (i === 0 ? { ...l, ...patch } : l)),
    }));

  const handleSavePartner = async () => {
    if (!partnerForm.name.trim()) {
      toast.error("Location name is required");
      return;
    }

    const isOwn = partnerForm.type === "own";
    // An own studio is one place; only a partner lists other clinics.
    const places = locationDraftsToPayload(isOwn ? partnerForm.locations.slice(0, 1) : partnerForm.locations);
    if (!places.ok) {
      toast.error(places.error);
      return;
    }
    const dropping = isOwn ? (branchMap.get(partnerForm.id ?? "")?.length ?? 0) : 0;
    if (
      dropping &&
      !confirm(`An own studio has one address. Remove this partner's other ${dropping} location${dropping === 1 ? "" : "s"}?`)
    ) {
      return;
    }
    setSavingPartner(true);
    try {
      const payload = {
        name: partnerForm.name.trim(),
        type: partnerForm.type,
        address: places.address,
        postal_code: places.postal_code,
        branch_name: isOwn ? null : places.branch_name,
        branches: isOwn ? [] : places.branches,
        // Own studios never show on /our-partners, so partner-only fields are cleared.
        logo_url: isOwn ? null : partnerForm.logo_url || null,
        media_asset_id: isOwn ? null : partnerForm.media_asset_id,
        website_url: isOwn ? null : partnerForm.website_url || null,
        description: isOwn ? null : partnerForm.description || null,
        visible: isOwn ? false : partnerForm.visible,
      };

      const res = partnerForm.id
        ? await fetch(`/api/partners/${partnerForm.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/partners", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

      const json = await res.json();
      if (!json.ok) {
        toast.error(errorText(json, "Couldn't save the location."));
        // The main location may have saved before its other clinics were refused.
        if (partnerForm.id) loadData();
        return;
      }

      toast.success(partnerForm.id ? "Location updated" : "Location added");
      setPartnerDialogOpen(false);
      loadData();
    } finally {
      setSavingPartner(false);
    }
  };

  const handleDeletePartner = async (id: string) => {
    const others = branchMap.get(id)?.length ?? 0;
    const prompt = others
      ? `Delete this partner and all ${others + 1} of its locations?`
      : "Delete this location?";
    if (!confirm(prompt)) return;
    const res = await fetch(`/api/partners/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (!json.ok) {
      toast.error(errorText(json, "Couldn't delete the location."));
      return;
    }
    toast.success("Location deleted");
    loadData();
  };

  const handleToggleVisibility = async (partner: PartnerRow) => {
    const res = await fetch(`/api/partners/${partner.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visible: !partner.visible }),
    });
    const json = await res.json();
    if (!json.ok) {
      toast.error("Couldn't update visibility.");
      return;
    }
    loadData();
  };

  // Only main rows are ordered here; each partner's branches keep their own order.
  const persistPartnerOrder = async (order: PartnerRow[]) => {
    setPartners([...order, ...partners.filter((p) => p.parent_id)]);
    const res = await fetch("/api/partners/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: order.map((p) => p.id) }),
    });
    const json = await res.json();
    if (!json.ok) {
      toast.error("Couldn't reorder.");
      loadData();
    }
  };

  const movePartner = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= mainRows.length) return;
    const order = [...mainRows];
    const [item] = order.splice(index, 1);
    order.splice(target, 0, item);
    void persistPartnerOrder(order);
  };

  const handlePartnerDragEnd = (event: SortableDragEndEvent) => {
    const order = sortableMove(mainRows, event, (p) => p.id);
    if (order) void persistPartnerOrder(order);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <h1 className="text-2xl font-semibold">Partners</h1>
          <InfoTip label="About Partners">
            Manage your studios and partner clinics, the Work With Us page and the
            Partner Agreement.
          </InfoTip>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={to("/our-partners")} target="_blank">
            <ExternalLink className="mr-2 h-4 w-4" />
            View page
          </Link>
        </Button>
      </div>

      <Tabs defaultValue="locations">
        <TabsList>
          <TabsTrigger value="locations">Partners</TabsTrigger>
          <TabsTrigger value="work-with-us">Work With Us</TabsTrigger>
          <TabsTrigger value="agreement">Agreement</TabsTrigger>
        </TabsList>

        <TabsContent value="work-with-us" className="space-y-6 pt-4">
          <div className="flex items-center gap-1 rounded-lg border p-1 w-fit">
            {SUPPORTED_LOCALES.map((loc) => (
              <button
                key={loc}
                type="button"
                onClick={() => setActiveLocale(loc)}
                className={`min-h-11 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeLocale === loc
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground active:bg-press"
                }`}
              >
                {loc === "en-US" ? "English" : "中文"}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {activeLocale === "en-US" ? (
              <div className="space-y-1.5">
                <Label>Hero image</Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={heroImage}
                    onChange={(e) => {
                      setHeroImage(e.target.value);
                      setHeroAssetId(null);
                    }}
                    placeholder="Image URL or pick from media…"
                    className="flex-1"
                  />
                  <ImagePicker
                    onSelect={(s) => {
                      setHeroImage(s.url);
                      setHeroAssetId(s.assetId);
                    }}
                  >
                    <Button type="button" variant="outline" size="sm">
                      Browse
                    </Button>
                  </ImagePicker>
                </div>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label>Title ({activeLocale})</Label>
              <Input
                value={activeContent.title ?? ""}
                onChange={(e) => updateActiveContent({ title: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Subtitle ({activeLocale})</Label>
              <Textarea
                value={activeContent.subtitle ?? ""}
                onChange={(e) => updateActiveContent({ subtitle: e.target.value })}
                rows={2}
              />
            </div>

            <div className="space-y-3">
              <Label>Benefit cards ({activeLocale})</Label>
              {(activeContent.benefitCards ?? []).slice(0, 3).map((card, idx) => (
                <div key={idx} className="space-y-2 rounded-lg border p-3">
                  <span className="text-xs text-muted-foreground">Card {idx + 1}</span>
                  <Input
                    value={card.title}
                    onChange={(e) => updateBenefitCard(idx, "title", e.target.value)}
                    placeholder="Title"
                  />
                  <Textarea
                    value={card.description}
                    onChange={(e) => updateBenefitCard(idx, "description", e.target.value)}
                    placeholder="Description"
                    rows={2}
                  />
                </div>
              ))}
            </div>

            <div
              className="space-y-1.5"
              data-color-mode={resolvedTheme === "dark" ? "dark" : "light"}
            >
              <Label>Body in Markdown ({activeLocale})</Label>
              <MDEditor
                value={activeContent.body ?? ""}
                onChange={(v) => updateActiveContent({ body: v ?? "" })}
                height={280}
                preview="edit"
                commands={isMobile ? MOBILE_MD_COMMANDS : undefined}
                extraCommands={isMobile ? MOBILE_MD_EXTRA_COMMANDS : undefined}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>CTA title ({activeLocale})</Label>
                <Input
                  value={activeContent.ctaTitle ?? ""}
                  onChange={(e) => updateActiveContent({ ctaTitle: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>CTA button label ({activeLocale})</Label>
                <Input
                  value={activeContent.ctaButtonLabel ?? ""}
                  onChange={(e) => updateActiveContent({ ctaButtonLabel: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>CTA subtitle ({activeLocale})</Label>
              <Textarea
                value={activeContent.ctaSubtitle ?? ""}
                onChange={(e) => updateActiveContent({ ctaSubtitle: e.target.value })}
                rows={2}
              />
            </div>

            <div className="space-y-1.5">
              <Label>CTA button URL</Label>
              <Input
                value={activeContent.ctaButtonUrl ?? "/partner/apply"}
                onChange={(e) => updateActiveContent({ ctaButtonUrl: e.target.value })}
                placeholder="/partner/apply"
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label>Show logo marquee</Label>
                <p className="text-xs text-muted-foreground">
                  Animated partner logo strip above the grid
                </p>
              </div>
              <Switch
                checked={activeContent.showMarquee ?? true}
                onCheckedChange={(checked) => updateActiveContent({ showMarquee: checked })}
              />
            </div>
          </div>

          <Button onClick={handleSavePage} disabled={savingPage}>
            {savingPage ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save Work With Us
          </Button>
        </TabsContent>

        <TabsContent value="locations" className="space-y-4 pt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {partners.length} location{partners.length === 1 ? "" : "s"}
            </p>
            <Button size="sm" onClick={() => openPartnerDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Add location
            </Button>
          </div>

          <DragDropProvider onDragEnd={handlePartnerDragEnd}>
            <div className="space-y-2">
              {mainRows.map((partner, index) => {
                const branches = branchMap.get(partner.id) ?? [];
                const mainAddress = formatLocationAddress(partner.address, partner.postal_code);
                return (
                  <SortableRow
                    key={partner.id}
                    id={partner.id}
                    index={index}
                    label={partner.name}
                    className="flex flex-wrap items-center gap-3 rounded-lg border p-3 max-md:flex-nowrap max-md:gap-1 max-md:px-1 max-md:py-1.5"
                  >
                    {(grip) => (
                      <>
                        {grip}
                        <div className="flex items-center gap-1 max-md:hidden">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="min-h-11 min-w-11"
                            disabled={index === 0}
                            onClick={() => movePartner(index, -1)}
                          >
                            <ChevronUp className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="min-h-11 min-w-11"
                            disabled={index === mainRows.length - 1}
                            onClick={() => movePartner(index, 1)}
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="flex h-10 w-16 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted max-md:hidden">
                          {partner.logo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={partner.logo_url}
                              alt=""
                              className="max-h-8 max-w-full object-contain"
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>

                        <div className="min-w-0 flex-1 max-md:py-1">
                          <div className="flex items-center gap-2 max-md:flex-wrap max-md:gap-x-2 max-md:gap-y-1">
                            <span className="font-medium max-md:break-words">{partner.name}</span>
                            <span className="shrink-0 whitespace-nowrap rounded border px-1.5 py-0.5 text-xs text-muted-foreground">
                              {partner.type === "own" ? "Own studio" : "Partner"}
                            </span>
                            {branches.length ? (
                              <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-xs text-muted-foreground">
                                <MapPin className="h-3 w-3" aria-hidden />
                                {branches.length + 1} locations
                              </span>
                            ) : null}
                            {partner.type !== "own" && !partner.visible ? (
                              <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground md:hidden">
                                Hidden
                              </span>
                            ) : null}
                          </div>
                          {branches.length ? (
                            <ul className="mt-0.5 space-y-0.5 text-sm text-muted-foreground">
                              {[partner, ...branches].map((place) => {
                                const line = formatLocationAddress(place.address, place.postal_code);
                                return (
                                  <li key={place.id} className="md:truncate max-md:break-words">
                                    {place.branch_name ? (
                                      <span className="text-foreground">{place.branch_name}: </span>
                                    ) : null}
                                    {line || "No address"}
                                  </li>
                                );
                              })}
                            </ul>
                          ) : mainAddress || partner.description ? (
                            <div className="text-sm text-muted-foreground md:truncate max-md:mt-0.5 max-md:break-words">
                              {mainAddress || partner.description}
                            </div>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-1 max-md:hidden">
                          {partner.type === "own" ? null : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleToggleVisibility(partner)}
                              title={partner.visible ? "Hide" : "Show"}
                            >
                              {partner.visible ? (
                                <Eye className="h-4 w-4" />
                              ) : (
                                <EyeOff className="h-4 w-4 text-muted-foreground" />
                              )}
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Edit ${partner.name}`}
                            onClick={() => openPartnerDialog(partner)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Delete ${partner.name}`}
                            onClick={() => handleDeletePartner(partner.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>

                        {/* Phones: one menu instead of five icons on two rows. Non-modal, so Edit can open the dialog. */}
                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-11 shrink-0 md:hidden"
                              aria-label={`Actions for ${partner.name}`}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-48">
                            <DropdownMenuItem className={menuItemClassName} onSelect={() => openPartnerDialog(partner)}>
                              <Pencil />
                              Edit
                            </DropdownMenuItem>
                            {partner.type === "own" ? null : (
                              <DropdownMenuItem
                                className={menuItemClassName}
                                onSelect={() => handleToggleVisibility(partner)}
                              >
                                {partner.visible ? <EyeOff /> : <Eye />}
                                {partner.visible ? "Hide from public page" : "Show on public page"}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              className={menuItemClassName}
                              disabled={index === 0}
                              onSelect={() => movePartner(index, -1)}
                            >
                              <ChevronUp />
                              Move up
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className={menuItemClassName}
                              disabled={index === mainRows.length - 1}
                              onSelect={() => movePartner(index, 1)}
                            >
                              <ChevronDown />
                              Move down
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              className={menuItemClassName}
                              onSelect={() => handleDeletePartner(partner.id)}
                            >
                              <Trash2 />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </>
                    )}
                  </SortableRow>
                );
              })}
            </div>
          </DragDropProvider>
        </TabsContent>

        <TabsContent value="agreement" className="space-y-4 pt-4">
          <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
            Current version{" "}
            <span className="font-medium text-foreground">{AGREEMENT_VERSION}</span>. Editing
            the copy here does not change the version. Bump{" "}
            <code className="text-xs">AGREEMENT_VERSION</code> in code to force partners to
            re-accept.
          </div>
          <div
            className="space-y-1.5"
            data-color-mode={resolvedTheme === "dark" ? "dark" : "light"}
          >
            <Label>
              Agreement in Markdown<span className="max-md:hidden"> (live preview)</span>
            </Label>
            <MDEditor
              value={agreementMd}
              onChange={(v) => setAgreementMd(v ?? "")}
              height={460}
              // Side-by-side halves are ~170px wide on a phone; the toolbar still toggles the preview.
              preview={isMobile ? "edit" : "live"}
              commands={isMobile ? MOBILE_MD_COMMANDS : undefined}
              extraCommands={isMobile ? MOBILE_MD_EXTRA_COMMANDS : undefined}
            />
          </div>
          <Button onClick={handleSaveAgreement} disabled={savingAgreement}>
            {savingAgreement ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save agreement
          </Button>
        </TabsContent>
      </Tabs>

      <Dialog open={partnerDialogOpen} onOpenChange={setPartnerDialogOpen}>
        <DialogContent className="md:max-h-[90dvh] md:overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{partnerForm.id ? "Edit location" : "Add location"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <div className="flex items-center gap-1 rounded-lg border p-1 w-fit">
                {(["own", "partner"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setPartnerForm((f) => ({ ...f, type: t }))}
                    className={`min-h-11 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      partnerForm.type === t
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground active:bg-press"
                    }`}
                  >
                    {t === "own" ? "Own studio" : "Partner"}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={partnerForm.name}
                onChange={(e) => setPartnerForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            {partnerForm.type === "own" ? (
              <>
                <div className="space-y-1.5">
                  <Label>Address</Label>
                  <Textarea
                    value={partnerForm.locations[0]?.address ?? ""}
                    onChange={(e) => setMainLocation({ address: e.target.value })}
                    rows={2}
                    placeholder="Street address"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Postal code</Label>
                  <Input
                    value={partnerForm.locations[0]?.postal_code ?? ""}
                    onChange={(e) => setMainLocation({ postal_code: e.target.value })}
                  />
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <div>
                  <Label>Locations</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Every clinic this partner runs. Each one shows on the public page and can be
                    picked for bookings and Results.
                  </p>
                </div>
                <PartnerLocationsFields
                  value={partnerForm.locations}
                  onChange={(locations) => setPartnerForm((f) => ({ ...f, locations }))}
                  idPrefix="partner-loc"
                />
              </div>
            )}

            {partnerForm.type === "partner" ? (
              <>
                <div className="space-y-1.5">
                  <Label>Logo</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={partnerForm.logo_url}
                      onChange={(e) =>
                        setPartnerForm((f) => ({ ...f, logo_url: e.target.value, media_asset_id: null }))
                      }
                      placeholder="Image URL…"
                      className="flex-1"
                    />
                    <ImagePicker
                      onSelect={(s) =>
                        setPartnerForm((f) => ({
                          ...f,
                          logo_url: s.url,
                          media_asset_id: s.assetId,
                        }))
                      }
                    >
                      <Button type="button" variant="outline" size="sm">
                        Browse
                      </Button>
                    </ImagePicker>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Website URL</Label>
                  <Input
                    value={partnerForm.website_url}
                    onChange={(e) => setPartnerForm((f) => ({ ...f, website_url: e.target.value }))}
                    placeholder="https://…"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Short description</Label>
                  <Textarea
                    value={partnerForm.description}
                    onChange={(e) => setPartnerForm((f) => ({ ...f, description: e.target.value }))}
                    rows={2}
                  />
                </div>
                <div className="flex items-center justify-between max-md:min-h-11">
                  <Label htmlFor="partner-visible">Visible on public page</Label>
                  <Switch
                    id="partner-visible"
                    checked={partnerForm.visible}
                    onCheckedChange={(checked) => setPartnerForm((f) => ({ ...f, visible: checked }))}
                  />
                </div>
              </>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPartnerDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSavePartner} disabled={savingPartner}>
              {savingPartner ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
