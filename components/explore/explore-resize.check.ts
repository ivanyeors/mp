import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";

import type { Browser, Page } from "playwright";

const URL = process.env.EXPLORE_URL ?? "http://localhost:3100/en-US/explore";
const { chromium } = createRequire(path.resolve("package.json"))("playwright") as typeof import("playwright");

type Seen = { css: number; buffer: number; blank: boolean };
let browser: Browser;

async function open(url: string, viewport: { width: number; height: number }, opts: { dpr?: number; still?: boolean } = {}) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: opts.dpr ?? 1, reducedMotion: opts.still ? "reduce" : "no-preference" });
  await page.goto(url, { waitUntil: "load" });
  await page.waitForSelector('main[data-scene="on"] canvas', { timeout: 60_000 });
  return page;
}

const twoFrames = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

async function drag() {
  const page = await open(URL, { width: 1440, height: 820 }, { dpr: 2 });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const host = document.querySelector("main > div[aria-hidden]")!;
    const canvas = host.querySelector("canvas")!;
    const probe = document.createElement("canvas");
    probe.width = probe.height = 8;
    const ctx = probe.getContext("2d", { willReadFrequently: true })!;
    const seen: Seen[] = [];
    (window as unknown as { __seen: Seen[] }).__seen = seen;
    new ResizeObserver(() => {
      ctx.clearRect(0, 0, 8, 8);
      ctx.drawImage(canvas, 0, 0, 8, 8);
      const d = ctx.getImageData(0, 0, 8, 8).data;
      let lit = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i]! + d[i + 1]! + d[i + 2]! > 0) lit += 1;
      seen.push({ css: host.clientWidth, buffer: canvas.width, blank: lit === 0 });
    }).observe(host);
  });
  const widths = [1360, 1280, 1200, 1120, 1040, 960, 880, 960, 1040, 1120, 1200, 1280];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 820 });
    await twoFrames(page);
  }
  const seen = (await page.evaluate(() => (window as unknown as { __seen: Seen[] }).__seen)).slice(1);
  assert.ok(seen.length >= widths.length - 1, `a frame was shown for each step of the drag (${seen.length})`);
  const blank = seen.filter((f) => f.blank).length;
  assert.equal(blank, 0, `${blank} of ${seen.length} frames of the drag showed an empty canvas`);
  for (const f of seen) assert.equal(f.buffer, f.css, `drawn at 1 pixel per CSS pixel while resizing (${f.buffer} for ${f.css})`);

  await page.waitForTimeout(600);
  const after = await page.evaluate(() => {
    const host = document.querySelector("main > div[aria-hidden]")!;
    return { css: host.clientWidth, buffer: host.querySelector("canvas")!.width };
  });
  assert.equal(after.buffer, after.css * 2, `sharp again once the window is still (${after.buffer} for ${after.css})`);
  await page.close();
  console.log(`ok   drag: ${seen.length} frames, none empty; 1:1 while resizing, 2:1 after`);
}

async function flowers() {
  const url = `${URL}?bloom=3&hour=10&rain=0`;
  const portrait = { width: 600, height: 900 };
  const clip = { x: 400, y: 600, width: 200, height: 250 };
  const grown = async (page: Page) => {
    let last = Buffer.alloc(0);
    for (let i = 0; i < 40; i += 1) {
      await page.waitForTimeout(1000);
      const shot = await page.screenshot({ clip });
      if (shot.equals(last)) return shot;
      last = shot;
    }
    throw new Error("the flowers never stopped growing");
  };
  const fresh = await open(url, portrait, { still: true });
  const want = await grown(fresh);
  const turned = await open(url, { width: 1400, height: 900 }, { still: true });
  await grown(turned);
  await turned.setViewportSize(portrait);
  await turned.waitForTimeout(600);
  const got = await grown(turned);
  const differing = await fresh.evaluate(async (pngs) => {
    const [p, q] = await Promise.all(
      pngs.map(async (b64) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, c.width, c.height).data;
      }),
    );
    let n = 0;
    for (let i = 0; i < p!.length; i += 4) if (Math.abs(p![i]! - q![i]!) + Math.abs(p![i + 1]! - q![i + 1]!) + Math.abs(p![i + 2]! - q![i + 2]!) > 30) n += 1;
    return n / (p!.length / 4);
  }, [want.toString("base64"), got.toString("base64")]);
  await fresh.close();
  await turned.close();
  assert.ok(differing < 0.002, `the flowers turned to portrait differ from fresh ones in ${(differing * 100).toFixed(2)}% of the cliff`);
  console.log(`ok   flowers: turned to portrait, the cliff matches a fresh load (${(differing * 100).toFixed(2)}% differ)`);
}

async function main() {
  browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
  try {
    await drag();
    await flowers();
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
