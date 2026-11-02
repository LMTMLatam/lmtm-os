import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { agentDeliverables } from "./agent_deliverables.js";
import { clients } from "./clients.js";

/** Cómo rindió una pieza del Productor a las 24 h y a los 7 días. null = sin dato, nunca cero. */
export const piezaMetricas = pgTable(
  "pieza_metricas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deliverableId: uuid("deliverable_id").notNull().references(() => agentDeliverables.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
    postId: text("post_id").notNull(),
    momento: text("momento").notNull(), // 24h | 7d
    /** Las horas reales que tenía el posteo al medirlo: una lectura tardía no se hace pasar por la de 24 h. */
    horas: integer("horas").notNull(),
    reacciones: integer("reacciones"),
    comentarios: integer("comentarios"),
    compartidos: integer("compartidos"),
    alcance: integer("alcance"),
    vistas: integer("vistas"),
    guardados: integer("guardados"),
    nota: text("nota"),
    medidoAt: timestamp("medido_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    piezaMomento: uniqueIndex("pieza_metricas_pieza_momento_idx").on(t.deliverableId, t.momento),
    cliente: index("pieza_metricas_cliente_idx").on(t.clientId),
  }),
);
