import { pgTable, uuid, text, timestamp, jsonb, numeric, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { clients } from "./clients.js";

/**
 * Una decisión: algo que alguien tiene que hacer con un cliente, con el número
 * que lo justifica y la plata por día que está en juego.
 *
 * El problema que resuelve: la decisión estaba repartida en cinco módulos
 * (informe ejecutivo, costo de no hacer, plan de acción, cartera, cola humana),
 * cada uno con su lista y su forma de ordenar. Nadie podía abrir UNA pantalla y
 * ver "hacé esto, dale". Acá cada regla escribe en el mismo lugar y con la misma
 * forma, y el ciclo (abierta → aprobada → ejecutada → verificada) obliga a
 * mirar el efecto: "ejecutada" no es el final, el final es que el próximo dato
 * lo confirme.
 *
 * Columnas de PLAN.md más tres que el ciclo necesita:
 *   clave         → el mismo hecho no abre dos decisiones (las reglas corren
 *                   todos los días y sin esto la lista se duplica sola)
 *   ejecutada_at  → desde cuándo mirar "el próximo dato"
 *   updated_at    → para saber qué cambió en la última corrida
 */
export const decisiones = pgTable(
  "decisiones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    /** Familia de la decisión: "saldo:frenada", "pauta:sin_leads", "cadena:sin_destino", … */
    tipo: text("tipo").notNull(),
    /** Qué hacer, en imperativo y desde el lado de quien lo hace. */
    que: text("que").notNull(),
    /** Los números que la justifican: { resumen, datos: [{ etiqueta, valor, unidad }], ventana? }. */
    porque: jsonb("porque").$type<Record<string, unknown>>().notNull().default({}),
    /** ARS por día en juego. null = no se puede medir en plata (no es cero). */
    arsPorDia: numeric("ars_por_dia", { precision: 14, scale: 2 }),
    /** equipo | cliente | agente */
    responsable: text("responsable").notNull(),
    /** abierta | aprobada | ejecutada | verificada | descartada | vencida */
    estado: text("estado").notNull().default("abierta"),
    /** regla:<nombre> | agente:<id> */
    creadaPor: text("creada_por").notNull(),
    /** La acción ejecutable por una ruta con guardas. null = la hace una persona a mano. */
    accion: jsonb("accion").$type<Record<string, unknown> | null>(),
    venceAt: timestamp("vence_at", { withTimezone: true }),
    motivoDescarte: text("motivo_descarte"),
    verificadaAt: timestamp("verificada_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    clave: text("clave").notNull(),
    ejecutadaAt: timestamp("ejecutada_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Una sola decisión VIVA por hecho. Las cerradas no cuentan: si el mismo
    // problema vuelve después de verificado, es una decisión nueva.
    claveViva: uniqueIndex("decisiones_clave_viva_uq")
      .on(t.clave)
      .where(sql`estado in ('abierta','aprobada','ejecutada')`),
    // Hoy lee "lo vivo, ordenado por plata".
    estadoIdx: index("decisiones_estado_idx").on(t.estado, t.arsPorDia),
    clienteIdx: index("decisiones_cliente_idx").on(t.clientId, t.estado),
  }),
);

export type Decision = typeof decisiones.$inferSelect;
export type NuevaDecision = typeof decisiones.$inferInsert;
