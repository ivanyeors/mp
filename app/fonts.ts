import { Figtree } from "next/font/google";

/**
 * The site's one typeface, loaded here and nowhere else. The root layout puts its
 * variable on <html>, globals.css names it `--font-sans`, and every page and
 * component inherits it from there instead of setting a font of its own. HTML
 * served outside the app shell, which cannot load it, uses `FONT_STACK`
 * (lib/font-stack.ts), which names the same face.
 */
export const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
});
