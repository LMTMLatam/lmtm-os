import { describe, expect, it } from "vitest";
import {
  DIAS_DESPACHO_SIN_RED,
  DIAS_SIN_DESPACHO,
  DIAS_SYNC_CONFIABLE,
  diagnosticar,
  type EstadoCliente,
} from "../cadena-publicacion.js";

const sano: EstadoCliente = {
  tieneDestino: true,
  diasDesdeDespacho: 1,
  tieneSyncOrganico: true,
  diasDesdeSync: 0,
  diasDesdeUltimoPost: 1,
};

describe("diagnosticar — primer eslabón roto de la cadena", () => {
  it("una cadena sana no reporta nada", () => {
    expect(diagnosticar(sano)).toBeNull();
  });

  it("sin destino en Make gana sobre todo lo demás", () => {
    // Aunque además no despache y la red esté muda: el problema es uno solo, y
    // reportar los tres manda al equipo a revisar el escenario equivocado.
    expect(diagnosticar({
      ...sano, tieneDestino: false, diasDesdeDespacho: null,
      diasDesdeSync: 99, diasDesdeUltimoPost: 99,
    })).toBe("sin_destino");
  });

  it("con destino pero sin despachos, es el despachador", () => {
    expect(diagnosticar({ ...sano, diasDesdeDespacho: DIAS_SIN_DESPACHO + 1 })).toBe("despachador_mudo");
    expect(diagnosticar({ ...sano, diasDesdeDespacho: null })).toBe("despachador_mudo");
  });

  it("justo en el umbral de despacho todavía no acusa", () => {
    expect(diagnosticar({ ...sano, diasDesdeDespacho: DIAS_SIN_DESPACHO })).toBeNull();
  });

  // El caso que evitó tres acusaciones falsas el 10/9/26: Ikigai, TAMARINDO y
  // HANSHI parecían "Make publicó y la red no lo muestra" y en realidad era
  // nuestro propio sync parado hacía 70, 28 y 9 días.
  it("con el sync parado dice que estamos ciegos, NO que la red esté muda", () => {
    expect(diagnosticar({
      ...sano,
      diasDesdeSync: DIAS_SYNC_CONFIABLE + 1,
      diasDesdeUltimoPost: 70,
    })).toBe("sync_ciego");
  });

  it("solo acusa a la red con el sync al día", () => {
    expect(diagnosticar({
      ...sano, diasDesdeDespacho: 1, diasDesdeSync: 0,
      diasDesdeUltimoPost: DIAS_DESPACHO_SIN_RED + 1,
    })).toBe("red_muda");
  });

  it("al cliente sin sync orgánico no se le inventa un outage", () => {
    expect(diagnosticar({
      ...sano, tieneSyncOrganico: false, diasDesdeSync: null, diasDesdeUltimoPost: null,
    })).toBeNull();
  });

  it("no acusa a la red si hace menos que el último despacho", () => {
    // Despachó hace 10 días y el último post es de hace 6: el post salió DESPUÉS
    // del despacho anterior, así que la cadena funcionó.
    expect(diagnosticar({
      ...sano, diasDesdeDespacho: 8, diasDesdeSync: 0, diasDesdeUltimoPost: 6,
    })).toBeNull();
  });
});
