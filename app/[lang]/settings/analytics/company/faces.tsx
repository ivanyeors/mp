import {
  Bot, Building2, ClipboardCheck, Code2, Crown, Database, Factory, FileSignature, Globe, Handshake, Headset, HeartHandshake,
  Landmark, Lightbulb, Mail, Megaphone, MousePointerClick, PackageCheck, PenLine, PieChart, Radar, Scale, Search, Shield,
  ShieldAlert, Star, Trophy, UserPlus, Users, Video, type LucideIcon,
} from "lucide-react";
import type { Health } from "@/lib/company/overview";
import { cn } from "@/lib/utils";
import { HEALTH } from "./format";

const ICONS: Record<string, LucideIcon> = {
  ceo: Crown,
  "dept-fin": Landmark,
  "dept-sales": Handshake,
  "dept-strat": Lightbulb,
  "dept-ops": Factory,
  fin: Landmark,
  compliance: Scale,
  legal: FileSignature,
  mkt: Megaphone,
  seo: Search,
  sem: MousePointerClick,
  social: Video,
  lifecycle: Mail,
  content: PenLine,
  reviews: Star,
  pr: Trophy,
  bd: Building2,
  partner: Users,
  crm: HeartHandshake,
  csqa: Headset,
  market: PieChart,
  compintel: Radar,
  product: Lightbulb,
  supplier: Factory,
  ops: PackageCheck,
  talent: UserPlus,
  security: Shield,
  "sec-surface": Globe,
  "sec-code": Code2,
  "sec-data": Database,
  "sec-threat": ShieldAlert,
};

const RING: Record<Health, string> = {
  ok: "ring-emerald-500/50",
  unchanged: "ring-sky-500/50",
  degraded: "ring-amber-500/60",
  failed: "ring-red-500/70",
  missed: "ring-red-500/70",
  none: "ring-border",
  paused: "ring-border",
  group: "ring-border",
};

export function AgentFace({ id, health, size = "md" }: { id: string; health: Health; size?: "sm" | "md" | "lg" }) {
  const Icon = ICONS[id] ?? (id.startsWith("dept-") ? ClipboardCheck : Bot);
  const box = size === "lg" ? "h-12 w-12 rounded-2xl" : size === "sm" ? "h-7 w-7 rounded-lg" : "h-9 w-9 rounded-xl";
  const icon = size === "lg" ? "h-5 w-5" : size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  return (
    <span className={cn("relative inline-grid shrink-0 place-items-center bg-gradient-to-br from-muted to-muted/40 text-foreground/80 ring-1", box, RING[health])}>
      <Icon className={icon} strokeWidth={1.7} aria-hidden="true" />
      {health !== "group" ? (
        <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5">
          {HEALTH[health].pulse ? <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 motion-reduce:hidden", HEALTH[health].dot)} /> : null}
          <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full ring-2 ring-background", HEALTH[health].dot)} />
        </span>
      ) : null}
      <span className="sr-only">{HEALTH[health].label}</span>
    </span>
  );
}
