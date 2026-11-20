import { useMediaQuery } from "@/hooks/use-media-query"

/**
 * Below the `md:` breakpoint. `false` on the server and while hydrating (see useMediaQuery).
 *
 * 767.98, not 767: a zoomed desktop window can be 767.5px wide, where Tailwind's
 * `max-md:` styles still apply, and this must agree with them.
 */
export function useIsMobile() {
  return useMediaQuery("(max-width: 767.98px)")
}
