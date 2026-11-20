export type Rgb = readonly [number, number, number];

export interface Place {
  lat: number;
  lon: number;
}

export interface SkyBody {
  elevation: number;
  hourAngle: number;
  wheel: number;
}

export interface MoonState extends SkyBody {
  phase: number;
  lit: number;
}

export interface SkyPalette {
  top: Rgb;
  mid: Rgb;
  horizon: Rgb;
  sun: Rgb;
  glow: Rgb;
  cloud: Rgb;
  cloudShade: Rgb;
  seaDeep: Rgb;
  seaShallow: Rgb;
  tint: Rgb;
  stars: number;
  sunStrength: number;
}

export interface SkyState {
  palette: SkyPalette;
  sun: SkyBody;
  moon: MoonState;
  ink: "dark" | "light";
  raining: boolean;
}

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
const wrap180 = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function hex(h: string): Rgb {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export function toHex(c: Rgb): string {
  const p = (v: number) => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0");
  return `#${p(c[0])}${p(c[1])}${p(c[2])}`;
}

function dayOfYear(at: Date): number {
  return Math.floor((at.getTime() - Date.UTC(at.getUTCFullYear(), 0, 0)) / DAY_MS);
}

function declination(at: Date): number {
  return -23.44 * Math.cos((2 * Math.PI * (dayOfYear(at) + 10)) / 365);
}

function wheelOf(latDeg: number, declDeg: number, elevation: number, hourAngle: number): number {
  const highest = Math.max(1, 90 - Math.abs(latDeg - declDeg));
  const lowest = Math.max(1, 90 - Math.abs(latDeg + declDeg));
  const share = Math.max(-1, Math.min(1, elevation >= 0 ? elevation / highest : elevation / lowest));
  const angle = share * 90;
  return (((hourAngle < 0 ? 180 - angle : angle) % 360) + 360) % 360;
}

function elevationOf(latDeg: number, declDeg: number, hourAngleDeg: number): number {
  const lat = latDeg * RAD;
  const decl = declDeg * RAD;
  const s = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(hourAngleDeg * RAD);
  return Math.asin(Math.min(1, Math.max(-1, s))) / RAD;
}

export function sunPosition(at: Date, place: Place): SkyBody {
  const b = (2 * Math.PI * (dayOfYear(at) - 81)) / 364;
  const equationOfTime = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
  const utcHours = at.getUTCHours() + at.getUTCMinutes() / 60 + at.getUTCSeconds() / 3600;
  const hourAngle = wrap180((utcHours + place.lon / 15 + equationOfTime / 60 - 12) * 15);
  const decl = declination(at);
  const elevation = elevationOf(place.lat, decl, hourAngle);
  return { elevation, hourAngle, wheel: wheelOf(place.lat, decl, elevation, hourAngle) };
}

const NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14);
const SYNODIC_DAYS = 29.530588853;

export function moonPhase(at: Date): number {
  const cycles = (at.getTime() - NEW_MOON_MS) / (SYNODIC_DAYS * DAY_MS);
  return cycles - Math.floor(cycles);
}

export function moonPosition(at: Date, place: Place): MoonState {
  const phase = moonPhase(at);
  const sun = sunPosition(at, place);
  const hourAngle = wrap180(sun.hourAngle - phase * 360);
  const decl = declination(at) * Math.cos(2 * Math.PI * phase);
  const elevation = elevationOf(place.lat, decl, hourAngle);
  return {
    elevation,
    hourAngle,
    wheel: wheelOf(place.lat, decl, elevation, hourAngle),
    phase,
    lit: (1 - Math.cos(2 * Math.PI * phase)) / 2,
  };
}

export function guessPlace(timeZone: string | null | undefined, utcOffsetMinutes: number): Place {
  const tz = timeZone ?? "";
  if (tz === "Asia/Singapore" || tz === "Asia/Kuala_Lumpur") return { lat: 1.35, lon: 103.82 };
  const lon = Math.max(-180, Math.min(180, (utcOffsetMinutes / 60) * 15));
  const south = /^(Australia|Antarctica)\/|^Pacific\/(Auckland|Fiji)|^Africa\/(Johannesburg|Maputo|Harare)|^America\/(Sao_Paulo|Argentina|Santiago|Montevideo|Lima|La_Paz)/.test(tz);
  if (south) return { lat: -30, lon };
  if (tz.startsWith("Europe/")) return { lat: 48, lon };
  if (tz.startsWith("America/")) return { lat: 38, lon };
  return { lat: 20, lon };
}

type Stop = { at: number } & Omit<SkyPalette, "sunStrength">;

const stop = (at: number, c: Record<Exclude<keyof Stop, "at" | "stars">, string>, stars: number): Stop => ({
  at,
  top: hex(c.top),
  mid: hex(c.mid),
  horizon: hex(c.horizon),
  sun: hex(c.sun),
  glow: hex(c.glow),
  cloud: hex(c.cloud),
  cloudShade: hex(c.cloudShade),
  seaDeep: hex(c.seaDeep),
  seaShallow: hex(c.seaShallow),
  tint: hex(c.tint),
  stars,
});

const NIGHT = stop(-18, { top: "#0a0f2c", mid: "#151d4a", horizon: "#2c3470", sun: "#ffd9a8", glow: "#39407e", cloud: "#39437f", cloudShade: "#1f2756", seaDeep: "#080d2a", seaShallow: "#1c2760", tint: "#5d6aa8" }, 1);
const DAY_LOW = stop(12, { top: "#3f93e6", mid: "#96ccf6", horizon: "#e4f3fc", sun: "#ffeaa6", glow: "#fff1c4", cloud: "#fff6e2", cloudShade: "#a4a8e2", seaDeep: "#1b78c2", seaShallow: "#79d2e8", tint: "#ffffff" }, 0);
const DAY_HIGH = stop(40, { top: "#3390ee", mid: "#86c8f8", horizon: "#dff2fd", sun: "#fffdf0", glow: "#fff8dc", cloud: "#fff7e4", cloudShade: "#a9ade4", seaDeep: "#1675c6", seaShallow: "#6fd3ea", tint: "#ffffff" }, 0);

