import { Document, Font, Image as PdfImage, Link, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { LIGHT } from "@/lib/email/theme";
import type { Section } from "@/lib/spatial-fillings/core";
import { SHEET_ART_BACKGROUND, type PillowSheet, type SheetSection } from "@/lib/customer-pillow/sheet";

export type SheetImage = { src: string; width: number; height: number };

export type SheetArt = {
    logo: SheetImage;
    top: SheetImage | null;
    cuts: Partial<Record<Section, SheetImage>>;
    icons: Record<string, SheetImage>;
};

export const SHEET_FONT_WEIGHTS = [400, 500, 600, 700] as const;

export function registerSheetFonts(src: (weight: number) => string) {
    Font.register({
        family: "Figtree",
        fonts: SHEET_FONT_WEIGHTS.map((fontWeight) => ({ src: src(fontWeight), fontWeight })),
    });
    Font.registerHyphenationCallback((word) => [word]);
}

const NAVY = "#1d3f75";
const TINT = "#eef3fa";
const MARGIN = 30;
const CONTENT_WIDTH = 595.28 - 2 * MARGIN;
const GAP = 12;
const TOP_WIDTH = 330;
const COLUMN_WIDTH = (CONTENT_WIDTH - 2 * GAP) / 3;
const CARD_GAP = 6;
const SECTION_TITLE: Record<Section, string> = { left: "Left", center: "Centre", right: "Right" };

const s = StyleSheet.create({
    page: { fontFamily: "Figtree", fontSize: 8.5, color: LIGHT.fg, paddingTop: 26, paddingBottom: 36, paddingHorizontal: MARGIN },
    p: { lineHeight: "11.5pt" },
    row: { flexDirection: "row" },
    header: { flexDirection: "row", alignItems: "center" },
    eyebrow: { fontSize: 7, fontWeight: 600, letterSpacing: 1.3, color: NAVY, textTransform: "uppercase" },
    small: { fontSize: 7.5, color: LIGHT.mutedFg },
    h1: { fontSize: 21, fontWeight: 600, letterSpacing: -0.5 },
    h2: { fontSize: 12.5, fontWeight: 600, letterSpacing: -0.2 },
    h3: { fontSize: 9.5, fontWeight: 600 },
    muted: { color: LIGHT.mutedFg },
    chip: { fontSize: 7.5, fontWeight: 500, backgroundColor: LIGHT.mutedBg, borderRadius: 7, paddingVertical: 2.5, paddingHorizontal: 7, marginLeft: 4 },
    chipDark: { fontSize: 7.5, fontWeight: 600, color: "#ffffff", backgroundColor: NAVY, borderRadius: 7, paddingVertical: 2.5, paddingHorizontal: 7, marginLeft: 4 },
    blockHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5, paddingBottom: 4, borderBottomWidth: 0.75, borderBottomColor: LIGHT.border },
    filling: { flexDirection: "row", alignItems: "center", paddingVertical: 1.8 },
    swatch: { width: 8, height: 8, borderRadius: 2, marginRight: 6 },
    count: { marginLeft: "auto", fontWeight: 600, color: LIGHT.mutedFg },
    facts: { flexDirection: "row", flexWrap: "wrap", marginTop: 8, backgroundColor: LIGHT.mutedBg, borderRadius: 8, paddingTop: 6, paddingHorizontal: 8 },
    fact: { width: "50%", paddingBottom: 6, paddingRight: 4 },
    card: {
        width: (CONTENT_WIDTH - 3 * CARD_GAP) / 4,
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 0.75,
        borderColor: LIGHT.border,
        borderRadius: 9,
        paddingVertical: 6,
        paddingHorizontal: 8,
    },
    cardValue: { fontSize: 12.5, fontWeight: 600, marginTop: 1 },
    column: { width: COLUMN_WIDTH },
    artBox: { backgroundColor: SHEET_ART_BACKGROUND, borderWidth: 0.75, borderColor: LIGHT.border, borderRadius: 8, justifyContent: "center", overflow: "hidden" },
    step: { flexDirection: "row", alignItems: "center", paddingVertical: 1.8 },
    stepNo: { width: 13, height: 13, borderRadius: 6.5, backgroundColor: NAVY, color: "#ffffff", fontSize: 7, fontWeight: 700, textAlign: "center", lineHeight: 1, paddingTop: 3, marginRight: 5 },
    stepDot: { width: 7, height: 7, borderRadius: 3.5, marginLeft: 3, marginRight: 8 },
    stepBar: { width: 2.5, height: 11, borderRadius: 1.25, marginRight: 5 },
    tip: { width: COLUMN_WIDTH, backgroundColor: TINT, borderRadius: 9, padding: 9 },
    help: { width: COLUMN_WIDTH, backgroundColor: "#ffffff", borderWidth: 1, borderColor: NAVY, borderRadius: 9, padding: 9 },
    helpLink: { color: NAVY, fontWeight: 600, textDecoration: "none", marginTop: 3 },
    footer: { position: "absolute", left: MARGIN, right: MARGIN, bottom: 16, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: LIGHT.mutedFg },
});

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function Picture({ image, width }: { image: SheetImage; width: number }) {
    return <PdfImage src={image.src} style={{ width, height: (width * image.height) / image.width }} />;
}

