// ============================================================
// E-Commerce Type Definitions
// ============================================================

// --- Status & Enum Types ---

export type ProductStatus = "draft" | "active" | "archived";
export type ProductType = "pillow" | "bolster" | "accessory" | "bundle";
export type OrderStatus = "pending" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled" | "refunded" | "partially_refunded" | "payment_failed" | "disputed";
export type DiscountType = "percentage" | "fixed_amount" | "free_shipping";
export type ReviewStatus = "pending" | "approved" | "rejected";
// CollectionType removed — collections dropped in migration 0029

// --- Localized Content ---

export interface LocalizedProductContent {
  title: string;
  description?: string;
  body?: string;
  seo_title?: string;
  seo_description?: string;
  seo_keywords?: string[];
}

export interface LocalizedCategoryContent {
  name: string;
  description?: string;
}

// LocalizedCollectionContent removed — collections dropped

export interface LocalizedShippingContent {
  name: string;
  description?: string;
  estimated_days?: string;
}

// --- Categories ---

export interface ProductCategory {
  id: string;
  parent_id: string | null;
  slug: string;
  content: Record<string, LocalizedCategoryContent>;
  image_url: string | null;
  position: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  children?: ProductCategory[];
}

// --- Products ---

export interface Product {
  id: string;
  slug: string;
  product_type: ProductType;
  status: ProductStatus;
  content: Record<string, LocalizedProductContent>;
  category_id: string | null;
  featured: boolean;
  tags: string[];
  stripe_product_id: string | null;
  stripe_payment_link: string | null;
  stripe_payment_link_id: string | null;
  is_auto_generated: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined data (optional, populated by queries)
  variants?: ProductVariant[];
  images?: ProductImage[];
  options?: ProductOption[];
  category?: ProductCategory | null;
}

export interface ProductOption {
  id: string;
  product_id: string;
  name: string;
  position: number;
  values: string[];
}

export interface ProductVariant {
  id: string;
  product_id: string;
  sku: string | null;
  title: string | null;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  price: number;
  compare_at_price: number | null;
  cost_price: number | null;
  currency: string;
  stock_quantity: number;
  track_inventory: boolean;
  weight_grams: number | null;
  image_url: string | null;
  is_active: boolean;
  position: number;
  stripe_price_id: string | null;
  item_id: number | null;
  pillow_product_id: number | null;
  price_key: string | null;
  shopify_variant_id: number | null;
  created_at: string;
  updated_at: string;
  // Joined data
  stock_available?: number;
}

export interface ProductImage {
  id: string;
  product_id: string;
  variant_id: string | null;
  url: string;
  alt_text: string | null;
  position: number;
  created_at: string;
}

// --- Customers ---

export interface Customer {
  id: string;
  email: string;
  auth_user_id: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  locale: string;
  tags: string[];
  notes: string | null;
  total_orders: number;
  total_spent: number;
  created_at: string;
  updated_at: string;
  addresses?: CustomerAddress[];
}

export interface CustomerAddress {
  id: string;
  customer_id: string;
  label: string | null;
  recipient: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string | null;
  postal_code: string;
  country: string;
  phone: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

// --- Cart ---

export interface Cart {
  id: string;
  token: string;
  customer_id: string | null;
  currency: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
  items?: CartItem[];
}

export interface CartItem {
  id: string;
  cart_id: string;
  variant_id: string;
  quantity: number;
  added_at: string;
  customization_id?: string | null;
  // Joined data for display
  variant?: ProductVariant;
  product?: Product;
}

// Client-side cart item (for React context / localStorage)
export interface CartItemClient {
  variantId: string;
  productId: string;
  productSlug: string;
  productTitle: string;
  variantTitle: string | null;
  imageUrl: string | null;
  price: number;
  compareAtPrice: number | null;
  currency: string;
  quantity: number;
  customizationId?: string;
  customizationSummary?: string;
  addonPrice?: number;
}

// --- Orders ---

export interface Order {
  id: string;
  order_number: string;
  customer_id: string | null;
  email: string;
  phone: string | null;
  status: OrderStatus;
  currency: string;
  subtotal: number;
  shipping_amount: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
  amount_captured?: number;
  amount_refunded?: number;
  shipping_address: ShippingAddress;
  billing_address: ShippingAddress | null;
  shipping_method_id: string | null;
  coupon_id: string | null;
  coupon_code: string | null;
  notes: string | null;
  internal_notes: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  paid_at: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  shopify_order_id: number | null;
  stripe_session_id: string | null;
  locale: string;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
  timeline?: OrderTimelineEvent[];
  customer?: Customer | null;
}

export interface OrderItemCustomizationSnapshot {
  config_lines?: import("./customization").ConfigLine[];
  filling_lines?: import("./customization").FillingLine[];
  total_addon_price?: number;
  summary?: string;
  pillow_product_id?: number;
}

export interface OrderItem {
  id: string;
  order_id: string;
  variant_id: string | null;
  sku: string;
  product_title: string;
  variant_title: string | null;
  image_url: string | null;
  quantity: number;
  returned_quantity?: number;
  unit_price: number;
  total_price: number;
  unit_cost?: number | null;
  total_cost?: number | null;
  customization_id?: string | null;
  customization_snapshot?: OrderItemCustomizationSnapshot | null;
  created_at: string;
}

/** Per-order realized margin from `order_margins` view. */
export interface OrderMargin {
  order_id: string;
  order_number: string;
  revenue: number;
  discount: number;
  shipping: number;
  tax: number;
  cogs: number;
  net_revenue: number;
  gross_margin: number;
  margin_pct: number | null;
}

export interface OrderTimelineEvent {
  id: string;
  order_id: string;
  event_type: string;
  message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ShippingAddress {
  recipient: string;
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postal_code: string;
  country: string;
  phone?: string;
}

// --- Coupons ---

export interface Coupon {
  id: string;
  code: string;
  discount_type: DiscountType;
  discount_value: number;
  currency: string;
  min_order_amount: number | null;
  max_discount: number | null;
  usage_limit: number | null;
  usage_count: number;
  per_customer_limit: number | null;
  starts_at: string | null;
  expires_at: string | null;
  applies_to: { product_ids?: string[]; category_ids?: string[] } | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// --- Shipping ---

export interface ShippingMethod {
  id: string;
  slug: string;
  content: Record<string, LocalizedShippingContent>;
  base_rate: number;
  free_above: number | null;
  currency: string;
  countries: string[];
  is_active: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

// --- Reviews ---

export interface ProductReview {
  id: string;
  product_id: string;
  customer_id: string | null;
  order_id: string | null;
  author_name: string;
  rating: number;
  title: string | null;
  body: string | null;
  status: ReviewStatus;
  created_at: string;
  updated_at: string;
}

// (Wishlists removed — tables dropped in migration 0029)
