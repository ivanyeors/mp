import type { Permission } from "@/lib/auth/permissions";

export type TimelineGroup = { readonly key: string; readonly label: string };

export type TimelineKind = string;

export type TimelineRef = {
  type: string;
  id: string;
  href?: string;
};

export type TimelineEntry = {
  id: string;
  at: string;
  kind: TimelineKind;
  ref: TimelineRef;
  summary: string;
  status?: string;
  detail?: string;
  rating?: number;
};

export type ShownTimelineEntry = TimelineEntry & { group: string };

export type TimelineCustomer = { id: string; email: string | null };

export type TimelineBatch = { entries: TimelineEntry[]; floor: string | null };

export type TimelineAdapter = {
  key: string;
  group: TimelineGroup;
  kinds: readonly TimelineKind[];
  permission: Permission;
  load(customer: TimelineCustomer, before: string | null, limit: number): Promise<TimelineBatch>;
};

export type TimelineCursor = { at: string; kind: string; refId: string; id: string };