function BlockHead({ title, aside, large = false }: { title: string; aside?: string; large?: boolean }) {
    return (
        <View style={s.blockHead}>
            <Text style={large ? s.h2 : s.h3}>{title}</Text>
            {aside ? <Text style={s.small}>{aside}</Text> : null}
        </View>
    );
}

function Header({ sheet, logo }: { sheet: PillowSheet; logo: SheetImage }) {
    return (
        <View>
            <View style={s.header}>
                <Picture image={logo} width={34} />
                <View style={{ marginLeft: 10, flex: 1 }}>
                    <Text style={s.h1}>Your Mpillow</Text>
                    {sheet.customerName ? <Text style={[s.muted, { fontSize: 9, marginTop: 1 }]}>Prepared for {sheet.customerName}</Text> : null}
                </View>
                <View style={{ alignItems: "flex-end" }}>
                    <Text style={s.eyebrow}>Pillow guide</Text>
                    <Text style={[s.small, { marginTop: 2 }]}>{sheet.preparedOn}</Text>
                </View>
            </View>
            <View style={[s.row, { alignItems: "center", marginTop: 9 }]}>
                <Text style={[s.p, s.muted, { flex: 1 }]}>{sheet.story}</Text>
                {sheet.size ? <Text style={s.chipDark}>Size {sheet.size}</Text> : null}
                <Text style={s.chip}>{sheet.pillowName}</Text>
                <Text style={s.chip}>{plural(sheet.pieces, "piece")}</Text>
            </View>
        </View>
    );
}

function Inside({ sheet }: { sheet: PillowSheet }) {
    return (
        <View style={{ flex: 1 }}>
            <BlockHead title="What's inside" aside={`${plural(sheet.pieces, "piece")} in all`} />
            {sheet.fillings.map((f) => (
                <View key={f.label} style={s.filling}>
                    <View style={[s.swatch, { backgroundColor: f.color }]} />
                    <Text>{f.label}</Text>
                    <Text style={s.count}>× {f.count}</Text>
                </View>
            ))}
            {sheet.fitting && sheet.fitting.facts.length > 0 ? (
                <View style={s.facts}>
                    {sheet.fitting.facts.map(([label, value]) => (
                        <View key={label} style={s.fact}>
                            <Text style={s.small}>{label}</Text>
                            <Text style={{ fontWeight: 600 }}>{value}</Text>
                        </View>
                    ))}
                </View>
            ) : null}
        </View>
    );
}

function Measurements({ sheet, art }: { sheet: PillowSheet; art: SheetArt }) {
    const fitting = sheet.fitting;
    if (!fitting || fitting.measurements.length === 0) return null;
    return (
        <View style={{ marginTop: GAP }} wrap={false}>
            <BlockHead title="Your measurements" aside={`From your fitting on ${fitting.fittedOn}`} />
            <View style={[s.row, { justifyContent: "space-between" }]}>
                {fitting.measurements.map((m) => {
                    const icon = art.icons[m.icon];
                    return (
                        <View key={m.letter} style={s.card}>
                            {icon ? <Picture image={icon} width={22} /> : null}
                            <View style={{ marginLeft: 7, flex: 1 }}>
                                <Text style={s.small}>
                                    {m.letter} · {m.label}
                                </Text>
                                <Text style={s.cardValue}>{m.value}</Text>
                            </View>
                        </View>
                    );
                })}
            </View>
        </View>
    );
}

function Steps({ section }: { section: SheetSection }) {
    if (section.steps.length === 0) return <Text style={s.muted}>No fillings in this section.</Text>;
    return (
        <View>
            {section.steps.map((step, i) => (
                <View key={i} style={s.step}>
                    {section.ordered ? <Text style={s.stepNo}>{i + 1}</Text> : <View style={[s.stepDot, { backgroundColor: step.color }]} />}
                    {section.ordered ? <View style={[s.stepBar, { backgroundColor: step.color }]} /> : null}
                    <Text style={{ flex: 1 }}>
                        <Text style={{ fontWeight: 600 }}>{step.label}</Text>
                        <Text style={s.muted}>
                            {"  "}
                            {step.where}
                        </Text>
                    </Text>
                </View>
            ))}
        </View>
    );
}

