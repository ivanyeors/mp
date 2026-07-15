# Graph Report - .  (2026-07-15)

## Corpus Check
- 539 files · ~294,836 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3125 nodes · 7679 edges · 164 communities (154 shown, 10 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 38 edges (avg confidence: 0.66)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Appointment & Scheduling API
- Results SLA & Cron Jobs
- mBolster Config Client
- Shop Products & Inventory
- Auth, Discovery & Account Pages
- FAQ Category Management API
- Inventory Configuration UI
- FAQ Items & Page Sets API
- Pillow Maker Builder Components
- Inventory Actions & Shopify Sales
- Media Assets API
- Landing Sections & Photos
- Order Lifecycle Management
- Costing & Pricing Settings
- Admin Panel & Users
- Blog Management API
- Orders Dashboard & Lookup
- Inventory Item CRUD Actions
- Inventory Config Save Route
- Shopify Sync & Diagnostics
- Shop Product Detail Page
- FAQ Settings UI
- Reviews & Address Management
- Account & Config Layouts
- Maker Sidebar & Customer Detail
- Product Settings Detail Page
- App Layout & Auth
- Media Migration
- Media Usage Tracking
- Result Accept/Decline API
- Results Detail API
- Maker Layout & Shipping
- Page Builder Settings
- Slide Content Resolver
- Slide Section Config
- Media Drive Import
- Shopify Mapping Apply
- Telegram Webhook
- Blog Settings Actions
- Google Drive Asset Import
- Results Assignment Prep
- Shopify Catalog Sync
- FAQ & Section Reordering
- MP Recommendation & Config
- Checkout & Coupon Validation
- Shop Customization Route
- Product Detail Client
- Stripe Webhook
- Blog Hub Page
- mBolster Config Page
- Results Add-ons
- Result Assignment API
- Landing Page
- Margin by Product Analytics
- Build Assembly
- Discovery Source Catalog
- Account Order History & Refunds
- Recommendation Rules & Tests
- Analytics Dashboard
- Discount Settings Page
- Partners Settings
- Slide Media & ADR
- Slide Content String Utils
- Account Addresses API
- Cart Item Management
- Checkout API
- Checkout Page UI
- Tax Calculation
- MP Config Responses
- Products Settings Page
- Customization Payload Builder
- Recommendation Engine
- Media Replace
- Analytics Margin Actions
- Product Configuration Card
- Marketing Copy Slice 01
- SEO Lede Coverage Check
- Shop Products API
- Shopify Mapping Suggest
- Results Detail Page
- Discovery Source Health Check
- Pillow Maker Design Canvas
- Margin by Category Analytics
- Inventory Deduction
- Order Cost Calculation
- Shop Product Detail API
- Media Settings Page
- Product Category Manager
- Marketing Copy Slice 04
- Public FAQ API
- MP Config Metrics Analytics
- Orders Settings Dashboard
- Money Ledger
- Order Margin Calculation
- Marketing Copy Safety Check
- Feature Carousel Items
- Customization Inventory
- Discovery Form Contact Check
- MP Config Shopify Sync
- Low Stock Alert
- Shopify Queue Line Pricing
- Stripe Payment Links
- Guides Topic Page
- Shopify Orders Import
- Results SLA Settings
- Exchange Rates
- Marketing Copy Slice 03
- Unit Margin by SKU Analytics
- Marketing Copy Slice 02
- Sheet Safe Area
- FAQ Item Detail API
- API Config Settings
- Discovery Source Forms
- Inventory Movement Analytics
- Product Timeline Analytics
- Restock Order
- API Request Progress
- Order MP Config Link
- Pillow Heatmap Analytics
- Shopify Integration Settings
- Auth Dock
- Configurator Preference Policy
- FAQ Categories Route
- FAQ Items Route
- Monthly Inventory Analytics
- General Settings Page
- Stripe Test Page
- Admin Panel Menu
- Shopify Inventory Templates
- Google Places API
- Forms Settings Page
- Cart Page
- Authorization Hold Tests
- Stock Resolution
- Legacy Filling Migration
- Supabase Middleware
- FAQ Page
- mBolster FAQ Dismiss
- Staff Management
- Google Testimonials Fallback
- Stripe Refund Tests
- Stripe Sync Tests
- FAQ Page Metadata
- Support Page Metadata

## God Nodes (most connected - your core abstractions)
1. `supabaseAdmin()` - 434 edges
2. `requireAdmin()` - 187 edges
3. `withLocale()` - 78 edges
4. `isSupportedLocale()` - 74 edges
5. `Locale` - 52 edges
6. `getLocaleFromPathname()` - 50 edges
7. `getAuthUser()` - 31 edges
8. `buildPageMetadata()` - 25 edges
9. `getStripe()` - 25 edges
10. `linkCustomerToAuthUser()` - 24 edges

## Surprising Connections (you probably didn't know these)
- `wrapText()` --indirect_call--> `token()`  [INFERRED]
  app/[lang]/settings/analytics/ProductConfigurationCard.tsx → lib/appointments/whatsapp.ts
- `POST()` --calls--> `requireAdmin()`  [EXTRACTED]
  app/api/shop/products/route.ts → lib/auth/admin.ts
- `RootLayout()` --calls--> `isSupportedLocale()`  [EXTRACTED]
  app/layout.tsx → lib/i18n/locales.ts
- `PostCard()` --calls--> `withLocale()`  [EXTRACTED]
  app/[lang]/blog/page.tsx → lib/i18n/routing.ts
- `CostingsPage()` --indirect_call--> `variant()`  [INFERRED]
  app/[lang]/settings/costings/page.tsx → lib/stripe/__tests__/checkout.test.ts

## Import Cycles
- None detected.

## Communities (164 total, 10 thin omitted)

### Community 0 - "Appointment & Scheduling API"
Cohesion: 0.06
Nodes (91): authorizeCron(), GET(), POST(), GET(), GET(), PUT(), PutSchema, GET() (+83 more)

### Community 1 - "Results SLA & Cron Jobs"
Cohesion: 0.05
Nodes (71): authorizeCron(), GET(), POST(), sendCustomerExpiredEmail(), sendOpsReminderEmail(), sendTelegram(), sendHeldEmail(), sendAssignedEmail() (+63 more)

### Community 2 - "mBolster Config Client"
Cohesion: 0.05
Nodes (73): BolsterLength, FAQ_VIEW_ALL, labelForSleepPosition(), MbolsterConfigClient(), MbolsterConfigInfo, normalizeStep(), SleepPosition, State (+65 more)

### Community 3 - "Shop Products & Inventory"
Cohesion: 0.05
Nodes (55): CreateSchema, GET(), POST(), POST(), POST(), BOLSTER_VARIANTS, bolsterKey(), BolsterVariant (+47 more)

### Community 4 - "Auth, Discovery & Account Pages"
Cohesion: 0.09
Nodes (37): GET(), GET(), AccountAddressesPage(), metadata, AccountLoginPage(), AccountProfilePage(), initialsFrom(), AccountResultsRedirect() (+29 more)

### Community 5 - "FAQ Category Management API"
Cohesion: 0.06
Nodes (44): DELETE(), LabelsSchema, PATCH(), PatchCategorySchema, RouteContext, DELETE(), LocaleContentSchema, PATCH() (+36 more)

### Community 6 - "Inventory Configuration UI"
Cohesion: 0.05
Nodes (49): BolsterEditor(), BolsterLength, BomByKind, BomLine, BomState, ConfigureInventoryPage(), DbItem, DefaultFillingPicker() (+41 more)

### Community 7 - "FAQ Items & Page Sets API"
Cohesion: 0.08
Nodes (43): CreateItemSchema, GET(), LocaleContentSchema, POST(), LabelsSchema, PATCH(), PatchSetSchema, RouteContext (+35 more)

### Community 8 - "Pillow Maker Builder Components"
Cohesion: 0.09
Nodes (37): BottomBar(), BottomBarProps, BolsterPreferences, BuilderActions, BuilderContext, BuilderProvider(), BuilderProviderProps, BuilderState (+29 more)

### Community 9 - "Inventory Actions & Shopify Sales"
Cohesion: 0.08
Nodes (46): AddItemSchema, archiveShopifySaleQueueRow(), CategoryEnum, commitShopifySales(), CommitShopifySalesSchema, deleteShopifyMapping(), deleteShopifyVariantOverride(), hasShopifyQueueInventoryDeduction() (+38 more)

### Community 10 - "Media Assets API"
Cohesion: 0.10
Nodes (41): DELETE(), GET(), PATCH(), POST(), DELETE(), PATCH(), GET(), POST() (+33 more)

### Community 11 - "Landing Sections & Photos"
Cohesion: 0.07
Nodes (34): CreateSchema, GET(), POST(), DataUrlSchema, GET(), GetQuerySchema, POST(), UpsertSchema (+26 more)

### Community 12 - "Order Lifecycle Management"
Cohesion: 0.10
Nodes (38): POST(), BodySchema, POST(), POST(), RefundSchema, BadgeVariant, formatDate(), formatMarginPct() (+30 more)

### Community 13 - "Costing & Pricing Settings"
Cohesion: 0.06
Nodes (42): BaselineState, BASIC_PILLOW_SIZES, BOLSTER_VARIANT_ORDER, BOLSTER_VARIANT_TITLES, BOLSTER_VARIANTS, bolsterKey(), BolsterVariant, CATEGORY_ORDER (+34 more)

### Community 14 - "Admin Panel & Users"
Cohesion: 0.11
Nodes (31): GET(), PATCH(), UpdateSchema, GET(), InviteSchema, POST(), CreateShippingMethodSchema, GET() (+23 more)

### Community 15 - "Blog Management API"
Cohesion: 0.07
Nodes (32): DELETE(), GET(), PATCH(), RouteParams, UpdateBlogSchema, CreateBlogSchema, GET(), POST() (+24 more)

### Community 16 - "Orders Dashboard & Lookup"
Cohesion: 0.08
Nodes (27): GET(), GET(), POST(), RestockSchema, AddressSchema, CreateOrderSchema, GET(), OrderItemSchema (+19 more)

### Community 17 - "Inventory Item CRUD Actions"
Cohesion: 0.09
Nodes (33): addInventoryItem(), deleteInventoryItem(), DeleteItemSchema, listFillingTemplates(), renameInventoryItem(), RenameItemSchema, CATEGORY_TITLES, getInventoryCategoryTitle() (+25 more)

### Community 18 - "Inventory Config Save Route"
Cohesion: 0.10
Nodes (31): BodySchema, BolsterBodySchema, dedupeLines(), formatSupabaseError(), POST(), ApplySchema, POST(), assertFillingLines() (+23 more)

### Community 19 - "Shopify Sync & Diagnostics"
Cohesion: 0.11
Nodes (29): BuildableRow, GET(), POST(), unauthorized(), ShopifyErrorResponse, shopifyFetch(), shopifyGetPrimaryLocationId(), shopifyGetVariantInventoryItemId() (+21 more)

### Community 20 - "Shop Product Detail Page"
Cohesion: 0.09
Nodes (29): generateMetadata(), ProductLayout(), Props, ProductDetailPage(), Props, clientSrc, layoutSrc, main() (+21 more)

### Community 21 - "FAQ Settings UI"
Cohesion: 0.11
Nodes (27): AddCategoryDialog(), CategoryRow, ItemEditor(), ItemRow, LOCALES, slugify(), SortableCategoryRow(), FAQ_DEFAULTS (+19 more)

### Community 22 - "Reviews & Address Management"
Cohesion: 0.13
Nodes (25): GET(), AddressActionResult, clearDefaults(), createAddress(), deleteAddress(), revalidate(), setDefaultAddress(), updateAddress() (+17 more)

### Community 23 - "Account & Config Layouts"
Cohesion: 0.09
Nodes (19): generateMetadata(), Props, generateMetadata(), META, Props, generateMetadata(), META, Props (+11 more)

### Community 24 - "Maker Sidebar & Customer Detail"
Cohesion: 0.09
Nodes (28): InputCard(), InputCardProps, MpMakerSidebar(), AddressFormState, BadgeVariant, CustomerDetailPage(), emptyAddress, formatDate() (+20 more)

### Community 25 - "Product Settings Detail Page"
Cohesion: 0.08
Nodes (25): ContentMap, EMPTY_CONTENT, EMPTY_VARIANT_FORM, formatPrice(), MDEditor, ProductEditorPage(), slugify(), VariantFormState (+17 more)

### Community 26 - "App Layout & Auth"
Cohesion: 0.14
Nodes (23): POST(), metadata, RootLayout(), soraMono, soraSans, viewport, robots(), ArticleJsonLdInput (+15 more)

### Community 27 - "Media Migration"
Cohesion: 0.15
Nodes (26): applyPublicMigration(), ApplyPublicMigrationResult, ensureAssetForPath(), loadPublicMigrationContext(), repoPublicFilePath(), scopePlan(), DEFERRED_PUBLIC_PATHS, ExistingPublicAsset (+18 more)

### Community 28 - "Media Usage Tracking"
Cohesion: 0.11
Nodes (25): GET(), GET(), listMediaAssets(), AssetRef, buildUsageMap(), dedupe(), entryKey(), fetchConsumerRows() (+17 more)

### Community 29 - "Result Accept/Decline API"
Cohesion: 0.15
Nodes (23): BodySchema, POST(), BodySchema, POST(), devOnly(), GET(), keyMode(), POST() (+15 more)

### Community 30 - "Results Detail API"
Cohesion: 0.13
Nodes (23): AddonLine, buildPublicSummary(), GET(), itemLabel(), PrefLine, calculateShippingRate(), getActiveShippingMethods(), getAllShippingMethods() (+15 more)

### Community 31 - "Maker Layout & Shipping"
Cohesion: 0.11
Nodes (22): COMMON_COUNTRIES, DEFAULT_FORM, formToPayload(), getMethodName(), LocaleContent, LOCALES, methodToForm(), SettingsShippingPage() (+14 more)

### Community 32 - "Page Builder Settings"
Cohesion: 0.08
Nodes (26): AddSectionDialog(), PageBuilderPage(), SECTION_TYPE_LABELS, slugify(), BuiltInSectionType, CredibilityContent, CUSTOM_SECTION_TEMPLATES, CustomFullWidthImageContent (+18 more)

### Community 33 - "Slide Content Resolver"
Cohesion: 0.11
Nodes (26): MessagesSlice, SPLIT_HERO_EXTRACTORS, SplitHeroExtractor, CommitmentCardsContent, FeatureCardGridContent, FeatureCarouselContent, FirmnessCompareContent, FirmnessScaleContent (+18 more)

### Community 34 - "Slide Section Config"
Cohesion: 0.07
Nodes (28): BaseSectionConfig, CommitmentCardsSectionConfig, FeatureCardGridSectionConfig, FeatureCarouselSectionConfig, FirmnessCompareSectionConfig, FirmnessScaleConfig, FullBleedMediaSectionConfig, HelpContactSectionConfig (+20 more)

### Community 35 - "Media Drive Import"
Cohesion: 0.16
Nodes (20): POST(), GET(), GET(), POST(), downloadFile(), DriveError, DriveErrorCode, driveErrorStatus() (+12 more)

### Community 36 - "Shopify Mapping Apply"
Cohesion: 0.10
Nodes (18): ApplyRow, POST(), unauthorized(), isShopifyOrder(), MappingRow, POST(), ShopifyOrder, getShopifyWebhookSecret() (+10 more)

### Community 37 - "Telegram Webhook"
Cohesion: 0.14
Nodes (27): answerCallback(), editTelegramMessage(), ForceReplyMarkup, GET(), getEnv(), handleCallback(), handleCommand(), helpText() (+19 more)

### Community 38 - "Blog Settings Actions"
Cohesion: 0.12
Nodes (19): deleteBlog(), requireAuth(), updateBlogStatus(), deleteCategory(), reorderCategories(), requireAuth(), requireAuth(), updateCustomer() (+11 more)

### Community 39 - "Google Drive Asset Import"
Cohesion: 0.17
Nodes (20): downloadThumbnail(), DriveFileMeta, defaultDeps(), DriveFileMetaLike, ImportDriveDeps, ImportDriveErrorCode, ImportDriveResult, importFromDrive() (+12 more)

### Community 40 - "Results Assignment Prep"
Cohesion: 0.13
Nodes (22): GET(), PILLOW_SIZES, PrepQuerySchema, AddonLineSchema, AddressSchema, HoldSchema, POST(), PreferenceLineSchema (+14 more)

### Community 41 - "Shopify Catalog Sync"
Cohesion: 0.13
Nodes (22): bolsterSizeToInternalVariant(), POST(), unauthorized(), GET(), listShopifyAdminState(), detectPremiumVariantFromTitle(), ItemPriceRow, MappingRow (+14 more)

### Community 42 - "FAQ & Section Reordering"
Cohesion: 0.09
Nodes (17): PUT(), ReorderSchema, PUT(), ReorderSchema, DELETE(), PUT(), ReorderSchema, PUT() (+9 more)

### Community 43 - "MP Recommendation & Config"
Cohesion: 0.16
Nodes (19): POST(), RecommendSchema, BomLineRow, DELETE(), GET(), ParamsSchema, resolveDiscoverySourceLabel(), BasicMpillowInput (+11 more)

### Community 44 - "Checkout & Coupon Validation"
Cohesion: 0.15
Nodes (18): POST(), ValidateCouponSchema, validateCartPrices(), validateCouponCode(), computeCouponDiscountAmount(), countCustomerCouponUses(), CouponLineItem, CouponUseOrder (+10 more)

### Community 45 - "Shop Customization Route"
Cohesion: 0.19
Nodes (22): ApplyRequestSchema, BolsterRecommendRequestSchema, handleApply(), handleApplyBolster(), handleRecommend(), MeasurementRecommendRequestSchema, POST(), RecommendRequestSchema (+14 more)

### Community 46 - "Product Detail Client"
Cohesion: 0.16
Nodes (21): getBody(), getCategoryName(), getDefaultVariant(), getDescription(), getStockStatus(), getTitle(), ProductDetailClient(), ApprovedReviewsState (+13 more)

### Community 47 - "Stripe Webhook"
Cohesion: 0.16
Nodes (19): CriticalWebhookError, POST(), TODO: wire to a real alert channel (email/Slack)., recordWebhookFailure(), updateCustomerStats(), recordLedgerEntry(), rollupOrderMoney(), buildOrderEmailData() (+11 more)

### Community 48 - "Blog Hub Page"
Cohesion: 0.14
Nodes (19): BlogHubPage(), metadata, PostCard(), Props, BlogPostPage(), generateMetadata(), generateStaticParams(), Props (+11 more)

### Community 49 - "mBolster Config Page"
Cohesion: 0.15
Nodes (17): INTRO, MbolsterConfigPage(), Props, assertConfiguratorWiring(), assertSurface(), introHtml, main(), read() (+9 more)

### Community 50 - "Results Add-ons"
Cohesion: 0.17
Nodes (19): GET(), accessoryFitsProduct(), AddonItemRow, addonMatchRank(), AddonProductType, BOLSTER_LENGTH_SET, BOLSTER_LENGTHS, BolsterLength (+11 more)

### Community 51 - "Result Assignment API"
Cohesion: 0.16
Nodes (16): AddonLine, AssignSchema, itemLabel(), PILLOW_SIZES, POST(), PrefLine, assembleBuild(), findStockShortages() (+8 more)

### Community 52 - "Landing Page"
Cohesion: 0.16
Nodes (18): formatPriceLabel(), getBolsterFromPriceLabel(), getLandingRatings(), getPillowXsFromPriceLabel(), Home(), IMAGE_DEFAULTS, parsePrice(), PillowKind (+10 more)

### Community 53 - "Margin by Product Analytics"
Cohesion: 0.11
Nodes (20): asMoney(), BomLineRowDb, BomTemplateLineRowDb, BomTemplateRowDb, Chart(), clamp(), defaultMargin, DrillKind (+12 more)

### Community 54 - "Build Assembly"
Cohesion: 0.11
Nodes (18): AddonLine, AssembleBuildInput, AssembleBuildResult, BomLineInput, BuildLine, BuildLineRole, PREFERENCE_CATEGORIES, PreferenceLine (+10 more)

### Community 55 - "Discovery Source Catalog"
Cohesion: 0.27
Nodes (17): activeDiscoverySourceOptions(), archiveDiscoverySourceOption(), assertCatalogAllowsSave(), findDiscoverySourceOption(), isPlainObject(), normalizeDiscoverySourceCatalog(), parseDiscoverySourceCatalog(), parseLabels() (+9 more)

### Community 56 - "Account Order History & Refunds"
Cohesion: 0.24
Nodes (14): AccountOrderDetailPage(), OrderRefundActions(), Props, AccountOrdersPage(), metadata, ResultsLayout(), getAuthUser(), getCustomerOrderByNumber() (+6 more)

### Community 57 - "Recommendation Rules & Tests"
Cohesion: 0.20
Nodes (18): getSizeBallparkFromPreferences(), AvailableFilling, buildExplanation(), deriveFirmness(), deriveSleepPosition(), FILLING_SPECS, FillingSpec, recommendFromMeasurements() (+10 more)

### Community 58 - "Analytics Dashboard"
Cohesion: 0.14
Nodes (19): getInventoryMovementWaterfall(), getMpConfigMetricsBreakdown(), AnalyticsPage(), BalanceRow, CATEGORY_LABELS, CATEGORY_ORDER, CategorySummary, describeItem() (+11 more)

### Community 59 - "Discount Settings Page"
Cohesion: 0.15
Nodes (19): AppliesTo, appliesToFromCoupon(), AppliesToSelection, buildAppliesToPayload(), buildSummary(), CatalogCategory, CatalogProduct, Coupon (+11 more)

### Community 60 - "Partners Settings"
Cohesion: 0.17
Nodes (17): emptyPartnerForm(), emptyWorkWithUs(), MDEditor, PartnerForm, PartnersSettingsPage(), getPartnerRows(), getPartners(), getPartnersPageContent() (+9 more)

### Community 61 - "Slide Media & ADR"
Cohesion: 0.18
Nodes (14): ADR-0004, getSlideMediaMap(), normalizePublicPath(), PlannedSlideAsset, planSlideMigration(), resolveSlideMedia(), SLIDE_PUBLIC_PATHS, slideImage() (+6 more)

### Community 62 - "Slide Content String Utils"
Cohesion: 0.21
Nodes (20): optionalString(), optionalStringArray(), requireString(), requireStringArray(), resolveCommitmentCards(), resolveFeatureCardGrid(), resolveFeatureCarousel(), resolveFirmnessCompare() (+12 more)

### Community 63 - "Account Addresses API"
Cohesion: 0.20
Nodes (12): GET(), POST(), POST(), BodySchema, POST(), GET(), ResultRow, associateGuestOrdersToCustomer() (+4 more)

### Community 64 - "Cart Item Management"
Cohesion: 0.18
Nodes (15): DELETE(), PATCH(), UpdateItemSchema, AddItemSchema, GET(), POST(), addCartItem(), clearCart() (+7 more)

### Community 65 - "Checkout API"
Cohesion: 0.17
Nodes (16): CheckoutItemSchema, CheckoutSchema, CustomizationConfigRow, POST(), ShippingAddressSchema, WorkingItem, findOrCreateCustomer(), getCustomerById() (+8 more)

### Community 66 - "Checkout Page UI"
Cohesion: 0.16
Nodes (17): CheckoutPage(), COUNTRY_OPTIONS, FormData, FormErrors, getShippingContent(), CartActions, CartContext, CartContextValue (+9 more)

### Community 67 - "Tax Calculation"
Cohesion: 0.16
Nodes (17): computeOrderTotal(), computeTax(), DEFAULT_TAX_RULES, getActiveTaxRules(), resolveTaxRule(), round2(), rowToRule(), SG_GST_RULE (+9 more)

### Community 68 - "MP Config Responses"
Cohesion: 0.19
Nodes (17): dataUrlToBlob(), ExistingMeasuredBySchema, formatTelegramTimestamp(), GET(), getOptionalEnv(), ListQuerySchema, MeasuredBySchema, MeasurementSchema (+9 more)

### Community 69 - "Products Settings Page"
Cohesion: 0.18
Nodes (17): Category, getCategoryName(), getPriceRange(), getProductTitle(), getThumbnailUrl(), getTotalStock(), hasMissingStripe(), hasPriceWarning() (+9 more)

### Community 70 - "Customization Payload Builder"
Cohesion: 0.16
Nodes (14): buildCustomizeApplyPayload(), componentVariantName(), CustomizeApplyRecommendation, CustomizeProductType, HARDCODED_UPSELLS, resolveBolsterVariant(), resolveEcomProductId(), SIZE_TO_BOLSTER_VARIANT (+6 more)

### Community 71 - "Recommendation Engine"
Cohesion: 0.18
Nodes (11): EngineDeps, callModelEndpoint(), getModelConfig(), ModelEndpointConfig, customizationResultSchema, fillingLineSchema, parseModelResult(), ACTIVE_CONFIG (+3 more)

### Community 72 - "Media Replace"
Cohesion: 0.24
Nodes (14): POST(), emptyReplaceSummary(), isLandingAssetIdKey(), landingAssetIdKey(), landingSlotKeyFromAssetIdKey(), planReplaceEverywhere(), ReplaceInput, replaceJsonRefs() (+6 more)

### Community 73 - "Analytics Margin Actions"
Cohesion: 0.15
Nodes (16): getMonthlyInventoryByCategory(), getRealizedMarginSummary(), getShopifySalesTimeline(), InventoryMovementGroup, InventoryMovementRow, ItemCategoryRow, MonthlyInventoryRow, monthsInRange() (+8 more)

### Community 74 - "Product Configuration Card"
Cohesion: 0.17
Nodes (14): BomTemplateLineRow, BomTemplateRow, CATEGORY_LABELS, CATEGORY_ORDER, describeItem(), humanize(), Node(), NodeShape (+6 more)

### Community 75 - "Marketing Copy Slice 01"
Cohesion: 0.21
Nodes (10): h1, heroSrc, ROOT, cred, founder, modular, enUS, MESSAGES (+2 more)

### Community 76 - "SEO Lede Coverage Check"
Cohesion: 0.18
Nodes (14): assertEnLede(), assertZhLede(), cjkChars(), componentFiles, enWords(), fillAndAssertProducts(), introHtml, isWeakEn() (+6 more)

### Community 77 - "Shop Products API"
Cohesion: 0.24
Nodes (12): GET(), POST(), GET(), attachStockAvailable(), CUSTOM_COMPOSED_PRODUCT_TYPES, getFeaturedProducts(), getProductById(), getProducts() (+4 more)

### Community 78 - "Shopify Mapping Suggest"
Cohesion: 0.18
Nodes (15): BOLSTER_SIZES, BolsterSize, bolsterSizeToVariant(), BolsterVariant, detectBolsterSize(), detectPillowKind(), detectPillowSize(), GET() (+7 more)

### Community 79 - "Results Detail Page"
Cohesion: 0.17
Nodes (12): BuildSummary, JOURNEY_STEPS, journeyIndex(), ResultListRow, ResultPublic, ResultStatusPage(), STATUS_COPY, statusTitle() (+4 more)

### Community 80 - "Discovery Source Health Check"
Cohesion: 0.12
Nodes (14): activeIds, adminApi, archived, archiveOther, context, migration, noOther, normalized (+6 more)

### Community 81 - "Pillow Maker Design Canvas"
Cohesion: 0.19
Nodes (9): DesignCanvas(), DesignControls(), DEFAULT_ITEMS, DesignContext, DesignContextValue, DesignItem, Preset, useDesign() (+1 more)

### Community 82 - "Margin by Category Analytics"
Cohesion: 0.17
Nodes (13): asMoney(), CategoryStackDatum, Chart(), clamp(), defaultMargin, estimateLabelWidth(), formatCompactCurrency, insightForMarginPct() (+5 more)

### Community 83 - "Inventory Deduction"
Cohesion: 0.30
Nodes (14): BOLSTER_VARIANTS, buildSaleDeductionTransactions(), CustomizationSnapshot, deductInventoryForOrder(), filterNonFillingBomLines(), InventoryLine, isBolsterCustomizedItem(), isBolsterVariant() (+6 more)

### Community 84 - "Order Cost Calculation"
Cohesion: 0.25
Nodes (11): calculateAddonCost(), calculateCustomizationBomCost(), resolveOrderItemUnitCost(), coverLine, ApiConfig, ComponentOption, ConfigLine, CustomizationConfig (+3 more)

### Community 85 - "Shop Product Detail API"
Cohesion: 0.21
Nodes (11): DELETE(), GET(), PATCH(), UpdateProductSchema, CreateVariantSchema, GET(), POST(), DELETE() (+3 more)

### Community 86 - "Media Settings Page"
Cohesion: 0.16
Nodes (13): DrivePreview, FilterMode, FolderFilter, KindFilter, kindFromMime(), LANDING_SLOTS, LandingSlot, MediaFile (+5 more)

### Community 87 - "Product Category Manager"
Cohesion: 0.21
Nodes (13): CategoriesManager(), CategoryRow(), CategoryRowProps, CategoryWithMeta, EMPTY_FORM, flattenTree(), FormState, getDescendantIds() (+5 more)

### Community 88 - "Marketing Copy Slice 04"
Cohesion: 0.14
Nodes (11): clientAt, faqAt, fibreLine, h1, h1Match, introAt, lede, ledeMatch (+3 more)

### Community 89 - "Public FAQ API"
Cohesion: 0.28
Nodes (11): GET(), getFaqPageData(), stripMarkdownForSchema(), buildFaqPageJsonLd(), assertGoogleFaqPageEligible(), extractFaqPageJsonLd(), FaqPageLd, fetchHtml() (+3 more)

### Community 90 - "MP Config Metrics Analytics"
Cohesion: 0.21
Nodes (12): MpConfigMetricBreakdown, MpConfigMetricSegment, Chart(), clamp(), defaultMargin, estimatedChartHeight(), estimateLabelWidth(), MpConfigMetricsStackedBarVisx() (+4 more)

### Community 91 - "Orders Settings Dashboard"
Cohesion: 0.22
Nodes (11): BadgeVariant, DashboardStats, formatDate(), formatMarginPct(), formatSGD(), ORDER_STATUSES, OrderRow, orderStatusBadgeClass() (+3 more)

### Community 92 - "Money Ledger"
Cohesion: 0.26
Nodes (9): addEntry(), LedgerEntry, ledgerReconciles(), LedgerType, MoneyState, MoneyStatus, RecordOpts, round2() (+1 more)

### Community 93 - "Order Margin Calculation"
Cohesion: 0.26
Nodes (9): adjustedProductRevenue(), ComputedOrderMargin, computeOrderMargin(), netRevenue(), OrderMarginItemInput, OrderMarginTotals, round2(), sumCogs() (+1 more)

### Community 94 - "Marketing Copy Safety Check"
Cohesion: 0.19
Nodes (10): assertMarketingCopySafe(), GatedString, wordCount(), gated, h1, landingSrc, llms, ROOT (+2 more)

### Community 95 - "Feature Carousel Items"
Cohesion: 0.18
Nodes (10): buildFeatureCarouselItems(), FeatureCarouselItem, resolveMeasurementHeader(), resolveMeasurementSteps(), resolveRatingBreakdownLabel(), resolveReviewTitle(), resolveTestimonialHeader(), isImplementedSectionType() (+2 more)

### Community 96 - "Customization Inventory"
Cohesion: 0.32
Nodes (11): BOLSTER_COMPONENT_CATEGORIES, getAvailableBolsterComponents(), getAvailableComponents(), isCaseInventoryCategory(), isProtectorInventoryCategory(), itemMatchesPreferenceRole(), PILLOW_COMPONENT_CATEGORIES, toComponentRole() (+3 more)

### Community 97 - "Discovery Form Contact Check"
Cohesion: 0.17
Nodes (10): bolster, detailApi, detailPage, formsPage, hold, mp, nav, preview (+2 more)

### Community 98 - "MP Config Shopify Sync"
Cohesion: 0.29
Nodes (10): BOLSTER_VARIANT_TO_SIZE, buildBolsterMpConfigData(), buildPillowMpConfigData(), createMpConfigFromCustomization(), CustomizationConfigRow, isBolsterConfig(), OrderItemForSync, resolveBolsterSizeAndVariant() (+2 more)

### Community 99 - "Low Stock Alert"
Cohesion: 0.24
Nodes (8): BomLine, bom, low, lowUnused, onHand, collectLowStockCategories(), isCategoryBottleneckLow(), splitBomByCategory()

### Community 100 - "Shopify Queue Line Pricing"
Cohesion: 0.27
Nodes (10): itemMsrp, pillowIds, productMsrp, detectPremiumVariantFromTitle(), parseMsrp(), parseReplaceLinesFromMetadata(), QueueLinePriceKind, ReplaceLine (+2 more)

### Community 101 - "Stripe Payment Links"
Cohesion: 0.31
Nodes (8): PaymentLinkSchema, POST(), POST(), SyncProductSchema, createPaymentLink(), deactivatePaymentLink(), syncProductToStripe(), syncVariantPrice()

### Community 102 - "Guides Topic Page"
Cohesion: 0.25
Nodes (7): generateMetadata(), GuideHubPage(), Props, getGuideContent(), GuideContent, GUIDES, GuideTopic

### Community 103 - "Shopify Orders Import"
Cohesion: 0.27
Nodes (10): refreshShopifySalesQueueFromShopify(), parseNextLink(), ShopifyErrorResponse, shopifyFetch(), shopifyFetchAbsolute(), ShopifyJson, shopifyListPaidOrders(), shopifyListPaidOrdersPaginated() (+2 more)

### Community 104 - "Results SLA Settings"
Cohesion: 0.24
Nodes (10): DEFAULT_SLA_FORM, MeasurementData, MpConfigResponseRow, normalizeMeasurement(), ResultsPage(), ResultsTab, safeString(), SlaSettingsForm (+2 more)

### Community 105 - "Exchange Rates"
Cohesion: 0.33
Nodes (8): GET(), convertPrice(), ExchangeRates, FALLBACK_RATES, getExchangeRates(), refreshExchangeRates(), roundForCurrency(), ZERO_DECIMAL_CURRENCIES

### Community 106 - "Marketing Copy Slice 03"
Cohesion: 0.20
Nodes (7): about, discover, lede, ledeMatch, pageSrc, ROOT, w

### Community 107 - "Unit Margin by SKU Analytics"
Cohesion: 0.22
Nodes (6): defaultMargin, legend, SeriesKey, seriesKeys, TooltipDatum, UnitMarginRow

### Community 108 - "Marketing Copy Slice 02"
Cohesion: 0.22
Nodes (7): hero, neckSrc, resolved, ROOT, sheetSrc, techCopy, types

### Community 109 - "Sheet Safe Area"
Cohesion: 0.28
Nodes (5): resolveSheetInsetBottomPadding(), resolveSheetInsetTopPadding(), SheetMobilePreset, SLIDE_INS, slideInDir

### Community 110 - "FAQ Item Detail API"
Cohesion: 0.32
Nodes (7): DELETE(), LocaleContentSchema, PATCH(), PatchItemSchema, RouteContext, deletePageFaqItem(), updatePageFaqItem()

### Community 111 - "API Config Settings"
Cohesion: 0.29
Nodes (7): ApiConfigSchema, DELETE(), DeleteSchema, GET(), PATCH(), POST(), UpdateSchema

### Community 112 - "Discovery Source Forms"
Cohesion: 0.36
Nodes (7): GET(), OptionSchema, PUT(), PutSchema, dbRoundtrip(), getDiscoverySourceCatalog(), saveDiscoverySourceCatalog()

### Community 113 - "Inventory Movement Analytics"
Cohesion: 0.32
Nodes (6): Chart(), clamp(), estimateLabelWidth(), MovementRow, tooltipStyles, WaterfallRow

### Community 114 - "Product Timeline Analytics"
Cohesion: 0.25
Nodes (5): palette, ProductTimeline, ProductTimelineVisxProps, TimelineDataPoint, tooltipStyles

### Community 115 - "Restock Order"
Cohesion: 0.39
Nodes (6): CustomizationSnapshot, loadOrderItem(), OrderItemRow, restockMetadata(), restockOrderItem(), restockQuantityAllowed()

### Community 116 - "API Request Progress"
Cohesion: 0.32
Nodes (5): decrementActiveApiRequests(), emit(), incrementActiveApiRequests(), listeners, RequestProgressListener

### Community 117 - "Order MP Config Link"
Cohesion: 0.38
Nodes (6): DELETE(), DeleteBodySchema, GET(), ParamsSchema, POST(), PostBodySchema

### Community 118 - "Pillow Heatmap Analytics"
Cohesion: 0.43
Nodes (6): clamp(), mulberry32(), PILLOW_VIEWBOX, PillowHeatmap(), PillowHeatmapProps, slugifyId()

### Community 119 - "Shopify Integration Settings"
Cohesion: 0.33
Nodes (5): Item, ShopifyAdminPage(), fullShopifySync(), supabaseAnonKey, supabaseUrl

### Community 120 - "Auth Dock"
Cohesion: 0.57
Nodes (4): DockSessionRole, isAdminPanelDockPath(), landingAuthPill(), resolveDockSessionRole()

### Community 121 - "Configurator Preference Policy"
Cohesion: 0.33
Nodes (5): client, holdRoute, PreferenceCategory, preferenceCategoryAllowed(), PreferenceProductType

### Community 122 - "FAQ Categories Route"
Cohesion: 0.40
Nodes (5): CreateCategorySchema, GET(), LabelsSchema, POST(), getAllFaqCategoriesAdmin()

### Community 123 - "FAQ Items Route"
Cohesion: 0.40
Nodes (5): CreateItemSchema, GET(), LocaleContentSchema, POST(), getAllFaqItemsAdmin()

### Community 124 - "Monthly Inventory Analytics"
Cohesion: 0.33
Nodes (3): MonthlyInventoryDatum, palette, tooltipStyles

### Community 125 - "General Settings Page"
Cohesion: 0.40
Nodes (5): ApiConfig, emptyForm, FormData, GeneralSettingsPage(), slugify()

### Community 126 - "Stripe Test Page"
Cohesion: 0.40
Nodes (5): btnStyle(), Config, SessionProbe, StripeTestPage(), TEST_CARDS

### Community 127 - "Admin Panel Menu"
Cohesion: 0.47
Nodes (4): bus, unsub, openAdminPanelMenu(), subscribeAdminPanelMenu()

### Community 128 - "Shopify Inventory Templates"
Cohesion: 0.40
Nodes (4): BomTemplateRow, grouped, groupShopifyTemplatesByKey(), ShopifyTemplateOption

### Community 129 - "Google Places API"
Cohesion: 0.70
Nodes (4): GET(), getOptionalReferrerHeaders(), getRequiredEnv(), PlacesSearchTextResponse

### Community 130 - "Forms Settings Page"
Cohesion: 0.60
Nodes (4): emptyLabels(), FormsSettingsPage(), LOCALES, slugify()

### Community 131 - "Cart Page"
Cohesion: 0.60
Nodes (3): CartPage(), CartPageProps, buildCartMessages()

### Community 132 - "Authorization Hold Tests"
Cohesion: 0.40
Nodes (4): cancelPi, capturePi, createPi, createSession

### Community 133 - "Stock Resolution"
Cohesion: 0.50
Nodes (3): resolveStockAvailable(), StockResolutionInput, StockSources

## Knowledge Gaps
- **858 isolated node(s):** `CalendarGuestEvent`, `CalendarRangeEvent`, `GCalEvent`, `RFC-3339`, `ReminderRow` (+853 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `supabaseAdmin()` connect `Landing Sections & Photos` to `Appointment & Scheduling API`, `Results SLA & Cron Jobs`, `Shop Products & Inventory`, `Auth, Discovery & Account Pages`, `FAQ Category Management API`, `FAQ Items & Page Sets API`, `Inventory Actions & Shopify Sales`, `Media Assets API`, `Order Lifecycle Management`, `Admin Panel & Users`, `Blog Management API`, `Orders Dashboard & Lookup`, `Inventory Item CRUD Actions`, `Inventory Config Save Route`, `Shopify Sync & Diagnostics`, `Shop Product Detail Page`, `FAQ Settings UI`, `Media Migration`, `Result Accept/Decline API`, `Results Detail API`, `Shopify Mapping Apply`, `Telegram Webhook`, `Blog Settings Actions`, `Google Drive Asset Import`, `Results Assignment Prep`, `Shopify Catalog Sync`, `FAQ & Section Reordering`, `MP Recommendation & Config`, `Checkout & Coupon Validation`, `Shop Customization Route`, `Stripe Webhook`, `Blog Hub Page`, `mBolster Config Page`, `Results Add-ons`, `Result Assignment API`, `Landing Page`, `Discovery Source Catalog`, `Analytics Dashboard`, `Partners Settings`, `Account Addresses API`, `Cart Item Management`, `Checkout API`, `Tax Calculation`, `MP Config Responses`, `Recommendation Engine`, `Analytics Margin Actions`, `SEO Lede Coverage Check`, `Shop Products API`, `Inventory Deduction`, `Shop Product Detail API`, `Customization Inventory`, `MP Config Shopify Sync`, `Stripe Payment Links`, `Shopify Orders Import`, `Exchange Rates`, `FAQ Item Detail API`, `API Config Settings`, `Discovery Source Forms`, `Order MP Config Link`, `FAQ Categories Route`, `FAQ Items Route`?**
  _High betweenness centrality (0.417) - this node is a cross-community bridge._
- **Why does `withLocale()` connect `Auth, Discovery & Account Pages` to `mBolster Config Client`, `Products Settings Page`, `Guides Topic Page`, `Inventory Configuration UI`, `Pillow Maker Builder Components`, `Orders Settings Dashboard`, `Order Lifecycle Management`, `Costing & Pricing Settings`, `Admin Panel & Users`, `Results Detail Page`, `Blog Hub Page`, `FAQ Settings UI`, `Account Order History & Refunds`, `Maker Sidebar & Customer Detail`, `Discount Settings Page`, `Partners Settings`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Why does `enUS` connect `Marketing Copy Slice 01` to `Marketing Copy Slice 03`, `Marketing Copy Slice 02`, `SEO Lede Coverage Check`, `Marketing Copy Slice 04`, `Public FAQ API`, `Marketing Copy Safety Check`, `Feature Carousel Items`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **What connects `CalendarGuestEvent`, `CalendarRangeEvent`, `GCalEvent` to the rest of the system?**
  _858 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Appointment & Scheduling API` be split into smaller, more focused modules?**
  _Cohesion score 0.05537948290241868 - nodes in this community are weakly interconnected._
- **Should `Results SLA & Cron Jobs` be split into smaller, more focused modules?**
  _Cohesion score 0.05118601747815231 - nodes in this community are weakly interconnected._
- **Should `mBolster Config Client` be split into smaller, more focused modules?**
  _Cohesion score 0.05209274314965372 - nodes in this community are weakly interconnected._