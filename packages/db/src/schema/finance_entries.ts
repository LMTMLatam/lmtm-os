import { pgTable, uuid, text, timestamp, bigint, boolean, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { clients } from "./clients.js";

// LMTM-OS business finance ledger: the agency's own income & expenses
// (client payments, subscriptions, etc.), categorized and optionally recurring.
// Distinct from finance_events (agent/system billing).
export const financeEntries = pgTable(
  "finance_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    type: text("type").notNull(), // 'income' | 'expense'
    category: text("category").notNull().default("general"),
    description: text("description"),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("ARS"),
    recurring: boolean("recurring").notNull().default(false),
    recurrence: text("recurrence").notNull().default("one_time"), // 'one_time' | 'monthly' | 'yearly'
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyOccurredIdx: index("finance_entries_company_occurred_idx").on(table.companyId, table.occurredAt),
    companyTypeIdx: index("finance_entries_company_type_idx").on(table.companyId, table.type),
    clientIdx: index("finance_entries_client_idx").on(table.clientId),
  }),
);
