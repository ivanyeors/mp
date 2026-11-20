export const EXPLORE_LAUNCH_AT = "2026-12-31T23:59:00+08:00";

export const EXPLORE_LAUNCH_LABEL = "31 December 2026, 23:59 Singapore time";

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  done: boolean;
}

export function countdownParts(nowMs: number, launchMs: number): CountdownParts {
  const left = Math.max(0, Math.floor((launchMs - nowMs) / 1000));
  return {
    days: Math.floor(left / 86400),
    hours: Math.floor((left % 86400) / 3600),
    minutes: Math.floor((left % 3600) / 60),
    seconds: left % 60,
    done: launchMs - nowMs <= 0,
  };
}
