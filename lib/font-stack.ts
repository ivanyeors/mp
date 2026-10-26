/**
 * The site's typeface as a plain CSS font stack, for HTML that cannot load the
 * web font: emails (mail clients load no web fonts) and the page proxy.ts writes
 * by hand. Inside the app, Figtree is loaded once in app/fonts.ts; keep the two
 * naming the same face. The fallbacks land on a humanist sans everywhere.
 */
export const FONT_STACK = "'Figtree','Segoe UI',Roboto,Helvetica,Arial,sans-serif";
