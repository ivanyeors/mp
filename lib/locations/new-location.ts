export function newLocationTakesBookings(type: "own" | "partner"): boolean {
  return type === "own";
}
