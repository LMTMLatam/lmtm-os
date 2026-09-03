// LMTM-OS: identidad de marca por cliente (migración 0129).
//
// Una fila por cliente con todo lo que define cómo se ve y cómo habla: paleta,
// tipografías, tono, qué palabras usa y cuáles evita, la promesa, a quién le
// habla y el logo. Antes esto vivía en tres lugares distintos (avatar en
// clients, voz de marca en client_memory, colores en ningún lado), así que los
// agentes que generan contenido no tenían de dónde sacarlo y las piezas salían
// genéricas.

import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { clients } from "./clients.js";

export const clientBrand = pgTable("client_brand", {
  clientId: uuid("client_id").primaryKey().references(() => clients.id, { onDelete: "cascade" }),
  /** El logo de la marca. Distinto del avatar: el avatar es la imagen de
   *  referencia con la que se generan las piezas. */
  logoUrl: text("logo_url"),
  /** Paleta en hex, en orden de importancia — el primero es el principal. */
  colores: jsonb("colores").$type<string[]>().notNull().default([]),
  tipografias: jsonb("tipografias").$type<string[]>().notNull().default([]),
  tono: text("tono"),
  palabrasSi: jsonb("palabras_si").$type<string[]>().notNull().default([]),
  palabrasNo: jsonb("palabras_no").$type<string[]>().notNull().default([]),
  mensaje: text("mensaje"),
  publico: text("publico"),
  diferencial: text("diferencial"),
  notas: text("notas"),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
