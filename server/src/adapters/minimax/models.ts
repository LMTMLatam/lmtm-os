import type { AdapterModel } from "../types.js";

export const models: AdapterModel[] = [
  { id: "MiniMax-M2", label: "MiniMax M2" },
  { id: "MiniMax-M2.1", label: "MiniMax M2.1" },
  { id: "MiniMax-M2.1-highspeed", label: "MiniMax M2.1 (highspeed)" },
  { id: "MiniMax-M2.5", label: "MiniMax M2.5" },
  { id: "MiniMax-M2.5-highspeed", label: "MiniMax M2.5 (highspeed)" },
  { id: "MiniMax-M2.7", label: "MiniMax M2.7" },
  { id: "MiniMax-M2.7-highspeed", label: "MiniMax M2.7 (highspeed)" },
];

export const DEFAULT_MODEL = "MiniMax-M2";

export async function listModels(): Promise<AdapterModel[]> {
  const apiKey = process.env.MINIMAX_API_KEY;
  const baseUrl = (process.env.MINIMAX_BASE_URL ?? "https://api.minimaxi.chat/v1").replace(/\/$/, "");
  if (!apiKey) return models;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!response.ok) return models;
    const data = (await response.json()) as { data?: Array<{ id: string }> };
    const discovered = (data.data ?? []).filter((m) => typeof m.id === "string");
    return discovered.length > 0
      ? discovered.map((m) => ({ id: m.id, label: m.id }))
      : models;
  } catch {
    return models;
  }
}
