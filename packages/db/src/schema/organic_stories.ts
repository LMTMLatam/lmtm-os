import { pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";
import { clients } from "./clients.js";

// LMTM-OS: stories de Instagram capturadas cada 6 h (Meta solo muestra las de
// las últimas 24 h). Migración 0159. Ver server/src/services/stories.ts.
export const organicStories = pgTable(
  "organic_stories",
  {
    id: text("id").primaryKey(),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
    pageId: text("page_id"),
    igUserId: text("ig_user_id").notNull(),
    mediaType: text("media_type"),
    permalink: text("permalink"),
    publicadaAt: timestamp("publicada_at", { withTimezone: true }).notNull(),
    vistaAt: timestamp("vista_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ clienteIdx: index("organic_stories_cliente_idx").on(t.clientId, t.publicadaAt) }),
);
