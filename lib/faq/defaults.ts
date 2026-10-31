import type { FaqDefaultCategory } from "./types";

/** Single source of truth for FAQ seed data (en-US + zh-CN). */
export const FAQ_DEFAULTS: FaqDefaultCategory[] = [
  {
    key: "about-mpillow",
    labels: {
      "en-US": "About Mpillow",
      "zh-CN": "关于 Mpillow",
    },
    items: [
      {
        slug: "where-did-mpillow-come-from",
        content: {
          "en-US": {
            question: "Where did Mpillow came about?",
            answer:
              "The Mpillow is designed by an engineer in the precision cutting tools industry. The founder of Mpillow could not get the right shape and height of the pillow in the market and after years of research and design, the Mpillow was born.\n\n[Learn more about our story](/our-partners)",
          },
          "zh-CN": {
            question: "Mpillow 是如何诞生的？",
            answer:
              "Mpillow 由一位精密刀具行业的工程师设计。创始人无法在市面上找到合适形状与高度的枕头，经过多年研究与设计，Mpillow 由此诞生。\n\n[了解更多品牌故事](/our-partners)",
          },
        },
      },
      {
        slug: "what-customisation-does-mpillow-have",
        content: {
          "en-US": {
            question: "What kind of customisation does Mpillow has?",
            answer:
              "We customise the Mpillow based on your:\n\n1. Shoulder length\n2. Neck depth\n3. Head depth\n4. Neck length\n\nThese measurements will be used to identify the following:\n\n1. Mpillow Size\n2. Mpillow configuration type\n3. Profile Type\n\nOur pillows come in 5 different sizes for your consideration.\n\nIf you are unsure what pillow size to buy, you can [book an appointment](/support) for a customisation request.",
          },
          "zh-CN": {
            question: "Mpillow 有哪些定制方式？",
            answer:
              "我们根据以下身体数据为您定制 Mpillow：\n\n1. 肩长\n2. 颈深\n3. 头深\n4. 颈长\n\n这些测量数据用于确定您的 Mpillow 尺寸、配置类型和轮廓类型。\n\n我们的枕头有 5 种不同尺寸。若不确定该选哪种尺寸，可[预约咨询](/support)进行定制测量。",
          },
        },
      },
      {
        slug: "what-is-included-when-i-buy-mpillow",
        content: {
          "en-US": {
            question: "What is included when I buy the Mpillow?",
            answer:
              "You will have:\n\n- x2 Pillow cover sheets\n- x1 Pillow case\n- x1 Waterproof Inner Protector\n- Number of fillings provided will vary based on your body profile and pillow size\n- x1 High Quality Reusable Vacuum Bag — apart from the Mpillow, you will also have a vacuum bag to seal and compress the Mpillow in a smaller size in case there is a need to bring the Mpillow overseas\n- x1 Laundry Bag — for you to separate the components of the Mpillow when you are washing it together with your other laundry items",
          },
          "zh-CN": {
            question: "购买 Mpillow 包含哪些配件？",
            answer:
              "您将获得：\n\n- 枕套床单 x2\n- 枕套 x1\n- 防水内胆保护套 x1\n- 填充物（数量因身体数据和枕头尺寸而异）\n- 高品质可重复使用真空压缩袋 x1 — 便于出国携带\n- 洗衣袋 x1 — 与其他衣物一起洗涤时分装各部件",
          },
        },
      },
      {
        slug: "difference-standard-premium-customised",
        content: {
          "en-US": {
            question: "What is the difference with the Standard / Premium / Customised Mpillows?",
            answer: "**Coming Soon!**",
          },
          "zh-CN": {
            question: "标准版、高级版和定制版 Mpillow 有什么区别？",
            answer: "**即将推出！** 我们正在准备详细对比指南。在此之前，请访问[商店](/shop)或[联系我们](/support)获取个性化建议。",
          },
        },
      },
      {
        slug: "what-is-mpillow-made-of",
        content: {
          "en-US": {
            question: "What is Mpillow made of?",
            answer:
              "The Mpillow is made up of different modular components that consist of a uniquely designed case, two special shaped cover sheets, a waterproof terry cotton protector, soft and firm fillings that consists of microfibre structures for each firmness.",
          },
          "zh-CN": {
            question: "Mpillow 由什么材料制成？",
            answer:
              "Mpillow 由模块化组件构成：独特设计的枕套、两片特殊形状的床单套、防水毛巾棉保护套，以及由微纤维结构制成的软质和硬质填充物。",
          },
        },
      },
      {
        slug: "what-are-cover-sheets-for",
        content: {
          "en-US": {
            question: "What are the Cover Sheets for?",
            answer:
              "The Mpillow cover sheets helps to create convenience when it comes to washing the Mpillow.\n\nInstead of washing the whole pillow, you can choose to just remove the cover sheet and wash it like how you would normally wash your clothes.",
          },
          "zh-CN": {
            question: "床单套有什么作用？",
            answer:
              "Mpillow 床单套让清洗更方便。您无需清洗整个枕头，只需拆下床单套，像普通床品一样清洗即可。",
          },
        },
      },
      {
        slug: "why-cover-sheet-not-cover-whole-pillow",
        content: {
          "en-US": {
            question: "Why does the cover sheet not cover the whole pillow?",
            answer:
              "This is due to the design of the Mpillow case, which has the anti-slip layer below the pillow. The Mpillow cover sheets provides an extra layer of hygiene protection and convenience to you.\n\nWe understand that the aesthetics of the cover sheet might not go well with your bedroom — you could sleep on Mpillow without it. It's purely just for convenience and people who love to wash the covers every single day.",
          },
          "zh-CN": {
            question: "为什么床单套不能覆盖整个枕头？",
            answer:
              "这是由于 Mpillow 枕套的设计——枕头下方有防滑层。床单套提供额外的卫生保护层和使用便利。\n\n若外观不符合您的卧室风格，也可以不使用床单套直接睡——它们纯粹是为了方便和日常清洗。",
          },
        },
      },
      {
        slug: "why-special-pillow-case",
        content: {
          "en-US": {
            question: "Why do I need a special pillow case?",
            answer:
              'The design of Mpillow is measured to fit to your body structure, hence the "M" Shape that you see in our product. A special case is required to ensure that the ergonomics of the sleep posture would not be obstructed with the shoulders when you sleep on the side.\n\nAdding another layer of a normal pillow case would not allow you to have the full ergonomic experience with the Mpillow as it will not conform to the M shape design of the pillow.',
          },
          "zh-CN": {
            question: "为什么需要专用枕套？",
            answer:
              "Mpillow 根据您的身体结构测量定制——因此呈现独特的「M」形。专用枕套确保侧卧时人体工学支撑不被肩膀阻挡。\n\n普通枕套无法贴合 M 形设计，会影响完整的 ergonomic 睡眠体验。",
          },
        },
      },
      {
        slug: "what-is-inner-protector-for",
        content: {
          "en-US": {
            question: "What is the Mpillow Inner Protector for?",
            answer:
              "Our Mpillow design with hygiene in mind. The inner protector helps to prevent all kinds of dirt and bacteria even liquids or saliva from entering the pillow or reaching the fillings.\n\nAs it is made from a waterproof layer beneath the fabric, even water molecules could not penetrate into the fabric. Because the cover sheets and pillow case add more layers of protection on top, the inner protector only needs washing once a year, when you wash the whole pillow. Dirt and germs collect in the protector, so do not skip it. You can wash it more often if you prefer. See the [care ritual](/mp-care) for the full routine.",
          },
          "zh-CN": {
            question: "Mpillow 内胆保护套有什么作用？",
            answer:
              "我们的设计以卫生为优先。内胆保护套可防止污垢、细菌、液体和唾液进入填充物。\n\n织物下方有防水层——水分子也无法渗透。由于外层还有床单套和枕套保护，内胆保护套每年清洗一次即可，与整只枕头一起清洗。污垢和细菌会积聚在保护套中，请勿省略；也可按个人喜好更频繁地清洗。完整步骤请参阅[保养指南](/mp-care)。",
          },
        },
      },
      {
        slug: "inner-protector-waterproof-or-resistant",
        content: {
          "en-US": {
            question: "Is the Inner Protector Water Proof or Water Resistant?",
            answer:
              "The protector is waterproof. There are filter holes carefully placed in the back part of the protector to enable air to escape from within the protector.",
          },
          "zh-CN": {
            question: "内胆保护套是防水还是防泼溅？",
            answer:
              "保护套为**完全防水**。背面设有精心布置的透气滤孔，便于内部空气排出。",
          },
        },
      },
      {
        slug: "what-sleeping-positions",
        content: {
          "en-US": {
            question: "What sleeping position can you sleep with Mpillow?",
            answer:
              "At this moment, ergonomically speaking, we are recommending users to sleep on the side and on their back.\n\nIf you have the habit to sleep on your stomach more, you could try adjusting your sleep to the side at the moment.\n\nSleeping on the back is possible as well, however you will need to have support for your lower back area.",
          },
          "zh-CN": {
            question: "Mpillow 适合哪些睡姿？",
            answer:
              "从人体工学角度，我们建议侧卧和仰卧。\n\n若习惯趴睡，可尝试调整为侧卧。仰卧也可以，但可能需要额外的腰部支撑。",
          },
        },
      },
    ],
  },
  {
    key: "care-maintenance",
    labels: {
      "en-US": "Care & Maintenance",
      "zh-CN": "保养与维护",
    },
    items: [
      {
        slug: "why-fluff-mpillow",
        content: {
          "en-US": {
            question: "Why do I need to fluff my Mpillow?",
            answer:
              "We would recommend fluffing out the pillow so that all the fillings fall into place evenly. This will maintain the buoyancy of the pillow and maintain a comfortable height for your head posture.",
          },
          "zh-CN": {
            question: "为什么需要拍打蓬松 Mpillow？",
            answer:
              "建议拍打枕头使填充物均匀分布，保持蓬松度和舒适的头部支撑高度。",
          },
        },
      },
      {
        slug: "how-often-fluff-mpillow",
        content: {
          "en-US": {
            question: "How often should I fluff my Mpillow?",
            answer:
              "Everyday would be the recommend frequency. The fillings in the Mpillow will revert its structure as long as there are movement.",
          },
          "zh-CN": {
            question: "应该多久拍打蓬松一次？",
            answer: "建议每天拍打一次。只要有活动，Mpillow 的填充物就会恢复原有结构。",
          },
        },
      },
      {
        slug: "pillow-gets-flat",
        content: {
          "en-US": {
            question: "What should I do if my pillow gets flat after awhile?",
            answer:
              "Don't worry! There are a few remedies for this — you could fluff your pillow everyday, or you could add in the extra fillings that was provided.\n\nIf the pillow gets flat after 6 or more months, try removing the fillings totally to air them. This will \"reset\" their shape and fluff.\n\nAlternatively, you can remove the fillings from the Mpillow to wash them as well. Be sure to take a look at our [wash care guide](/mp-care) for more information.",
          },
          "zh-CN": {
            question: "枕头使用一段时间后变扁怎么办？",
            answer:
              "别担心！可以每天拍打蓬松，或添加附赠的额外填充物。\n\n若使用 6 个月以上变扁，可将填充物全部取出晾晒通风——这能恢复形状和蓬松度。也可取出填充物清洗。详情请参阅 [Mpillow 保养指南](/mp-care)。",
          },
        },
      },
      {
        slug: "can-i-wash-mpillow",
        content: {
          "en-US": {
            question: "Can I wash the Mpillow?",
            answer:
              "You can wash every single component of the Mpillow including the fillings!\n\nPlease refer to our [wash care guide](/mp-care).",
          },
          "zh-CN": {
            question: "Mpillow 可以清洗吗？",
            answer:
              "可以——Mpillow 的每个组件都可以清洗，包括填充物！请参阅我们的[清洗保养指南](/mp-care)。",
          },
        },
      },
      {
        slug: "how-to-dry-fillings",
        content: {
          "en-US": {
            question: "How can we dry the fillings after washing it?",
            answer:
              "You can dry your fillings under sheltered sunlight. Avoid direct sunlight! For more information please refer to our [wash care guide](/mp-care).",
          },
          "zh-CN": {
            question: "清洗后如何晾干填充物？",
            answer:
              "可在遮阴处晾晒填充物，避免阳光直射！更多信息请参阅[清洗保养指南](/mp-care)。",
          },
        },
      },
      {
        slug: "how-to-assemble-mpillow",
        content: {
          "en-US": {
            question: "How do I assemble the Mpillow myself?",
            answer:
              "If you are unsure how to reassemble your Mpillow, you can request a video instructional sent to you via our customer support on WhatsApp or you can [book a re-adjustment session](/support) with us.",
          },
          "zh-CN": {
            question: "如何自行组装 Mpillow？",
            answer:
              "若不确定如何重新组装，可通过 WhatsApp 客服索取视频教程，或[预约调整服务](/support)。",
          },
        },
      },
      {
        slug: "how-often-change-cover-sheet",
        content: {
          "en-US": {
            question: "How often should I change my cover sheet?",
            answer:
              "This would depend on your personal preference. Usually, you can wash the covers every few days or once every 2 weeks. Do check out our [guide here](/mp-care).",
          },
          "zh-CN": {
            question: "应该多久更换一次床单套？",
            answer:
              "视个人喜好而定。通常每隔几天或每两周清洗一次即可。更多建议请参阅[保养指南](/mp-care)。",
          },
        },
      },
    ],
  },
  {
    key: "warranty",
    labels: {
      "en-US": "Warranty",
      "zh-CN": "保修",
    },
    items: [
      {
        slug: "ten-year-fillings-warranty",
        content: {
          "en-US": {
            question: "Wow! 10 years fillings warranty?",
            answer:
              "Yes! 10 years because we are confident that the fillings would not go completely flat, or loose its fillings. If the filling is compressed over a long period of time, please refer to [Mpillow Care](/mp-care) page about fluffing the fillings. In an event that you find that you have used up your extra given fillings, you could just buy extras from our [accessories shop](/shop).",
          },
          "zh-CN": {
            question: "10 年填充物保修？",
            answer:
              "是的！我们提供 10 年保修，因为我们对填充物品质有信心——不会完全变扁或失去结构。若长期使用后压缩，请参阅 [Mpillow 保养](/mp-care) 页面关于拍松的说明。若附赠填充物已用完，可在[配件商店](/shop)购买补充。",
          },
        },
      },
      {
        slug: "warranty-covers-case-protectors",
        content: {
          "en-US": {
            question: "Is there warranty for the Mpillow Covers, Case & Protectors?",
            answer:
              "There is a one week manufacturer defect warranty starting from the receiving date.",
          },
          "zh-CN": {
            question: "枕套、外壳和保护套有保修吗？",
            answer: "自收货之日起，提供一周制造缺陷保修。",
          },
        },
      },
    ],
  },
  {
    key: "returns-refund",
    labels: {
      "en-US": "Returns & Refund",
      "zh-CN": "退货与退款",
    },
    items: [
      {
        slug: "wrong-size-exchange",
        content: {
          "en-US": {
            question: "I got the wrong size, could I do an exchange?",
            answer:
              "Yes, you can! We are committed to help you get the rest you need. Do drop us an email if you find this an issue with 2 weeks. We will do an exchange for you. If it is a bigger pillow size, you will have to top up the difference. If it's smaller, we could offset the difference by giving accessories around the price difference.",
          },
          "zh-CN": {
            question: "尺寸买错了，可以换货吗？",
            answer:
              "可以！我们致力于帮您获得优质睡眠。若遇此问题，请在 2 周内发邮件联系我们，我们将安排换货。换更大尺寸需补差价；换更小尺寸可按差价抵扣配件。",
          },
        },
      },
      {
        slug: "refund-duration",
        content: {
          "en-US": {
            question: "What is the refund duration?",
            answer: "There is currently no refund for our premium customisable pillows.",
          },
          "zh-CN": {
            question: "退款期限是多久？",
            answer: "目前高级定制枕头不支持退款。",
          },
        },
      },
      {
        slug: "return-after-one-month",
        content: {
          "en-US": {
            question: "Could I return the product after 1 month of trying?",
            answer:
              "Not at the moment. However we really committed that you can have a good rest and a good pillow to support your rest that we will be willing to understand your reasons for return and also to go all out to help you with your request and issues.",
          },
          "zh-CN": {
            question: "试用一个月后可以退货吗？",
            answer:
              "目前暂不支持。但我们致力于帮您获得优质睡眠，会尽力了解您的情况并协助处理。",
          },
        },
      },
      {
        slug: "how-to-create-return-request",
        content: {
          "en-US": {
            question: "How can I create a return request?",
            answer:
              "Give us a call regarding your reasons of return. We will do our best to help with that request. You can also reach us via our [support page](/support).",
          },
          "zh-CN": {
            question: "如何申请退货？",
            answer:
              "请致电说明退货原因，我们会尽力协助。您也可通过[客服页面](/support)联系我们。",
          },
        },
      },
      {
        slug: "product-collected-for-refund",
        content: {
          "en-US": {
            question: "Can I have the product collected for refund/exchange?",
            answer:
              "There wont be any collection by us for refunds, or exchange. You will have to drop by for us to assist you with your issues personally.",
          },
          "zh-CN": {
            question: "可以上门取件办理退款/换货吗？",
            answer: "我们不提供上门取件服务。需您亲自到店，以便我们当面协助处理。",
          },
        },
      },
      {
        slug: "pack-everything-when-returning",
        content: {
          "en-US": {
            question: "Do I need to pack everything in the package or box when returning?",
            answer:
              "Yes, please do. If there is no box, you could pack it up in the dry bag with the pillow vacuum properly. It would help in our exchange process.",
          },
          "zh-CN": {
            question: "退货时需要原包装装回所有物品吗？",
            answer:
              "是的。若无原包装盒，可用干燥袋将枕头真空压缩后妥善包装，这有助于换货流程。",
          },
        },
      },
      {
        slug: "refund-after-shipment",
        content: {
          "en-US": {
            question: "Could I refund immediately after the shipment is out?",
            answer:
              "Not at the moment, you will need to have the product arrive to you. After which you will be able to do your refund.",
          },
          "zh-CN": {
            question: "发货后可以立即退款吗？",
            answer: "目前不可以。需先收到商品后，方可按政策申请退款（如适用）。",
          },
        },
      },
    ],
  },
  {
    key: "shipping",
    labels: {
      "en-US": "Shipping",
      "zh-CN": "配送",
    },
    items: [
      {
        slug: "how-long-to-ship",
        content: {
          "en-US": {
            question: "How long does it takes to ship?",
            answer:
              "Usually it takes 5 - 7 working days to do fulfilment and shipping it to your doorstep.",
          },
          "zh-CN": {
            question: "配送需要多长时间？",
            answer: "通常需要 5–7 个工作日完成备货并送达您家门口。",
          },
        },
      },
      {
        slug: "ship-internationally",
        content: {
          "en-US": {
            question: "Do you ship internationally?",
            answer:
              "As our focus is currently set only in Singapore, we only ship it around this region. If you would like to ship to another country, do [send us a request](/support).",
          },
          "zh-CN": {
            question: "可以国际配送吗？",
            answer:
              "目前主要服务新加坡及周边地区。若需配送至其他国家，请[联系我们](/support)咨询。",
          },
        },
      },
      {
        slug: "how-to-track-shipment",
        content: {
          "en-US": {
            question: "How do I track my shipment?",
            answer:
              "After ordering, or customising the Mpillow with us at our store, you will receive an invoice or a order in your email.",
          },
          "zh-CN": {
            question: "如何追踪物流？",
            answer:
              "在线下单或到店定制后，您将收到包含物流信息的订单确认邮件或发票。",
          },
        },
      },
      {
        slug: "reject-wrong-shipment",
        content: {
          "en-US": {
            question: "If its the wrong pillow size or product can I reject the shipment?",
            answer:
              "Yes, you can and you would have to give us a update for us to replace the right pillow for you.",
          },
          "zh-CN": {
            question: "收到错误尺寸或产品可以拒收吗？",
            answer: "可以——请告知我们，我们将为您更换正确的产品。",
          },
        },
      },
      {
        slug: "lost-after-delivered",
        content: {
          "en-US": {
            question: "What if my items is lost after the status is being delivered?",
            answer:
              "Do drop us an email or give us a call. We will start our investigation immediately when this happens.\n\nEvery delivery will have a tracking number so it would be very difficult for the product to be lost in transit.",
          },
          "zh-CN": {
            question: "物流显示已送达但物品丢失怎么办？",
            answer:
              "请发邮件或致电我们，我们将立即展开调查。每笔订单均有物流单号，运输途中丢失的情况极为罕见。",
          },
        },
      },
    ],
  },
];
