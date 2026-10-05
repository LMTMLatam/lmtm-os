// La regla que estos tests protegen: el nivel decide el canal, y nada que el
// sistema haya querido avisar puede desaparecer en silencio.
import { describe, expect, it } from "vitest";
import { armarDigest, decidir, HORAS_DEDUPE, NIVEL_INTERRUMPE, TOPE_DIARIO } from "../wa-embudo.js";

describe("decidir", () => {
  it("nivel 5 interrumpe siempre, incluso con el día cargado", () => {
    // Un tope en nivel 5 reproduce el bug que estamos arreglando: el aviso que
    // importa silenciado por volumen ajeno. Esto es plata parada o una cuenta
    // caída — Distrillantas.
    expect(decidir({ nivel: 5, yaDicho: false, enviadosHoy: 500 })).toEqual({ accion: "enviar" });
  });

  it("nivel 4 interrumpe hasta el tope y después degrada a digest", () => {
    expect(decidir({ nivel: 4, yaDicho: false, enviadosHoy: TOPE_DIARIO[4] - 1 })).toEqual({ accion: "enviar" });
    expect(decidir({ nivel: 4, yaDicho: false, enviadosHoy: TOPE_DIARIO[4] })).toEqual({ accion: "digest" });
  });

  it("pasado el tope DEGRADA, no descarta", () => {
    // La diferencia importa: que el aviso número 9 del día no interrumpa es
    // correcto; que desaparezca es volver a perder un Distrillantas.
    const d = decidir({ nivel: 4, yaDicho: false, enviadosHoy: 99 });
    expect(d.accion).toBe("digest");
    expect(d.accion).not.toBe("descartar");
  });

  it.each([2, 3] as const)("nivel %i nunca interrumpe: va al digest", (nivel) => {
    expect(decidir({ nivel, yaDicho: false, enviadosHoy: 0 })).toEqual({ accion: "digest" });
  });

  it("nivel 1 se registra pero no se manda nunca", () => {
    const d = decidir({ nivel: 1, yaDicho: false, enviadosHoy: 0 });
    expect(d.accion).toBe("descartar");
  });

  it("el mismo hecho no se avisa dos veces en la ventana de dedupe", () => {
    const d = decidir({ nivel: 5, yaDicho: true, enviadosHoy: 0 });
    expect(d.accion).toBe("descartar");
    expect(d.accion === "descartar" && d.motivo).toContain(String(HORAS_DEDUPE));
  });

  it("el dedupe gana incluso en nivel 5", () => {
    // Si no, una cuenta caída manda el mismo mensaje cada corrida del vigilante
    // y vuelve a quemar el canal, que es el problema original.
    expect(decidir({ nivel: 5, yaDicho: true, enviadosHoy: 0 }).accion).toBe("descartar");
  });

  it("el umbral de interrupción es 4: 3 no interrumpe y 4 sí", () => {
    expect(NIVEL_INTERRUMPE).toBe(4);
    expect(decidir({ nivel: 3, yaDicho: false, enviadosHoy: 0 }).accion).toBe("digest");
    expect(decidir({ nivel: 4, yaDicho: false, enviadosHoy: 0 }).accion).toBe("enviar");
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
