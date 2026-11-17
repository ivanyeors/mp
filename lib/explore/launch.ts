/**
 * The Explore page's launch moment (owner, 2026-11-16): the site opens at
 * 23:59 on Thursday 31 December 2026, Singapore time. One fixed time; the
 * countdown runs to it and never restarts.
 */
export const EXPLORE_LAUNCH_AT = "2026-12-31T23:59:00+08:00";

/** How people read it, wherever they are. */
export const EXPLORE_LAUNCH_LABEL = "31 December 2026, 23:59 Singapore time";

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** The launch has come. */
  done: boolean;
}

/** Pure — what is left until `launchMs`, floored to the second. */
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
