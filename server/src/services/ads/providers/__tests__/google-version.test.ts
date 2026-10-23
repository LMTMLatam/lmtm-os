// 21/10/26: Google dejó de aceptar la v22 de la API de Google Ads (400
// UNSUPPORTED_VERSION en todas las cuentas) y el sync de Google quedó congelado.
// Al pasar a v26 hubo que cambiar los únicos campos que se habían ido en el
// medio: v23 sacó campaign.start_date / end_date.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dia } from "../google.js";

describe("Google Ads: fechas de campaña desde v23", () => {
  it("start_date_time / end_date_time se guardan como el día, igual que antes", () => {
    expect(dia("2026-10-01 00:00:00")?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(dia("2037-12-30 23:59:59")?.toISOString()).toBe("2037-12-30T00:00:00.000Z");
    expect(dia("2026-10-01")?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(dia(undefined)).toBeUndefined();
    expect(dia("")).toBeUndefined();
  });

  it("ninguna consulta pide los campos de fecha que v23 sacó", () => {
    const servicios = join(__dirname, "..", "..", "..");
    const archivos = [
      join(servicios, "ads", "providers", "google.ts"),
      ...readdirSync(servicios).filter((f) => /^(ads-|balance-monitor).*\.ts$/.test(f)).map((f) => join(servicios, f)),
    ];
    for (const f of archivos) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/campaign\.(start|end)_date\b(?!_time)/);
    }
  });
});
