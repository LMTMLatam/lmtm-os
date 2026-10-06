import { describe, expect, it } from "vitest";
import type { BalanceInfo } from "../../services/balance-monitor.js";
import { mereceAvisoDeSaldo, motivoFrenada } from "../../services/balance-monitor.js";
import type { SaludFuente } from "../../ingest/salud.js";
import {
  clientesConPautaCiega,
  errorEnCastellano,
  propuestaDeCadena,
  propuestasDeCobertura,
  propuestasDeCola,
  propuestasDeCosto,
  propuestasDeSaldo,
} from "../reglas/existentes.js";

describe("cadena de publicación", () => {
  it("no lleva plata: la cadena es orgánica y no frena la pauta", () => {
    const p = propuestaDeCadena({ clientId: "c1", cliente: "MAERS", eslabon: "despachador_mudo", detalle: "Make no despacha hace 12 días", diasSin: 12 });
    expect(p.arsPorDia).toBeNull();
    expect(p.clave).toBe("cadena:c1:despachador_mudo");
    // El cliente va aparte en todas las pantallas: repetirlo en el "qué" es ruido.
    expect(p.que).not.toContain("MAERS");
    expect(p.accion?.tipo).toBe("tarea");
  });
});

const balance = (o: Partial<BalanceInfo> = {}): BalanceInfo => ({
  account: "act_1",
  platform: "meta",
  clientId: "c1",
  clientName: "DISTRILLANTAS",
  currency: "ARS",
  spendCap: 500_000,
  amountSpent: 499_999.5,
  remaining: 0.5,
  dailySpend: 0,
  daysLeft: null,
  accountStatus: 1,
  low: true,
  gastoConocido: true,
  activaReciente: true,
  ...o,
});

describe("saldo", () => {
  const fns = { motivoFrenada, mereceAvisoDeSaldo };

  it("una cuenta frenada hace días gasta 0 hoy: la plata en juego es la parada, no el gasto reciente", () => {
    const costos = new Map([["c1", { clientId: "c1", arsPorDia: 30_000, gastoDiarioPrevio: 30_000, gastoDiarioActual: 0 }]]);
    const [p] = propuestasDeSaldo([balance()], costos, fns);
    expect(p.tipo).toBe("saldo:frenada");
    expect(p.arsPorDia).toBe(30_000);
    expect(p.responsable).toBe("cliente");
  });

  it("dos cuentas frenadas del mismo cliente no cuentan dos veces su plata parada", () => {
    const costos = new Map([["c1", { clientId: "c1", arsPorDia: 40_000, gastoDiarioPrevio: 40_000, gastoDiarioActual: 0 }]]);
    const ps = propuestasDeSaldo(
      [balance({ account: "act_meta", dailySpend: 500 }), balance({ account: "123", platform: "google", dailySpend: 0 })],
      costos,
      fns,
    );
    expect(ps).toHaveLength(2);
    expect(ps.reduce((s, p) => s + (p.arsPorDia ?? 0), 0)).toBe(40_000);
  });

  it("aunque la segunda cuenta frenada venía gastando, su gasto ya está en la caída del cliente", () => {
    const costos = new Map([["c1", { clientId: "c1", arsPorDia: 40_000, gastoDiarioPrevio: 40_000, gastoDiarioActual: 0 }]]);
    const [a, b] = propuestasDeSaldo(
      [balance({ account: "act_meta", dailySpend: 9_000 }), balance({ account: "123", platform: "google", dailySpend: 6_000 })],
      costos,
      fns,
    );
    expect(a.arsPorDia).toBe(40_000);
    expect(b.arsPorDia).toBeNull();
    // Se muestra lo que gastaba, pero dice por qué no suma.
    expect(b.porque.datos[0].valor).toBe(6_000);
    expect(b.porque.resumen).toContain("ya está contada en su otra cuenta frenada");
  });

  it("deuda en Meta es frenada aunque tenga saldo", () => {
    const [p] = propuestasDeSaldo([balance({ accountStatus: 3, remaining: 200_000, low: false, dailySpend: 12_000 })], new Map(), fns);
    expect(p.tipo).toBe("saldo:frenada");
    expect(p.porque.resumen).toContain("deuda");
  });

  it("por agotarse: cargar antes de que se frene, con el gasto diario en juego", () => {
    const [p] = propuestasDeSaldo([balance({ remaining: 40_000, dailySpend: 10_000, daysLeft: 4, low: true })], new Map(), fns);
    expect(p.tipo).toBe("saldo:bajo");
    expect(p.que).toContain("4 días");
    expect(p.arsPorDia).toBe(10_000);
  });

  it("frenada y por agotarse comparten clave: es la misma cuenta", () => {
    const [a] = propuestasDeSaldo([balance()], new Map(), fns);
    const [b] = propuestasDeSaldo([balance({ remaining: 40_000, dailySpend: 10_000, daysLeft: 4 })], new Map(), fns);
    expect(a.clave).toBe(b.clave);
  });

  it("sin gasto conocido no pide cargar saldo (no se frena lo que no gasta)", () => {
    // 06/10: 18 "cargá saldo antes de que se frene" con gasto null llegaban al link del cliente.
    expect(propuestasDeSaldo([balance({ remaining: 3_290, amountSpent: 496_710, low: true, dailySpend: 0, gastoConocido: false })], new Map(), fns)).toEqual([]);
    expect(propuestasDeSaldo([balance({ remaining: 3_290, amountSpent: 496_710, low: true, dailySpend: 0, gastoConocido: true })], new Map(), fns)).toEqual([]);
  });

  it("una cuenta dormida con saldo bajo no pide nada", () => {
    expect(propuestasDeSaldo([balance({ remaining: 5_000, activaReciente: false })], new Map(), fns)).toEqual([]);
  });
});

