import { pgTable, uuid, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { clients } from "./clients.js";

// LMTM-OS: curated video references per client (reels the team wants to riff on).
// Fed into content-idea generation so ideas are grounded in real references.
export const videoReferences = pgTable("video_references", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  categorias: text("categorias").array().notNull().default([]),
  comentario: text("comentario"),
  source: text("source").notNull().default("sheet"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  clientIdx: index("video_references_client_idx").on(t.clientId),
  uniq: uniqueIndex("video_references_client_url_uq").on(t.clientId, t.url),
}));
