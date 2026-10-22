// ============================================================
// Finance report email (Analytics → Reports)
// ============================================================
//
// Sent by a Member to people they pick: other Members or the outside accounts
// team. The figures are in the body so it reads without opening anything; the
// rows are in the attached CSV. Staff audience: no marketing footer.

import { renderEmailShell } from "./base";
import { dataTable, infoList, mutedText, paragraph, preformatted, statusPill } from "./components";
import { money, negativeMoney } from "./format";
import type { RenderedEmail } from "./types";

export type FinanceReportTotals = {
  currency: string;
  saleCount: number;
  sales: number;
  tax: number;
  refunds: number;
  net: number;
};

export type FinanceReportEmailData = {
  /** e.g. "Customer purchases". */
  reportName: string;
  /** e.g. "October 2026". */
  periodLabel: string;
  /** The Member who sent it. */
  sentBy: string;
  /** Optional message from the sender. */
  note: string | null;
  attachmentName: string;
  rowCount: number;
  totals: FinanceReportTotals[];
  /** Net per channel, shown when more than one channel has rows. */
  channels: Array<{ label: string; currency: string; saleCount: number; net: number }>;
};

function signed(amount: number, currency: string): string {
  return amount < 0 ? negativeMoney(amount, currency) : money(amount, currency);
}

function totalsRows(t: FinanceReportTotals) {
  return [
    { label: `Sales (${t.saleCount})`, value: money(t.sales, t.currency) },
    { label: "GST included in sales", value: money(t.tax, t.currency) },
    { label: "Refunds and disputes", value: signed(t.refunds, t.currency) },
    { label: "Net received", value: signed(t.net, t.currency), strong: true },
  ];
}

export function renderFinanceReportEmail(p: FinanceReportEmailData): RenderedEmail {
  const subject = `${p.reportName} report · ${p.periodLabel}`;
  const intro = `${p.sentBy} sent you the ${p.reportName.toLowerCase()} report for ${p.periodLabel} from the Mpillow Admin Panel.`;
  const howTo =
    `The attached ${p.attachmentName} has ${p.rowCount} ${p.rowCount === 1 ? "row" : "rows"}, one per payment or refund, ` +
    "dated in Singapore time. Sales are dated when the customer paid and refunds when the money went back, " +
    "and the Amount column adds up to the net above.";
  const scope =
    "Card processing fees and Stripe payouts are not in this report: it lists what customers paid, not what reached the bank.";

  const channelTable =
    p.channels.length > 1
      ? dataTable({
          columns: [
            { key: "channel", label: "Channel" },
            { key: "sales", label: "Sales", align: "right" },
            { key: "net", label: "Net", align: "right" },
          ],
          rows: p.channels.map((c) => ({
            channel: c.label,
            sales: String(c.saleCount),
            net: signed(c.net, c.currency),
          })),
        })
      : "";

  const text = [
    intro,
    ...(p.note ? ["", p.note] : []),
    "",
    ...p.totals.flatMap((t) => [...totalsRows(t).map((r) => `${r.label}: ${r.value}`), ""]),
    ...(p.channels.length > 1
      ? [...p.channels.map((c) => `${c.label}: ${c.saleCount} sales, net ${signed(c.net, c.currency)}`), ""]
      : []),
    howTo,
    "",
    scope,
  ].join("\n");

  const html = renderEmailShell({
    title: `${p.reportName} · ${p.periodLabel}`,
    preheader: intro,
    audience: "staff",
    bodyHtml: `${statusPill("Finance report", "neutral")}
${paragraph(intro, { top: 16 })}
${p.note ? preformatted(p.note) : ""}
${p.totals.length === 0 ? paragraph("There were no sales or refunds in this period.") : p.totals.map((t) => infoList(totalsRows(t))).join("\n")}
${channelTable}
${paragraph(howTo, { top: 16 })}
${mutedText(scope)}`,
  });

  return { subject, text, html };
}
