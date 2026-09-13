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
  postsFuturos: 5,
  postsFuturosListos: 5,
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

describe("diagnosticar — el contenido que viene", () => {
  it("sin calendario cargado avisa antes de que deje de publicar", () => {
    expect(diagnosticar({ ...sano, postsFuturos: 0, postsFuturosListos: 0 })).toBe("sin_calendario");
  });

  // El caso COSA PROPIEDADES del 11/9/26: 11 posts programados, ninguno
  // completo. Todos se iban a descartar en silencio y la tarea igual quedaba
  // etiquetada como enviada, así que ningún tablero lo mostraba.
  it("con calendario pero ningún post completo, avisa que van a fallar", () => {
    expect(diagnosticar({ ...sano, postsFuturos: 11, postsFuturosListos: 0 })).toBe("contenido_incompleto");
  });

  it("alcanza con UNO listo para no acusar: el resto se completa a tiempo", () => {
    expect(diagnosticar({ ...sano, postsFuturos: 11, postsFuturosListos: 1 })).toBeNull();
  });

  // Si el despachador está mudo Y no hay nada cargado, el problema es la carga.
  // Reportar "Make no despacha" manda a revisar el escenario y se pierde la tarde.
  it("la falta de contenido gana sobre el despachador mudo, porque es su causa", () => {
    expect(diagnosticar({
      ...sano, postsFuturos: 0, postsFuturosListos: 0, diasDesdeDespacho: 245,
    })).toBe("sin_calendario");
  });

  it("pero sin destino sigue ganando sobre todo: no hay a dónde mandar nada", () => {
    expect(diagnosticar({
      ...sano, tieneDestino: false, postsFuturos: 0, postsFuturosListos: 0,
    })).toBe("sin_destino");
  });

  // No ver no es lo mismo que no haber: si ClickUp no respondió, null.
  it("si no se pudo leer ClickUp no inventa un problema de contenido", () => {
    expect(diagnosticar({ ...sano, postsFuturos: null, postsFuturosListos: null })).toBeNull();
    expect(diagnosticar({
      ...sano, postsFuturos: null, postsFuturosListos: null, diasDesdeDespacho: 99,
    })).toBe("despachador_mudo");
  });
});
