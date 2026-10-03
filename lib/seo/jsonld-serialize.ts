/**
 * JSON-LD for an inline `<script type="application/ld+json">`.
 *
 * `JSON.stringify` alone is not safe there: a string value containing
 * `</script>` closes the element early and whatever follows runs as page
 * markup. Blog titles, product copy and FAQ answers all reach JSON-LD, so a
 * single staff-authored string would become script on every public page.
 *
 * Escaping `<`, `>` and `&` as \u-sequences keeps the JSON byte-for-byte
 * equivalent once parsed. U+2028 / U+2029 are escaped too: valid in JSON
 * strings but line terminators to older JavaScript parsers.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
