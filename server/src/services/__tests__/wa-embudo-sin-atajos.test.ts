// El guard del embudo.
//
// POR QUÉ ES UN TEST Y NO UN CHEQUEO EN RUNTIME
// La red de seguridad natural sería desviar dentro del transporte, pero el
// transporte no recibe `db` y el embudo lo necesita para registrar. Así que la
// invariante se sostiene acá: si un módulo quiere el destino del equipo, tiene
// que pasar por `avisarAlEquipo`.
//
// Sin esto el problema vuelve solo: el próximo módulo que necesite avisar algo
// copia el patrón del vecino —`sendWhatsAppToNumber(alertsNumber(), texto)`— y
// se saltea el nivel, el tope, el dedupe y el registro. Fue exactamente así que
// llegamos a 14 emisores sueltos.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

/**
 * Los únicos archivos que pueden nombrar el destino del equipo.
 *
 * Para agregar uno acá hace falta una razón que no sea "es más corto": el
 * embudo acepta nivel 5, que interrumpe siempre y sin tope, así que no existe
 * el caso "es tan urgente que no puede esperar al embudo".
 */
const PERMITIDOS = new Set([
  "services/agency-ops.ts", // define alertsNumber y el transporte
  "services/wa-embudo.ts", // el embudo: el único que manda al equipo
]);

async function archivosTs(dir: string, acc: string[] = []): Promise<string[]> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "dist" || e.name === "__tests__") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) await archivosTs(p, acc);
    else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) acc.push(p);
  }
  return acc;
}

describe("nadie se saltea el embudo", () => {
  it("sólo el embudo y agency-ops nombran el destino del equipo", async () => {
    const archivos = await archivosTs(RAIZ);
    expect(archivos.length).toBeGreaterThan(50); // el scan encontró el árbol

    const infractores: string[] = [];
    for (const abs of archivos) {
      const rel = abs.slice(RAIZ.length).replace(/\\/g, "/");
      if (PERMITIDOS.has(rel)) continue;
      const src = await readFile(abs, "utf8");
      // `alertsNumber()` es el destino del equipo; `LMTM_ALERTS_WHATSAPP` y
      // `LMTM_TEAM_WA_GROUP` son las dos formas de leerlo sorteando la función.
      if (/\balertsNumber\b|LMTM_ALERTS_WHATSAPP|LMTM_TEAM_WA_GROUP/.test(src)) infractores.push(rel);
    }

    expect(
      infractores,
      `Estos módulos le hablan al equipo sin pasar por el embudo (usá avisarAlEquipo de wa-embudo.ts; ` +
        `nivel 5 interrumpe siempre y sin tope, así que no hay caso urgente que lo justifique):\n` +
        infractores.map((f) => `  · ${f}`).join("\n"),
    ).toEqual([]);
  });
});
