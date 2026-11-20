import { describe, expect, it } from "vitest";
import { coincidencia, leerReferencia, leerSrt, limpiarFicha, pedidoFicha, PREGUNTAS_FICHA } from "../virales-ficha.js";

describe("ficha de un viral (plan 17/11)", () => {
  it("lee la línea real de vtool referencia (17/11) y no inventa si cambia el formato", () => {
    const linea = "r1.mp4                       1:18.9 |   9 cortes, plano medio 7.89 s, primer corte 9.8 s | 3.45 pal/s | -14.6 LUFS | brillo 121 sat 17";
    expect(leerReferencia(`Transcribiendo...\n${linea}\nOK -> r1__hoja.jpg\nMEDIANA: ...`)).toEqual({
      duracion: 78.9, cortes: 9, planoMedio: 7.89, primerCorte: 9.8, palabrasPorSegundo: 3.45, lufs: -14.6, brillo: 121, saturacion: 17,
    });
    expect(leerReferencia("x.mp4  0:12.0 |   0 cortes, plano medio 12.0 s, primer corte None s | 0 pal/s | None LUFS | brillo None sat None"))
      .toMatchObject({ duracion: 12, cortes: 0, primerCorte: null, lufs: null, brillo: null });
    expect(leerReferencia("otro formato")).toBeNull();
  });

  it("del .srt saca todo el texto y lo que se dice en los primeros 3 s", () => {
    const srt = "1\n00:00:00,000 --> 00:00:01,200\nSi trabajás en\n\n2\n00:00:01,300 --> 00:00:02,900\ncapital pero\n\n3\n00:00:03,100 --> 00:00:04,000\nno querés vivir\n";
    expect(leerSrt(srt)).toEqual({ texto: "Si trabajás en capital pero no querés vivir", gancho: "Si trabajás en capital pero" });
    expect(leerSrt("")).toEqual({ texto: "", gancho: "" });
  });

  it("el pedido trae todas las preguntas y los tipos", () => {
    const p = pedidoFicha([{ slug: "recorrido", descripcion: "Se recorre un lugar." }, { slug: "promo", descripcion: "" }], { texto: "hola", gancho: "hola" });
    for (const k of Object.keys(PREGUNTAS_FICHA)) expect(p).toContain(`- ${k}:`);
    expect(p).toContain("- recorrido: Se recorre un lugar.");
    expect(p).toContain("- promo\n");
  });

  it("de la respuesta del modelo quedan solo claves conocidas con booleanos, y un tipo válido", () => {
    const f = limpiarFicha({ respuestas: { cara_primer_cuadro: true, humor: "sí", inventada: true }, tipo: " Recorrido ", gancho: " Si trabajás en capital " }, ["recorrido"]);
    expect(f.respuestas).toEqual({ cara_primer_cuadro: true });
    expect(f.faltan).toContain("humor");
    expect(f.tipo).toBe("recorrido");
    expect(f.gancho).toBe("Si trabajás en capital");
    expect(limpiarFicha({ tipo: "cualquiera" }, ["recorrido"]).tipo).toBeNull();
  });

  it("el examen compara solo las preguntas que respondieron los dos", () => {
    expect(coincidencia({ humor: true, cta_explicito: false, loop_final: true }, { humor: true, cta_explicito: true })).toEqual({ iguales: 1, total: 2, porcentaje: 50 });
    expect(coincidencia({}, {}).porcentaje).toBeNull();
  });
});
