import { pgTable, uuid, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { clients } from "./clients.js";
import { issues } from "./issues.js";
import { agents } from "./agents.js";

// LMTM-OS: structured agent deliverables — a finished copy, campaign spec,
// report or research artifact, captured as a reusable object instead of buried
// in a comment thread. See migration 0119.
export const agentDeliverables = pgTable("agent_deliverables", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  issueId: uuid("issue_id").references(() => issues.id, { onDelete: "set null" }),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
  kind: text("kind").notNull(), // copy | campaign_spec | report | research | plan | other
  title: text("title").notNull(),
  content: text("content").notNull(),
  url: text("url"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  companyIdx: index("agent_deliverables_company_idx").on(t.companyId, t.createdAt),
  clientIdx: index("agent_deliverables_client_idx").on(t.clientId),
  issueIdx: index("agent_deliverables_issue_idx").on(t.issueId),
}));
