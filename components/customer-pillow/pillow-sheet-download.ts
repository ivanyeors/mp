import { pdf } from "@react-pdf/renderer";
import { softTopSettling } from "@/components/spatial/soft-top";
import type { PillowSheet } from "@/lib/customer-pillow/sheet";
import { FITTING_MEASUREMENTS } from "@/lib/fitting-import/view";
import { SECTIONS, type Section } from "@/lib/spatial-fillings/core";
import { pillowSheetDocument, registerSheetFonts, SHEET_FONT_WEIGHTS, type SheetArt, type SheetImage } from "./pillow-sheet-document";

const ART_SCALE = 2.5;
const SETTLE_POLL_MS = 120;
const SETTLE_TIMEOUT_MS = 8000;
const LOGO = "/mpillow_logo_2026.png";
const fontUrl = (weight: number) => `/fonts/figtree/figtree-${weight}.woff`;

const STYLE_PROPS = [
    "display",
    "visibility",
    "opacity",
    "fill",
    "fill-opacity",
    "fill-rule",
    "stroke",
    "stroke-width",
    "stroke-opacity",
    "stroke-dasharray",
    "stroke-dashoffset",
    "stroke-linejoin",
    "stroke-linecap",
    "paint-order",
    "clip-path",
    "mask",
    "filter",
    "font-size",
    "font-weight",
    "text-anchor",
    "dominant-baseline",
    "letter-spacing",
    "text-transform",
];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Could not load ${src.slice(0, 60)}`));
        img.src = src;
    });
}

function toDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

async function embeddedFontCss(): Promise<string> {
    const faces = await Promise.all(
        SHEET_FONT_WEIGHTS.map(async (weight) => {
            const res = await fetch(fontUrl(weight));
            if (!res.ok) throw new Error(`Could not load the ${weight} font`);
            return `@font-face{font-family:Figtree;font-weight:${weight};src:url(${await toDataUrl(await res.blob())}) format("woff");}`;
        }),
    );
    return `${faces.join("")}text,tspan{font-family:Figtree,Helvetica,Arial,sans-serif;}`;
}

function inlineStyles(from: Element, to: Element) {
    const computed = getComputedStyle(from);
    const style = (to as SVGElement).style;
    for (const prop of STYLE_PROPS) {
        const value = computed.getPropertyValue(prop);
        if (value) style.setProperty(prop, value);
    }
    if (computed.getPropertyValue("vector-effect") === "non-scaling-stroke") {
        style.setProperty("stroke-width", `${parseFloat(computed.getPropertyValue("stroke-width")) * ART_SCALE}px`);
    }
    to.removeAttribute("class");
    for (let i = 0; i < from.children.length; i++) inlineStyles(from.children[i], to.children[i]);
}

function paint(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): SheetImage {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width);
    canvas.height = Math.round(height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser cannot draw the pillow");
    draw(ctx);
    return { src: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height };
}

async function rasterizeSvg(svg: SVGSVGElement, fontCss: string, background: string): Promise<SheetImage> {
    const box = svg.viewBox.baseVal;
    const width = box.width * ART_SCALE;
    const height = box.height * ART_SCALE;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    inlineStyles(svg, clone);
    clone.setAttribute("width", String(width));
    clone.setAttribute("height", String(height));
    const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
    style.textContent = fontCss;
    clone.insertBefore(style, clone.firstChild);
    const xml = new XMLSerializer().serializeToString(clone);
    const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`);
    return paint(width, height, (ctx) => {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
    });
}

async function rasterizeFile(src: string, width: number): Promise<SheetImage> {
    const img = await loadImage(src);
    const height = (width * img.naturalHeight) / img.naturalWidth;
    return paint(width, height, (ctx) => ctx.drawImage(img, 0, 0, width, height));
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

async function settledArt(timeoutMs: number): Promise<HTMLElement> {
    let waited = 0;
    let last = "";
    let same = 0;
    for (;;) {
        const art = document.querySelector<HTMLElement>("[data-pillow-sheet-art]");
        const markup = art?.querySelector("svg") ? art.innerHTML : "";
        same = markup && markup === last && !softTopSettling() ? same + 1 : 0;
        last = markup;
        if (art && same >= 3) return art;
        if (waited > timeoutMs) {
            if (art?.querySelector("svg")) return art;
            throw new Error("The pillow drawing did not load");
        }
        await wait(SETTLE_POLL_MS);
        await nextFrame();
        waited += SETTLE_POLL_MS;
    }
}

export async function capturePillowArt(background: string): Promise<SheetArt> {
    const [art, fontCss, logo, icons] = await Promise.all([
        settledArt(SETTLE_TIMEOUT_MS),
        embeddedFontCss(),
        rasterizeFile(LOGO, 192),
        Promise.all(FITTING_MEASUREMENTS.map(async (m) => [m.icon, await rasterizeFile(m.icon, 160)] as const)),
    ]);
    const svgOf = (key: string) => art.querySelector<SVGSVGElement>(`[data-sheet-art="${key}"] svg`);
    const top = svgOf("top");
    const cuts: Partial<Record<Section, SheetImage>> = {};
    for (const section of SECTIONS) {
        const svg = svgOf(section);
        if (svg) cuts[section] = await rasterizeSvg(svg, fontCss, background);
    }
    return {
        logo,
        top: top ? await rasterizeSvg(top, fontCss, background) : null,
        cuts,
        icons: Object.fromEntries(icons),
    };
}

export async function downloadPillowSheet(sheet: PillowSheet, art: SheetArt): Promise<void> {
    registerSheetFonts((weight) => new URL(fontUrl(weight), window.location.origin).href);
    const blob = await pdf(pillowSheetDocument(sheet, art)).toBlob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = sheet.fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
