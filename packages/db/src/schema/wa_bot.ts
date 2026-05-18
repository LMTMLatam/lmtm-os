import { pgTable, uuid, text, timestamp, integer, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";

export const waBotConfig = pgTable("wa_bot_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  status: text("status").notNull().default("disconnected"),
  connectedPhone: text("connected_phone"),
  lastQr: text("last_qr"),
  summaryHour: integer("summary_hour").notNull().default(20),
  summaryDestination: text("summary_destination").notNull().default("group"),
  sessionData: jsonb("session_data"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const waGroupMessages = pgTable(
  "wa_group_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupJid: text("group_jid").notNull(),
    groupName: text("group_name"),
    senderJid: text("sender_jid").notNull(),
    senderName: text("sender_name"),
    body: text("body").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    groupIdx: index("wa_group_messages_group_idx").on(t.groupJid),
    tsIdx: index("wa_group_messages_ts_idx").on(t.timestamp),
  }),
);

export const waGroupSummaries = pgTable(
  "wa_group_summaries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupJid: text("group_jid").notNull(),
    groupName: text("group_name"),
    summaryDate: text("summary_date").notNull(),
    content: text("content").notNull(),
    messageCount: integer("message_count").notNull().default(0),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uq: uniqueIndex("wa_group_summaries_group_date_uq").on(t.groupJid, t.summaryDate),
  }),
);
