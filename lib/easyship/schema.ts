import { z } from "zod";

/** Pure: shared by the settings UI, the API route and the sync. No server imports. */

export const WEBHOOK_PATH = "/api/shipping/easyship/webhook";

export const TRACKING_STATUSES = [
  "in_transit",
  "out_for_delivery",
  "unsuccessful_delivery_attempt",
  "delivered",
  "exception",
] as const;

export const AD_TITLES = [
  "Call Now", "Book Now", "Buy Now", "Contact Us", "Learn More", "See Offer",
  "Sign Up", "Shop Now", "Use App", "Visit Us", "Leave a Review", "Leave a Comment",
] as const;

export const WEBHOOK_EVENTS = [
  "shipment_label_created",
  "shipment_label_failed",
  "shipment_cancelled",
  "shipment_tracking_checkpoints_created",
  "shipment_tracking_status_changed",
  "shipment_warehouse_state_updated",
  "batch_started",
  "batch_item_finished",
  "batch_finished",
  "credit_balance_low",
  "external_shipment_insured",
  "courier_state_changed",
  "transaction_record_create",
  "oauth_authorization_revoked",
] as const;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "HEX colour like #50D4A4");
const Button = z.object({ background_color: hex, text_color: hex });
const Advertising = z.object({ title: z.enum(AD_TITLES), url: z.string().url() }).nullable();

export const TrackingEmailSchema = z.object({
  display_options: z.object({ header: z.boolean(), contact: z.boolean() }),
  allowed_statuses: z.array(z.enum(TRACKING_STATUSES)).max(5),
  button: Button,
  footnote: z.string().max(350),
  advertising: Advertising,
});

export const TrackingPageSchema = z.object({
  display_options: z.object({
    header: z.boolean(),
    estimated_delivery_time: z.boolean(),
    status_icon: z.boolean(),
    contact_courier: z.boolean(),
    contact: z.boolean(),
  }),
  button: Button,
  footnote: z.string().max(350),
  advertising: Advertising,
});

export const DefaultForSchema = z.object({
  sender: z.boolean(),
  return: z.boolean(),
  pickup: z.boolean(),
  billing: z.boolean(),
});

export const AddressSchema = z.object({
  line_1: z.string().trim().min(1).max(35),
  line_2: z.string().trim().max(35).nullable(),
  city: z.string().trim().min(1).max(200),
  state: z.string().trim().max(200).nullable(),
  postal_code: z.string().trim().max(20).nullable(),
  country_alpha2: z.string().trim().length(2).toUpperCase(),
  company_name: z.string().trim().min(1).max(27),
  contact_name: z.string().trim().min(1).max(22),
  contact_phone: z.string().trim().min(1).max(20),
  contact_email: z.string().trim().email().max(50),
  default_for: DefaultForSchema,
});

export const BoxSchema = z.object({
  name: z.string().trim().min(1).max(100),
  outer_length: z.number().positive(),
  outer_width: z.number().positive(),
  outer_height: z.number().positive(),
  weight: z.number().nonnegative(),
});

/** Which box an item type ships in, plus one unit's content weight. Kept on the doc only; never synced. */
export const BOX_TYPES = ["pillow", "bolster", "accessory"] as const;
const BoxForTypeSchema = z.object({ box: z.string().trim().min(1), weight_grams: z.number().int().positive().max(70_000) });
export const BoxForTypesSchema = z
  .object({ pillow: BoxForTypeSchema, bolster: BoxForTypeSchema, accessory: BoxForTypeSchema })
  .partial();

export const RuleClauseSchema = z.object({
  type: z.string().trim().min(1),
  options: z.record(z.string(), z.unknown()),
});

export const ShippingRuleSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(1000),
  priority: z.number().int().nonnegative(),
  active: z.boolean(),
  conditions: z.array(RuleClauseSchema).min(1),
  actions: z.array(RuleClauseSchema).min(1),
});

export const WebhookSettingsSchema = z.object({
  enabled: z.boolean(),
  event_types: z.array(z.string().trim().min(1)).min(1),
});

