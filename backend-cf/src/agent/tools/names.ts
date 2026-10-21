/** Shared ingredient / pantry name normalize for matching. */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}
