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

const INK = SHEET_ART_BACKGROUND;
const NAVY = "#1d3f75";
const CONTENT_WIDTH = 595.28 - 2 * 40;
const CUT_WIDTH = 222;
const SECTION_TITLE: Record<Section, string> = { left: "Left", center: "Centre", right: "Right" };

const s = StyleSheet.create({
    page: { fontFamily: "Figtree", fontSize: 9.5, color: LIGHT.fg, paddingTop: 34, paddingBottom: 54, paddingHorizontal: 40 },
    p: { lineHeight: "13.5pt" },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
    eyebrow: { fontSize: 7.5, fontWeight: 600, letterSpacing: 1.4, color: NAVY, textTransform: "uppercase" },
    small: { fontSize: 8, color: LIGHT.mutedFg },
    h1: { fontSize: 26, fontWeight: 600, letterSpacing: -0.6, lineHeight: 1.15 },
    h2: { fontSize: 15, fontWeight: 600, letterSpacing: -0.3 },
    h3: { fontSize: 10.5, fontWeight: 600 },
    muted: { color: LIGHT.mutedFg },
    chips: { flexDirection: "row", flexWrap: "wrap", marginTop: 10 },
    chip: { fontSize: 8, fontWeight: 500, backgroundColor: LIGHT.mutedBg, borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8, marginRight: 5 },
    chipDark: { fontSize: 8, fontWeight: 600, color: "#ffffff", backgroundColor: NAVY, borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8, marginRight: 5 },
    block: { marginTop: 18 },
    blockHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8, paddingBottom: 5, borderBottomWidth: 0.75, borderBottomColor: LIGHT.border },
    fillings: { flexDirection: "row", flexWrap: "wrap" },
    filling: { width: CONTENT_WIDTH / 3, flexDirection: "row", alignItems: "center", paddingVertical: 3, paddingRight: 10 },
    swatch: { width: 9, height: 9, borderRadius: 2.5, marginRight: 7 },
    count: { marginLeft: "auto", fontWeight: 600, color: LIGHT.mutedFg },
    cards: { flexDirection: "row", justifyContent: "space-between" },
    card: { width: (CONTENT_WIDTH - 3 * 8) / 4, borderWidth: 0.75, borderColor: LIGHT.border, borderRadius: 10, padding: 9, alignItems: "center" },
    cardValue: { fontSize: 15, fontWeight: 600, marginTop: 2 },
    facts: { flexDirection: "row", flexWrap: "wrap", marginTop: 8, backgroundColor: LIGHT.mutedBg, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 10 },
    fact: { width: (CONTENT_WIDTH - 20) / 4 },
    tips: { flexDirection: "row", justifyContent: "space-between", marginTop: 12 },
    tip: { width: (CONTENT_WIDTH - 8) / 2, backgroundColor: "#eef3fa", borderRadius: 10, padding: 10 },
    sectionRow: { flexDirection: "row", paddingTop: 12, marginTop: 12, borderTopWidth: 0.75, borderTopColor: LIGHT.border },
    cutCol: { width: CUT_WIDTH, marginRight: 20 },
    stepsCol: { flex: 1 },
    step: { flexDirection: "row", alignItems: "center", paddingVertical: 2.5 },
    stepNo: { width: 15, height: 15, borderRadius: 7.5, backgroundColor: NAVY, color: "#ffffff", fontSize: 7.5, fontWeight: 700, textAlign: "center", lineHeight: 1, paddingTop: 3.6, marginRight: 7 },
    stepDot: { width: 7, height: 7, borderRadius: 3.5, marginLeft: 4, marginRight: 11 },
    stepBar: { width: 3, height: 13, borderRadius: 1.5, marginRight: 6 },
    stepLabel: { fontWeight: 600 },
    stepWhere: { marginLeft: "auto", fontSize: 8, color: LIGHT.mutedFg },
    help: { marginTop: 18, backgroundColor: INK, borderRadius: 12, padding: 14, color: "#ffffff" },
    helpLinks: { flexDirection: "row", marginTop: 8 },
    helpLink: { color: "#ffffff", fontWeight: 600, textDecoration: "none", marginRight: 18 },
    footer: { position: "absolute", left: 40, right: 40, bottom: 24, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: LIGHT.mutedFg },
});

