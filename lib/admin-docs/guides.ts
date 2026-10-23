/**
 * Admin Panel → Documentation: every guide, in the order the index lists
 * them. A new guide is a `DocGuide` and its sections builder here, and a page
 * at `/settings/docs/<slug>`.
 */
import { POINTS_GUIDE } from "./points";
import type { DocGuide } from "./types";

export const ADMIN_GUIDES: readonly DocGuide[] = [POINTS_GUIDE];
