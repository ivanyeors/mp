export const XRAY_THEME = [
  "border bg-slate-100 [--xray-shell:#64748b] [--xray-interior:rgba(255,255,255,0.75)] [--xray-veil:#f1f5f9]",
  "dark:border-transparent dark:bg-slate-950 dark:[--xray-shell:rgba(255,255,255,0.9)] dark:[--xray-interior:rgba(15,23,42,0.5)] dark:[--xray-veil:rgb(2,6,23)]",
].join(" ");

export const XRAY_SHELL_VAR = "var(--xray-shell, rgba(255,255,255,0.9))";
export const XRAY_INTERIOR_VAR = "var(--xray-interior, rgba(15,23,42,0.5))";
export const XRAY_PIECE_EDGE_VAR = "var(--xray-piece-edge, rgba(255,255,255,0.9))";
