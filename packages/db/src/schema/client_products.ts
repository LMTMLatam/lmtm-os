import { pgTable, uuid, text, jsonb, timestamp, index, integer, boolean } from "drizzle-orm/pg-core";
import { clients } from "./clients.js";

// LMTM-OS: catálogo de productos por cliente (migración 0127).
//
// El equipo carga acá nombre + foto de cada producto. Los agentes lo usan como
// referencia al generar placas, carruseles y videos — sin esto el modelo
// inventa el producto y sale contenido que no es del cliente.
export const clientProducts = pgTable("client_products", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  /** Link directo a la imagen (vive en Drive: super redes/<cliente>/PRODUCTOS). */
  imageUrl: text("image_url"),
  driveFileId: text("drive_file_id"),
  position: integer("position").notNull().default(0),
  active: boolean("active").notNull().default(true),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  clientIdx: index("client_products_client_idx").on(t.clientId, t.position),
}));
