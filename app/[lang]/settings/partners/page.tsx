"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
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
import { ImagePicker } from "@/components/ui/image-picker";
import { Switch } from "@/components/ui/switch";
import { DEFAULT_WORK_WITH_US, type PartnerRow, type WorkWithUsContent } from "@/lib/partners/types";
import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/locales";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { usePathname } from "next/navigation";

const MDEditor = dynamic(
  () => import("@uiw/react-md-editor").then((mod) => mod.default),
  { ssr: false },
);

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
    ctaButtonUrl: "/support",
    showMarquee: true,
  };
}

type PartnerForm = {
  id?: string;
  name: string;
  logo_url: string;
  website_url: string;
  description: string;
  visible: boolean;
};

const emptyPartnerForm = (): PartnerForm => ({
  name: "",
  logo_url: "",
  website_url: "",
  description: "",
  visible: true,
});

export default function PartnersSettingsPage() {
  const pathname = usePathname() ?? "/";
  const locale = getLocaleFromPathname(pathname) ?? "en-US";
  const to = (href: string) => withLocale(href, locale as Locale);
  const { resolvedTheme } = useTheme();

  const [loading, setLoading] = useState(true);
  const [savingPage, setSavingPage] = useState(false);
  const [activeLocale, setActiveLocale] = useState<Locale>("en-US");
  const [content, setContent] = useState<Record<string, WorkWithUsContent>>({});
  const [heroImage, setHeroImage] = useState("");

  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [partnerDialogOpen, setPartnerDialogOpen] = useState(false);
  const [partnerForm, setPartnerForm] = useState<PartnerForm>(emptyPartnerForm);
  const [savingPartner, setSavingPartner] = useState(false);

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

      const merged: Record<string, WorkWithUsContent> = {};
      for (const loc of SUPPORTED_LOCALES) {
        merged[loc] = {
          ...emptyWorkWithUs(),
          ...DEFAULT_WORK_WITH_US[loc],
          ...(pageJson.row?.content?.[loc] ?? {}),
        };
      }
      setContent(merged);

      const enHero = pageJson.row?.content?.["en-US"]?.heroImage ?? "";
      setHeroImage(enHero);

      if (partnersJson.ok) {
        setPartners(partnersJson.partners ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
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
        toast.error(typeof json.error === "string" ? json.error : "Failed to save page content");
        return;
      }
      toast.success("Work With Us content saved");
      loadData();
    } finally {
      setSavingPage(false);
    }
  };

  const openPartnerDialog = (partner?: PartnerRow) => {
    if (partner) {
      setPartnerForm({
        id: partner.id,
        name: partner.name,
        logo_url: partner.logo_url ?? "",
        website_url: partner.website_url ?? "",
        description: partner.description ?? "",
        visible: partner.visible,
      });
    } else {
      setPartnerForm(emptyPartnerForm());
    }
    setPartnerDialogOpen(true);
  };

  const handleSavePartner = async () => {
    if (!partnerForm.name.trim()) {
      toast.error("Partner name is required");
      return;
    }

    setSavingPartner(true);
    try {
      const payload = {
        name: partnerForm.name.trim(),
        logo_url: partnerForm.logo_url || null,
        website_url: partnerForm.website_url || null,
        description: partnerForm.description || null,
        visible: partnerForm.visible,
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
        toast.error(typeof json.error === "string" ? json.error : "Failed to save partner");
        return;
      }

      toast.success(partnerForm.id ? "Partner updated" : "Partner added");
      setPartnerDialogOpen(false);
      loadData();
    } finally {
      setSavingPartner(false);
    }
  };

  const handleDeletePartner = async (id: string) => {
    if (!confirm("Delete this partner?")) return;
    const res = await fetch(`/api/partners/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (!json.ok) {
      toast.error("Failed to delete partner");
      return;
    }
    toast.success("Partner deleted");
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
      toast.error("Failed to update visibility");
      return;
    }
    loadData();
  };

  const movePartner = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= partners.length) return;
    const order = [...partners];
    const [item] = order.splice(index, 1);
    order.splice(target, 0, item);

    const res = await fetch("/api/partners/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: order.map((p) => p.id) }),
    });
    const json = await res.json();
    if (!json.ok) {
      toast.error("Failed to reorder");
      return;
    }
    setPartners(order);
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
        <div>
          <h1 className="text-2xl font-semibold">Partners Page</h1>
          <p className="text-sm text-muted-foreground">
            Edit the Work With Us section and partner logos shown on the public page.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={to("/our-partners")} target="_blank">
            <ExternalLink className="mr-2 h-4 w-4" />
            View page
          </Link>
        </Button>
      </div>

      <Tabs defaultValue="work-with-us">
        <TabsList>
          <TabsTrigger value="work-with-us">Work With Us</TabsTrigger>
          <TabsTrigger value="logos">Partner Logos</TabsTrigger>
        </TabsList>

        <TabsContent value="work-with-us" className="space-y-6 pt-4">
          <div className="flex items-center gap-1 rounded-lg border p-1 w-fit">
            {SUPPORTED_LOCALES.map((loc) => (
              <button
                key={loc}
                type="button"
                onClick={() => setActiveLocale(loc)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeLocale === loc
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
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
                    onChange={(e) => setHeroImage(e.target.value)}
                    placeholder="Image URL or pick from media..."
                    className="flex-1"
                  />
                  <ImagePicker onSelect={(s) => setHeroImage(s.url)}>
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
              <Label>Body — markdown ({activeLocale})</Label>
              <MDEditor
                value={activeContent.body ?? ""}
                onChange={(v) => updateActiveContent({ body: v ?? "" })}
                height={280}
                preview="live"
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
                value={activeContent.ctaButtonUrl ?? "/support"}
                onChange={(e) => updateActiveContent({ ctaButtonUrl: e.target.value })}
                placeholder="/support"
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

        <TabsContent value="logos" className="space-y-4 pt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {partners.length} partner{partners.length === 1 ? "" : "s"}
            </p>
            <Button size="sm" onClick={() => openPartnerDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Add partner
            </Button>
          </div>

          <div className="space-y-2">
            {partners.map((partner, index) => (
              <div
                key={partner.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
              >
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={index === 0}
                    onClick={() => movePartner(index, -1)}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={index === partners.length - 1}
                    onClick={() => movePartner(index, 1)}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </div>

                <div className="flex h-10 w-16 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted">
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

                <div className="min-w-0 flex-1">
                  <div className="font-medium">{partner.name}</div>
                  {partner.description ? (
                    <div className="truncate text-sm text-muted-foreground">{partner.description}</div>
                  ) : null}
                </div>

                <div className="flex items-center gap-1">
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => openPartnerDialog(partner)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeletePartner(partner.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={partnerDialogOpen} onOpenChange={setPartnerDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{partnerForm.id ? "Edit partner" : "Add partner"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={partnerForm.name}
                onChange={(e) => setPartnerForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Logo</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={partnerForm.logo_url}
                  onChange={(e) => setPartnerForm((f) => ({ ...f, logo_url: e.target.value }))}
                  placeholder="Image URL..."
                  className="flex-1"
                />
                <ImagePicker onSelect={(s) => setPartnerForm((f) => ({ ...f, logo_url: s.url }))}>
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
                placeholder="https://..."
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
            <div className="flex items-center justify-between">
              <Label>Visible on public page</Label>
              <Switch
                checked={partnerForm.visible}
                onCheckedChange={(checked) => setPartnerForm((f) => ({ ...f, visible: checked }))}
              />
            </div>
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
