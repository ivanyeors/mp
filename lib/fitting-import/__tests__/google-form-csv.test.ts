import { describe, expect, it } from "vitest";
import {
  driveFileIds,
  FORM_FIELDS,
  normaliseFittingRow,
  parseFittingFormCsv,
  parseFormTimestamp,
  parseInches,
  parseYesNo,
  readDateOrder,
  splitAnswers,
} from "@/lib/fitting-import/google-form-csv";
import { formCsv, FORM_HEADER } from "./fixtures";

const NOW = Date.parse("2026-10-31T08:00:00Z");

describe("parseFittingFormCsv", () => {
  it("matches every column of the owner's form, and keeps nothing as an other answer", () => {
    const { header, rows } = parseFittingFormCsv(formCsv([{}]));
    expect(header).toEqual({ ok: true, problems: [], missing: [], other: [] });
    expect(Object.keys(rows[0]!.cells).sort()).toEqual(
      FORM_FIELDS.filter((f) => f !== "notes" && f !== "referredBy").sort(),
    );
    expect(rows[0]!.cells.name).toBe("Avery Lim");
    expect(rows[0]!.cells.servicedBy).toBe("Sophie");
  });

  it("keeps a column it does not know under its header, and numbers a repeated one", () => {
    const header = [...FORM_HEADER, "Favourite colour:", "Favourite colour"];
    const { header: check, rows } = parseFittingFormCsv(
      formCsv([{ "Favourite colour:": "Blue", "Favourite colour": "Green" }], header),
    );
    expect(check.other).toEqual(["Favourite colour", "Favourite colour (2)"]);
    expect(rows[0]!.other).toEqual({ "Favourite colour": "Blue", "Favourite colour (2)": "Green" });
  });

  it("matches a renamed question by its words, and lists what is missing", () => {
    const { header: check, rows } = parseFittingFormCsv(
      ["Timestamp,Email address,Shoulder length (in),Notes", "10/17/2026 13:00:00,a@example.com,17.5,hello"].join("\n"),
    );
    expect(check.ok).toBe(true);
    expect(rows[0]!.cells).toEqual({ timestamp: "10/17/2026 13:00:00", email: "a@example.com", shoulderLength: "17.5", notes: "hello" });
    expect(check.missing).toContain("Configuration Type");
  });

  it("refuses a file with no Timestamp, or with neither Email nor Mobile", () => {
    expect(parseFittingFormCsv("Name,Email\nA,a@example.com").header.problems).toEqual(["The file has no Timestamp column."]);
    expect(parseFittingFormCsv("Timestamp,Name\n10/17/2026,A").header.problems).toEqual([
      "The file has neither an Email nor a Mobile column.",
    ]);
    expect(parseFittingFormCsv("Timestamp,Email").header.problems).toEqual(["The file has no rows."]);
  });
});

describe("timestamps", () => {
  it("reads the Sheets export as Singapore time, in either date order", () => {
    expect(parseFormTimestamp("10/17/2026 1:24:28", "mdy")).toBe("2026-10-16T17:24:28.000Z");
    expect(parseFormTimestamp("17/10/2026 13:24:28", "dmy")).toBe("2026-10-17T05:24:28.000Z");
    expect(parseFormTimestamp("10/17/2026", "mdy")).toBe("2026-10-16T16:00:00.000Z");
    expect(parseFormTimestamp("10/17/2026 1:24 PM", "mdy")).toBe("2026-10-17T05:24:00.000Z");
    expect(parseFormTimestamp("10/17/2026 12:05:00 am", "mdy")).toBe("2026-10-16T16:05:00.000Z");
  });

  it("reads the Forms download, with its own offset", () => {
    expect(parseFormTimestamp("2026/10/17 1:24:28 PM GMT+8", "dmy")).toBe("2026-10-17T05:24:28.000Z");
    expect(parseFormTimestamp("2026-10-17 13:24:28", "mdy")).toBe("2026-10-17T05:24:28.000Z");
    expect(parseFormTimestamp("2026-10-17T05:24:28Z", "mdy")).toBe("2026-10-17T05:24:28.000Z");
  });

  it("refuses what is not a date", () => {
    for (const s of ["", "yesterday", "2/30/2026 10:00:00", "13/13/2026", "10/17/2026 25:00:00", "10/17/2026 13:00 PM"]) {
      expect(parseFormTimestamp(s, "mdy")).toBeNull();
    }
  });

  it("tells the date order from the file's own dates", () => {
    const rows = (ts: string[]) => ts.map((timestamp) => ({ cells: { timestamp }, other: {} }));
    expect(readDateOrder(rows(["10/17/2026 1:00:00", "3/4/2026"]))).toEqual({ proven: "mdy", conflict: false });
    expect(readDateOrder(rows(["17/10/2026 1:00:00", "3/4/2026"]))).toEqual({ proven: "dmy", conflict: false });
    expect(readDateOrder(rows(["3/4/2026", "2026/10/17 1:00:00 PM GMT+8"]))).toEqual({ proven: null, conflict: false });
    expect(readDateOrder(rows(["10/17/2026", "17/10/2026"]))).toEqual({ proven: null, conflict: true });
  });
});

