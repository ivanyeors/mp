// Who signs in to the preview: one Owner, and a Staff member with no
// permissions for checking what a refused page looks like
// (`preview shoot --as staff@preview.local …`).
//
// Every fixture file exports a function of { scenario, now } returning
// { users, tables, rpc }. Files load in name order; rows for the same table
// from several files are added together. All data here is made up.

export const OWNER = { id: "00000000-0000-4000-8000-000000000001", email: "owner@preview.local" };
export const STAFF = { id: "00000000-0000-4000-8000-000000000002", email: "staff@preview.local" };

export default function base() {
  const at = "2026-01-05T02:00:00Z";
  return {
    users: [
      { ...OWNER, user_metadata: { full_name: "Preview Owner" } },
      { ...STAFF, user_metadata: { full_name: "Preview Staff" } },
    ],
    tables: {
      admin_roles: [
        { id: "role-owner", key: "owner", name: "Owner", description: "Everything", is_system: true, grants_all: true, permissions: [], created_at: at, updated_at: at },
        { id: "role-staff", key: "staff", name: "Staff", description: "No pages", is_system: false, grants_all: false, permissions: [], created_at: at, updated_at: at },
      ],
      admin_users: [
        { id: "member-owner", auth_user_id: OWNER.id, email: OWNER.email, role: "owner", role_id: "role-owner", is_active: true, created_at: at, updated_at: at },
        { id: "member-staff", auth_user_id: STAFF.id, email: STAFF.email, role: "staff", role_id: "role-staff", is_active: true, created_at: at, updated_at: at },
      ],
    },
    rpc: {
      is_admin_user: (_args, { user }) => Boolean(user),
    },
  };
}
