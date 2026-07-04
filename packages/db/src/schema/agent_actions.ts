import { pgTable, uuid, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { clients } from "./clients.js";
import { agents } from "./agents.js";

// LMTM-OS: ledger of real write-actions the agents execute (not just
// proposals) — starting with Meta ad pauses. `outcome` is filled later to
// measure whether the action helped. See migration 0120.
export const agentActions = pgTable("agent_actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
  kind: text("kind").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
  outcome: jsonb("outcome").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  clientIdx: index("agent_actions_client_idx").on(t.clientId),
  kindIdx: index("agent_actions_kind_idx").on(t.kind, t.createdAt),
}));
