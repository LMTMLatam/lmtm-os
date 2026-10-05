import { describe, expect, it } from "vitest";
import { KINDS_EVALUABLES, MINIMO_PARA_LECCION, leccionDe } from "../action-outcomes.js";

describe("KINDS_EVALUABLES", () => {
  // Cuando se sumó la escritura en Google, esas acciones quedaron sin evaluar:
  // la capacidad más nueva era la única sin feedback. Volvió a pasar al sumar
  // el presupuesto, así que la lista se fija acá a propósito.
  it("cubre las cuatro palancas de escritura que ejecuta la flota", () => {
    expect([...KINDS_EVALUABLES]).toEqual([
      "pause_ad_entity",
      "add_negative_keywords",
      "pause_keywords",
      "set_budget",
    ]);
  });

  // La autonomía graduada se decide con este mismo historial: una palanca que
  // no se evalúa nunca se gana el derecho a ejecutarse sola, y —peor— una que
  // se ejecuta sola sin estar acá lo haría sin que nadie mida el resultado.
  it("toda palanca que puede volverse automática está medida", () => {
    for (const kind of ["pause_ad_entity", "set_budget"]) {
      expect([...KINDS_EVALUABLES]).toContain(kind);
    }
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
