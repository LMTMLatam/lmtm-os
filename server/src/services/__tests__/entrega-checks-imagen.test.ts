import { afterEach, describe, expect, it, vi } from "vitest";
import { verificarImagen } from "../entrega-checks.js";

const IMG = "https://ejemplo.test/placa.jpg";

/** Simula lo que devuelve el modelo de visión. */
function modeloDice(texto: string | null, motivo?: string) {
  vi.doMock("../nvidia-modelos.js", () => ({
    nvidiaConfigurado: () => true,
    verImagen: async () => ({ texto, motivo, detalle: motivo }),
  }));
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("../nvidia-modelos.js");
});

async function correr(url = IMG, opts = { nombreCliente: "MAERS", otrosClientes: ["Distrillantas", "BOERO"] }) {
  const { verificarImagen: fn } = await import("../entrega-checks.js");
  return fn(url, opts);
}

describe("verificarImagen", () => {
  it("una placa sana pasa sin problemas", async () => {
    modeloDice(JSON.stringify({ descripcion: "Placa con logo de MAERS", legible: true, marcaAjena: null, idiomaTextoOk: true, problemas: [] }));
    const r = await correr();
    expect(r.ok).toBe(true);
    expect(r.sinVerificar).toBe(false);
    expect(r.problemas).toEqual([]);
    expect(r.descripcion).toContain("MAERS");
  });

  // El riesgo más caro de una agencia, y el único que solo se ve MIRANDO la
  // pieza: el check de texto no puede detectar un logo.
  it("detecta la marca de otro cliente en la imagen", async () => {
    modeloDice(JSON.stringify({ descripcion: "Placa", legible: true, marcaAjena: "Distrillantas", idiomaTextoOk: true, problemas: [] }));
    const r = await correr();
    expect(r.ok).toBe(false);
    expect(r.problemas.join(" ")).toContain("Distrillantas");
    expect(r.problemas.join(" ")).toContain("OTRO cliente");
  });

  it("marca el render fallado y el idioma equivocado", async () => {
    modeloDice(JSON.stringify({ descripcion: "Placa", legible: false, marcaAjena: null, idiomaTextoOk: false, problemas: [] }));
    const r = await correr();
    expect(r.ok).toBe(false);
    expect(r.problemas.some((p) => p.includes("ilegible"))).toBe(true);
    expect(r.problemas.some((p) => p.includes("español"))).toBe(true);
  });

  // Lo importante no es que devuelva ok, sino que diga que NO miró. Devolver
  // "sin problemas" sin haber mirado es el verde mentiroso de siempre.
  it("si el modelo no contesta avisa que no verificó", async () => {
    modeloDice(null, "red");
    const r = await correr();
    expect(r.sinVerificar).toBe(true);
    expect(r.problemas).toEqual([]);
  });

  it("si el modelo contesta cualquier cosa tampoco inventa un veredicto", async () => {
    modeloDice("no pude ver la imagen, perdón");
    const r = await correr();
    expect(r.sinVerificar).toBe(true);
  });

  it("aguanta JSON envuelto en prosa o en un bloque de código", async () => {
    modeloDice('Claro, acá va:\n```json\n{"descripcion":"ok","legible":true,"marcaAjena":null,"idiomaTextoOk":true,"problemas":[]}\n```');
    const r = await correr();
    expect(r.sinVerificar).toBe(false);
    expect(r.ok).toBe(true);
  });

  it("no repite el mismo problema dos veces", async () => {
    modeloDice(JSON.stringify({
      descripcion: "x", legible: false, marcaAjena: null, idiomaTextoOk: true,
      problemas: ["La imagen tiene texto cortado, encimado o ilegible: revisá el render antes de entregarla."],
    }));
    const r = await correr();
    expect(r.problemas).toHaveLength(1);
  });
});

describe("verificarImagen sin NVIDIA configurado", () => {
  it("no bloquea la entrega pero deja claro que no miró", async () => {
    vi.doMock("../nvidia-modelos.js", () => ({
      nvidiaConfigurado: () => false,
      verImagen: async () => { throw new Error("no debería llamarse"); },
    }));
    const { verificarImagen: fn } = await import("../entrega-checks.js");
    const r = await fn(IMG, { nombreCliente: "MAERS" });
    expect(r.ok).toBe(true);
    expect(r.sinVerificar).toBe(true);
  });
});

// Guard de tipo: la firma tiene que seguir aceptando solo la URL.
describe("firma", () => {
  it("acepta llamarse solo con la url", () => {
    expect(typeof verificarImagen).toBe("function");
    expect(verificarImagen.length).toBeGreaterThanOrEqual(1);
  });
});
