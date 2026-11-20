import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { esDecisionHumana } from "../decision-humana.js";

// 20/10: "no quiero que se frenen más anuncios sin autorización humana".
// 26/10: tampoco mover presupuesto solo. La única puerta que ejecuta una acción
// de pauta es aprobarla, y aprobar exige una persona (assertBoard).
// 17/11 (Naza): el departamento de pauta optimiza solo (subir y mover presupuesto)
// pero nunca frena ni apaga. Fuera de una aprobación humana, el ÚNICO que ejecuta
// es pauta-optimiza-sola.ts, y su regla está en su test (20/11: también baja y duplica; nunca pausa ni apaga).
describe("pauta: solo una persona o el optimizador ejecutan", () => {
  it("ejecutarAccionAprobada solo se llama al aprobar o desde el optimizador", () => {
    const src = join(__dirname, "..", "..");
    const llamadas: string[] = [];
    const recorrer = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) { if (f !== "__tests__") recorrer(p); continue; }
        if (!f.endsWith(".ts")) continue;
        if (/ejecutarAccionAprobada\s*\(/.test(readFileSync(p, "utf8"))) llamadas.push(relative(src, p).replace(/\\/g, "/"));
      }
    };
    recorrer(src);
    expect(llamadas.sort()).toEqual(["services/ads-propuestas.ts", "services/approvals.ts", "services/pauta-optimiza-sola.ts"]);
  });
});

describe("lo que decide una persona no lo cierra un agente (26/10)", () => {
  it("reconoce las marcas de los títulos reales", () => {
    expect(esDecisionHumana("[HUMANO] Reactivar/monitorizar bots de health-check")).toBe(true);
    expect(esDecisionHumana("[L2 · OK humano] Compuerta de pieza en el despachador")).toBe(true);
    expect(esDecisionHumana("Pedir OK humano para la pauta de DUNOD")).toBe(true);
    expect(esDecisionHumana("[Pendiente OK PM] Implementar compuerta")).toBe(false); // el PM es un agente
    expect(esDecisionHumana("Arreglar el filtro de fecha del health-check")).toBe(false);
    expect(esDecisionHumana(null)).toBe(false);
  });
});
