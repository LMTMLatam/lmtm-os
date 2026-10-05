import { pgTable, uuid, text, timestamp, jsonb, date, index, uniqueIndex } from "drizzle-orm/pg-core";
import { clients } from "./clients.js";

/**
 * El informe semanal para un cliente: la narrativa que escribe el estratega,
 * los números de la semana con los que se escribió y lo que dijo el auditor.
 *
 * El agente escribe SIN números (marcadores como {cpl} u {objetivo}); el
 * servidor los completa desde `metricasCliente()` de esa semana y guarda la
 * foto en `numeros`. Así lo que se auditó es exactamente lo que se publica.
 *
 * borrador → observado (el auditor encontró algo) | aprobado → publicado
 * (una persona lo publicó: es lo único que ve el cliente en su link).
 */
export const informesSemanales = pgTable(
  "informes_semanales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    /** Lunes de la semana que cubre (YYYY-MM-DD). */
    semana: date("semana").notNull(),
    /** { resumen, hicimos[], aprendimos[], proximos[], pedidos[] }, con marcadores. */
    narrativa: jsonb("narrativa").$type<Record<string, unknown>>().notNull(),
    /** Los números de la semana (y de la anterior) con los que se completan los marcadores. */
    numeros: jsonb("numeros").$type<Record<string, unknown>>().notNull(),
    /** borrador | observado | aprobado | publicado */
    estado: text("estado").notNull().default("borrador"),
    /** agente:<id> | tablero:<usuario> */
    escritoPor: text("escrito_por").notNull(),
    /** { ok, fallas[], at } */
    auditoria: jsonb("auditoria").$type<Record<string, unknown> | null>(),
    publicadoAt: timestamp("publicado_at", { withTimezone: true }),
    publicadoPor: text("publicado_por"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    clienteSemanaUq: uniqueIndex("informes_semanales_cliente_semana_uq").on(t.clientId, t.semana),
    estadoIdx: index("informes_semanales_estado_idx").on(t.estado, t.semana),
  }),
);
