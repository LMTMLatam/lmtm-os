import { pgTable, uuid, text, jsonb, timestamp, index, bigint, integer, boolean } from "drizzle-orm/pg-core";
import { clients } from "./clients.js";

// LMTM-OS: Baúl de Ganchos — reusable hook vault. client_id null = global
// (niche-level) hook. See migration 0121.
export const hooks = pgTable("hooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
  niche: text("niche"),
  text: text("text").notNull(),
  sourceKind: text("source_kind").notNull().default("manual"), // manual | organico | competidor | tendencia
  sourceRef: text("source_ref"),
  format: text("format"),
  views: bigint("views", { mode: "number" }),
  timesUsed: integer("times_used").notNull().default(0),
  pinned: boolean("pinned").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  clientIdx: index("hooks_client_idx").on(t.clientId),
  nicheIdx: index("hooks_niche_idx").on(t.niche),
}));

// LMTM-OS: Tendencias — daily external news mined by agents, tagged by
// content potential and applicable niches. See migration 0121.
export const trends = pgTable("trends", {
  id: uuid("id").primaryKey().defaultRandom(),
  day: text("day").notNull(), // YYYY-MM-DD
  title: text("title").notNull(),
  url: text("url"),
  source: text("source"),
  tag: text("tag").notNull().default("potencial-de-gancho"), // potencial-de-gancho | explicativo | ignorar
  niches: jsonb("niches").$type<string[]>().notNull().default([]),
  summary: text("summary"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  dayIdx: index("trends_day_idx").on(t.day),
}));

// LMTM-OS: Radar de nicho — informe accionable semanal por rubro producido por
// los agentes (pedido del equipo 2026-07-17): análisis cruzado de los clientes
// del rubro (orgánico + pauta), referentes EXTERNOS tendencia (BsAs/exterior,
// TikTok/Meta) con links, ideas con url de referencia, y plan de acción por
// cliente. Reemplaza el "titular suelto" del panel por dirección concreta.
export const nicheReports = pgTable("niche_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  niche: text("niche").notNull(),
  week: text("week").notNull(), // YYYY-MM-DD (lunes de la semana)
  sections: jsonb("sections").$type<{
    analisisCruzado?: { organico?: string; pauta?: string };
    referentes?: Array<{ nombre: string; cuenta?: string; plataforma?: string; ubicacion?: string; queHacen?: string; urlPerfil?: string; urlEjemplo?: string }>;
    ideas?: Array<{ titulo: string; detalle?: string; url?: string; fuente?: string }>;
    planPorCliente?: Array<{ cliente: string; clientId?: string; movidas: string[] }>;
  }>().notNull().default({}),
  createdByAgentId: uuid("created_by_agent_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  nicheWeekIdx: index("niche_reports_niche_week_idx").on(t.niche, t.week),
}));

// LMTM-OS: Centro de Inteligencia — intervenciones de los vigilantes (pedido
// 2026-07-18): alertas/oportunidades/aprendizajes con nivel de interrupción
// 1-5. Nivel >=4 puede ir a WhatsApp (con tope diario), 3 al brief, <=2 solo
// dashboard. dedupe_key evita re-alertar lo mismo mientras siga abierto.
export const interventions = pgTable("interventions", {
  id: uuid("id").primaryKey().defaultRandom(),
  vigilante: text("vigilante").notNull(), // financiera | contenido | salud-cliente | ...
  kind: text("kind").notNull().default("alerta"), // alerta | oportunidad | aprendizaje | hipotesis | plan | iniciativa
  level: integer("level").notNull().default(2), // 1-5 (nivel de interrupción)
  clientId: uuid("client_id"),
  title: text("title").notNull(),
  body: text("body"),
  dedupeKey: text("dedupe_key").notNull(),
  status: text("status").notNull().default("open"), // open | sent | resolved | dismissed
  evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  statusLevelIdx: index("interventions_status_level_idx").on(t.status, t.level),
}));
