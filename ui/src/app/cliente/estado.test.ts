import { describe, expect, it } from "vitest";
import { diasDeSaldo, recursosDe } from "./estado";

const ads = (remaining: number | null, spend: number, days: number) =>
  ({
    accountHealth: remaining == null ? null : { status: 1, statusLabel: "activa", remaining, currency: "ARS", checkedAt: "2026-11-20" },
    insights: { since: "2026-10-21", byPlatform: { meta: { platform: "meta", impressions: 0, clicks: 0, spend, leads: 0, days, ctr: 0, cpc: 0 } } },
  }) as never;

describe("días de saldo", () => {
  it("divide el saldo por el gasto diario de Meta", () => {
    expect(diasDeSaldo(ads(120_000, 300_000, 30))).toBe(12);
  });
  it("sin saldo, sin gasto o sin días no inventa un número", () => {
    expect(diasDeSaldo(ads(null, 300_000, 30))).toBeNull();
    expect(diasDeSaldo(ads(120_000, 0, 30))).toBeNull();
    expect(diasDeSaldo(ads(120_000, 300_000, 0))).toBeNull();
    expect(diasDeSaldo(undefined)).toBeNull();
  });
});

describe("recursos del cliente", () => {
  it("lo no configurado queda sin link, no desaparece", () => {
    const r = recursosDe({ clickupFolderId: "f1", sheetsSpreadsheetId: null, websiteUrl: null, metadata: { redesScriptId: "s1" } } as never);
    expect(r.find((x) => x.nombre === "ClickUp")?.url).toContain("/v/f/f1");
    expect(r.find((x) => x.nombre === "Script de redes")?.url).toContain("/d/s1/edit");
    expect(r.find((x) => x.nombre === "Sheet de redes")?.url).toBeNull();
    expect(r).toHaveLength(5);
  });
});
