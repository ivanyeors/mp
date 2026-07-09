export const OPEN_BOOK_APPOINTMENT_EVENT = "mpillow:open-book-appointment";

export const BOOK_APPOINTMENT_URL =
  "https://calendar.google.com/calendar/appointments/schedules/AcZssZ0bNnrc_0CeREyaoByx0GDhuif5fJFTCyAQTkEJH14vNs5XT_zzqgv47CJ-FrUACncTtYs8yeas?gv=true";

export function openBookAppointmentSheet() {
  window.dispatchEvent(new Event(OPEN_BOOK_APPOINTMENT_EVENT));
}
