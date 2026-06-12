import { pgTable, uuid, text, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";

export const waGroupConfig = pgTable("wa_group_config", {
  groupJid: text("group_jid").primaryKey(),
  groupName: text("group_name"),
  enabled: boolean("enabled").notNull().default(true),
  inactivityMinutes: integer("inactivity_minutes").notNull().default(30),
  minMessages: integer("min_messages").notNull().default(3),
  deliveryMode: text("delivery_mode").notNull().default("group"),
  deliveryTarget: text("delivery_target"),
  summaryTone: text("summary_tone").notNull().default("rio_platense"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const waDailyDigests = pgTable(
  "wa_daily_digests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    digestDate: text("digest_date").notNull(),
    content: text("content").notNull(),
    groupsCount: integer("groups_count").notNull().default(0),
    summariesCount: integer("summaries_count").notNull().default(0),
    sentTo: text("sent_to"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    dateIdx: index("wa_daily_digests_date_uq").on(t.digestDate),
  }),
);
