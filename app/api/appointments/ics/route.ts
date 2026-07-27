import { buildVEvent } from "@/lib/appointments/ics";

export const runtime = "nodejs";

/**
 * GET /api/appointments/ics?start=&end=&summary=&location=&description=&uid=
 * Returns a downloadable .ics so phones trigger the OS "add to calendar" sheet.
 * `start`/`end` are ISO datetimes (may carry +08:00 or Z). `start`/`end` required.
 */
export function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const start = q.get("start");
  const end = q.get("end");
  if (!start || !end) {
    return new Response("Missing start/end", { status: 400 });
  }

  let ics: string;
  try {
    ics = buildVEvent({
      startIso: start,
      endIso: end,
      summary: q.get("summary") ?? "Appointment",
      location: q.get("location") ?? undefined,
      description: q.get("description") ?? undefined,
      uid: q.get("uid") ?? `${start}-mpillow`,
    });
  } catch {
    return new Response("Invalid start/end", { status: 400 });
  }

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="appointment.ics"',
    },
  });
}
