export const USERS_TABS = ["members", "profiles", "roles", "telegram"] as const;
export type UsersTab = (typeof USERS_TABS)[number];

export function parseUsersTab(value: string | string[] | undefined): UsersTab {
  const v = Array.isArray(value) ? value[0] : value;
  return (USERS_TABS as readonly string[]).includes(v ?? "") ? (v as UsersTab) : "members";
}
