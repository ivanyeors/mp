import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CalibrationSheet } from "@/lib/spatial-fillings/calibration";
import type { CatalogSource } from "@/lib/spatial-fillings/dimension-overrides";
import { PILLOW_SIZES } from "@/lib/spatial-fillings/dimensions";

function Blank() {
  return <TableCell className="min-w-20 border-b border-dashed border-foreground/30" aria-label="Measured" />;
}

function Source({ source }: { source: CatalogSource }) {
  if (source === "unmeasured") return <Badge variant="destructive">fallback</Badge>;
  return <Badge variant={source === "configured" ? "secondary" : "outline"}>{source === "configured" ? "configured" : "measured"}</Badge>;
}

function Section({ title, hint, children }: { title: string; hint: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2 break-inside-avoid-page">
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      <p className="text-sm text-muted-foreground">{hint}</p>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

const phoneMinWidth = {
  budgets: "max-md:min-w-[34rem] max-md:[&_th]:whitespace-nowrap",
  templates: "max-md:[&_th]:whitespace-nowrap",
  layers: "max-md:min-w-[54rem] max-md:[&_th]:whitespace-nowrap",
  squeeze: "max-md:min-w-[36rem] max-md:[&_th]:whitespace-nowrap",
  settle: "max-md:min-w-[46rem] max-md:[&_th]:whitespace-nowrap",
  footprints: "max-md:min-w-[60rem] max-md:[&_th]:whitespace-nowrap",
} as const;

const layerCount = (n: number | null) => (n === null ? "–" : String(n));

const PRINT_ONLY_SHEET = `@media print {
  body *:not([data-calibration-sheet]):not([data-calibration-sheet] *):not(:has([data-calibration-sheet])) { display: none !important; }
  @page { size: A4 landscape; margin: 12mm; }
}`;

export function CalibrationSheetView({ sheet, generatedAt }: { sheet: CalibrationSheet; generatedAt: string }) {
  return (
    <div className="mx-auto max-w-5xl space-y-8 p-4 text-sm max-md:space-y-6 max-md:p-0 print:max-w-none print:p-0 print:text-xs" data-calibration-sheet>
      <style>{PRINT_ONLY_SHEET}</style>
      <header className="space-y-2">
        <h1 className="text-xl font-semibold tracking-tight">X-ray calibration sheet</h1>
        <p className="text-muted-foreground">
          What the x-ray predicts for each bench check in slice 10, from the saved dimensions at {generatedAt}.
          Write the ruler reading in the empty column. Anything more than a few millimetres (or one layer) apart is a
          number to change on the Configure page&apos;s Dimensions tab. Print with your browser (⌘P / Ctrl+P).
          Loft allowance: {Math.round(sheet.loftAllowance * 100)} %.
        </p>
        {sheet.unmeasured.length > 0 && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive" role="alert">
            {sheet.unmeasured.length} entries are still drawn from a fallback size ({sheet.unmeasured.join(", ")}). Their
            predictions are placeholders: enter the size M measurements on the Dimensions tab first, then reload this sheet.
          </p>
        )}
      </header>

      <Section title="1. Loft budget per size" hint="The height each section may stand at: the gusset plus the loft allowance. The centre is one inch lower.">
        <Table className={phoneMinWidth.budgets}>
          <TableHeader>
            <TableRow>
              <TableHead>Size</TableHead>
              <TableHead>Side, x-ray (mm)</TableHead>
              <TableHead>Side, measured</TableHead>
              <TableHead>Centre, x-ray (mm)</TableHead>
              <TableHead>Centre, measured</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sheet.budgets.map((b) => (
              <TableRow key={b.size}>
                <TableCell className="font-medium">{b.size}</TableCell>
                <TableCell>{b.sideMm}</TableCell>
                <Blank />
                <TableCell>{b.centreMm}</TableCell>
                <Blank />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      {sheet.templates.length > 0 && (
        <Section
          title="2. Default filling templates"
          hint="Build each one and measure the loft at each section's middle. The x-ray reads the same numbers."
        >
          <Table className={phoneMinWidth.templates}>
            <TableHeader>
              <TableRow>
                <TableHead>Template</TableHead>
                <TableHead>Fit</TableHead>
                {(["left", "center", "right"] as const).map((s) => [
                  <TableHead key={`${s}-x`} className="capitalize">{s}, x-ray / max</TableHead>,
                  <TableHead key={`${s}-m`} className="capitalize">{s}, measured</TableHead>,
                ])}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sheet.templates.map((t) => (
                <TableRow key={`${t.size}-${t.tier}`}>
                  <TableCell className="font-medium max-md:min-w-56">
                    <span className="capitalize">{t.tier}</span> {t.size}
                    <div className="text-xs font-normal text-muted-foreground">{t.name}</div>
                    {t.notes.length > 0 && <div className="mt-1 text-xs text-muted-foreground">{t.notes.join("; ")}</div>}
                  </TableCell>
                  <TableCell>{t.status}</TableCell>
                  {(["left", "center", "right"] as const).map((s) => [
                    <TableCell key={`${s}-x`}>
                      {t.middleLoftMm[s]} / {t.maxLoftMm[s]}
                    </TableCell>,
                    <Blank key={`${s}-m`} />,
                  ])}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
      )}

      <Section
        title="3. Layers until it cannot close"
        hint="One pouch type, the same number of layers in the front, middle and back of one section. The x-ray turns amber at the first number and red at the second. Note the layer at which the bench says no. They should agree within one layer."
      >
        <Table className={phoneMinWidth.layers}>
          <TableHeader>
            <TableRow>
              <TableHead>Pouch</TableHead>
              {PILLOW_SIZES.map((size) => (
                <TableHead key={size}>{size} side and centre</TableHead>
              ))}
              <TableHead>Bench (size, section, layer)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sheet.layers.map((r) => (
              <TableRow key={r.key}>
                <TableCell className="font-medium">
                  {r.label} <Source source={r.source} />
                </TableCell>
                {PILLOW_SIZES.map((size) => {
                  const v = r.bySize[size];
                  return (
                    <TableCell key={size} className="whitespace-nowrap tabular-nums">
                      {layerCount(v.side.compressedAt)} / {layerCount(v.side.overAt)}
                      <span className="px-1.5 text-muted-foreground">·</span>
                      {layerCount(v.centre.compressedAt)} / {layerCount(v.centre.overAt)}
                    </TableCell>
                  );
                })}
                <Blank />
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-xs text-muted-foreground">
          Each cell reads the <em>side</em> then the <em>centre</em> section, as “squeezes at / cannot close at” a number of layers.
          “–” means not within the five-layer cap.
        </p>
      </Section>

      {sheet.squeeze.length > 0 && (
        <Section title="4. Five 6D L in one section" hint="Squeeze them in by hand, then check the x-ray says the same and its numbers are credible.">
          <Table className={phoneMinWidth.squeeze}>
            <TableHeader>
              <TableRow>
                <TableHead>Build</TableHead>
                <TableHead>X-ray</TableHead>
                <TableHead>Bench</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sheet.squeeze.map((s) => (
                <TableRow key={s.label}>
                  <TableCell className="font-medium">{s.label}</TableCell>
                  <TableCell>
                    <span className="font-medium">{s.status}</span>: {s.message}
                  </TableCell>
                  <Blank />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
      )}

      <Section
        title="5. Settle: one pouch alone in centre middle, size M"
        hint="Front and back empty. The x-ray draws it at its own length, spread 0 each way. Close the pillow, press once as a head would, open it and measure how far it really spread each way and how thick it now is."
      >
        <Table className={phoneMinWidth.settle}>
          <TableHeader>
            <TableRow>
              <TableHead>Pouch</TableHead>
              <TableHead>Spread front / back (mm)</TableHead>
              <TableHead>Measured</TableHead>
              <TableHead>Length relaxed → settled (mm)</TableHead>
              <TableHead>Thickness relaxed → settled (mm)</TableHead>
              <TableHead>Measured</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sheet.settle.map((s) => (
              <TableRow key={s.key}>
                <TableCell className="font-medium">
                  {s.label} <Source source={s.source} />
                </TableCell>
                <TableCell className="tabular-nums">
                  {s.spreadFrontMm} / {s.spreadBackMm}
                </TableCell>
                <Blank />
                <TableCell className="tabular-nums">
                  {s.lengthMm} → {s.settledLengthMm}
                </TableCell>
                <TableCell className="tabular-nums">
                  {s.thicknessMm} → {s.settledThicknessMm}
                </TableCell>
                <Blank />
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {sheet.seam && (
          <p>
            Front and back filled with {sheet.seam.label}, middle empty: the x-ray draws the front one ending{" "}
            <strong>{sheet.seam.seamFromFrontMm} mm</strong> from the front edge, at its own length (body {sheet.seam.bodyLengthMm} mm).
            Measured: ________ mm.
          </p>
        )}
      </Section>

      <Section
        title="6. Footprints by size"
        hint="Lay the pouch flat in an open chamber and photograph it from above. M is what the Dimensions tab says. The other sizes are scaled from M by the pillow's proportions, so the XS and XL photos check that rule too."
      >
        <Table className={phoneMinWidth.footprints}>
          <TableHeader>
            <TableRow>
              <TableHead>Piece</TableHead>
              {PILLOW_SIZES.map((size) => (
                <TableHead key={size}>{size} w × l × t</TableHead>
              ))}
              <TableHead>Measured (size: w × l)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...sheet.footprints, ...sheet.neck].map((f) => (
              <TableRow key={f.key}>
                <TableCell className="font-medium">
                  {f.label} <Source source={f.source} />
                </TableCell>
                {PILLOW_SIZES.map((size) => {
                  const d = f.bySize[size];
                  return (
                    <TableCell key={size} className="whitespace-nowrap tabular-nums">
                      {d.widthMm} × {d.lengthMm} × {d.thicknessMm}
                    </TableCell>
                  );
                })}
                <Blank />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>
    </div>
  );
}
