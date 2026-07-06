import { pgTable, uuid, text, jsonb, timestamp, index, bigint, integer, boolean } from "drizzle-orm/pg-core";
import { clients } from "./clients.js";

// LMTM-OS: Baúl de Ganchos — reusable hook vault. client_id null = global
// (niche-level) hook. See migration 0121.
export const hooks = pgTable("hooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
  niche: text("niche"),
  text: text("text").notNull(),
  sourceKind: text("source_kind").notNull().default("manual"), // manual | organico | competidor | tendencia
  sourceRef: text("source_ref"),
  format: text("format"),
  views: bigint("views", { mode: "number" }),
  timesUsed: integer("times_used").notNull().default(0),
  pinned: boolean("pinned").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  clientIdx: index("hooks_client_idx").on(t.clientId),
  nicheIdx: index("hooks_niche_idx").on(t.niche),
}));

// LMTM-OS: Tendencias — daily external news mined by agents, tagged by
// content potential and applicable niches. See migration 0121.
export const trends = pgTable("trends", {
  id: uuid("id").primaryKey().defaultRandom(),
  day: text("day").notNull(), // YYYY-MM-DD
  title: text("title").notNull(),
  url: text("url"),
  source: text("source"),
  tag: text("tag").notNull().default("potencial-de-gancho"), // potencial-de-gancho | explicativo | ignorar
  niches: jsonb("niches").$type<string[]>().notNull().default([]),
  summary: text("summary"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  dayIdx: index("trends_day_idx").on(t.day),
}));