function Picture({ image, width }: { image: SheetImage; width: number }) {
    return <PdfImage src={image.src} style={{ width, height: (width * image.height) / image.width }} />;
}

function Header({ sheet, logo }: { sheet: PillowSheet; logo: SheetImage }) {
    return (
        <View style={s.header}>
            <Picture image={logo} width={38} />
            <View style={{ alignItems: "flex-end" }}>
                <Text style={s.eyebrow}>Pillow guide</Text>
                <Text style={s.small}>{sheet.preparedOn}</Text>
            </View>
        </View>
    );
}

function Footer({ sheet }: { sheet: PillowSheet }) {
    return (
        <View style={s.footer} fixed>
            <Text>
                Mpillow · <Link src={sheet.links.care.href.replace(/\/mp-care$/, "")} style={{ color: LIGHT.mutedFg, textDecoration: "none" }}>{sheet.links.care.text.replace(/\/mp-care$/, "")}</Link> · WhatsApp {sheet.links.whatsapp.text}
            </Text>
            <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
    );
}

function BlockHead({ title, aside }: { title: string; aside?: string }) {
    return (
        <View style={s.blockHead}>
            <Text style={s.h3}>{title}</Text>
            {aside ? <Text style={s.small}>{aside}</Text> : null}
        </View>
    );
}

function Overview({ sheet, art }: { sheet: PillowSheet; art: SheetArt }) {
    return (
        <>
            <View>
                <Text style={s.h1}>Your Mpillow</Text>
                {sheet.customerName ? <Text style={[s.h3, s.muted, { fontWeight: 500, marginTop: 4 }]}>Prepared for {sheet.customerName}</Text> : null}
                <Text style={[s.p, { marginTop: 6, color: LIGHT.mutedFg, maxWidth: 400 }]}>{sheet.story}</Text>
                <View style={s.chips}>
                    {sheet.size ? <Text style={s.chipDark}>Size {sheet.size}</Text> : null}
                    <Text style={s.chip}>{sheet.pillowName}</Text>
                    <Text style={s.chip}>
                        {sheet.pieces} piece{sheet.pieces === 1 ? "" : "s"}
                    </Text>
                </View>
            </View>
            {art.top ? (
                <View style={{ marginTop: 14, alignItems: "center" }}>
                    <Picture image={art.top} width={CONTENT_WIDTH} />
                </View>
            ) : null}
            <View style={s.block} wrap={false}>
                <BlockHead title="What's inside" aside={`${sheet.pieces} piece${sheet.pieces === 1 ? "" : "s"} in all`} />
                <View style={s.fillings}>
                    {sheet.fillings.map((f) => (
                        <View key={f.label} style={s.filling}>
                            <View style={[s.swatch, { backgroundColor: f.color }]} />
                            <Text>{f.label}</Text>
                            <Text style={s.count}>× {f.count}</Text>
                        </View>
                    ))}
                </View>
            </View>
        </>
    );
}

