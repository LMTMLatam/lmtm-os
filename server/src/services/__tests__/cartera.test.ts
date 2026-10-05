// La regla que estos tests protegen: la columna "próxima acción" es lo que
// convierte la tabla en decisiones, así que su orden de prioridades tiene que
// ser explícito y no un efecto de cómo quedaron los if.
import { describe, expect, it } from "vitest";
import { decidirAccion, MINIMO_IMPRESIONES, variacionPct } from "../cartera.js";

const base = {
  inversion30d: 100_000,
  leads30d: 40,
  cpl: 2_500,
  deltaRubroPct: 0,
  deltaPropioPct: 0,
  formatoDominantePct: 50,
  plataParadaPorDia: 0,
  impresiones30d: 50_000,
};

describe("variacionPct", () => {
  it("negativo cuando mejoró, positivo cuando empeoró", () => {
    expect(variacionPct(80, 100)).toBe(-20);
    expect(variacionPct(130, 100)).toBe(30);
  });

  it("sin referencia no se inventa una comparación", () => {
    // Comparar contra cero o contra nada daría Infinity o NaN, y eso termina
    // pintado como un delta gigante en la tabla.
    expect(variacionPct(100, 0)).toBeNull();
    expect(variacionPct(100, null)).toBeNull();
    expect(variacionPct(null, 100)).toBeNull();
  });
});

describe("decidirAccion", () => {
  it("la plata parada gana sobre TODO lo demás", () => {
    // Es lo único que se está perdiendo hoy; el resto describe eficiencia.
    const a = decidirAccion({
      ...base,
      plataParadaPorDia: 43_000,
      leads30d: 0,
      deltaRubroPct: 200,
      deltaPropioPct: 200,
      formatoDominantePct: 100,
    });
    expect(a.texto).toContain("Reactivar");
    expect(a.texto).toContain("43.000");
    expect(a.tono).toBe("critico");
  });

  it("sin pauta NO es un problema, es un estado", () => {
    // Pintar en rojo a quien no contrató pauta puso 40 de 58 clientes en alerta
    // y volvió inútil el semáforo.
    const a = decidirAccion({ ...base, inversion30d: 0, leads30d: 0, cpl: null });
    expect(a.tono).toBe("neutro");
    expect(a.prioridad).toBe(0);
    expect(a.texto).toContain("Sin pauta");
  });

  it("gastar sin traer un solo lead es crítico", () => {
    const a = decidirAccion({ ...base, leads30d: 0, cpl: null });
    expect(a.tono).toBe("critico");
    expect(a.texto).toContain("no trae leads");
  });

  it("con poco volumen no afirma nada", () => {
    // Un umbral que decide sobre la FALTA de un dato no puede concluir.
    const a = decidirAccion({ ...base, impresiones30d: MINIMO_IMPRESIONES - 1, deltaRubroPct: 90 });
    expect(a.texto).toContain("poco volumen");
    expect(a.tono).toBe("neutro");
  });

  it("empeorar contra uno mismo pesa más que estar arriba del rubro", () => {
    // Un cliente puede estar siempre arriba del promedio de su rubro y estar
    // bien; lo que no puede es encarecerse contra su propio mes pasado.
    const a = decidirAccion({ ...base, deltaPropioPct: 40, deltaRubroPct: 40 });
    expect(a.texto).toContain("propios 30 días previos");
  });

  it("muy por debajo del rubro es una oportunidad, no una alerta", () => {
    const a = decidirAccion({ ...base, deltaRubroPct: -30 });
    expect(a.tono).toBe("oportunidad");
    expect(a.texto).toContain("escalar presupuesto");
  });

  it("un solo formato dominante pide diversificar", () => {
    const a = decidirAccion({ ...base, formatoDominantePct: 85 });
    expect(a.texto).toContain("diversificar");
  });

  it("un cliente sano no inventa una tarea", () => {
    // Una tabla donde todas las filas piden algo es una tabla que nadie mira.
    const a = decidirAccion(base);
    expect(a.texto).toBe("Sin acción");
    expect(a.prioridad).toBe(0);
  });

  it("las prioridades ordenan de peor a mejor", () => {
    const parada = decidirAccion({ ...base, plataParadaPorDia: 1_000 }).prioridad;
    const sinLeads = decidirAccion({ ...base, leads30d: 0, cpl: null }).prioridad;
    const propio = decidirAccion({ ...base, deltaPropioPct: 40 }).prioridad;
    const rubro = decidirAccion({ ...base, deltaRubroPct: 40 }).prioridad;
    const oportunidad = decidirAccion({ ...base, deltaRubroPct: -30 }).prioridad;
    const sana = decidirAccion(base).prioridad;
    expect(parada).toBeGreaterThan(sinLeads);
    expect(sinLeads).toBeGreaterThan(propio);
    expect(propio).toBeGreaterThan(rubro);
    expect(rubro).toBeGreaterThan(oportunidad);
    expect(oportunidad).toBeGreaterThan(sana);
  });
});
