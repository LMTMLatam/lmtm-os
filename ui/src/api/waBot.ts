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

export const waBotApi = {
  status: () => api.get<WaBotStatus>("/wa-bot/status"),
  health: () => api.get<WaPublicHealth>("/wa-bot/public-health"),
  start: () => api.post<{ ok?: boolean; error?: string }>("/wa-bot/start", null),
  stop: () => api.post<{ ok: boolean }>("/wa-bot/stop", null),
};
