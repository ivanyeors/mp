import { type NextRequest, type NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

/**
 * Refreshes the Supabase auth session for the incoming request and writes any
 * rotated session cookies onto the provided response. Designed to compose with
 * the existing locale/currency middleware: pass the response that middleware is
 * about to return and this mutates its cookies in place.
 *
 * Returns the (possibly null) user so callers can make auth-aware routing
 * decisions if needed.
 */
export async function refreshSupabaseSession(
  request: NextRequest,
  response: NextResponse,
) {
  if (!supabaseUrl || !supabaseAnonKey) return null;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}
