import type { DiscoverySourceCatalog } from "./types";
import { OTHER_DISCOVERY_SOURCE_ID } from "./types";

export const DEFAULT_DISCOVERY_SOURCE_CATALOG: DiscoverySourceCatalog = {
  options: [
    {
      id: "instagram",
      labels: { "en-US": "Instagram", "zh-CN": "Instagram" },
      active: true,
    },
    {
      id: "google",
      labels: { "en-US": "Google", "zh-CN": "谷歌" },
      active: true,
    },
    {
      id: "friend-family",
      labels: { "en-US": "Friend / family", "zh-CN": "朋友 / 家人" },
      active: true,
    },
    {
      id: "clinic-partner",
      labels: { "en-US": "Clinic / partner", "zh-CN": "诊所 / 合作伙伴" },
      active: true,
    },
    {
      id: "walk-in",
      labels: { "en-US": "Walk-in", "zh-CN": "路过 / 到店" },
      active: true,
    },
    {
      id: OTHER_DISCOVERY_SOURCE_ID,
      labels: { "en-US": "Other", "zh-CN": "其他" },
      active: true,
      system: true,
    },
  ],
};