describe("cells", () => {
  it("reads inches as staff write them", () => {
    expect(parseInches("18")).toBe(18);
    expect(parseInches("2.5")).toBe(2.5);
    expect(parseInches("0")).toBe(0);
    expect(parseInches("18 inches")).toBe(18);
    expect(parseInches('3.5"')).toBe(3.5);
    expect(parseInches("2 1/2")).toBe(2.5);
    expect(parseInches("3/4")).toBe(0.75);
    expect(parseInches("about 3")).toBeNull();
    expect(parseInches("120")).toBeNull();
    expect(parseInches("-1")).toBeNull();
  });

  it("reads yes and no, and nothing else", () => {
    expect(parseYesNo("Yes")).toBe(true);
    expect(parseYesNo(" no ")).toBe(false);
    expect(parseYesNo("Sometimes")).toBeNull();
  });

  it("finds every Drive file id in a cell", () => {
    expect(
      driveFileIds(
        "https://drive.google.com/open?id=1aaaaaaaaaaa, https://drive.google.com/file/d/1bbbbbbbbbbb/view, https://drive.google.com/open?id=1aaaaaaaaaaa",
      ),
    ).toEqual(["1aaaaaaaaaaa", "1bbbbbbbbbbb"]);
    expect(driveFileIds("photo on WhatsApp")).toEqual([]);
  });

  it("splits a checkbox answer", () => {
    expect(splitAnswers("Neck pain, Snoring, Neck pain")).toEqual(["Neck pain", "Snoring"]);
  });
});

describe("normaliseFittingRow", () => {
  const row = (r: Record<string, string>) => parseFittingFormCsv(formCsv([r])).rows[0]!;

  it("turns the sample row into the Fitting record the import writes", () => {
    const result = normaliseFittingRow(row({}), "mdy", NOW);
    expect(result).toEqual({
      ok: true,
      repairs: [],
      row: {
        key: "google_form|2026-10-16T17:24:28.000Z|avery.lim@example.com",
        email: "avery.lim@example.com",
        phone: "+6591230001",
        name: "Avery Lim",
        fitting: {
          fitted_at: "2026-10-16T17:24:28.000Z",
          name_on_form: "Avery Lim",
          email_on_form: "Avery.Lim@Example.com",
          mobile_on_form: "91230001",
          shoulder_length_in: 18,
          neck_to_back_in: 2.5,
          head_to_back_in: 0,
          neck_length_in: 3.5,
          recommended_size: "M",
          configuration_type: "T12",
          profile_side: "M-LN",
          sleeper_type: "Side & Back sleeper",
          sleep_symptoms: ["Neck pain", "Snoring"],
          blood_pressure: "Normal",
          acid_reflux: false,
          ear_discomfort_side_sleep: false,
          bed_firmness: "Medium Firm",
          uses_bolster: false,
          age_group: "35-39",
          gender: "Female",
          discovery_source: "Instagram",
          referred_by: null,
          serviced_by: "Sophie",
          notes: null,
          drive_files: [
            { slot: "back_photo", file_id: "1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
            { slot: "side_photo", file_id: "1bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
            { slot: "back_sleep_preview", file_id: "1ccccccccccccccccccccccccccccccccc" },
            { slot: "side_sleep_preview", file_id: "1ddddddddddddddddddddddddddddddddd" },
            { slot: "customisation_form", file_id: "1eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" },
          ],
          other_answers: {},
        },
      },
    });
  });

  it("matches by mobile when the email is unusable, and keys the row by it", () => {
    const result = normaliseFittingRow(row({ "Email:": "avery@" }), "mdy", NOW);
    expect(result.ok && result.row.email).toBeNull();
    expect(result.ok && result.row.key).toBe("google_form|2026-10-16T17:24:28.000Z|+6591230001");
    expect(result.ok && result.repairs).toEqual(["email_invalid"]);
    expect(result.ok && result.row.fitting.email_on_form).toBe("avery@");
  });

  it("keeps a cell it cannot read as typed, under its question", () => {
    const result = normaliseFittingRow(
      row({ "A) Shoulder length Measurements (Inches)": "about 18", "Did you have acid reflux?": "Sometimes", "Upload a photo of your back": "sent on WhatsApp" }),
      "mdy",
      NOW,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row.fitting.shoulder_length_in).toBeNull();
    expect(result.row.fitting.acid_reflux).toBeNull();
    expect(result.row.fitting.drive_files.map((f) => f.slot)).not.toContain("back_photo");
    expect(result.row.fitting.other_answers).toEqual({
      "A) Shoulder length Measurements (Inches)": "about 18",
      "Did you have acid reflux?": "Sometimes",
      "Upload a photo of your back": "sent on WhatsApp",
    });
    expect(result.repairs.sort()).toEqual(["answer_unreadable", "drive_link_unreadable", "measurement_unreadable"]);
  });

  it("shortens notes past the column's limit and keeps them whole", () => {
    const long = "x".repeat(6000);
    const result = normaliseFittingRow(row({ "Additional Notes": long }), "mdy", NOW);
    expect(result.ok && result.row.fitting.notes?.length).toBe(5000);
    expect(result.ok && result.row.fitting.other_answers["Additional Notes"]).toBe(long);
  });

  it("skips a row with no readable time, or no way to reach them", () => {
    expect(normaliseFittingRow(row({ Timestamp: "" }), "mdy", NOW)).toEqual({ ok: false, reason: "no_timestamp" });
    expect(normaliseFittingRow(row({ Timestamp: "1/1/2014 10:00:00" }), "mdy", NOW)).toEqual({ ok: false, reason: "no_timestamp" });
    expect(normaliseFittingRow(row({ Timestamp: "1/1/2027 10:00:00" }), "mdy", NOW)).toEqual({ ok: false, reason: "no_timestamp" });
    expect(normaliseFittingRow(row({ "Email:": "", "Mobile No: ": "" }), "mdy", NOW)).toEqual({ ok: false, reason: "no_contact" });
    expect(normaliseFittingRow(row({ "Email:": "", "Mobile No: ": "12" }), "mdy", NOW)).toEqual({ ok: false, reason: "no_contact" });
  });
});
