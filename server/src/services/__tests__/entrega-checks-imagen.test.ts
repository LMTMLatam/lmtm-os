import { afterEach, describe, expect, it, vi } from "vitest";
import { marcasAjenas, verificarImagen } from "../entrega-checks.js";

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
    modeloDice(JSON.stringify({ descripcion: "Placa con logo de MAERS", legible: true, marcasVisibles: [], idiomaTextoOk: true, problemas: [] }));
    const r = await correr();
    expect(r.ok).toBe(true);
    expect(r.sinVerificar).toBe(false);
    expect(r.problemas).toEqual([]);
    expect(r.descripcion).toContain("MAERS");
  });

  // El riesgo más caro de una agencia, y el único que solo se ve MIRANDO la
  // pieza: el check de texto no puede detectar un logo.
  it("detecta la marca de otro cliente en la imagen", async () => {
    modeloDice(JSON.stringify({ descripcion: "Placa", legible: true, marcasVisibles: ["Distrillantas"], idiomaTextoOk: true, problemas: [] }));
    const r = await correr();
    expect(r.ok).toBe(false);
    expect(r.problemas.join(" ")).toContain("Distrillantas");
    expect(r.problemas.join(" ")).toContain("OTRO cliente");
  });

  it("marca el render fallado y el idioma equivocado", async () => {
    modeloDice(JSON.stringify({ descripcion: "Placa", legible: false, marcasVisibles: [], idiomaTextoOk: false, problemas: [] }));
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
      descripcion: "x", legible: false, marcasVisibles: [], idiomaTextoOk: true,
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

// El flag existe porque las placas del pipeline salen SIN texto a propósito
// (los modelos escriben con faltas, el texto lo monta diseño). Sin avisarle al
// verificador, marca "no tiene texto ni logo" como problema en TODAS: medido
// contra una imagen real, mismo archivo, ok:false sin el flag y ok:true con él.
describe("sinTextoEsperado", () => {
  it("le dice al modelo que la ausencia de texto y logo no es un problema", async () => {
    const capturadas: string[] = [];
    vi.doMock("../nvidia-modelos.js", () => ({
      nvidiaConfigurado: () => true,
      verImagen: async (instruccion: string) => {
        capturadas.push(instruccion);
        return { texto: JSON.stringify({ descripcion: "x", legible: true, marcasVisibles: [], idiomaTextoOk: true, problemas: [] }) };
      },
    }));
    const { verificarImagen: fn } = await import("../entrega-checks.js");

    await fn("https://ejemplo.test/a.jpg", { nombreCliente: "MAERS", sinTextoEsperado: true });
    expect(capturadas[0]).toContain("SIN texto");
    expect(capturadas[0]).toContain("NO es un problema");
    // Con el flag, "legible" pasa a significar solo render fallado.
    expect(capturadas[0]).toContain("render falló");

    await fn("https://ejemplo.test/a.jpg", { nombreCliente: "MAERS" });
    expect(capturadas[1]).not.toContain("NO es un problema");
    expect(capturadas[1]).toContain("texto está cortado");
  });

  it("aun con el flag sigue detectando la marca de otro cliente", async () => {
    // Lo que NO se relaja: la contaminación entre cuentas es el riesgo caro y
    // no depende de que la pieza lleve texto.
    vi.doMock("../nvidia-modelos.js", () => ({
      nvidiaConfigurado: () => true,
      verImagen: async () => ({ texto: JSON.stringify({ descripcion: "x", legible: true, marcasVisibles: ["BOERO"], idiomaTextoOk: true, problemas: [] }) }),
    }));
    const { verificarImagen: fn } = await import("../entrega-checks.js");
    const r = await fn("https://ejemplo.test/a.jpg", { nombreCliente: "MAERS", otrosClientes: ["BOERO"], sinTextoEsperado: true });
    expect(r.ok).toBe(false);
    expect(r.problemas.join(" ")).toContain("BOERO");
  });
});

// El cruce se sacó del prompt: antes la lista de clientes iba recortada a 40 y
// la agencia tiene 59, así que 18 marcas quedaban fuera del control en silencio
// — en el check cuyo único trabajo es detectar exactamente eso.
describe("marcasAjenas", () => {
  const otros = ["Distrillantas", "MA PROPIEDADES", "BOERO", "Gala"];

  it("detecta una marca de otro cliente", () => {
    expect(marcasAjenas(["Distrillantas"], "MAERS", otros)).toEqual(["Distrillantas"]);
  });

  it("no acusa a la marca del propio cliente", () => {
    expect(marcasAjenas(["MAERS"], "MAERS", otros)).toEqual([]);
  });

  it("aguanta variantes de escritura del mismo nombre", () => {
    expect(marcasAjenas(["MA Propiedades S.A."], "MAERS", otros)).toEqual(["MA PROPIEDADES"]);
    expect(marcasAjenas(["boero"], "MAERS", otros)).toEqual(["BOERO"]);
  });

  it("una marca de un tercero no es problema nuestro", () => {
    // Una Coca-Cola en una góndola no es contaminación entre cuentas.
    expect(marcasAjenas(["Coca-Cola", "Pepsi"], "MAERS", otros)).toEqual([]);
  });

  // Sin el mínimo de largo, un cliente llamado "Gala" matchea dentro de
  // "regalado" y cada paisaje sale acusado.
  it("no matchea nombres cortos dentro de otras palabras", () => {
    expect(marcasAjenas(["regalado"], "MAERS", otros)).toEqual([]);
  });

  it("sin marcas visibles no reporta nada, y aguanta basura", () => {
    expect(marcasAjenas([], "MAERS", otros)).toEqual([]);
    expect(marcasAjenas(null, "MAERS", otros)).toEqual([]);
    expect(marcasAjenas("no es un array", "MAERS", otros)).toEqual([]);
    expect(marcasAjenas([null, 42, ""], "MAERS", otros)).toEqual([]);
  });

  it("no repite el mismo cliente aunque aparezca dos veces", () => {
    expect(marcasAjenas(["BOERO", "boero pinturas"], "MAERS", otros)).toEqual(["BOERO"]);
  });
});