export const EasyshipSettingsSchema = z.object({
  tracking_email: TrackingEmailSchema,
  tracking_page: TrackingPageSchema,
  addresses: z.array(AddressSchema),
  boxes: z.array(BoxSchema),
  box_for_type: BoxForTypesSchema.default({}),
  shipping_rules: z.array(ShippingRuleSchema),
  webhook: WebhookSettingsSchema,
});

/** What a save accepts: also refuses repeated box names, which "Used for" can't tell apart. Reads stay lenient. */
export const EasyshipSettingsInputSchema = EasyshipSettingsSchema.refine(
  (s) => new Set(s.boxes.map((b) => b.name.trim().toLowerCase())).size === s.boxes.length,
  { message: "Box names must be unique", path: ["boxes"] },
);

export type EasyshipSettings = z.infer<typeof EasyshipSettingsSchema>;
export type EasyshipAddress = z.infer<typeof AddressSchema>;
export type EasyshipBox = z.infer<typeof BoxSchema>;
export type BoxForTypes = z.infer<typeof BoxForTypesSchema>;
export type EasyshipShippingRule = z.infer<typeof ShippingRuleSchema>;
export type RuleClause = z.infer<typeof RuleClauseSchema>;

export const DEFAULT_SETTINGS: EasyshipSettings = {
  tracking_email: {
    display_options: { header: false, contact: false },
    allowed_statuses: [],
    button: { background_color: "#50D4A4", text_color: "#FFFFFF" },
    footnote: "",
    advertising: null,
  },
  tracking_page: {
    display_options: {
      header: true,
      estimated_delivery_time: true,
      status_icon: true,
      contact_courier: true,
      contact: true,
    },
    button: { background_color: "#50D4A4", text_color: "#FFFFFF" },
    footnote: "",
    advertising: null,
  },
  addresses: [],
  boxes: [],
  box_for_type: {},
  shipping_rules: [],
  webhook: {
    enabled: false,
    event_types: [
      "shipment_label_created",
      "shipment_label_failed",
      "shipment_tracking_status_changed",
      "shipment_tracking_checkpoints_created",
    ],
  },
};

/* ── Live Easyship shapes (the subset the sync and import read) ─────────── */

export type LiveAddress = EasyshipAddress & { id: string; status: "active" | "inactive" };
export type LiveBox = {
  id: string;
  name: string;
  type: "box" | "flat_rate_box";
  outer_dimensions: { length: number; width: number; height: number };
  weight: number;
};
export type LiveRule = {
  id: string;
  name: string;
  description: string | null;
  priority: number;
  active: boolean;
  conditions: Array<RuleClause & { id: string }>;
  actions: Array<RuleClause & { id: string }>;
};
export type LiveWebhook = {
  id: string;
  endpoint: string;
  event_types: string[];
  version: string;
  state: "active" | "inactive" | "failed";
  secret_token: string | null;
};
export type LiveSnapshot = {
  account: { name: string; easyship_company_id: string } | null;
  setting: { tracking_email: unknown; tracking_page: unknown } | null;
  addresses: LiveAddress[];
  boxes: LiveBox[];
  shipping_rules: LiveRule[];
  webhooks: LiveWebhook[];
};

export const COMPARE_OPERATORS = [
  "greater_than", "greater_than_or_equal_to", "less_than", "less_than_or_equal_to", "equal_to",
] as const;
const TEXT_OPERATORS = ["contains", "does_not_contain", "is_exactly"] as const;

export type RefKind = "country" | "courier_service" | "box" | "flat_rate_box" | "address" | "store" | "category";
export type OptionField = {
  key: string;
  kind: "text" | "number" | "boolean" | "text-list" | "enum" | "enum-list" | "ref" | "ref-list";
  enum?: readonly (string | number)[];
  ref?: RefKind;
  label?: string;
  optional?: boolean;
};

