import { index, jsonb, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Panel Licitaciones (pedido 2026-07-22): oportunidades de Mercado Público
// (ChileCompra) que le sirven a la agencia. El sync diario trae las activas,
// filtra por keywords de marketing y guarda candidatas; un agente las cura a
// diario (util con "por qué nos sirve" / descartada). estado:
// candidata → util | descartada; vencida cuando pasó la fecha de cierre.
export const licitaciones = pgTable("licitaciones", {
  id: uuid("id").primaryKey().defaultRandom(),
  codigo: text("codigo").notNull().unique(), // CodigoExterno de Mercado Público
  nombre: text("nombre").notNull(),
  descripcion: text("descripcion"),
  organismo: text("organismo"),
  region: text("region"),
  moneda: text("moneda"),
  montoEstimado: numeric("monto_estimado"),
  fechaPublicacion: timestamp("fecha_publicacion", { withTimezone: true }),
  fechaCierre: timestamp("fecha_cierre", { withTimezone: true }),
  url: text("url"),
  estado: text("estado").notNull().default("candidata"),
  /** Por qué nos sirve (lo escribe el agente curador) o qué keywords matchearon. */
  relevancia: text("relevancia"),
  raw: jsonb("raw"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  estadoIdx: index("licitaciones_estado_idx").on(t.estado),
  cierreIdx: index("licitaciones_fecha_cierre_idx").on(t.fechaCierre),
}));
