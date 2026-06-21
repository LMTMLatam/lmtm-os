// LMTM-OS: ads_inventory_cache
//
// Per-connection cache of the "pages-with-sets" inventory payload (pages +
// linked ad accounts + ad sets) that the "Conectar ad account" UI loads.
//
// Why this exists: building that payload hits the Meta Graph API ~50+ times
// (each Business Manager's owned_pages + client_pages, plus ad accounts and
// ad sets). Doing that on every page load both makes the screen hang and
// pushes the Meta app over its application-level rate limit (x-app-usage
// call_count > 100% → HTTP 403 "(#4) Application request limit reached").
//
// The route reads this cache first (fresh within a TTL) and only rebuilds
// occasionally. When Meta throttles a rebuild, the route serves the last
// known-good payload (stale) instead of hanging, so the screen always loads.

import { pgTable, uuid, jsonb, timestamp } from "drizzle-orm/pg-core";
import { adsConnections } from "./ads_connections.js";

export const adsInventoryCache = pgTable("ads_inventory_cache", {
  connectionId: uuid("connection_id")
    .primaryKey()
    .references(() => adsConnections.id, { onDelete: "cascade" }),
  companyId: uuid("company_id").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AdsInventoryCache = typeof adsInventoryCache.$inferSelect;
export type NewAdsInventoryCache = typeof adsInventoryCache.$inferInsert;
