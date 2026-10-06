// El ciclo diario tiene que traer TODAS las partes de cada cuenta. Ya pasó dos
// veces que una quedó solo en el botón manual y se congeló sin que nadie lo
// viera: creativos (11/8) y conjuntos (06/10, estado y presupuesto de agosto).
import { describe, expect, it, vi } from "vitest";

const llamadas: string[] = [];
vi.mock("../services/ads/aggregator.js", () => {
  const parte = (nombre: string) => vi.fn(async () => {
    llamadas.push(nombre);
    return 1;
  });
  return {
    adsAggregator: {
      syncCampaigns: parte("campaigns"),
      syncAdsets: parte("adsets"),
      syncCreatives: parte("creatives"),
      syncInsights: parte("insights"),
      syncAudience: parte("audience"),
      syncOrganic: parte("organic"),
    },
  };
});

const { runAllAdsSync } = await import("../services/ads-autosync.js");

describe("sync diario de pauta", () => {
  it("trae campañas, conjuntos, creativos e insights de cada cuenta", async () => {
    vi.useFakeTimers();
    const db = {
      select: () => ({ from: async () => [{ id: "m1", connectionId: "c1", companyId: "e", clientId: "x", platform: "meta", adAccountId: "act_1" }] }),
      insert: () => ({ values: async () => undefined }),
      update: () => ({ set: () => ({ where: async () => undefined }) }),
    };
    const corrida = runAllAdsSync(db as never);
    await vi.runAllTimersAsync();
    const r = await corrida;
    vi.useRealTimers();
    expect(r.ok).toBe(1);
    for (const p of ["campaigns", "adsets", "creatives", "insights"]) expect(llamadas).toContain(p);
  });
});
