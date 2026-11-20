import type { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import type { Permission } from "@/lib/auth/permissions";
import { secretMatches } from "@/lib/auth/secret";

export async function requireBearerOrAdmin(
  req: Request,
  envName: string,
  permission: Permission,
): Promise<NextResponse | null> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : null;
  if (secretMatches(process.env[envName]?.trim(), token)) return null;
  return requireAdmin(permission);
}
