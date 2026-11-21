type HastNode = {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

const DROPPED_ELEMENTS = new Set([
  "script", "style", "iframe", "frame", "frameset", "object", "embed", "applet",
  "link", "meta", "base", "form", "noscript", "template",
]);

const URL_PROPERTIES = new Set(["href", "src", "action", "formaction", "xlinkhref", "poster", "cite", "data"]);

const SAFE_URL = /^(?:https?:|mailto:|tel:|#|\/(?!\/)|\.{1,2}\/|[^:]*$)/i;

export function isSafeUrl(value: unknown): boolean {
  const url = String(value).replace(/[\u0000- \u007f]/g, "");
  return SAFE_URL.test(url);
}

function clean(node: HastNode): void {
  if (!node.children) return;
  node.children = node.children.filter(
    (child) => !(child.type === "element" && DROPPED_ELEMENTS.has((child.tagName ?? "").toLowerCase())),
  );
  for (const child of node.children) {
    if (child.type === "element" && child.properties) {
      for (const key of Object.keys(child.properties)) {
        const name = key.toLowerCase();
        if (name.startsWith("on") || name === "srcdoc") delete child.properties[key];
        else if (URL_PROPERTIES.has(name) && !isSafeUrl(child.properties[key])) delete child.properties[key];
      }
    }
    clean(child);
  }
}

export function rehypeStripUnsafeHtml() {
  return (tree: HastNode) => {
    clean(tree);
  };
}
