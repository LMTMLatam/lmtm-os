// Casos reales del 05/10/2026: cada uno es una forma en que el panel ya mintió.
import { describe, expect, it } from "vitest";
import { errorCorto, estadoFuente, type Corrida, type HechosFuente } from "../salud.js";

describe("errorCorto", () => {
  it("rescata el motivo y el código del JSON de Meta y Google", () => {
    expect(errorCorto('Graph pagination /act_1/insights → 400: {"error":{"message":"Service temporarily unavailable","type":"OAuthException"}}'))
      .toBe("400: Service temporarily unavailable");
    expect(errorCorto('Google Ads /customers/1/googleAds:searchStream → 403: [{ "error": { "code": 403, "message": "The caller does not have permission" } }]'))
      .toBe("403: The caller does not have permission");
    expect(errorCorto("DB: algo raro")).toBe("DB: algo raro");
    expect(errorCorto(null)).toBeNull();
  });
});

const AHORA = new Date("2026-10-05T15:00:00Z");
const ok = (at: string): Corrida => ({ ok: true, at, error: null });
const falla = (at: string, error = "Graph pagination /act_1/insights → 400: Service temporarily unavailable"): Corrida =>
  ({ ok: false, at, error });

function hechos(p: Partial<HechosFuente>): HechosFuente {
  return { fuente: "meta_ads", conectada: true, cuentas: [], ultimoDato: null, ...p };
}

describe("estadoFuente: pauta", () => {
  it("sin cuenta conectada no es una falla ni un cero: es sin_conexion", () => {
    const r = estadoFuente(hechos({ conectada: false }), AHORA);
    expect(r.estado).toBe("sin_conexion");
    expect(r.ultimoDato).toBeNull();
  });

  it("HANSHI: falla las últimas noches, la corrida buena tampoco trajo datos → fallando, con el último dato a la vista", () => {
    const r = estadoFuente(hechos({
      ultimoDato: "2026-06-15",
      cuentas: [{ cuenta: "act_794667221613355", corridas: [
        falla("2026-10-05T02:50:00Z"), falla("2026-10-04T02:50:00Z"), ok("2026-09-24T02:50:00Z"), falla("2026-09-23T02:50:00Z"),
      ] }],
    }), AHORA);
    expect(r.estado).toBe("fallando");
    expect(r.fallasSeguidas).toBe(2);
    expect(r.fallandoDesde).toBe("2026-10-04T02:50:00Z");
    expect(r.ultimaCorridaOk).toBe("2026-09-24T02:50:00Z");
    expect(r.detalle).toContain("Último dato: 15/06");
  });

  it("Google con 403 desde siempre → fallando con el error, y sin inventar un último dato", () => {
    const corridas = Array.from({ length: 30 }, (_, i) =>
      falla(new Date(Date.parse("2026-10-05T02:26:00Z") - i * 86400_000).toISOString(),
        'Google Ads /customers/8418979554/googleAds:searchStream → 403: [{ "error": { "code": 403, "status": "PERMISSION_DENIED" } }]'));
    const r = estadoFuente(hechos({ fuente: "google_ads", cuentas: [{ cuenta: "act_8418979554", corridas }] }), AHORA);
    expect(r.estado).toBe("fallando");
    expect(r.fallasSeguidas).toBe(30);
    expect(r.ultimoError).toContain("403");
    expect(r.ultimoDato).toBeNull();
    expect(r.ultimaCorridaOk).toBeNull();
  });

  it("Distrillantas al día → ok", () => {
    const r = estadoFuente(hechos({ ultimoDato: "2026-10-04", cuentas: [{ cuenta: "act_1", corridas: [ok("2026-10-05T02:53:00Z")] }] }), AHORA);
    expect(r.estado).toBe("ok");
  });

  it("DOMINGO BISIO: el sync anda pero no hay entrega hace 51 días → sin_entrega, no fallando", () => {
    const r = estadoFuente(hechos({ ultimoDato: "2026-08-15", cuentas: [{ cuenta: "act_2", corridas: [ok("2026-10-05T02:40:00Z")] }] }), AHORA);
    expect(r.estado).toBe("sin_entrega");
    expect(r.detalle).toContain("15/08");
  });

  it("nada falla pero el sync no termina bien hace más de 36 h → atrasada", () => {
    const r = estadoFuente(hechos({ ultimoDato: "2026-10-01", cuentas: [{ cuenta: "act_3", corridas: [ok("2026-10-02T02:40:00Z")] }] }), AHORA);
    expect(r.estado).toBe("atrasada");
  });

  it("dos cuentas, una sana y otra fallando → fallando (manda la peor)", () => {
    const r = estadoFuente(hechos({
      ultimoDato: "2026-10-04",
      cuentas: [
        { cuenta: "act_a", corridas: [ok("2026-10-05T02:40:00Z")] },
        { cuenta: "act_b", corridas: [falla("2026-10-05T02:41:00Z"), falla("2026-10-04T02:41:00Z"), falla("2026-10-03T02:41:00Z")] },
      ],
    }), AHORA);
    expect(r.estado).toBe("fallando");
    expect(r.fallasSeguidas).toBe(3);
  });
});

describe("estadoFuente: orgánico", () => {
  const conPagina = (p: Partial<HechosFuente>) => hechos({ fuente: "organico", cuentas: [{ cuenta: "act_1", corridas: [ok("2026-10-05T02:40:00Z")] }], ...p });

  it("sin página asociada → sin_conexion", () => {
    expect(estadoFuente(hechos({ fuente: "organico", conectada: false }), AHORA).estado).toBe("sin_conexion");
  });

  it("las métricas no se refrescan hace días → atrasada (aunque el log diga ok)", () => {
    const r = estadoFuente(conPagina({ ultimoDato: "2026-10-03", ultimoRefresco: "2026-09-28T02:40:00Z" }), AHORA);
    expect(r.estado).toBe("atrasada");
  });

  it("métricas al día pero la página no publica hace más de un mes → sin_entrega", () => {
    const r = estadoFuente(conPagina({ ultimoDato: "2026-08-20", ultimoRefresco: "2026-10-05T02:40:00Z" }), AHORA);
    expect(r.estado).toBe("sin_entrega");
  });

  it("página sin publicaciones sincronizadas → sin_entrega, no atrasada", () => {
    const r = estadoFuente(conPagina({ ultimoDato: null, ultimoRefresco: null }), AHORA);
    expect(r.estado).toBe("sin_entrega");
  });

  it("al día → ok", () => {
    const r = estadoFuente(conPagina({ ultimoDato: "2026-10-04", ultimoRefresco: "2026-10-05T02:40:00Z" }), AHORA);
    expect(r.estado).toBe("ok");
  });
});