/** Condition type → option fields, from the 2024-09 ShippingRuleCreate schema. */
export const RULE_CONDITIONS: Record<string, OptionField[]> = {
  match_all: [],
  match_country: [{ key: "country_ids", kind: "ref-list", ref: "country", label: "Destination countries" }],
  match_state: [{ key: "states", kind: "text-list", label: "States (countryId-ABBR, e.g. 39-AB)" }],
  match_zipcode: [
    { key: "operator", kind: "enum", enum: ["is_any_of", "is_none_of", "starts_with"] },
    { key: "zipcodes", kind: "text-list" },
  ],
  match_sku: [
    { key: "operator", kind: "enum", enum: TEXT_OPERATORS },
    { key: "shipment_items_sku", kind: "text-list", label: "SKUs" },
  ],
  match_category: [{ key: "category_ids", kind: "ref-list", ref: "category" }],
  match_platform_name: [{ key: "platform_names", kind: "text-list" }],
  match_store: [{ key: "store_ids", kind: "ref-list", ref: "store" }],
  match_buyer_selected_courier_name: [
    { key: "operator", kind: "enum", enum: TEXT_OPERATORS },
    { key: "buyer_selected_courier_name", kind: "text" },
  ],
  match_items_count: [
    { key: "operator", kind: "enum", enum: COMPARE_OPERATORS },
    { key: "shipment_items_count", kind: "number" },
  ],
  match_selling_price: [
    { key: "operator", kind: "enum", enum: COMPARE_OPERATORS },
    { key: "value", kind: "number" },
    { key: "currency", kind: "text", label: "Currency (e.g. SGD)" },
  ],
  match_weight: [
    { key: "operator", kind: "enum", enum: COMPARE_OPERATORS },
    { key: "total_actual_weight", kind: "number", label: "Total weight (kg)" },
  ],
  include_order_tag_name: [{ key: "order_tag_list", kind: "text-list", label: "Order tags" }],
};

/** Action type → option fields, from the 2024-09 ShippingRuleCreate schema. */
export const RULE_ACTIONS: Record<string, OptionField[]> = {
  add_never_courier_service: [{ key: "never_courier_service_ids", kind: "ref-list", ref: "courier_service" }],
  add_preferred_courier_service: [{ key: "preferred_courier_service_ids", kind: "ref-list", ref: "courier_service" }],
  force_incoterms: [{ key: "incoterms", kind: "enum", enum: ["DDP", "DDU", "DDU_and_Best_DDP", "DDP_and_Best_DDU"] }],
  force_sort_by: [{ key: "sort_by", kind: "enum", enum: ["total_charge", "delivery_time_rank", "value_for_money_rank"] }],
  force_insurance: [{ key: "insured", kind: "boolean" }],
  force_tracking_rating: [{ key: "force_tracking_rating", kind: "enum-list", enum: [-1, 0, 1, 2, 3], label: "Allowed tracking ratings" }],
  force_package: [
    { key: "force_box_id", kind: "ref", ref: "box", optional: true, label: "Custom box" },
    { key: "force_flat_rate_box_id", kind: "ref", ref: "flat_rate_box", optional: true, label: "Flat-rate box" },
  ],
  reject_packages: [{ key: "never_package_ids", kind: "ref-list", ref: "box", label: "Boxes to exclude" }],
  force_residential_surcharge: [{ key: "set_as_residential", kind: "boolean" }],
  force_ship_from: [{ key: "origin_address_id", kind: "ref", ref: "address" }],
  force_automated_return_requested: [{ key: "force_automated_return_requested", kind: "boolean" }],
  add_forced_delivery_time: [
    { key: "operator", kind: "enum", enum: ["less_than", "less_than_or_equal_to", "greater_than_or_equal_to", "greater_than"] },
    { key: "value", kind: "number", label: "Days" },
  ],
};

const asStr = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const asBool = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);

function importTracking<T extends { display_options: Record<string, boolean>; button: { background_color: string; text_color: string }; footnote: string; advertising: { title: string; url: string } | null }>(
  live: unknown,
  base: T,
): T {
  const l = (live ?? {}) as Record<string, unknown>;
  const dopts = (l.display_options ?? {}) as Record<string, unknown>;
  const btn = (l.button ?? {}) as Record<string, unknown>;
  const ad = l.advertising as { title?: unknown; url?: unknown } | null | undefined;
  const display_options = Object.fromEntries(
    Object.entries(base.display_options).map(([k, v]) => [k, asBool(dopts[k], v)]),
  ) as T["display_options"];
  return {
    ...base,
    display_options,
    button: {
      background_color: asStr(btn.background_color, base.button.background_color),
      text_color: asStr(btn.text_color, base.button.text_color),
    },
    footnote: asStr(l.footnote, base.footnote),
    advertising:
      ad && typeof ad.title === "string" && typeof ad.url === "string" ? { title: ad.title, url: ad.url } : null,
  } as T;
}

