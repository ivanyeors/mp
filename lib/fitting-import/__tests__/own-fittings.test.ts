import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";
import { toOwnFittingView } from "../own-view";
import type { FittingRecordView } from "../view";

const h = vi.hoisted(() => ({ db: {} as FakeDb }));
vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  return { supabaseAdmin: () => fakeSupabaseAdmin(h.db) };
});

const { listOwnFittings } = await import("../records");

const MEI = "aaaaaaaa-0000-4000-8000-000000000001";
const KIM = "aaaaaaaa-0000-4000-8000-000000000002";
const SOPHIE = "00000000-0000-4000-8000-0000000000a5";
const DRIVE_ID = "1meibackphotoxxxxxxxxx";

const record = (over: Partial<FittingRecordView> = {}): FittingRecordView => ({
  id: "0e000000-0000-4000-8000-0000000000c1",
  fittedAt: "2025-11-03T06:15:00.000Z",
  importedAt: "2026-10-31T02:00:00.000Z",
  createdCustomer: false,
  matchedBy: "phone",
  nameOnForm: "Mei Tan",
  emailOnForm: null,
  mobileOnForm: "9123 0007",
  shoulderLengthIn: 18,
  neckToBackIn: 2.5,
  headToBackIn: 0,
  neckLengthIn: 3.5,
  recommendedSize: "M",
  configurationType: "T12",
  profileSide: "M-LN",
  sleeperType: "Side sleeper",
  sleepSymptoms: ["Neck pain"],
  bloodPressure: "Normal",
  acidReflux: false,
  earDiscomfortSideSleep: true,
  bedFirmness: "Medium Firm",
  usesBolster: null,
  ageGroup: "35-39",
  gender: "Female",
  discoverySource: "Instagram",
  referredBy: null,
  servicedBy: "Sophie",
  notes: "Re-check after 3 months.",
  files: [{ index: 0, slot: "back_photo", fileId: DRIVE_ID }],
  otherAnswers: [],
  ...over,
});

describe("toOwnFittingView", () => {
  it("keeps every answer and nothing about Drive or how the import found the Customer", () => {
    const own = toOwnFittingView(record());
    expect(Object.keys(own).sort()).toEqual(
      [
        "id", "fittedAt", "shoulderLengthIn", "neckToBackIn", "headToBackIn", "neckLengthIn", "recommendedSize",
        "configurationType", "profileSide", "sleeperType", "sleepSymptoms", "bloodPressure", "acidReflux",
        "earDiscomfortSideSleep", "bedFirmness", "usesBolster", "ageGroup", "gender", "discoverySource", "referredBy",
        "servicedBy", "notes", "otherAnswers",
      ].sort(),
    );
    expect(own).toMatchObject({ shoulderLengthIn: 18, profileSide: "M-LN", bloodPressure: "Normal", notes: "Re-check after 3 months." });
    expect(JSON.stringify(own)).not.toContain(DRIVE_ID);
  });

  it("leaves out an upload cell kept as an other answer, and any Google file link", () => {
    const own = toOwnFittingView(
      record({
        otherAnswers: [
          ["Upload a photo of your back", "see the shared folder"],
          ["Upload your mattress", "https://drive.google.com/open?id=1mattressxxxxxxxxxxx"],
          ["Signed form", "https://docs.google.com/document/d/1formxxxxxxxxxxxx/edit"],
          ["D) Neck length Measurements (Inches)", "not taken"],
        ],
      }),
    );
    expect(own.otherAnswers).toEqual([["D) Neck length Measurements (Inches)", "not taken"]]);
  });
});

describe("listOwnFittings", () => {
  beforeEach(() => {
    const row = (id: string, customer_id: string, fitted_at: string) => ({
      id, customer_id, batch_id: "b1", source: "google_form", source_key: id.repeat(2), created_customer: false,
      matched_by: "email", fitted_at, imported_at: "2026-10-31T02:00:00.000Z",
      name_on_form: "Mei Tan", email_on_form: "mei.tan@example.test", mobile_on_form: "9123 0007",
      shoulder_length_in: "18.00", neck_to_back_in: "2.50", head_to_back_in: null, neck_length_in: null,
      recommended_size: "M", configuration_type: "T12", profile_side: "M-LN", sleeper_type: null, sleep_symptoms: null,
      blood_pressure: null, acid_reflux: null, ear_discomfort_side_sleep: null, bed_firmness: null, uses_bolster: null,
      age_group: null, gender: null, discovery_source: null, referred_by: null, serviced_by: "sophie",
      serviced_by_staff_id: SOPHIE, notes: null,
      drive_files: [{ slot: "back_photo", file_id: DRIVE_ID }, { slot: "customisation_form", file_id: "1meiformxxxxxxxxxxxx" }],
      other_answers: { "Upload a photo of your side": "on my phone" },
    });
    h.db = {
      mp_staff: [{ id: SOPHIE, name: "Sophie" }],
      customer_fittings: [
        row("0e000000-0000-4000-8000-0000000000c1", MEI, "2024-05-01T03:00:00.000Z"),
        row("0e000000-0000-4000-8000-0000000000c2", MEI, "2025-11-03T06:15:00.000Z"),
        row("0e000000-0000-4000-8000-0000000000c3", KIM, "2025-12-01T06:15:00.000Z"),
      ],
    };
  });

  it("reads only that Customer's records, newest first, with no Drive file in them", async () => {
    const own = await listOwnFittings(MEI);
    expect(own.map((f) => f.id)).toEqual(["0e000000-0000-4000-8000-0000000000c2", "0e000000-0000-4000-8000-0000000000c1"]);
    expect(own[0]).toMatchObject({ shoulderLengthIn: 18, neckToBackIn: 2.5, servicedBy: "Sophie", otherAnswers: [] });
    const sent = JSON.stringify(own);
    expect(sent).not.toMatch(/1mei|drive|"files"|fileId|matched|on_?form|imported|createdCustomer/i);
  });
});
