export type Messages = {
  common: {
    close: string;
    customise: string;
    bookAppointment: string;
    addToCart: string;
    learnMore: string;
    learnHow: string;
    fromPricePrefix: string; // e.g. "From"
    shopNow: string;
  };
  header: {
    customiseLabel: string;
    online: string;
    inPerson: string;
  };
  home: {
    hero: {
      titlePrefix: string;
      titleEmphasis: string;
      titleSuffix: string;
      subtitle: string;
      ctaCustomise: string;
      ctaBookAppointment: string;
      seoAnswer: string;
    };
    sizeMatters: {
      title: string;
      description: string;
    };
    ambassadors: {
      title: string;
      description: string;
    };
    pickYourMpillow: {
      title: string;
      subtitle: string;
      specs: {
        customisation: string;
        fitControl: string;
      };
      products: {
        basic: { title: string; description: string; badge: string };
        premium: { title: string; description: string; badge: string };
      };
      buttonCustomise: string;
      fromPricePrefix: string; // section-specific if desired
    };
    neckPains: {
      title: string;
      description: string;
      feelTitle: string;
      feelSupported: { label: string; description: string };
      feelFit: { label: string; description: string };
      feelUpkeep: { label: string; description: string };
    };
    whyChoose: {
      cards: Array<{ key: string; label: string; title: string; description: string }>;
    };
    mbolster: {
      title: string;
      description: string;
      subtitle: string;
      buttonCustomise: string;
      fromPricePrefix: string;
      specs: {
        customisation: string;
        fitControl: string;
      };
    };
    credibility: {
      cards: Array<{ key: string; title: string; description: string }>;
    };
    review: {
      title: string;
      subtitle: string;
      videoTitle: string;
    };
    founder: {
      title: string;
      subtitle: string;
      paragraphs: string[];
      name: string;
      role: string;
    };
    stories: {
      title: string;
      subtitle: string;
    };
  };
  /** TikTok videos section and the shared TikTok player (components/tiktok). */
  tiktok: {
    title: string;
    subtitle: string;
    playVideo: string;
    pauseScrolling: string;
    resumeScrolling: string;
    previousVideo: string;
    nextVideo: string;
    watchOnTikTok: string;
    /** "{current} of {total}" */
    position: string;
    /** "TikTok video {n}" */
    untitled: string;
  };
  slides: {
    ambassadors: {
      trigger: string;
      title: string;
      description: string;
      heroLabel: string;
      heroDescription: string;
      allBuildsTitle: string;
      allBuildsParagraphs: string[];
      ambassadorsTitle: string;
      awardsIntro: string;
      awardsButton: string;
      awards: string[];
      testimonialTitle: string;
      testimonialQuote: string;
      testimonialAttribution: string;
      videoTitle: string;
      videoDescription: string;
    };
    sizeMatters: {
      trigger: string;
      title: string;
      description: string;
      pressQuote: { text: string; attribution: string };
      sectionSizeMattersTitle: string;
      sectionSizeMattersDescription: string;
      measurementsTitle: string;
      measurementsIntro: string;
      measurementCards: Array<{ key: string; title: string; description: string }>;
      headShapesTitle: string;
      headShapesDescription: string;
      whyUniqueTitle: string;
      whyUniqueDescription: string;
      sleepPositionTitle: string;
      sleepPositionParagraphs: string[];
      configurationsTitle: string;
      configurationsParagraphs: string[];
    };
    basicMpillow: {
      trigger: string;
      title: string;
      description: string;
      heroTitle: string;
      heroParagraphs: string[];
      packagingTitle: string;
      packagingItems: string[];
      firmnessTitle: string;
      firmnessDescription: string;
      firmnessBasicLabel: string;
      firmnessPremiumLabel: string;
      features: Array<{ title: string; description: string }>;
      sizeTitle: string;
      sizeDescription: string;
      sizeTable: {
        sizeHeader: string;
        shoulderHeader: string;
        rows: Array<{ size: string; shoulder: string }>;
      };
      sizingChartTitle: string;
      sizingChartDescription: string;
      aftercareTitle: string;
      careButton: string;
      bottomCustomise: string;
      bookAdjustment: string;
    };
    premiumMpillow: {
      trigger: string;
      title: string;
      description: string;
      heroSubtitle: string;
      heroParagraphs: string[];
      trustStrip: Array<{ label: string }>;
      overseasTitle: string;
      overseasDescription: string;
      whoItsForTitle: string;
      whoItsForIntro: string;
      whoItsForItems: string[];
      whoItsForConclusion: string;
      pricingTitle: string;
      pricingTable: { sizeHeader: string; priceHeader: string };
      pricingNotes: string[];
      featuresTitle: string;
      featuresIntro: string;
      features: Array<{ title: string; description: string }>;
      firmnessTitle: string;
      firmnessDescription: string;
      accessoryTitle: string;
      accessorySubtitle: string;
      accessoryDescription: string;
      accessoryButton: string;
      videoTitle: string;
      measurementsTitle: string;
      measurementsIntro: string;
      measurementSteps: Array<{ title: string; description: string }>;
      packageTitle: string;
      packageItems: string[];
      aftercareTitle: string;
      aftercareDescription: string;
      commitmentTitle: string;
      commitmentReadjustmentTitle: string;
      commitmentReadjustmentDescription: string;
      commitmentWarrantyTitle: string;
      commitmentWarrantyDescription: string;
      helpTitle: string;
      helpDescription: string;
      bottomBookBespoke: string;
    };
    cervicalNeckSupport: {
      title: string;
      description: string;
      heroEyebrow: string;
      heroTitle: string;
      heroDescription: string;
      techNeckTitle: string;
      techNeckParagraphs: string[];
      whyTitle: string;
      whyDescription: string;
      benefitsTitle: string;
      benefits: Array<{ title: string; description: string }>;
      differenceTitle: string;
      differenceParagraphs: string[];
      additionalBenefitsTitle: string;
      additionalBenefits: string[];
      bottomViewSource: string;
      bottomShop: string;
    };
    mbolster: {
      trigger: string;
      title: string;
      description: string;
      heroLabel: string;
      heroTitle: string;
      heroDescription: string;
      zoomLabel: string;
      salePriceLabel: string;
      reviewCountLabel: string;
      sizeLabel: string;
      sizePlaceholder: string;
      sizes: string[];
      caseTypeLabel: string;
      caseTypePlaceholder: string;
      caseTypes: string[];
      purchaseNote: string;
      purchaseLinkLabel: string;
      viewDetailsLabel: string;
      aboutTitle: string;
      aboutParagraphs: string[];
      sizeGuideTitle: string;
      sizeGuideDescription: string;
      sizeGuideItems: string[];
      packagingTitle: string;
      packagingItems: string[];
      fillingsTitle: string;
      fillingsDescription: string;
      packagingNote: string;
      reviewsTitle: string;
      reviewsBasedOn: string;
      reviewTitle: string;
      reviewText: string;
      reviewAttribution: string;
      ratingBreakdown: string;
      stars: string[];
      modularTitle: string;
      modularDescription: string;
      customiseTitle: string;
      customiseDescription: string;
      fillingsSectionTitle: string;
      fillingsSectionDescription: string;
      discoverTitle: string;
      discoverParagraphs: string[];
      discoverButton: string;
    };
    bookAppointment: {
      trigger: string;
      title: string;
      flow: {
        typeLabel: string;
        customisation: string;
        readjustment: string;
        locationLabel: string;
        locationPlaceholder: string;
        dateLabel: string;
        datePlaceholder: string;
        slotLabel: string;
        noSlots: string;
        loadingSlots: string;
        suggestionsIntro: string;
        suggestionTimes: string;
        nameLabel: string;
        phoneLabel: string;
        emailLabel: string;
        saveToCalendar: string;
        submit: string;
        submitting: string;
        pickDateFirst: string;
        confirmedTitle: string;
        confirmedAt: string;
        bookAnother: string;
        errorSlotTaken: string;
        errorGeneric: string;
        /** The language the guest would like their visit in; Staff read it on the calendar event. */
        languageLabel: string;
        languageEnglish: string;
        languageMandarin: string;
        languageNone: string;
        languageHint: string;
        /**
         * The marketing email box, ticked by default (ADR 0039): the same words
         * as `MARKETING_BOX_LABEL` at checkout.
         */
        marketingEmail: string;
        /** Customisation booking: the Measurement service fees, `{premium}` / `{basic}` (ADR 0024). */
        measurementFeeNote: string;
      };
      /** Signed-in re-adjustment booking (ADR 0024). */
      readjust: {
        signInTitle: string;
        signInBody: string;
        signInCta: string;
        pickTitle: string;
        /** `{order}` order number, `{date}` purchase date. */
        orderLine: string;
        /** `{date}` last day of the complimentary window. */
        badgeFree: string;
        /** `{fee}`. */
        badgeFee: string;
        badgeFreeUsed: string;
        /** `{fee}`, `{date}` the day the window closed. */
        badgeWindowEnded: string;
        notListed: string;
        notListedHint: string;
        whereLabel: string;
        where: {
          online_before_accounts: string;
          in_store: string;
          gift: string;
          other: string;
        };
        referenceLabel: string;
        emptyTitle: string;
        switchAccount: string;
        priceLabel: string;
        complimentary: string;
        /** `{fee}`. */
        payAndBook: string;
        redirecting: string;
        emailLocked: string;
        errorRequote: string;
        pickFirst: string;
        confirmedFree: string;
        confirmingTitle: string;
        confirmingSlow: string;
        /** `{fee}`, `{email}`. */
        confirmedPaid: string;
        rescheduleTitle: string;
        rescheduleBody: string;
        expiredTitle: string;
        expiredBody: string;
        bookAgain: string;
      };
    };
  };
  shop: {
    title: string;
    subtitle: string;
    searchPlaceholder: string;
    allCategories: string;
    noProducts: string;
    filters: { category: string; sort: string; clear: string };
    sort: { newest: string; priceAsc: string; priceDesc: string; popular: string };
    product: {
      addToCart: string;
      outOfStock: string;
      inStock: string;
      lowStock: string;
      from: string;
      description: string;
      specifications: string;
      reviews: string;
      relatedProducts: string;
      share: string;
    };
    cart: {
      title: string;
      empty: string;
      emptyHint: string;
      continueShopping: string;
      checkout: string;
      proceedToCheckout: string;
      subtotal: string;
      discount: string;
      shipping: string;
      shippingAtCheckout: string;
      freeShippingAway: string; // e.g. "{amount} away from free shipping"
      freeShippingQualified: string;
      tax: string;
      total: string;
      coupon: string;
      applyCoupon: string;
      removeCoupon: string;
      couponApplied: string; // e.g. 'Discount code "{code}" active'
      referralApplied: string; // e.g. 'Referral code "{code}" active'
      remove: string;
      customizationAddon: string;
      closeCart: string;
    };
    /** The delivery estimator (product page, landing section, shipping policy). */
    delivery: {
      title: string;
      subtitle: string;
      country: string;
      postalCode: string;
      postalPlaceholder: string;
      /** Placeholder where the country has no postal codes (Hong Kong, the UAE…). */
      postalOptional: string;
      check: string;
      checking: string;
      free: string;
      freeOver: string; // e.g. "Free shipping over {amount}"
      via: string; // e.g. "via {courier}"
      noOptions: string;
      error: string;
      note: string;
      noteCart: string;
      sameDay: string;
      day: string; // e.g. "{n} business day"
      days: string; // e.g. "{n} business days"
      range: string; // e.g. "{min}–{max} business days"
    };
    checkout: {
      title: string;
      information: string;
      shipping: string;
      payment: string;
      confirmation: string;
      email: string;
      phone: string;
      shippingAddress: string;
      shippingMethod: string;
      payWithStripe: string;
      orderConfirmed: string;
      orderNumber: string;
      thankYou: string;
    };
    account: {
      orders: string;
      addresses: string;
      profile: string;
    };
    customization: {
      title: string;
      subtitle: string;
      step1: string;
      step2: string;
      step3: string;
      step4: string;
      sleepPosition: string;
      bodyType: string;
      firmness: string;
      notes: string;
      notesPlaceholder: string;
      getRecommendation: string;
      recommendedSize: string;
      fillingConfig: string;
      alternatives: string;
      continueCustomize: string;
      coverStyle: string;
      caseStyle: string;
      quantity: string;
      baseIncluded: string;
      perUnit: string;
      reviewOrder: string;
      orderSummary: string;
      basePrice: string;
      addons: string;
      totalPrice: string;
      addToCart: string;
      upsells: string;
      back: string;
      next: string;
      positions: {
        side: string;
        back: string;
        stomach: string;
        mixed: string;
      };
      bodyTypes: {
        petite: string;
        average: string;
        large: string;
      };
      firmnesses: {
        soft: string;
        "medium-soft": string;
        medium: string;
        "medium-firm": string;
        firm: string;
      };
    };
    settings: {
      apiConfigs: string;
      apiConfigsDescription: string;
      addApi: string;
      editApi: string;
      apiName: string;
      apiSlug: string;
      apiBaseUrl: string;
      apiKey: string;
      apiConfig: string;
      apiActive: string;
    };
  };
  /** The Payment link page of a Staff order (ADR 0048). */
  pay: {
    title: string;
    orderNumber: string;
    greeting: string;
    greetingNoName: string;
    item: string;
    qty: string;
    amount: string;
    subtotal: string;
    shipping: string;
    discount: string;
    tax: string;
    total: string;
    collectFrom: string;
    deliverTo: string;
    noteFromUs: string;
    payButton: string;
    opening: string;
    secure: string;
    validUntil: string;
    paidTitle: string;
    paidBody: string;
    confirmingTitle: string;
    confirmingSlow: string;
    expiredTitle: string;
    expiredBody: string;
    closedTitle: string;
    closedBody: string;
    notFoundTitle: string;
    notFoundBody: string;
    contact: string;
    error: string;
  };
};
