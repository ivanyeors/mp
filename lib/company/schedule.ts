const SG_OFFSET_MS = 8 * 60 * 60 * 1000;

type Field = Set<number> | null;

function field(text: string, min: number, max: number): Field {
  if (text === "*") return null;
  const values = new Set<number>();
  for (const part of text.split(",")) {
    const range = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!range) throw new Error(`Unsupported cron field "${text}"`);
    const from = Number(range[1]);
    const to = range[2] === undefined ? from : Number(range[2]);
    if (from < min || to > max || from > to) throw new Error(`Cron field "${text}" is out of range`);
    for (let v = from; v <= to; v++) values.add(v);
  }
  return values;
}

export type Cron = { minutes: Field; hours: Field; days: Field; months: Field; weekdays: Field };

export function parseCron(schedule: string): Cron {
  const body = schedule.trim().replace(/^CRON_TZ=Asia\/Singapore\s+/, "");
  if (/^CRON_TZ=/.test(body)) throw new Error(`Only Asia/Singapore schedules are read: "${schedule}"`);
  const parts = body.split(/\s+/);
  if (parts.length !== 5) throw new Error(`Expected 5 cron fields: "${schedule}"`);
  const weekdays = field(parts[4], 0, 7);
  if (weekdays?.has(7)) weekdays.add(0);
  return {
    minutes: field(parts[0], 0, 59),
    hours: field(parts[1], 0, 23),
    days: field(parts[2], 1, 31),
    months: field(parts[3], 1, 12),
    weekdays,
  };
}

const has = (f: Field, v: number) => f === null || f.has(v);

function dayMatches(cron: Cron, sg: Date): boolean {
  if (!has(cron.months, sg.getUTCMonth() + 1)) return false;
  const dom = has(cron.days, sg.getUTCDate());
  const dow = has(cron.weekdays, sg.getUTCDay());
  if (cron.days !== null && cron.weekdays !== null) return dom || dow;
  return dom && dow;
}

export function nextRun(schedule: string, after: Date): Date | null {
  const cron = parseCron(schedule);
  const sgNow = new Date(after.getTime() + SG_OFFSET_MS);
  const day = new Date(Date.UTC(sgNow.getUTCFullYear(), sgNow.getUTCMonth(), sgNow.getUTCDate()));
  const times: number[] = [];
  for (let h = 0; h < 24; h++) {
    if (!has(cron.hours, h)) continue;
    for (let m = 0; m < 60; m++) if (has(cron.minutes, m)) times.push(h * 60 + m);
  }
  for (let i = 0; i < 400; i++) {
    const d = new Date(day.getTime() + i * 86_400_000);
    if (!dayMatches(cron, d)) continue;
    for (const t of times) {
      const at = new Date(d.getTime() + t * 60_000 - SG_OFFSET_MS);
      if (at.getTime() > after.getTime()) return at;
    }
  }
  return null;
}

export function previousRun(schedule: string, before: Date): Date | null {
  const cron = parseCron(schedule);
  const sgNow = new Date(before.getTime() + SG_OFFSET_MS);
  const day = new Date(Date.UTC(sgNow.getUTCFullYear(), sgNow.getUTCMonth(), sgNow.getUTCDate()));
  const times: number[] = [];
  for (let h = 23; h >= 0; h--) {
    if (!has(cron.hours, h)) continue;
    for (let m = 59; m >= 0; m--) if (has(cron.minutes, m)) times.push(h * 60 + m);
  }
  for (let i = 0; i < 400; i++) {
    const d = new Date(day.getTime() - i * 86_400_000);
    if (!dayMatches(cron, d)) continue;
    for (const t of times) {
      const at = new Date(d.getTime() + t * 60_000 - SG_OFFSET_MS);
      if (at.getTime() <= before.getTime()) return at;
    }
  }
  return null;
}
