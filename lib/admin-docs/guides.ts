/**
 * Admin Panel → Documentation: every guide, in the order the index lists
 * them. A new guide is a `DocGuide` and its sections builder here, and a page
 * at `/settings/docs/<slug>`.
 */
import { META_TESTERS_GUIDE } from "./meta-testers";
import { POINTS_GUIDE } from "./points";
import { STAFF_ORDERS_GUIDE } from "./staff-orders";
import type { DocGuide } from "./types";

export const ADMIN_GUIDES: readonly DocGuide[] = [STAFF_ORDERS_GUIDE, POINTS_GUIDE, META_TESTERS_GUIDE];