describe("costo de no hacer", () => {
  const costos = new Map([
    ["c1", { clientId: "c1", arsPorDia: 20_000, gastoDiarioPrevio: 30_000, gastoDiarioActual: 10_000 }],
    ["c2", { clientId: "c2", arsPorDia: 5_000, gastoDiarioPrevio: 5_000, gastoDiarioActual: 0 }],
  ]);
  const nombres = new Map([["c1", "MA PROPIEDADES"], ["c2", "HANSHI"]]);

  it("una decisión por cliente con su plata parada", () => {
    const ps = propuestasDeCosto(costos, nombres, new Set(), { desde: "2026-10-02", hasta: "2026-10-04" });
    expect(ps.map((p) => p.arsPorDia)).toEqual([20_000, 5_000]);
    expect(ps[0].clientId).toBe("c1");
    expect(ps[0].accion?.tipo === "tarea" && ps[0].accion.titulo).toContain("MA PROPIEDADES");
  });

  it("no afirma una caída que explica otra cosa (cuenta frenada o sync roto)", () => {
    const ps = propuestasDeCosto(costos, nombres, new Set(["c2"]), { desde: "2026-10-02", hasta: "2026-10-04" });
    expect(ps.map((p) => p.clientId)).toEqual(["c1"]);
  });

  it("pauta ciega = fuente de pauta fallando o atrasada, no el orgánico", () => {
    const s = (clientId: string, fuente: SaludFuente["fuente"], estado: SaludFuente["estado"]) => ({ clientId, fuente, estado }) as SaludFuente;
    const ciegos = clientesConPautaCiega([s("c1", "meta_ads", "fallando"), s("c2", "organico", "fallando"), s("c3", "google_ads", "sin_entrega")]);
    expect([...ciegos]).toEqual(["c1"]);
  });
});

