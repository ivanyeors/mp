export const OPEN_BOOK_APPOINTMENT_EVENT = "mpillow:open-book-appointment";

// ponytail: BOOK_APPOINTMENT_URL (Google iframe) retired in slice 08 (ADR 0013) —
// replaced by the Mpillow BookingFlow. Removed the dead export.

export function openBookAppointment() {
  window.dispatchEvent(new Event(OPEN_BOOK_APPOINTMENT_EVENT));
}
