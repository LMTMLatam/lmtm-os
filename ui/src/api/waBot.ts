import { api } from "./client";

export type WaStatus = "disconnected" | "connecting" | "connected";

export interface WaBotStatus {
  status: WaStatus;
  connectedPhone: string | null;
  qr: string | null; // PNG data URL while connecting
  openwaAvailable: boolean;
}

export interface WaPublicHealth {
  lmtmOs: { ok: boolean; ts: string };
  openwa: { configured: boolean; url: string | null; reachable: boolean; error: string | null };
  bot: { status: string; connectedPhone: string | null; autoStartAttempts: number; lastAutoStartError: string | null };
}

export interface WaGroup {
  groupJid: string;
  groupName: string | null;
  clientId?: string | null;
  hasMessages?: boolean;
  participants?: number | null;
}

export interface WaGroupConfig {
  groupJid: string;
  groupName: string | null;
  enabled: boolean;
  inactivityMinutes: number;
  minMessages: number;
  deliveryMode: string;
  deliveryTarget: string | null;
  summaryTone: string;
  clientId: string | null;
}

export interface WaClientGroup {
  groupJid: string;
  groupName: string | null;
  enabled: boolean;
  summaries: Array<{
    id: string;
    summaryDate: string;
    content: string;
    messageCount: number;
    createdAt: string;
  }>;
}

export interface WaSummary {
  id: string;
  groupJid: string;
  groupName: string | null;
  summaryDate: string;
  content: string;
  messageCount: number;
  sentAt: string | null;
  createdAt: string;
}

export const waBotApi = {
  status: () => api.get<WaBotStatus>("/wa-bot/status"),
  health: () => api.get<WaPublicHealth>("/wa-bot/public-health"),
  start: () => api.post<{ ok?: boolean; error?: string }>("/wa-bot/start", null),
  stop: () => api.post<{ ok: boolean }>("/wa-bot/stop", null),
  groups: () => api.get<WaGroup[]>("/wa-bot/groups"),
  groupConfigs: () => api.get<WaGroupConfig[]>("/wa-bot/groups/configs"),
  groupSummaries: (jid: string) => api.get<WaSummary[]>(`/wa-bot/groups/${encodeURIComponent(jid)}/summaries`),
  setGroupConfig: (jid: string, body: Partial<WaGroupConfig>) =>
    api.put<WaGroupConfig>(`/wa-bot/groups/${encodeURIComponent(jid)}/config`, body),
  runSummaryNow: () => api.post<{ ok: boolean }>("/wa-bot/summary/run", null),
  clientGroups: (clientId: string) =>
    api.get<{ groups: WaClientGroup[] }>(`/wa-bot/clients/${clientId}/groups`),
};