const EVENING: readonly Stop[] = [
  NIGHT,
  stop(-7, { top: "#161c4e", mid: "#43397a", horizon: "#b8607c", sun: "#ff9a6b", glow: "#c4607e", cloud: "#6f5590", cloudShade: "#3a3168", seaDeep: "#12173f", seaShallow: "#5b447f", tint: "#8d86c0" }, 0.75),
  stop(-1.5, { top: "#33458f", mid: "#b56f9c", horizon: "#ffab73", sun: "#ff7d47", glow: "#ffa26a", cloud: "#f6a59c", cloudShade: "#8b6aa2", seaDeep: "#2a2f6e", seaShallow: "#e59a86", tint: "#d9b0c4" }, 0.2),
  stop(4, { top: "#4f86d2", mid: "#f0b29c", horizon: "#ffd89c", sun: "#ff9d4d", glow: "#ffcf90", cloud: "#ffeedd", cloudShade: "#e3a99c", seaDeep: "#2b62ae", seaShallow: "#f5c9a2", tint: "#ffe6d2" }, 0),
  DAY_LOW,
  DAY_HIGH,
];

const MORNING: readonly Stop[] = [
  NIGHT,
  stop(-7, { top: "#141b4c", mid: "#3a3f80", horizon: "#a8709a", sun: "#ffb59a", glow: "#b47aa0", cloud: "#65609a", cloudShade: "#343a70", seaDeep: "#10173f", seaShallow: "#4f4f8a", tint: "#8a8cc4" }, 0.75),
  stop(-1.5, { top: "#3a55a0", mid: "#c28db4", horizon: "#ffc09a", sun: "#ff9668", glow: "#ffb999", cloud: "#f9bdc0", cloudShade: "#9580b4", seaDeep: "#2a3a7c", seaShallow: "#e9b0ac", tint: "#e0c0d2" }, 0.2),
  stop(4, { top: "#5a98dc", mid: "#f6c8c0", horizon: "#ffe6bc", sun: "#ffb765", glow: "#ffe2b0", cloud: "#fff3ea", cloudShade: "#ecbcc0", seaDeep: "#2f6fb8", seaShallow: "#f7d6c0", tint: "#fff0e4" }, 0),
  DAY_LOW,
  DAY_HIGH,
];

const COLOUR_KEYS = ["top", "mid", "horizon", "sun", "glow", "cloud", "cloudShade", "seaDeep", "seaShallow", "tint"] as const;

function between(stops: readonly Stop[], elevation: number): Omit<SkyPalette, "sunStrength"> {
  const first = stops[0]!;
  const last = stops[stops.length - 1]!;
  if (elevation <= first.at) return first;
  if (elevation >= last.at) return last;
  let i = 1;
  while (stops[i]!.at < elevation) i += 1;
  const a = stops[i - 1]!;
  const b = stops[i]!;
  const t = (elevation - a.at) / (b.at - a.at);
  const out = { stars: a.stars + (b.stars - a.stars) * t } as Record<string, unknown>;
  for (const k of COLOUR_KEYS) out[k] = mix(a[k], b[k], t);
  return out as unknown as Omit<SkyPalette, "sunStrength">;
}

export function luminance(c: Rgb): number {
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
}

function overcast(p: SkyPalette, sunElevation: number): SkyPalette {
  const deck = mix(hex("#2d3654"), hex("#b3bdc9"), clamp01((sunElevation + 8) / 18));
  const toward = (c: Rgb, t: number, k = 1): Rgb => {
    const m = mix(c, deck, t);
    return [m[0] * k, m[1] * k, m[2] * k];
  };
  return {
    top: toward(p.top, 0.7, 0.92),
    mid: toward(p.mid, 0.72),
    horizon: toward(p.horizon, 0.6, 1.05),
    sun: toward(p.sun, 0.5),
    glow: toward(p.glow, 0.75),
    cloud: toward(p.cloud, 0.5, 1.12),
    cloudShade: toward(p.cloudShade, 0.65, 0.9),
    seaDeep: toward(p.seaDeep, 0.5, 0.8),
    seaShallow: toward(p.seaShallow, 0.6, 0.94),
    tint: toward(p.tint, 0.35, 0.95),
    stars: p.stars * 0.08,
    sunStrength: 0.12,
  };
}

export function skyPalette(sunElevation: number, morning: boolean, raining = false): SkyPalette {
  const clear: SkyPalette = { ...between(morning ? MORNING : EVENING, sunElevation), sunStrength: 1 };
  return raining ? overcast(clear, sunElevation) : clear;
}

export function inkFor(palette: SkyPalette): "dark" | "light" {
  return luminance(mix(palette.top, palette.mid, 0.55)) > 0.3 ? "dark" : "light";
}

export function skyAt(at: Date, place: Place, raining = false): SkyState {
  const sun = sunPosition(at, place);
  const palette = skyPalette(sun.elevation, sun.hourAngle < 0, raining);
  return { palette, sun, moon: moonPosition(at, place), ink: inkFor(palette), raining };
}

export function skyCss(palette: SkyPalette): string {
  const { top, mid, horizon, seaShallow, seaDeep } = palette;
  return `linear-gradient(to bottom, ${toHex(top)} 0%, ${toHex(mid)} 42%, ${toHex(horizon)} 62%, ${toHex(seaShallow)} 62%, ${toHex(seaDeep)} 100%)`;
}
