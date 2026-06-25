import { pgTable, uuid, text, timestamp, jsonb, index, uniqueIndex, bigint } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";

// LMTM-OS: clients
// A real-world customer of the agency. Independent of platform connections
// (one client may have 0..N connections on Meta, Google, TikTok, LinkedIn).
// Distinct from `companies`, which is the Paperclip tenancy boundary.

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    legalName: text("legal_name"),
    taxId: text("tax_id"),
    status: text("status").notNull().default("active"),
    tier: text("tier").notNull().default("standard"),
    ownerAgentId: uuid("owner_agent_id").references(() => agents.id, { onDelete: "set null" }),
    primaryContactName: text("primary_contact_name"),
    primaryContactEmail: text("primary_contact_email"),
    primaryContactPhone: text("primary_contact_phone"),
    websiteUrl: text("website_url"),
    industry: text("industry"),
    monthlyRetainerCents: bigint("monthly_retainer_cents", { mode: "number" }).notNull().default(0),
    currency: text("currency").notNull().default("ARS"),
    crmExternalId: text("crm_external_id"),
    planillaSource: text("planilla_source"),
    planillaExternalId: text("planilla_external_id"),
    planillaSyncedAt: timestamp("planilla_synced_at", { withTimezone: true }),
    // ClickUp folder + 3 standard lists per client.
    // Populated by the clickup-sync service.
    clickupFolderId: text("clickup_folder_id"),
    clickupListRedesId: text("clickup_list_redes_id"),
    clickupListVideoId: text("clickup_list_video_id"),
    clickupListEnfoqueTecnicoId: text("clickup_list_enfoque_tecnico_id"),
    clickupListsSyncedAt: timestamp("clickup_lists_synced_at", { withTimezone: true }),
    // LMTM-OS: per-client Google Sheets planilla (the planning sheet each
    // client has in Drive). Auto-detected by name from the agency's Drive,
    // but the operator can override.
    sheetsSpreadsheetId: text("sheets_spreadsheet_id"),
    sheetsDetectedAt: timestamp("sheets_detected_at", { withTimezone: true }),
    onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
    offboardedAt: timestamp("offboarded_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    slugUq: uniqueIndex("clients_slug_uq").on(table.slug),
    statusIdx: index("clients_status_idx").on(table.status),
    ownerAgentIdx: index("clients_owner_agent_idx").on(table.ownerAgentId),
    crmExternalIdx: index("clients_crm_external_idx").on(table.crmExternalId),
    planillaIdx: index("clients_planilla_idx").on(table.planillaSource, table.planillaExternalId),
  }),
);

export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
