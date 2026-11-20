"use client";

import { useState } from "react";
import {
  Moon,
  Sun,
  Feather,
  Leaf,
  Droplets,
  Layers,
  Shield,
  Package,
  Square,
  Circle,
  Star,
} from "lucide-react";

import { SunburstMenu, type SunburstNode } from "@/components/ui/sunburst-menu";

const tree: SunburstNode[] = [
  {
    id: "fillings",
    label: "Fillings",
    icon: Layers,
    children: [
      { id: "memory-foam", label: "Memory", icon: Feather },
      { id: "latex", label: "Latex", icon: Leaf },
      { id: "gel", label: "Gel", icon: Droplets },
      { id: "microfiber", label: "Micro", icon: Circle, disabled: true },
    ],
  },
  {
    id: "cover",
    label: "Cover",
    icon: Square,
    children: [
      { id: "cotton", label: "Cotton", icon: Star },
      { id: "bamboo", label: "Bamboo", icon: Leaf },
    ],
  },
  { id: "case", label: "Case", icon: Package },
  { id: "protector", label: "Protector", icon: Shield, disabled: true },
];

export default function SunburstDemoPage() {
  const [display, setDisplay] = useState<"icon" | "text" | "both">("both");
  const [selected, setSelected] = useState<SunburstNode | null>(null);
  const [dark, setDark] = useState(false);

  return (
    <div className={dark ? "dark" : ""}>
      <div className="flex min-h-screen flex-col items-center gap-8 bg-background p-10 text-foreground">
        <div className="flex flex-wrap items-center gap-3">
          {(["icon", "text", "both"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDisplay(d)}
              className={`rounded-md border px-3 py-1.5 text-sm ${display === d ? "bg-primary text-primary-foreground" : "bg-background"}`}
            >
              {d}
            </button>
          ))}
          <button
            onClick={() => setDark((v) => !v)}
            className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm"
          >
            {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            {dark ? "light" : "dark"}
          </button>
        </div>

        <SunburstMenu
          root={tree}
          display={display}
          onSelect={setSelected}
          selectedId={selected?.id}
        />

        <p className="text-sm text-muted-foreground">
          Selected: <span className="font-medium text-foreground">{selected ? selected.label : "—"}</span>
        </p>
        <p className="max-w-md text-center text-xs text-muted-foreground">
          Click center to open. Click a parent (Fillings, Cover) to fan its children
          outward. Leaves select + collapse. Microfiber &amp; Protector are disabled.
          Keyboard: arrows move, Enter activates, Esc steps back.
        </p>
      </div>
    </div>
  );
}
