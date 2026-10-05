// LMTM-OS: minimax_local model discovery.

import type { AdapterModel } from "@paperclipai/adapter-utils";
import { models as staticModels } from "../index.js";

export const DEFAULT_MODEL = "MiniMax-M2";

/**
 * A qué modelo caer cuando el preferido está sobrecargado.
 *
 * Sólo los PREVIEW tienen respaldo, y es a propósito: un preview es capacidad
 * compartida y limitada —el 5/10/26 devolvió un 529 en medio de un banco de
 * prueba— mientras que un modelo estable que devuelve 529 tiene un problema que
 * conviene ver, no tapar. Caer de un estable a otro escondería una caída real
 * de MiniMax detrás de una respuesta peor.
 */
export const MODELO_DE_RESPALDO: Readonly<Record<string, string>> = {
  "MiniMax-M3.1-Flash-Preview": "MiniMax-M3",
};

/**
 * ¿Esto es "estoy saturado, probá de nuevo" y no "lo que pediste está mal"?
 *
 * Distinguirlo importa: ante una sobrecarga reintentar con otro modelo es lo
 * correcto, y ante un 400 o un modelo inexistente reintentar es gastar dos veces
 * para fallar igual — y peor, enmascarar el error de configuración.
 */
export function esSobrecarga(status: number, upstreamStatusCode?: number): boolean {
  if (status === 429 || status === 502 || status === 503 || status === 529) return true;
  // 1002 = rate limit, 1027 = servicio saturado, en los codigos propios de MiniMax.
  return upstreamStatusCode === 1002 || upstreamStatusCode === 1027;
}

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
