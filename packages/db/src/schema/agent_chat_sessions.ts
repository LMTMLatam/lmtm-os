import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const agentChatSessions = pgTable("agent_chat_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  agentKey: text("agent_key").notNull().default("default"),
  clientContext: text("client_context"),
  messages: jsonb("messages").$type<Array<Record<string, unknown>>>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  companyIdx: index("agent_chat_sessions_company_idx").on(t.companyId),
  keyIdx: index("agent_chat_sessions_key_idx").on(t.companyId, t.agentKey),
}));
