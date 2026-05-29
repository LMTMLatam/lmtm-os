import { pgTable, uuid, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { metaConnections } from "./meta_connections.js";

// One Meta connection (your agency's user/system token) can be reused
// across multiple client companies. This mapping table records which
// ad accounts (act_xxx) from that connection are assigned to which
// client company, so the Dashboard Agent can resolve "datos para X" to a
// (connection, adAccountId) pair without re-asking each time.
export const metaAdAccountMappings = pgTable(
  "meta_ad_account_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id").notNull().references(() => metaConnections.id, { onDelete: "cascade" }),
    adAccountId: text("ad_account_id").notNull(),
    pageId: text("page_id"),
    label: text("label"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("meta_mappings_company_idx").on(table.companyId),
    connectionIdx: index("meta_mappings_connection_idx").on(table.connectionId),
    companyAccountUq: uniqueIndex("meta_mappings_company_account_uq").on(table.companyId, table.adAccountId),
  }),
);