describe("cola humana", () => {
  const fila = (clientId: string | null, diasParado: number, title = "[HUMANO] Reconectar página") => ({
    clientId,
    title,
    identifier: "LMTM-1",
    motivo: "Hay que re-autorizar el token de la página.",
    diasParado,
  });

  it("una decisión por cliente, sin plata (ya la lleva la de costo)", () => {
    const ps = propuestasDeCola([fila("c1", 10), fila("c1", 4), fila("c2", 5)], new Map([["c1", "DUNOD"], ["c2", "SERRAT"]]));
    expect(ps).toHaveLength(2);
    const dunod = ps.find((p) => p.clientId === "c1")!;
    expect(dunod.que).toContain("2 tareas");
    expect(dunod.que).toContain("10 días");
    expect(dunod.arsPorDia).toBeNull();
  });

  it("lo que espera hace menos de 3 días todavía no es de una persona; sin cliente no se puede mostrar", () => {
    expect(propuestasDeCola([fila("c1", 2), fila(null, 30)], new Map())).toEqual([]);
  });
});

describe("cobertura", () => {
  const s = (o: Partial<SaludFuente>): SaludFuente => ({
    clientId: "c1",
    cliente: "SKYGARDEN ",
    fuente: "google_ads",
    estado: "ok",
    ultimoDato: "2026-09-13",
    ultimaCorridaOk: null,
    fallasSeguidas: 0,
    fallandoDesde: null,
    ultimoError: null,
    detalle: "detalle",
    ...o,
  });

  it("sin_entrega no es una falla y no pide nada", () => {
    expect(propuestasDeCobertura([s({ estado: "sin_entrega" })])).toEqual([]);
  });

  it("fallando pide reconectar, con el nombre limpio y desde cuándo", () => {
    const [p] = propuestasDeCobertura([s({ estado: "fallando", fallasSeguidas: 30, fallandoDesde: "2026-09-14T03:00:00Z", ultimoError: "403" })]);
    expect(p.tipo).toBe("cobertura:fallando");
    expect(p.que).toBe("Reconectar Google Ads: no se pueden traer los datos desde el 14/09");
  });

  it("el error crudo de la plataforma no llega a Hoy: se dice en castellano o no se dice", () => {
    const crudo = "403: The caller does not have permission";
    const [p] = propuestasDeCobertura([s({ estado: "fallando", fallasSeguidas: 30, fallandoDesde: "2026-09-14T03:00:00Z", ultimoError: crudo })]);
    expect(p.porque.resumen).toBe("La conexión con Google Ads falla cada noche: la cuenta no nos da permiso.");
    expect(JSON.stringify(p.porque)).not.toContain("caller");
    // El equipo sí lo necesita tal cual, para buscarlo: va en la tarea.
    expect(p.accion && p.accion.tipo === "tarea" && p.accion.descripcion).toContain(crudo);

    expect(errorEnCastellano("400: Service temporarily unavailable")).toBe("la plataforma no responde");
    expect(errorEnCastellano("Please reduce the amount of data you're asking for")).toBe("la plataforma pide traer menos datos por vez");
    expect(errorEnCastellano("Error validating access token: Session has expired")).toBe("venció el acceso y hay que volver a conectar la cuenta");
    // Lo que no se reconoce no se adivina.
    const [q] = propuestasDeCobertura([s({ estado: "fallando", ultimoError: "Unknown field adset_xyz" })]);
    expect(q.porque.resumen).toBe("La conexión con Google Ads falla cada noche.");
  });

  it("sin conexión y sin datos nunca: solo cuenta para Meta", () => {
    const ps = propuestasDeCobertura([
      s({ estado: "sin_conexion", fuente: "google_ads", ultimoDato: null }),
      s({ estado: "sin_conexion", fuente: "meta_ads", ultimoDato: null }),
    ]);
    expect(ps.map((p) => p.tipo)).toEqual(["cobertura:sin_meta"]);
  });

  it("sin conexión CON datos viejos es que se desconectó (la firma de Distrillantas)", () => {
    const [p] = propuestasDeCobertura([s({ estado: "sin_conexion", fuente: "google_ads", ultimoDato: "2026-09-20" })]);
    expect(p.tipo).toBe("cobertura:desconectada");
    expect(p.que).toContain("se desconectó");
    // Y su caída de gasto no se afirma: dejamos de ver, no dejó de gastar.
    expect([...clientesConPautaCiega([s({ estado: "sin_conexion", fuente: "meta_ads", ultimoDato: "2026-09-20" })])]).toEqual(["c1"]);
  });
});
