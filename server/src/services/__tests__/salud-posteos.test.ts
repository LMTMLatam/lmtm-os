import { describe, expect, it } from "vitest";
import { armarMensajes, conexionesEnRiesgo, corridasAMano, explicarFalla, fallasRecientes, FALLA_EN_COMENTARIO, type Hallazgo } from "../salud-posteos.js";
import { decidirAviso } from "../../avisos/politica.js";

const AHORA = new Date("2026-10-15T01:00:00Z");

describe("conexiones de Make", () => {
  const usos = [{ id: 1, name: "Reno" }, { id: 2, name: "SERRAT" }, { id: 9, name: "Plantilla apagada" }];
  it("por vencer con escenarios activos: avisa; grave en los últimos 3 días o vencida", () => {
    const [h] = conexionesEnRiesgo([{ id: 2558417, name: "LMTM", accountName: "facebook", expire: "2026-10-25T20:08:33Z", scenarioUsages: usos }], new Set([1, 2]), AHORA);
    expect(h.tipo).toBe("conexion_por_vencer");
    expect(h.grave).toBe(false);
    expect(h.que).toContain("la usan 2 escenarios activos");
    expect(conexionesEnRiesgo([{ id: 2558417, name: "LMTM", accountName: "facebook", expire: "2026-10-17T00:00:00Z", scenarioUsages: usos }], new Set([1]), AHORA)[0].grave).toBe(true);
  });
  it("no verifica: se avisa (no grave hasta que tumbe un escenario)", () => {
    expect(conexionesEnRiesgo([{ id: 2564327, name: "Tester - LinkedIn connection", accountName: "linkedin2", expire: "2026-04-05T15:25:33Z", scenarioUsages: usos, verificada: false }], new Set([1]), AHORA)[0])
      .toMatchObject({ tipo: "conexion_caida", grave: false });
  });
  it("vencida según Make pero verifica (Pinterest Tester, 15/10): no se acusa; ni la que usan solo escenarios apagados", () => {
    expect(conexionesEnRiesgo([{ id: 2647824, name: "Tester - pinterest connection", accountName: "pinterest2", expire: "2026-04-10T10:43:51Z", scenarioUsages: usos, verificada: true }], new Set([1]), AHORA)).toEqual([]);
    expect(conexionesEnRiesgo([{ id: 2577923, name: "Test - Fluence", accountName: "facebook", expire: "2026-06-05T17:32:05Z", scenarioUsages: [{ id: 9, name: "x" }], verificada: false }], new Set([1]), AHORA)).toEqual([]);
  });
  it("lejos del vencimiento: nada", () => {
    expect(conexionesEnRiesgo([{ id: 1, name: "LMTM", accountName: "linkedin2", expire: "2027-10-09T01:47:53Z", scenarioUsages: usos }], new Set([1]), AHORA)).toEqual([]);
  });
});

describe("posts fallidos", () => {
  it("el motivo de Make en castellano", () => {
    expect(explicarFalla("The image format is not supported. (36001, OAuthException)")).toMatch(/JPG/);
    expect(explicarFalla("[500] Internal error encountered.")).toMatch(/error interno/);
  });
  it("solo las recientes sin resolver son alarma; las viejas se cuentan", () => {
    const f = fallasRecientes([
      { created: "2026-10-13T13:01:52Z", resolved: false, reason: "[500] Internal error encountered." },
      { created: "2026-10-05T11:02:15Z", resolved: false, reason: "[500] Internal error encountered." },
      { created: "2026-09-22T14:00:48Z", resolved: true, reason: "Media ID is not available (9007, OAuthException)" },
    ], AHORA);
    expect(f.recientes).toBe(1);
    expect(f.viejas).toBe(1);
    expect(f.motivos[0].veces).toBe(1);
  });
  it("el error 500 de Instagram no manda a reprocesar ni a pisar el original", () => {
    const t = explicarFalla("[500] Internal error encountered.");
    expect(t).toMatch(/APARTE/);
    expect(t).toMatch(/NO reprocesar ni hacer replay/);
    expect(t).not.toMatch(/subirlo a mano/);
  });
  it("el comentario que deja Make en ClickUp", () => {
    expect(FALLA_EN_COMENTARIO.test("LinkedIn Post was not successfull")).toBe(true);
    expect(FALLA_EN_COMENTARIO.test("Publicado en Instagram")).toBe(false);
  });
});

