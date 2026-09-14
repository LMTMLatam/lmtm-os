import { describe, expect, it } from "vitest";
import { MINIMO_COPYS, fusionar, type MarcaAprendida } from "../marca-aprendida.js";

const aprendida: MarcaAprendida = {
  tono: "Amigable y cercano, con voseo y emojis.",
  palabrasSi: ["encontrá", "descubrí", "sumá"],
  palabrasNo: ["usted", "formal"],
  mensaje: "Todo para el profesional de la peluquería.",
  publico: "Peluqueros y profesionales de la belleza.",
  diferencial: "Variedad de marcas y contenido educativo.",
};

describe("fusionar — lo que cargó una persona GANA", () => {
  it("con la fila vacía escribe todo lo aprendido", () => {
    const r = fusionar(null, aprendida, false);
    expect(r.aEscribir).toEqual(aprendida);
    expect(r.respetados).toEqual([]);
  });

  // El caso que importa: el equipo conoce al cliente mejor que un promedio de
  // 200 posts. Que un proceso automático le borre el tono que definió a mano es
  // la forma más rápida de que dejen de usar el panel.
  it("NO pisa los campos que cargó una persona", () => {
    const humana = { tono: "Serio, institucional. Nada de emojis.", publico: "Arquitectos." };
    const r = fusionar(humana, aprendida, true);
    expect(r.aEscribir.tono).toBeUndefined();
    expect(r.aEscribir.publico).toBeUndefined();
    expect(r.respetados).toContain("tono");
    expect(r.respetados).toContain("publico");
  });

  it("pero SÍ completa los huecos que la persona dejó vacíos", () => {
    const humana = { tono: "Serio, institucional." };
    const r = fusionar(humana, aprendida, true);
    expect(r.aEscribir.mensaje).toBe(aprendida.mensaje);
    expect(r.aEscribir.palabrasSi).toEqual(aprendida.palabrasSi);
    expect(r.respetados).toEqual(["tono"]);
  });

  it("una lista vacía cuenta como hueco, no como decisión", () => {
    // Nadie "decide" que un cliente no usa ninguna palabra: [] es que no se
    // cargó. Un string en blanco, igual.
    const r = fusionar({ palabrasSi: [], tono: "   " }, aprendida, true);
    expect(r.aEscribir.palabrasSi).toEqual(aprendida.palabrasSi);
    expect(r.aEscribir.tono).toBe(aprendida.tono);
    expect(r.respetados).toEqual([]);
  });

  it("si la fila la escribió el propio aprendizaje, se pisa entera", () => {
    // Sin esto la primera corrida congelaría la marca para siempre y el
    // cliente no podría evolucionar su voz.
    const previa = { tono: "algo viejo", mensaje: "otro mensaje" };
    const r = fusionar(previa, aprendida, false);
    expect(r.aEscribir).toEqual(aprendida);
    expect(r.respetados).toEqual([]);
  });
});

describe("piso de muestra", () => {
  it("no describe una voz con menos de 15 copys", () => {
    // Una identidad de marca sacada de cuatro publicaciones es una invención
    // con formato de dato, y después la flota genera meses apoyada en eso.
    expect(MINIMO_COPYS).toBeGreaterThanOrEqual(15);
  });
});
