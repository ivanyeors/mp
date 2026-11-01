import { csvCell } from "@/lib/csv";

/**
 * The Google Form export's header, as the owner's file has it (2026-10-31),
 * and made-up rows in its shape. Every name, number, email and Drive id here
 * is invented.
 */
export const FORM_HEADER = [
  "Name:",
  "Timestamp",
  "Mobile No: ",
  "A) Shoulder length Measurements (Inches)",
  "Recommended Pillow size",
  "Configuration Type",
  "Profile Side",
  "B) Neck to Back Measurements (Inches)",
  "C) Head to Back Measurements (Inches)",
  "D) Neck length Measurements (Inches)",
  "Upload a photo of your back",
  "Upload a photo of your side",
  "How did you know about Mpillow?",
  "Blood Pressure Level",
  "Age group",
  "Gender",
  "Email:",
  "Serviced by:",
  "Additional Notes",
  "Back Sleep preview (for official use)",
  "Side Sleep preview (for official use)",
  "Customization form (for official use)",
  "Ear discomfort during side sleep?",
  "What is the firmness of your bed?",
  "Did you have acid reflux?",
  "Who were you referred from?",
  "During/ after I sleep, I have:",
  "I'm a:",
  "Do you use bolsters to sleep?",
] as const;

type Header = (typeof FORM_HEADER)[number];

const drive = (id: string) => `https://drive.google.com/open?id=${id}`;

/** A complete row, as a staff member filled the form in. */
export const SAMPLE_ROW: Record<Header, string> = {
  "Name:": "Avery Lim ",
  Timestamp: "10/17/2026 1:24:28",
  "Mobile No: ": "91230001",
  "A) Shoulder length Measurements (Inches)": "18",
  "Recommended Pillow size": "M",
  "Configuration Type": "T12",
  "Profile Side": "M-LN",
  "B) Neck to Back Measurements (Inches)": "2.5",
  "C) Head to Back Measurements (Inches)": "0",
  "D) Neck length Measurements (Inches)": "3.5",
  "Upload a photo of your back": drive("1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
  "Upload a photo of your side": drive("1bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
  "How did you know about Mpillow?": "Instagram",
  "Blood Pressure Level": "Normal",
  "Age group": "35-39",
  Gender: "Female",
  "Email:": "Avery.Lim@Example.com",
  "Serviced by:": "Sophie ",
  "Additional Notes": "",
  "Back Sleep preview (for official use)": drive("1ccccccccccccccccccccccccccccccccc"),
  "Side Sleep preview (for official use)": drive("1ddddddddddddddddddddddddddddddddd"),
  "Customization form (for official use)": drive("1eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"),
  "Ear discomfort during side sleep?": "No",
  "What is the firmness of your bed?": "Medium Firm",
  "Did you have acid reflux?": "No",
  "Who were you referred from?": "",
  "During/ after I sleep, I have:": "Neck pain, Snoring",
  "I'm a:": "Side & Back sleeper",
  "Do you use bolsters to sleep?": "No",
};

/** A CSV of rows over FORM_HEADER (or another header), each a partial override of SAMPLE_ROW. */
export function formCsv(rows: Partial<Record<string, string>>[], header: readonly string[] = FORM_HEADER): string {
  const lines = [header.map(csvCell).join(",")];
  for (const r of rows) {
    const row = { ...SAMPLE_ROW, ...r } as Record<string, string | undefined>;
    lines.push(header.map((h) => csvCell(row[h] ?? "")).join(","));
  }
  return lines.join("\r\n");
}
