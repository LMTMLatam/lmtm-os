// LMTM-OS: competitor library + generated content ideas. See migration
// 0108_competitors_content.sql.

import { pgTable, uuid, text, jsonb, timestamp, index, integer } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { clients } from "./clients.js";

// ── Competitors: manually-curated per client ──────────────────────────────────
export const competitors = pgTable(
  "competitors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    fbPageUrl: text("fb_page_url"),
    igHandle: text("ig_handle"),
    website: text("website"),
    notes: text("notes"),
    // Pasted ad copies / links the team observed from this competitor.
    sampleAds: jsonb("sample_ads").$type<Array<{ text?: string; url?: string }>>().notNull().default([]),
    // Lo que contestó Instagram al medirlo (competencia-ig.ts): "ok", "no_encontrada", "no_es_empresa" o el error.
    igEstado: text("ig_estado"),
    igSeguidores: integer("ig_seguidores"),
    igRevisadoAt: timestamp("ig_revisado_at", { withTimezone: true }),
    /** Lectura de su Facebook con ScrapeCreators (migración 0157). */
    fbEstado: text("fb_estado"),
    fbRevisadoAt: timestamp("fb_revisado_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ clientIdx: index("competitors_client_idx").on(t.clientId) }),
);
export type Competitor = typeof competitors.$inferSelect;
export type NewCompetitor = typeof competitors.$inferInsert;

// Publicaciones públicas de la competencia en Instagram (migración 0155). Por
// usuario, no por fila de competidor: dos clientes pueden compartirlo.
export const competenciaPosts = pgTable(
  "competencia_posts",
  {
    id: text("id").primaryKey(),
    usuario: text("usuario").notNull(),
    texto: text("texto"),
    formato: text("formato"),
    /** null = la cuenta oculta los me gusta: no se mide. */
    meGusta: integer("me_gusta"),
    comentarios: integer("comentarios"),
    publicadoAt: timestamp("publicado_at", { withTimezone: true }).notNull(),
    permalink: text("permalink"),
    angulo: text("angulo"),
    anguloAt: timestamp("angulo_at", { withTimezone: true }),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ usuarioIdx: index("competencia_posts_usuario_idx").on(t.usuario, t.publicadoAt) }),
);

// ── Content ideas: AI-generated, split pauta (paid) vs posteo (organic) ───────
export const contentIdeas = pgTable(
  "content_ideas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // pauta | posteo
    format: text("format"),
    title: text("title").notNull(),
    copy: text("copy"),
    rationale: text("rationale"),
    source: text("source"),
    batchId: uuid("batch_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ clientIdx: index("content_ideas_client_idx").on(t.clientId, t.kind) }),
);
export type ContentIdea = typeof contentIdeas.$inferSelect;
export type NewContentIdea = typeof contentIdeas.$inferInsert;