function Measurements({ sheet, art }: { sheet: PillowSheet; art: SheetArt }) {
    const fitting = sheet.fitting;
    if (!fitting) return null;
    return (
        <View style={s.block} wrap={false}>
            <BlockHead title="Your measurements" aside={`From your fitting on ${fitting.fittedOn}`} />
            {fitting.measurements.length > 0 ? (
                <View style={s.cards}>
                    {fitting.measurements.map((m) => {
                        const icon = art.icons[m.icon];
                        return (
                            <View key={m.letter} style={s.card}>
                                {icon ? <Picture image={icon} width={34} /> : null}
                                <Text style={[s.small, { marginTop: 5 }]}>
                                    {m.letter} · {m.label}
                                </Text>
                                <Text style={s.cardValue}>{m.value}</Text>
                            </View>
                        );
                    })}
                </View>
            ) : null}
            {fitting.facts.length > 0 ? (
                <View style={s.facts}>
                    {fitting.facts.map(([label, value]) => (
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

function Steps({ section }: { section: SheetSection }) {
    if (section.steps.length === 0) return <Text style={s.muted}>No fillings in this section.</Text>;
    return (
        <View>
            {section.steps.map((step, i) => (
                <View key={i} style={s.step}>
                    {section.ordered ? <Text style={s.stepNo}>{i + 1}</Text> : <View style={[s.stepDot, { backgroundColor: step.color }]} />}
                    {section.ordered ? <View style={[s.stepBar, { backgroundColor: step.color }]} /> : null}
                    <Text style={s.stepLabel}>{step.label}</Text>
                    <Text style={s.stepWhere}>{step.where}</Text>
                </View>
            ))}
        </View>
    );
}

function Refill({ sheet, art }: { sheet: PillowSheet; art: SheetArt }) {
    const ordered = sheet.sections.some((x) => x.ordered);
    return (
        <>
            <Text style={s.h2}>Putting your fillings back</Text>
            <Text style={[s.p, { marginTop: 4, color: LIGHT.mutedFg, maxWidth: 440 }]}>
                {ordered
                    ? "Once the fillings are completely dry, put each one back into its section in the order below: step 1 goes in first. The cut beside each list shows how the pieces sit inside."
                    : "Once the fillings are completely dry, put each one back into its section. The cut beside each list shows where every piece sits inside."}
            </Text>
            <View style={s.tips}>
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
            </View>
            {sheet.sections.map((section) => {
                const cut = art.cuts[section.section];
                return (
                    <View key={section.section} style={s.sectionRow} wrap={false}>
                        <View style={s.cutCol}>
                            <View style={{ flexDirection: "row", alignItems: "baseline", marginBottom: 5 }}>
                                <Text style={s.h3}>{SECTION_TITLE[section.section]} section</Text>
                                <Text style={[s.small, { marginLeft: 6 }]}>
                                    {section.steps.length} piece{section.steps.length === 1 ? "" : "s"}
                                </Text>
                            </View>
                            {cut ? <Picture image={cut} width={CUT_WIDTH} /> : null}
                        </View>
                        <View style={s.stepsCol}>
                            <Text style={[s.small, { marginBottom: 3 }]}>{section.ordered ? "Fill in this order" : "Pieces in this section"}</Text>
                            <Steps section={section} />
                        </View>
                    </View>
                );
            })}
            <View style={s.help} wrap={false}>
                <Text style={[s.h3, { color: "#ffffff" }]}>Does your pillow feel different?</Text>
                <Text style={[s.p, { marginTop: 3, color: "#cbd5e1" }]}>
                    If the height or support no longer feels right, we can re-adjust it for you. Videos showing how to take your pillow apart and wash it are on our care page.
                </Text>
                <View style={s.helpLinks}>
                    <Link src={sheet.links.readjust.href} style={s.helpLink}>
                        Book a re-adjustment ›
                    </Link>
                    <Link src={sheet.links.whatsapp.href} style={s.helpLink}>
                        WhatsApp {sheet.links.whatsapp.text} ›
                    </Link>
                    <Link src={sheet.links.care.href} style={s.helpLink}>
                        {sheet.links.care.text} ›
                    </Link>
                </View>
            </View>
        </>
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
                <Overview sheet={sheet} art={art} />
                <Measurements sheet={sheet} art={art} />
                <Footer sheet={sheet} />
            </Page>
            <Page size="A4" style={s.page}>
                <Header sheet={sheet} logo={art.logo} />
                <Refill sheet={sheet} art={art} />
                <Footer sheet={sheet} />
            </Page>
        </Document>
    );
}