function Refill({ sheet, art }: { sheet: PillowSheet; art: SheetArt }) {
    const ordered = sheet.sections.some((x) => x.ordered);
    const cutHeight = COLUMN_WIDTH * Math.max(0, ...Object.values(art.cuts).map((c) => c.height / c.width));
    return (
        <View style={{ marginTop: GAP + 2 }} wrap={false}>
            <BlockHead large title="Putting your fillings back" aside="After a wash, once every filling is completely dry" />
            <Text style={[s.p, s.muted, { marginBottom: 7 }]}>
                {ordered
                    ? "Put each filling back into its section in the order shown: step 1 goes in first. The cut above each list shows how the pieces sit inside, from the front of the section to the back."
                    : "Put each filling back into its section. The cut above each list shows where every piece sits inside, from the front of the section to the back."}
            </Text>
            <View style={[s.row, { justifyContent: "space-between" }]}>
                {sheet.sections.map((section) => {
                    const cut = art.cuts[section.section];
                    return (
                        <View key={section.section} style={s.column}>
                            <View style={[s.row, { alignItems: "baseline", marginBottom: 4 }]}>
                                <Text style={s.h3}>{SECTION_TITLE[section.section]} section</Text>
                                <Text style={[s.small, { marginLeft: 5 }]}>{plural(section.steps.length, "piece")}</Text>
                            </View>
                            {cutHeight > 0 ? (
                                <View style={[s.artBox, cut ? { height: cutHeight } : { height: cutHeight, backgroundColor: LIGHT.mutedBg }]}>
                                    {cut ? <Picture image={cut} width={COLUMN_WIDTH - 1.5} /> : null}
                                </View>
                            ) : null}
                            <Text style={[s.small, { marginTop: 6, marginBottom: 2 }]}>
                                {section.ordered ? "Fill in this order" : "Pieces in this section"}
                            </Text>
                            <Steps section={section} />
                        </View>
                    );
                })}
            </View>
        </View>
    );
}

function Care({ sheet }: { sheet: PillowSheet }) {
    return (
        <View style={[s.row, { justifyContent: "space-between", marginTop: GAP + 2 }]} wrap={false}>
            <View style={s.tip}>
                <Text style={[s.h3, { color: NAVY }]}>Dry the fillings in shade</Text>
                <Text style={[s.p, { marginTop: 3 }]}>
                    Dry them under sheltered sunlight, never in direct sun. Make sure they are completely dry before they go back in.
                </Text>
            </View>
            <View style={s.tip}>
                <Text style={[s.h3, { color: NAVY }]}>Reset the fillings</Text>
                <Text style={[s.p, { marginTop: 3 }]}>Before refilling, loosen and air the fillings so they get back their shape and fluff.</Text>
            </View>
            <View style={s.help}>
                <Text style={[s.h3, { color: NAVY }]}>Does your pillow feel different?</Text>
                <Text style={[s.p, { marginTop: 3 }]}>If the height or support no longer feels right, we can re-adjust it for you.</Text>
                <Link src={sheet.links.readjust.href} style={[s.helpLink, { marginTop: 5 }]}>
                    Book a re-adjustment ›
                </Link>
                <Link src={sheet.links.whatsapp.href} style={s.helpLink}>
                    WhatsApp {sheet.links.whatsapp.text} ›
                </Link>
                <Link src={sheet.links.care.href} style={s.helpLink}>
                    Washing videos ›
                </Link>
            </View>
        </View>
    );
}

function Footer({ sheet }: { sheet: PillowSheet }) {
    const site = { href: sheet.links.care.href.replace(/\/mp-care$/, ""), text: sheet.links.care.text.replace(/\/mp-care$/, "") };
    return (
        <View style={s.footer} fixed>
            <Text>
                Mpillow ·{" "}
                <Link src={site.href} style={{ color: LIGHT.mutedFg, textDecoration: "none" }}>
                    {site.text}
                </Link>{" "}
                · WhatsApp {sheet.links.whatsapp.text}
            </Text>
            <Text render={({ pageNumber, totalPages }) => (totalPages > 1 ? `${pageNumber} / ${totalPages}` : "")} />
        </View>
    );
}

export function pillowSheetDocument(sheet: PillowSheet, art: SheetArt) {
    return (
        <Document
            title={sheet.customerName ? `${sheet.customerName}'s Mpillow guide` : "Mpillow guide"}
            author="Mpillow"
            subject="What's inside your pillow and how to put the fillings back"
            creator="Mpillow"
            producer="Mpillow"
        >
            <Page size="A4" style={s.page}>
                <Header sheet={sheet} logo={art.logo} />
                <View style={[s.row, { marginTop: GAP }]} wrap={false}>
                    {art.top ? (
                        <View style={[s.artBox, { marginRight: 16 }]}>
                            <Picture image={art.top} width={TOP_WIDTH} />
                        </View>
                    ) : null}
                    <Inside sheet={sheet} />
                </View>
                <Measurements sheet={sheet} art={art} />
                <Refill sheet={sheet} art={art} />
                <Care sheet={sheet} />
                <Footer sheet={sheet} />
            </Page>
        </Document>
    );
}
