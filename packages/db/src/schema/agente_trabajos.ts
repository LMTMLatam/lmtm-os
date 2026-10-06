import { pgTable, uuid, text, timestamp, jsonb, integer, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { clients } from "./clients.js";

/**
 * Un trabajo del runner propio de agentes: un rol, un cliente (o la cartera),
 * por qué se despertó, cada paso que dio y lo que encontró.
 *
 * Reemplaza issues + heartbeats + wakeups de paperclip. La interfaz lee de acá
 * lo que hizo cada agente; el resultado separa lo verificado de lo supuesto.
 */
export const agenteTrabajos = pgTable(
  "agente_trabajos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Nombre del archivo de rol: "media-buyer", "estratega", … */
    rol: text("rol").notNull(),
    /** null = trabajo de cartera (no de un cliente). */
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
    /** decision | horario | pedido */
    motivo: text("motivo").notNull(),
    /** Qué hecho lo despertó ("decision:<id>"): el mismo hecho no se trabaja dos veces. */
    ref: text("ref"),
    entrada: jsonb("entrada").$type<Record<string, unknown>>().notNull().default({}),
    /** pendiente | corriendo | hecho | fallo | cancelado */
    estado: text("estado").notNull().default("pendiente"),
    /** { resumen, verificado[], supuestos[], ... } */
    resultado: jsonb("resultado").$type<Record<string, unknown> | null>(),
    /** Cada herramienta usada: qué pidió, qué volvió (recortado), cuánto tardó. */
    pasos: jsonb("pasos").$type<Array<Record<string, unknown>>>().notNull().default([]),
    error: text("error"),
    turnos: integer("turnos"),
    tokensEntrada: integer("tokens_entrada"),
    tokensSalida: integer("tokens_salida"),
    intentos: integer("intentos").notNull().default(0),
    /** regla:<x> | horario:<rol> | tablero:<userId> | conector */
    pedidoPor: text("pedido_por").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => ({
    refUq: uniqueIndex("agente_trabajos_ref_uq")
      .on(t.rol, t.ref)
      .where(sql`ref IS NOT NULL AND estado IN ('pendiente', 'corriendo', 'hecho')`),
    colaIdx: index("agente_trabajos_cola_idx").on(t.estado, t.createdAt),
    clienteIdx: index("agente_trabajos_cliente_idx").on(t.clientId, t.createdAt),
  }),
);