describe("republicaciones a mano (RENO, 19/10 02:42)", () => {
  const ahora = new Date("2026-10-19T14:00:00Z");
  // Las corridas reales de esa noche, tal como las devuelve /scenarios/5863407/logs.
  const logs = [
    { id: "22ee9b18", timestamp: "2026-10-19T14:00:15Z", type: "auto", operations: 10 }, // post del día: normal
    { id: "cf428492", timestamp: "2026-10-19T05:42:49Z", type: "auto", operations: 11, replayOfExecutionId: "46ac41e6", replayOfExecutionTimestamp: "2026-10-13T13:00:12Z" },
    { id: "8a3c439c", timestamp: "2026-10-19T05:42:48Z", type: "auto", operations: 11, replayOfExecutionId: "d22f00c4", replayOfExecutionTimestamp: "2026-10-05T11:00:27Z" },
    { id: "db7ae5ca", timestamp: "2026-10-19T05:42:48Z", type: "auto", operations: 11, replayOfExecutionId: "653a2209", replayOfExecutionTimestamp: "2026-09-25T18:00:24Z" },
    { id: "2d7b520c", timestamp: "2026-10-19T05:39:08Z", type: "auto", operations: 3 }, // webhook a mano que cortó en el filtro
  ];
  it("los 3 replays que publicaron, y nada más", () => {
    const m = corridasAMano(logs, ahora);
    expect(m.map((x) => x.id).sort()).toEqual(["8a3c439c", "cf428492", "db7ae5ca"]);
    expect(m.every((x) => x.replayDe)).toBe(true);
  });
  it("una corrida manual que cortó en el filtro no publicó: no se avisa", () => {
    expect(corridasAMano([{ id: "x", timestamp: "2026-10-19T05:00:00Z", type: "manual", operations: 2 }], ahora)).toEqual([]);
    expect(corridasAMano([{ id: "y", timestamp: "2026-10-19T05:00:00Z", type: "manual", operations: 9 }], ahora)).toHaveLength(1);
  });
  it("lo de hace más de un día ya se avisó (o ya no es noticia)", () => {
    expect(corridasAMano([{ id: "z", timestamp: "2026-10-17T05:00:00Z", type: "auto", operations: 11, replayOfExecutionId: "a" }], ahora)).toEqual([]);
  });
});

describe("todo lo de publicación va a WhatsApp", () => {
  it("sale aunque ya se haya llegado al tope de interrupciones del día; lo ya dicho no se repite", () => {
    expect(decidirAviso({ origen: "salud-posteos", nivel: 5, yaDicho: false, interrupcionesHoy: 9 })).toEqual({ accion: "enviar" });
    expect(decidirAviso({ origen: "salud-posteos", nivel: 5, yaDicho: true, interrupcionesHoy: 0 }).accion).toBe("descartar");
    // Los demás siguen con el tope.
    expect(decidirAviso({ origen: "incidentes", nivel: 5, yaDicho: false, interrupcionesHoy: 3 }).accion).toBe("digest");
  });
  it("un mensaje para lo que no sale y otro para lo preventivo, de a 8", () => {
    const h = (n: number, grave: boolean): Hallazgo => ({ tipo: "posts_fallidos", clientId: "c", cliente: `C${n}`, grave, que: "x", detalle: "y", clave: `k${n}` });
    const m = armarMensajes([...Array.from({ length: 10 }, (_, i) => h(i, true)), h(99, false)]);
    expect(m.map((x) => x.items.length)).toEqual([8, 2, 1]);
    expect(m[0].texto).toMatch(/esto no está saliendo/);
    expect(m[2].texto).toMatch(/para que no se caiga/);
  });
});
