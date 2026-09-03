// La regla que estos tests protegen: un bloqueo que necesita una persona TIENE
// que aparecer en la cola humana aunque nadie le haya puesto el prefijo, y uno
// que nadie tocó en 21 días no puede quedarse abierto para siempre.
import { describe, expect, it } from "vitest";
import { DIAS_PARA_ESCALAR, DIAS_PARA_VENCER, necesitaPersona } from "../cola-humana.js";

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
