import { supabaseAdmin } from "@/lib/supabase/server";
import { fittingLabel } from "@/lib/fitting-import/view";
import { FITTINGS_GROUP } from "@/lib/crm/timeline/groups";
import { readStream } from "@/lib/crm/timeline/read";
import type { TimelineAdapter } from "@/lib/crm/timeline/types";

type FittingRow = {
  id: string;
  fitted_at: string;
  recommended_size: string | null;
  configuration_type: string | null;
  profile_side: string | null;
  serviced_by: string | null;
};

export const fittingsAdapter: TimelineAdapter = {
  key: "fittings",
  group: FITTINGS_GROUP,
  kinds: ["fitting.recorded"],
  permission: "customers",
  load(customer, before, limit) {
    return readStream<FittingRow>(
      supabaseAdmin()
        .from("customer_fittings")
        .select("id, fitted_at, recommended_size, configuration_type, profile_side, serviced_by")
        .eq("customer_id", customer.id),
      "fitted_at",
      before,
      limit,
      (f) => ({
        id: `fitting.recorded:${f.id}`,
        at: f.fitted_at,
        kind: "fitting.recorded",
        ref: { type: "customer_fitting", id: f.id },
        summary: `In-store fitting: ${fittingLabel({
          recommendedSize: f.recommended_size,
          configurationType: f.configuration_type,
          profileSide: f.profile_side,
        })}${f.serviced_by ? ` (serviced by ${f.serviced_by})` : ""}`,
      }),
    );
  },
};
