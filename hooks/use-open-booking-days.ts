"use client";

import { useRef, useState } from "react";

export type OpenDays = Set<string>;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function dayKey(d: Date): string {
  return `${monthKey(d)}-${pad(d.getDate())}`;
}

async function fetchOpenDays(month: string): Promise<OpenDays | null> {
  try {
    const res = await fetch(`/api/appointments/slots?month=${month}`);
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.ok || !Array.isArray(body.days)) return null;
    return new Set(body.days.map((d: { date: string }) => d.date));
  } catch {
    return null;
  }
}

export function useOpenBookingDays() {
  const asked = useRef(new Map<string, Promise<OpenDays | null>>());
  const [open, setOpen] = useState<Record<string, OpenDays>>({});

  function load(month: Date): Promise<OpenDays | null> {
    const key = monthKey(month);
    const known = asked.current.get(key);
    if (known) return known;
    const pending = fetchOpenDays(key).then((days) => {
      if (asked.current.get(key) !== pending) return days;
      if (days) setOpen((prev) => ({ ...prev, [key]: days }));
      else asked.current.delete(key);
      return days;
    });
    asked.current.set(key, pending);
    return pending;
  }

  function forget() {
    asked.current.clear();
    setOpen({});
  }

  function noOpenTime(day: Date): boolean {
    const days = open[monthKey(day)];
    return days ? !days.has(dayKey(day)) : false;
  }

  return { load, forget, noOpenTime };
}
