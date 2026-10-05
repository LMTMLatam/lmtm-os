import { pgTable, uuid, text, timestamp, integer, index } from "drizzle-orm/pg-core";

/**
 * Registro de TODO lo que el sistema quiso mandarle al equipo por WhatsApp,
 * se haya mandado o no.
 *
 * El problema que resuelve: 14 módulos llamaban al transporte directo, sin
 * nivel, sin tope y sin registro. Nadie podía medir cuánto manda el sistema, y
 * una caída real entraba en el mismo chorro que un aviso rutinario — Distrillantas
 * se desconectó entero y nadie se enteró.
 *
 * `motivo` dice por qué algo no se mandó (dedupe, tope, nivel 1). `origen`
 * permite ver a la semana qué módulo genera el volumen y apagarlo con dato en
 * la mano en vez de a ojo.
 */
export const waOutbox = pgTable(
  "wa_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    destino: text("destino").notNull(),
    /** 1 = no se manda nunca · 2-3 = digest · 4 = interrumpe con tope · 5 = interrumpe siempre. */
    nivel: integer("nivel").notNull().default(3),
    /** Módulo que lo originó: "vigilantes", "auditor", "publication-monitor", … */
    origen: text("origen").notNull(),
    /** Clave de dedupe: el mismo hecho no se avisa dos veces en 24h. */
    clave: text("clave").notNull(),
    clientId: uuid("client_id"),
    texto: text("texto").notNull(),
    /** pendiente | enviado | agrupado | descartado | error */
    estado: text("estado").notNull().default("pendiente"),
    motivo: text("motivo"),
    enviadoAt: timestamp("enviado_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    estadoIdx: index("wa_outbox_estado_idx").on(t.estado, t.createdAt),
    claveIdx: index("wa_outbox_clave_idx").on(t.clave, t.createdAt),
    origenIdx: index("wa_outbox_origen_idx").on(t.origen, t.createdAt),
  }),
);
