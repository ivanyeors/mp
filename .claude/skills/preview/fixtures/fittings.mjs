// Google Form fittings (ADR 0042): Mei (points.mjs) has two in-store
// fittings from the old form, so her page shows the Fitting history card:
// /settings/customers/00000000-0000-4000-8000-0000000000c7. Customers →
// Import fittings shows one applied import and one undone. The signed-in
// preview customer (Jamie, reviews.mjs) has one too, so /account shows the
// Profile's Fitting history: its Drive file and the Drive link kept as an
// other answer must not show there (ADR 0042 h). Every name, measurement,
// answer and Drive id is made up; Drive is unreachable in the preview, so the
// photo tiles show their "Open in Drive" fallback.

import { POINTS_CUSTOMER } from "./points.mjs";

/** The preview Owner's own Customer row (reviews.mjs). */
const OWN_CUSTOMER = "cust-preview-owner";

const SOPHIE = "00000000-0000-4000-8000-0000000000a5";
const BATCH = "00000000-0000-4000-8000-0000000000b9";
const UNDONE = "00000000-0000-4000-8000-0000000000ba";

export default function fittings({ now }) {
  const ago = (days) => new Date(now.getTime() - days * 86_400_000).toISOString();
  const file = (slot, n) => ({ slot, file_id: `1preview${slot.replace(/_/g, "")}${n}xxxxxxxx` });
  return {
    tables: {
      mp_staff: [{ id: SOPHIE, name: "Sophie", created_at: ago(900), updated_at: ago(900) }],
      fitting_import_batches: [
        {
          id: BATCH, source: "google_form_csv", file_name: "Mpillow fitting form (Responses).csv", file_sha256: "a".repeat(64),
          date_order: "mdy", rows_total: 412, rows_done: 412, created: 288, matched_email: 97, matched_phone: 9,
          already_imported: 0, skipped: { no_customer_for_mobile: 14, no_contact: 3, no_timestamp: 1 },
          run_by_user_id: null, run_by_profile_id: SOPHIE, applied_at: ago(1), rolled_back_at: null, undo_counts: null, created_at: ago(1),
        },
        {
          id: UNDONE, source: "google_form_csv", file_name: "forms (1).csv", file_sha256: "b".repeat(64),
          date_order: "dmy", rows_total: 40, rows_done: 40, created: 31, matched_email: 6, matched_phone: 1,
          already_imported: 0, skipped: { no_contact: 2 },
          run_by_user_id: null, run_by_profile_id: SOPHIE, applied_at: ago(2), rolled_back_at: ago(2),
          undo_counts: { fittings_removed: 38, customers_removed: 31, customers_kept: 0, kept_signed_in: 0, kept_referenced: 0 }, created_at: ago(2),
        },
      ],
      customer_fittings: [
        {
          id: "00000000-0000-4000-8000-0000000000e1", customer_id: POINTS_CUSTOMER, batch_id: BATCH, source: "google_form",
          source_key: "1".repeat(64), created_customer: false, matched_by: "email", fitted_at: ago(380), imported_at: ago(1),
          name_on_form: "Mei Tan", email_on_form: "mei.tan@example.test", mobile_on_form: "9123 0007",
          shoulder_length_in: 18, neck_to_back_in: 2.5, head_to_back_in: 0, neck_length_in: 3.5,
          recommended_size: "M", configuration_type: "T12", profile_side: "M-LN", sleeper_type: "Side & Back sleeper",
          sleep_symptoms: ["Neck pain", "Snoring"], blood_pressure: "Normal", acid_reflux: false, ear_discomfort_side_sleep: false,
          bed_firmness: "Medium Firm", uses_bolster: false, age_group: "35-39", gender: "Female", discovery_source: "Instagram",
          referred_by: null, serviced_by: "Sophie", serviced_by_staff_id: SOPHIE,
          notes: "Prefers the neck a little lower. Re-check after 3 months.",
          drive_files: [file("back_photo", 1), file("side_photo", 1), file("back_sleep_preview", 1), file("side_sleep_preview", 1), file("customisation_form", 1)],
          other_answers: {},
        },
        {
          id: "00000000-0000-4000-8000-0000000000e2", customer_id: POINTS_CUSTOMER, batch_id: BATCH, source: "google_form",
          source_key: "2".repeat(64), created_customer: false, matched_by: "email", fitted_at: ago(720), imported_at: ago(1),
          name_on_form: "Mei Tan", email_on_form: "mei.tan@example.test", mobile_on_form: null,
          shoulder_length_in: 17.5, neck_to_back_in: 2, head_to_back_in: 0.5, neck_length_in: null,
          recommended_size: "S", configuration_type: "T9", profile_side: "S-SN", sleeper_type: "Side sleeper",
          sleep_symptoms: ["Shoulder pain"], blood_pressure: "Unsure", acid_reflux: null, ear_discomfort_side_sleep: true,
          bed_firmness: "Soft", uses_bolster: true, age_group: "30-34", gender: "Female", discovery_source: "Friend",
          referred_by: "Dr Lee", serviced_by: "Ray", serviced_by_staff_id: null, notes: null,
          drive_files: [file("back_photo", 2)],
          other_answers: { "D) Neck length Measurements (Inches)": "not taken", "Did you have acid reflux?": "Sometimes" },
        },
        {
          id: "00000000-0000-4000-8000-0000000000e3", customer_id: OWN_CUSTOMER, batch_id: BATCH, source: "google_form",
          source_key: "3".repeat(64), created_customer: false, matched_by: "email", fitted_at: ago(240), imported_at: ago(1),
          name_on_form: "Jamie Lim", email_on_form: "owner@preview.local", mobile_on_form: "9123 0042",
          shoulder_length_in: 19, neck_to_back_in: 3, head_to_back_in: 0.5, neck_length_in: 4,
          recommended_size: "L", configuration_type: "T12", profile_side: "L-MN", sleeper_type: "Back sleeper",
          sleep_symptoms: ["Neck pain", "Headaches"], blood_pressure: "Normal", acid_reflux: false, ear_discomfort_side_sleep: false,
          bed_firmness: "Firm", uses_bolster: true, age_group: "40-44", gender: "Male", discovery_source: "Friend",
          referred_by: "Mei Tan", serviced_by: "Sophie", serviced_by_staff_id: SOPHIE,
          notes: "Sleeps mostly on the back. Lower the neck by half a notch at the next visit.",
          drive_files: [file("back_photo", 3), file("side_photo", 3)],
          other_answers: { "Upload a photo of your mattress": "https://drive.google.com/open?id=1previewmattressxxxxxxxx", "Pillow height today": "Two fingers" },
        },
        {
          // Jamie's visit the year before, under another email: found by mobile and name.
          id: "00000000-0000-4000-8000-0000000000e4", customer_id: OWN_CUSTOMER, batch_id: BATCH, source: "google_form",
          source_key: "4".repeat(64), created_customer: false, matched_by: "phone", fitted_at: ago(610), imported_at: ago(1),
          name_on_form: "Jamie Lim", email_on_form: "jamie.l@preview.local", mobile_on_form: "+65 9123 0042",
          shoulder_length_in: 18.5, neck_to_back_in: 3, head_to_back_in: 1, neck_length_in: null,
          recommended_size: "M", configuration_type: "T12", profile_side: "M-LN", sleeper_type: "Side & Back sleeper",
          sleep_symptoms: ["Neck pain"], blood_pressure: "Normal", acid_reflux: false, ear_discomfort_side_sleep: null,
          bed_firmness: "Medium Firm", uses_bolster: false, age_group: "40-44", gender: "Male", discovery_source: "Friend",
          referred_by: "Mei Tan", serviced_by: "Ray", serviced_by_staff_id: null, notes: null,
          drive_files: [file("back_photo", 4)],
          other_answers: {},
        },
      ],
    },
    rpc: {
      // The preview's read: who holds these emails and mobiles, and which rows are in.
      fitting_import_preview_matches: ({ p_emails = [], p_phones = [] }, { tables }) => {
        const out = [];
        for (const c of tables.customers ?? []) {
          const email = String(c.email ?? "").toLowerCase();
          if (p_emails.includes(email)) out.push({ match: "email", key: email, customer_id: c.id, has_name: Boolean(c.first_name), has_phone: Boolean(c.phone) });
          const name_key = [c.first_name, c.last_name].filter(Boolean).join(" ").replace(/\s+/g, " ").trim().toLowerCase() || null;
          if (c.phone && p_phones.includes(c.phone)) out.push({ match: "phone", key: c.phone, customer_id: c.id, has_name: Boolean(c.first_name), has_phone: true, name_key });
        }
        return out;
      },
    },
  };
}