/** Seeds the desired state from what Easyship holds today. Strays (no default flag) are not imported. */
export function importFromLive(live: LiveSnapshot, origin: string | null): EasyshipSettings {
  const setting = (live.setting ?? {}) as { tracking_email?: unknown; tracking_page?: unknown };
  const email = importTracking(setting.tracking_email, DEFAULT_SETTINGS.tracking_email);
  const statuses = (setting.tracking_email as { allowed_statuses?: unknown } | undefined)?.allowed_statuses;
  const endpoint = origin ? `${origin}${WEBHOOK_PATH}` : null;
  const webhook = live.webhooks.find((w) => w.endpoint === endpoint) ?? live.webhooks[0] ?? null;
  const parsed = EasyshipSettingsSchema.safeParse({
    tracking_email: {
      ...email,
      allowed_statuses: Array.isArray(statuses) ? statuses : [],
    },
    tracking_page: importTracking(setting.tracking_page, DEFAULT_SETTINGS.tracking_page),
    addresses: live.addresses
      .filter((a) => a.status === "active" && Object.values(a.default_for ?? {}).some(Boolean))
      .map((a) => ({
        line_1: a.line_1, line_2: a.line_2 ?? null, city: a.city, state: a.state ?? null,
        postal_code: a.postal_code ?? null, country_alpha2: a.country_alpha2,
        company_name: a.company_name ?? "", contact_name: a.contact_name ?? "",
        contact_phone: a.contact_phone ?? "", contact_email: a.contact_email ?? "",
        default_for: {
          sender: !!a.default_for?.sender, return: !!a.default_for?.return,
          pickup: !!a.default_for?.pickup, billing: !!a.default_for?.billing,
        },
      })),
    boxes: live.boxes
      .filter((b) => b.type === "box")
      .map((b) => ({
        name: b.name, outer_length: b.outer_dimensions.length, outer_width: b.outer_dimensions.width,
        outer_height: b.outer_dimensions.height, weight: b.weight ?? 0,
      })),
    shipping_rules: live.shipping_rules.map((r) => ({
      name: r.name, description: r.description ?? "", priority: r.priority ?? 0, active: !!r.active,
      conditions: r.conditions.map(({ type, options }) => ({ type, options: options ?? {} })),
      actions: r.actions.map(({ type, options }) => ({ type, options: options ?? {} })),
    })),
    webhook: webhook
      ? { enabled: webhook.state === "active", event_types: webhook.event_types }
      : DEFAULT_SETTINGS.webhook,
  });
  if (!parsed.success) throw new Error(`Easyship import did not validate: ${parsed.error.message}`);
  return parsed.data;
}

/** Ids the shipping-rule editor picks from; served by /api/settings/easyship/reference. */
export type EasyshipReference = {
  countries: { id: number; alpha2: string; name: string }[];
  courier_services: { id: string; name: string; umbrella_name: string }[];
  boxes: { id: string; name: string; type: "box" | "flat_rate_box" }[];
  addresses: { id: string; label: string }[];
  stores: { id: string; name: string }[];
  categories: { id: string; name: string }[];
};

/** The courier account has no type → box mapping: keep ours, and the boxes it names that the account lacks. */
export function keepMappedBoxes(
  current: Pick<EasyshipSettings, "boxes" | "box_for_type">,
  imported: EasyshipSettings["boxes"],
): Pick<EasyshipSettings, "boxes" | "box_for_type"> {
  const key = (n: string) => n.trim().toLowerCase();
  const have = new Set(imported.map((b) => key(b.name)));
  const mapped = new Set(Object.values(current.box_for_type).map((m) => key(m!.box)));
  const kept = current.boxes.filter((b) => mapped.has(key(b.name)) && !have.has(key(b.name)));
  return { boxes: [...imported, ...kept], box_for_type: current.box_for_type };
}
