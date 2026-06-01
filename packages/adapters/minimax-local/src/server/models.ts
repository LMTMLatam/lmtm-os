// LMTM-OS: minimax_local model discovery.

import type { AdapterModel } from "@paperclipai/adapter-utils";
import { models as staticModels } from "../index.js";

export const DEFAULT_MODEL = "MiniMax-M3";

const DEFAULT_BASE_URL = "https://api.minimaxi.chat/v1";

export function resolveBaseUrl(override?: string | null): string {
  if (override && override.trim().length > 0) return override.trim().replace(/\/$/, "");
  const envUrl = process.env.MINIMAX_BASE_URL;
  if (envUrl && envUrl.trim().length > 0) return envUrl.trim().replace(/\/$/, "");
  return DEFAULT_BASE_URL;
}

export function resolveApiKey(override?: string | null): string {
  if (override && override.trim().length > 0) return override.trim();
  return process.env.MINIMAX_API_KEY ?? "";
}

export function resolveModel(override?: string | null): string {
  if (override && override.trim().length > 0) return override.trim();
  const envModel = process.env.MINIMAX_MODEL;
  if (envModel && envModel.trim().length > 0) return envModel.trim();
  return DEFAULT_MODEL;
}

export async function listMinimaxModels(): Promise<AdapterModel[]> {
  const apiKey = resolveApiKey();
  const baseUrl = resolveBaseUrl();
  if (!apiKey) return staticModels;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    const response = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!response.ok) return staticModels;
    const data = (await response.json()) as { data?: Array<{ id: string }> };
    const discovered = (data.data ?? [])
      .map((m) => m.id)
      .filter((id) => typeof id === "string" && id.length > 0);
    if (discovered.length === 0) return staticModels;
    // Prefer discovered list when available, but always include our defaults
    // so a user-created agent with model "MiniMax-M3" still resolves
    // even if MiniMax's /models endpoint is stale.
    const known = new Set(discovered);
    const merged = [
      ...discovered.map((id) => ({ id, label: id })),
      ...staticModels.filter((m) => !known.has(m.id)),
    ];
    return merged;
  } catch {
    return staticModels;
  }
}
