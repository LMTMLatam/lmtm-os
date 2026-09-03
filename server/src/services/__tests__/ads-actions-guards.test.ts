import type { Db } from "@paperclipai/db";
import { describe, expect, it } from "vitest";
import { MAX_POR_LLAMADA, agregarNegativas } from "../ads-actions.js";

/**
 * DB falsa: devuelve, en orden, los resultados encolados para cada cadena
 * select().from().where().limit(). Alcanza para llegar a los guards, que es lo
 * único que se prueba acá — ninguno de estos casos llega a la red.
 */
function dbConRespuestas(...respuestas: unknown[][]): Db {
  let i = 0;
  const cadena = {
    from: () => cadena,
    where: () => cadena,
    limit: () => Promise.resolve(respuestas[i++] ?? []),
    then: (r: (v: unknown[]) => unknown) => r(respuestas[i++] ?? []),
  };
  return { select: () => cadena } as unknown as Db;
}

const CAMPANA = [{ name: "Distrillantas Brand", connectionId: "conn-1" }];
const CLIENTE = [{ name: "Distrillantas" }];

describe("agregarNegativas — guards que no dependen de la red", () => {
  it("rechaza un lote más grande que el tope, antes de tocar la DB", async () => {
    const terminos = Array.from({ length: MAX_POR_LLAMADA + 1 }, (_, n) => `termino ${n}`);
    const r = await agregarNegativas(dbConRespuestas(), {
      clientId: "c1", campaignId: "camp1", terminos, approved: true,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain(String(MAX_POR_LLAMADA));
  });

  it("rechaza una campaña que no es del cliente", async () => {
    const r = await agregarNegativas(dbConRespuestas([]), {
      clientId: "c1", campaignId: "de-otro-cliente", terminos: ["neumaticos baratos"], approved: true,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("No encontré la campaña");
  });

  // El guard de marca corre ANTES de la firma humana y no lo levanta approved.
  // Es el punto del ejercicio: una aprobación apurada no puede apagar el mejor
  // tráfico de la cuenta.
  it("con approved=true igual se niega a negativizar la marca", async () => {
    const r = await agregarNegativas(dbConRespuestas(CAMPANA, CLIENTE), {
      clientId: "c1", campaignId: "camp1", approved: true,
      terminos: ["distrillantas pilar", "distrillantas beiro"],
    });
    expect(r.ok).toBe(false);
    expect(r.rechazadosPorMarca).toEqual(["distrillantas pilar", "distrillantas beiro"]);
    expect(r.error).toContain("marca");
  });

  it("sin approved ni ensayo pide firma humana y ya avisa qué sacó por marca", async () => {
    const r = await agregarNegativas(dbConRespuestas(CAMPANA, CLIENTE), {
      clientId: "c1", campaignId: "camp1",
      terminos: ["neumaticos baratos", "distrillantas pilar"],
    });
    expect(r.ok).toBe(false);
    expect(r.approvalRequired).toBe(true);
    expect(r.aplicados).toEqual(["neumaticos baratos"]);
    expect(r.rechazadosPorMarca).toEqual(["distrillantas pilar"]);
  });

  it("no acepta una lista vacía", async () => {
    const r = await agregarNegativas(dbConRespuestas(), {
      clientId: "c1", campaignId: "camp1", terminos: ["", "   "], approved: true,
    });
    expect(r.ok).toBe(false);
    expect(r.approvalRequired).toBeUndefined();
  });
});
