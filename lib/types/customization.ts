// ============================================================
// Pillow Customization Type Definitions
// ============================================================

// --- Filling & Config Lines ---

export interface FillingLine {
  item_id: number;
  subtype: string;
  name: string;
  quantity: number;
}

export interface ConfigLine {
  item_id: number;
  category: string;
  subtype?: string;
  name: string;
  size?: string;
  quantity: number;
  is_addon: boolean;
  price_delta: number;
}

// --- Customer Preferences (input to LLM — simple form) ---

export interface CustomerPreferences {
  sleep_position: "side" | "back" | "stomach" | "mixed";
  body_type: "petite" | "average" | "large";
  firmness: "soft" | "medium-soft" | "medium" | "medium-firm" | "firm";
  notes?: string;
}

// --- Measurement-Based Preferences (input from mp-config wizard) ---

export interface MeasurementBasedPreferences {
  measurements: {
    shoulder_length_cm: number;
    neck_to_back_cm: number;
    head_to_back_cm: number;
    neck_length_cm: number;
  };
  demographics: {
    gender: string;
    age_group: string;
  };
  health: {
    blood_pressure: string;
    ear_discomfort_side_sleep: boolean;
    bed_firmness: string;
    acid_reflux: boolean;
    sleep_pain_areas: string[];
    sleep_position_type: string[];
    uses_bolster: boolean;
  };
}

// --- Bolster Preferences (input from mbolster-config wizard) ---

export interface BolsterPreferences {
  height_cm: number;
  sleep_position: string;
}

// --- LLM Output ---

export interface CustomizationResult {
  recommended_size: string;
  recommended_kind: string;
  filling_lines: FillingLine[];
  summary: string;
  explanation: string;
}

// --- Available Component Options (returned to frontend) ---

export interface ComponentOption {
  item_id: number;
  category: string;
  name: string;
  subtype?: string;
  size?: string;
  stock_available: number;
  unit_price: number;
  base_quantity: number;
}

// --- Upsell ---

export interface UpsellItem {
  item_id: number;
  name: string;
  discount_pct: number;
  original_price: number;
  price: number;
  quantity: number;
}

// --- Full Customization Order (sent from frontend) ---

export type CustomizationProductType = "pillow" | "bolster";
export type BolsterVariant = "short" | "medium" | "long";

export interface CustomizationOrder {
  variant_id: string;
  product_type?: CustomizationProductType;
  pillow_product_id?: number;
  bolster_variant?: BolsterVariant;
  ecom_product_id?: string;
  filling_lines: FillingLine[];
  cover_variant: string;
  case_variant: string;
  component_quantities: ConfigLine[];
  upsells: UpsellItem[];
  total_addon_price: number;
  llm_metadata?: Record<string, unknown>;
}

// --- Stored Config (from DB) ---

export interface CustomizationConfig {
  id: string;
  product_type: CustomizationProductType;
  pillow_product_id: number | null;
  bolster_variant: BolsterVariant | null;
  ecom_product_id: string | null;
  bom_template_id: number | null;
  config_lines: ConfigLine[];
  filling_lines: FillingLine[];
  cover_variant: string | null;
  case_variant: string | null;
  llm_metadata: Record<string, unknown>;
  summary: string | null;
  total_addon_price: number;
  created_at: string;
}

// --- API Config (from DB) ---

export interface ApiConfig {
  id: string;
  slug: string;
  name: string;
  base_url: string | null;
  api_key: string | null;
  config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
