// La regla que estos tests protegen: un bloqueo que necesita una persona TIENE
// que aparecer en la cola humana aunque nadie le haya puesto el prefijo, y uno
// que nadie tocó en 21 días no puede quedarse abierto para siempre.
import { describe, expect, it } from "vitest";
import { DIAS_PARA_ESCALAR, DIAS_PARA_VENCER, necesitaPersona, TOPE_VISIBLE, totalPlataParada } from "../cola-humana.js";

describe("necesitaPersona", () => {
  it("reconoce lo que ya está marcado", () => {
    expect(necesitaPersona("[HUMANO] Pagar la factura de Meta")).toBe(true);
  });

  // Casos reales de la revisión de flota: bloqueados desde junio que el panel
  // no mostraba porque nadie les puso el prefijo.
  it.each([
    "Reconectar página Meta (IG/FB) de Empresariosxfunes en LMTM-OS",
    "[ESCALACIÓN-Luna] GALA: act_442202284525132 sigue sin mapear",
    "Confirmar hoja Cronopost vigente de ALISON",
    "Cargar Enfoque Técnico de BITTI en el brain del cliente",
    "Re-autorizar el token de Google Ads",
    "Dar acceso al Business Manager",
  ])("detecta que necesita una persona: %s", (titulo) => {
    expect(necesitaPersona(titulo)).toBe(true);
  });

  // Estos los destraba otro issue, no una persona: si los mandáramos a la cola
  // humana la llenaríamos de ruido y volveríamos al problema original.
  it.each([
    "Escribir el copy de los 4 posteos de septiembre",
    "Generar el reel de la promo de invierno",
    "Analizar el rendimiento de la campaña de búsqueda",
  ])("no escala lo que resuelve un agente: %s", (titulo) => {
    expect(necesitaPersona(titulo)).toBe(false);
  });
});

describe("plazos", () => {
  it("escala antes de vencer", () => {
    expect(DIAS_PARA_ESCALAR).toBeLessThan(DIAS_PARA_VENCER);
  });

  // Mismo criterio que aprobaciones y oportunidades: si cambia acá, que sea a
  // propósito y en todos lados.
  it("vence a los 21 días, igual que el resto de los paneles", () => {
    expect(DIAS_PARA_VENCER).toBe(21);
  });
});

describe("totalPlataParada", () => {
  // EL BUG QUE ESTE TEST NO AGARRABA, y por eso salio a produccion:
  // `arsPorDia` es la plata parada DEL CLIENTE, pegada a cada una de sus filas
  // para poder ordenar. El test viejo sumaba fila por fila y daba por buena esa
  // suma — asi que confirmaba justo el error. En el panel real, las 7 tareas de
  // MA PROPIEDADES hacian entrar sus $48.217 siete veces y el titular marcaba
  // $998.136.
  it("cuenta UNA vez por cliente, no una por tarea", () => {
    const cola = [
      { clientId: "ma-propiedades", arsPorDia: 48_217 },
      { clientId: "ma-propiedades", arsPorDia: 48_217 },
      { clientId: "ma-propiedades", arsPorDia: 48_217 },
      { clientId: "dunod", arsPorDia: 12_000 },
    ];
    expect(totalPlataParada(cola)).toBe(48_217 + 12_000);
  });

  it("mas tareas del mismo cliente NO suben el total", () => {
    const una = [{ clientId: "c1", arsPorDia: 10_000 }];
    const diez = Array.from({ length: 10 }, () => ({ clientId: "c1", arsPorDia: 10_000 }));
    expect(totalPlataParada(diez)).toBe(totalPlataParada(una));
  });

  it("suma toda la cola, no solo el tope visible", () => {
    // Un cliente distinto por fila: aca si tienen que sumar todos.
    const cola = Array.from({ length: TOPE_VISIBLE + 8 }, (_, i) => ({ clientId: `c${i}`, arsPorDia: 1_000 }));
    expect(totalPlataParada(cola)).toBe((TOPE_VISIBLE + 8) * 1_000);
    expect(totalPlataParada(cola.slice(0, TOPE_VISIBLE))).toBeLessThan(totalPlataParada(cola));
  });

  it("las filas que no se pueden tasar no rompen el total", () => {
    expect(totalPlataParada([{ clientId: "a", arsPorDia: 43_000 }, {}, { clientId: "b", arsPorDia: 0 }])).toBe(43_000);
  });

  it("sin clientId no se puede deduplicar, asi que suma", () => {
    // Es el lado seguro: subestimar la plata parada esconde el problema.
    expect(totalPlataParada([{ arsPorDia: 5_000 }, { arsPorDia: 5_000 }])).toBe(10_000);
  });

  it("cola vacia es cero, no NaN", () => {
    expect(totalPlataParada([])).toBe(0);
  });
});
