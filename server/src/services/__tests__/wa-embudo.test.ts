// La regla que estos tests protegen: el nivel decide el canal, y nada que el
// sistema haya querido avisar puede desaparecer en silencio.
import { describe, expect, it } from "vitest";
import { armarDigest, decidir, HORAS_DEDUPE, NIVEL_INTERRUMPE, TOPE_INTERRUPCIONES_DIA } from "../wa-embudo.js";

// Desde el rediseño B2 (avisos/politica.ts): solo interrumpe el nivel 5, solo
// lo pueden pedir los incidentes y los envíos manuales, y hay un tope de 3
// interrupciones por día en toda la agencia.
describe("decidir", () => {
  it("un incidente interrumpe hasta el tope del día y después degrada al resumen", () => {
    expect(decidir({ nivel: 5, origen: "incidentes", yaDicho: false, enviadosHoy: TOPE_INTERRUPCIONES_DIA - 1 })).toEqual({ accion: "enviar" });
    const d = decidir({ nivel: 5, origen: "incidentes", yaDicho: false, enviadosHoy: TOPE_INTERRUPCIONES_DIA });
    expect(d.accion).toBe("digest");
  });

  it("pasado el tope DEGRADA, no descarta", () => {
    // Que el cuarto aviso del día no interrumpa es la regla; que desaparezca
    // es volver a perder un Distrillantas.
    const d = decidir({ nivel: 5, origen: "incidentes", yaDicho: false, enviadosHoy: 99 });
    expect(d.accion).toBe("digest");
    expect(d.accion).not.toBe("descartar");
  });

  it("un módulo que se pone nivel 5 por su cuenta no interrumpe: va al resumen", () => {
    // Es lo que quemó el canal: cada módulo convencido de que lo suyo es urgente.
    for (const origen of ["vigilante-financiero", "monitor-saldo", "agente:saldo", "brief"]) {
      expect(decidir({ nivel: 5, origen, yaDicho: false, enviadosHoy: 0 }).accion).toBe("digest");
    }
  });

  it("el nivel 4 ya no interrumpe", () => {
    expect(NIVEL_INTERRUMPE).toBe(5);
    expect(decidir({ nivel: 4, origen: "cadena-publicacion", yaDicho: false, enviadosHoy: 0 }).accion).toBe("digest");
  });

  it.each([2, 3] as const)("nivel %i nunca interrumpe: va al resumen", (nivel) => {
    expect(decidir({ nivel, yaDicho: false, enviadosHoy: 0 })).toEqual({ accion: "digest" });
  });

  it("nivel 1 se registra pero no se manda nunca", () => {
    const d = decidir({ nivel: 1, yaDicho: false, enviadosHoy: 0 });
    expect(d.accion).toBe("descartar");
  });

  it("el mismo hecho no se avisa dos veces en la ventana de dedupe, ni siquiera un incidente", () => {
    const d = decidir({ nivel: 5, origen: "incidentes", yaDicho: true, enviadosHoy: 0 });
    expect(d.accion).toBe("descartar");
    expect(d.accion === "descartar" && d.motivo).toContain(String(HORAS_DEDUPE));
  });

  it("una persona que aprieta 'avisar' sí interrumpe (cuenta para el tope)", () => {
    expect(decidir({ nivel: 5, origen: "alertas-cliente (manual)", yaDicho: false, enviadosHoy: 0 }).accion).toBe("enviar");
  });
});

describe("armarDigest", () => {
  const filas = [
    { origen: "publication-monitor", nivel: 3, texto: "MAERS sin publicar hace 2 días" },
    { origen: "publication-monitor", nivel: 2, texto: "TAMARINDO sin pieza para mañana" },
    { origen: "auditor", nivel: 3, texto: "RENO: planilla sin filas nuevas" },
  ];

  it("sin pendientes no manda nada", () => {
    expect(armarDigest([])).toBeNull();
  });

  it("junta todo en UN texto y cuenta los avisos", () => {
    const t = armarDigest(filas, new Date("2026-10-04T09:00:00"))!;
    expect(t).toContain("3 avisos");
    expect(t.split("MAERS").length - 1).toBe(1);
    expect(t).toContain("TAMARINDO");
    expect(t).toContain("RENO");
  });

  it("agrupa por origen: un encabezado por módulo, no uno por aviso", () => {
    const t = armarDigest(filas)!;
    expect(t.split("*publication-monitor*").length - 1).toBe(1);
    expect(t).toContain("*publication-monitor* (2)");
    expect(t).toContain("*auditor* (1)");
  });

  it("el grupo de mayor nivel va primero", () => {
    const t = armarDigest([
      { origen: "bajo", nivel: 2, texto: "a" },
      { origen: "alto", nivel: 4, texto: "b" },
    ])!;
    expect(t.indexOf("*alto*")).toBeLessThan(t.indexOf("*bajo*"));
  });

  it("singular con un solo aviso", () => {
    expect(armarDigest([{ origen: "x", nivel: 3, texto: "y" }])).toContain("1 aviso");
  });

  it("recorta los textos largos: el digest es para decidir si abrir el panel", () => {
    const t = armarDigest([{ origen: "x", nivel: 3, texto: "z".repeat(400) }])!;
    expect(t).toContain("…");
    expect(t.length).toBeLessThan(300);
  });

  it("dice si es el de la mañana o el de la tarde", () => {
    expect(armarDigest(filas, new Date("2026-10-04T08:00:00"))).toContain("de la mañana");
    expect(armarDigest(filas, new Date("2026-10-04T18:00:00"))).toContain("de la tarde");
  });
});
