import { describe, expect, it } from "vitest";
import { KINDS_EVALUABLES, MINIMO_PARA_LECCION, leccionDe } from "../action-outcomes.js";

describe("KINDS_EVALUABLES", () => {
  // Cuando se sumó la escritura en Google, esas acciones quedaron sin evaluar:
  // la capacidad más nueva era la única sin feedback.
  it("cubre las tres palancas de escritura que ejecuta la flota", () => {
    expect([...KINDS_EVALUABLES]).toEqual(["pause_ad_entity", "add_negative_keywords", "pause_keywords"]);
  });
});

describe("leccionDe", () => {
  it("cuando empeora más de lo que mejora, pide justificar antes de repetirla", () => {
    const t = leccionDe("add_negative_keywords", { mejor: 2, peor: 6, igual: 2, total: 10 });
    expect(t).toContain("empeoró");
    expect(t).toContain("justificá por qué este caso es distinto");
  });

  it("cuando mejora en la mayoría, la marca como palanca que funciona", () => {
    const t = leccionDe("pause_ad_entity", { mejor: 7, peor: 1, igual: 2, total: 10 });
    expect(t).toContain("viene funcionando");
  });

  // El caso peligroso: 40% de mejora suena bien y no lo es. Sin este texto, un
  // agente lee "mejoró 40%" como permiso.
  it("un resultado tibio se dice tibio, no se disfraza de éxito", () => {
    const t = leccionDe("pause_keywords", { mejor: 4, peor: 3, igual: 3, total: 10 });
    expect(t).toContain("neutra");
    expect(t).toContain("No esperes que mueva la aguja sola");
    expect(t).not.toContain("viene funcionando");
  });

  it("siempre dice sobre cuántos casos se sacó la conclusión", () => {
    expect(leccionDe("x", { mejor: 3, peor: 1, igual: 1, total: 5 })).toContain("5 medidos");
  });

  it("el mínimo para escribir una lección deja fuera la anécdota", () => {
    expect(MINIMO_PARA_LECCION).toBeGreaterThanOrEqual(5);
  });
});
