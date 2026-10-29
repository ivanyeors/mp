/**
 * The site's typeface as a plain CSS font stack, for HTML that cannot load the
 * web font: emails (mail clients load no web fonts) and the page proxy.ts writes
 * by hand. Inside the app, Figtree is loaded once in app/fonts.ts; keep the two
 * naming the same face. The fallbacks land on a humanist sans everywhere.
 */
const LATIN_STACK = "'Figtree','Segoe UI',Roboto,Helvetica,Arial";

export const FONT_STACK = `${LATIN_STACK},sans-serif`;

/**
 * The emails' stack: the same, with the Chinese system fonts before the
 * generic family, for a campaign's 中文 version (PRD-campaign-email-editor
 * slice 17) and a Chinese name in any email. After the Latin faces, not
 * before them: a reader finds each character in the first font that has it,
 * so English words keep their face, and Chinese ones fall through to PingFang
 * SC (Apple), Microsoft YaHei (Windows) or Noto Sans SC (Android).
 */
export const EMAIL_FONT_STACK = `${LATIN_STACK},'PingFang SC','Microsoft YaHei','Noto Sans SC',sans-serif`;
