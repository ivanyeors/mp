export type SyncAction =
  | "created" | "updated" | "deleted" | "unchanged" | "activated" | "deactivated" | "skipped" | "error";

export type SyncStep = { area: string; action: SyncAction; target: string; detail?: string };

export type SyncReport = {
  ok: boolean;
  started_at: string;
  finished_at: string;
  steps: SyncStep[];
};
