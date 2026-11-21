// ponytail: there is no way to send a literal `*`, so an address containing one never matches its
// own row; such addresses are vanishingly rare.
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_*]/g, (ch) => `\\${ch}`);
}

export function sanitizeSearchTerm(raw: string): string {
  return raw.replace(/[,()%_*\\"]/g, "").trim().slice(0, 100);
}
