import { describe, expect, it } from "vitest";
import { esCarpetaDeSistema, normalizar, puntaje, rastrear, tipoDe } from "../nas-indice.js";
import type { ItemNas } from "../nas.js";

describe("tipos y normalización", () => {
  it("clasifica por extensión", () => {
    expect(tipoDe("DJI_0042.MP4")).toBe("video");
    expect(tipoDe("fachada.HEIC")).toBe("foto");
    expect(tipoDe("voz.wav")).toBe("audio");
    expect(tipoDe("logo.ai")).toBe("diseño");
    expect(tipoDe("brief.pdf")).toBe("documento");
    expect(tipoDe("sin-extension")).toBe("otro");
  });
  it("normaliza acentos y separadores", () => {
    expect(normalizar("Fábrica_Línea-2/Cámara.MOV")).toBe("fabrica linea 2 camara mov");
  });
  it("ignora las carpetas del QNAP", () => {
    expect(esCarpetaDeSistema("@Recycle")).toBe(true);
    expect(esCarpetaDeSistema(".@__thumb")).toBe(true);
    expect(esCarpetaDeSistema("Obra Pellegrini")).toBe(false);
  });
});

describe("puntaje", () => {
  const a = { ruta: "/LMTM/Clientes/Mondino/Fábrica 2025/linea_camaras.mp4", nombre: "linea_camaras.mp4" };
  it("todas las palabras tienen que estar; el nombre pesa más que la carpeta", () => {
    expect(puntaje(a, ["fabrica", "camaras"])).toBe(4);
    expect(puntaje(a, ["fabrica", "drone"])).toBe(0);
    expect(puntaje(a, ["camaras"])).toBeGreaterThan(puntaje(a, ["fabrica"]));
  });
});

describe("rastrear", () => {
  const arbol: Record<string, ItemNas[]> = {
    "/C": [
      { nombre: "Obra", ruta: "/C/Obra", carpeta: true, mb: null, modificado: null },
      { nombre: "@Recycle", ruta: "/C/@Recycle", carpeta: true, mb: null, modificado: null },
      { nombre: "logo.png", ruta: "/C/logo.png", carpeta: false, mb: 0.2, modificado: "Mon, 10 Nov 2026 10:00:00 GMT" },
    ],
    "/C/Obra": [
      { nombre: "drone.mp4", ruta: "/C/Obra/drone.mp4", carpeta: false, mb: 500, modificado: null },
      { nombre: "Rota", ruta: "/C/Obra/Rota", carpeta: true, mb: null, modificado: null },
    ],
    "/C/@Recycle": [{ nombre: "borrado.mp4", ruta: "/C/@Recycle/borrado.mp4", carpeta: false, mb: 1, modificado: null }],
  };
  const listar = async (r: string) => { if (r === "/C/Obra/Rota") throw new Error("403"); return arbol[r] ?? []; };

  it("recorre subcarpetas, saltea las del sistema y anota errores sin cortar", async () => {
    const r = await rastrear("/C", { listar, esperaReintentoMs: 1 });
    expect(r.archivos.map((a) => a.ruta).sort()).toEqual(["/C/Obra/drone.mp4", "/C/logo.png"]);
    expect(r.archivos.find((a) => a.nombre === "logo.png")).toMatchObject({ tipo: "foto", fecha: "2026-11-10" });
    expect(r.errores).toHaveLength(1);
    expect(r.recortado).toBe(false);
  });
  it("reintenta un 502 suelto", async () => {
    let veces = 0;
    const flojo = async (r: string) => { if (r === "/C/Obra" && veces++ === 0) throw new Error("502"); return arbol[r] ?? []; };
    const r = await rastrear("/C", { listar: async (x) => (x === "/C/Obra/Rota" ? [] : flojo(x)), esperaReintentoMs: 1 });
    expect(r.archivos.map((a) => a.nombre)).toContain("drone.mp4");
    expect(r.errores).toHaveLength(0);
  });
  it("saltea las cachés de los editores", () => {
    expect(esCarpetaDeSistema("Adobe Premiere Pro Video Previews")).toBe(true);
    expect(esCarpetaDeSistema("Rodaje_Oficina_08_26_DUNOD Masks")).toBe(true);
    expect(esCarpetaDeSistema("Media Cache Files")).toBe(true);
    expect(esCarpetaDeSistema("Proyecto Final")).toBe(false);
  });
  it("respeta el tope de carpetas", async () => {
    const r = await rastrear("/C", { listar, maxCarpetas: 1, esperaReintentoMs: 1 });
    expect(r.recortado).toBe(true);
  });
});

import { agruparCrudos, esRutaDeCrudos } from "../nas-indice.js";

describe("crudos nuevos (Editor, 17/11)", () => {
  const a = (ruta: string, fecha: string, mb = 10, tipo: "video" | "foto" = "video") => ({ cliente: "BOERO", clientId: "c1", archivo: { ruta, nombre: ruta.split("/").pop()!, tipo, mb, fecha } });
  it("agrupa videos por carpeta, saca lo terminado y las fotos, y ordena por fecha", () => {
    const r = agruparCrudos([
      a("/LMTM/Clientes/Boero/VIDEO/RECURSOS/frenos/CRUDOS/IMG_1.MOV", "2026-11-02"),
      a("/LMTM/Clientes/Boero/VIDEO/RECURSOS/frenos/CRUDOS/IMG_2.MOV", "2026-11-03", 20.4),
      a("/LMTM/Clientes/Boero/VIDEO/TERMINADOS/NO_SUBIDO/final.mp4", "2026-11-04"),
      a("/LMTM/Clientes/Boero/VIDEO/RECURSOS/frenos/CRUDOS/foto.jpg", "2026-11-05", 1, "foto"),
      a("/LMTM/Clientes/Boero/PRODUCCION/viejo/C1.MP4", "2026-10-01"),
    ]);
    expect(r).toEqual([
      { cliente: "BOERO", clientId: "c1", carpeta: "/LMTM/Clientes/Boero/VIDEO/RECURSOS/frenos/CRUDOS", videos: 2, mb: 30, fecha: "2026-11-03" },
      { cliente: "BOERO", clientId: "c1", carpeta: "/LMTM/Clientes/Boero/PRODUCCION/viejo", videos: 1, mb: 10, fecha: "2026-10-01" },
    ]);
  });
});

describe("qué carpetas son crudos (con rutas reales del índice, 18/11)", () => {
  it("entran producción, recursos y crudos; no lo terminado, avisos, diseño de redes, audio, maquetas ni proxies SUB", () => {
    for (const r of [
      "/LMTM/Clientes/Brachetta/PRODUCCION/11_26_Rodaje/M4ROOT/CLIP/C0001.MP4",
      "/LMTM/Clientes/Brachetta/PRODUCCION/11_26_Rodaje/CELULAR/IMG_1.MOV",
      "/LMTM/Clientes/Imperia/VIDEO/PROYECTOS/EDIFICIO_OROÑO_BLACK/RECURSOS/a.mp4",
      "/LMTM/Clientes/Gala/DISENO/RECURSOS/Avances_Gala_Rock/Etapa 5/Crudos/Drone/DJI_0556.MP4",
    ]) expect(esRutaDeCrudos(r)).toBe(true);
    for (const r of [
      "/LMTM/Clientes/El_Hiper_de_la_pelu/DISENO/PROYECTOS/REDES/11NOVIEMBRE_2026/a.mp4",
      "/LMTM/Clientes/Brachetta/PRODUCCION/11_26_Rodaje/M4ROOT/SUB/C0001S03.MP4",
      "/LMTM/Clientes/Distrillantas/AVISOS/OCTUBRE_2026/MECANICA/a.mp4",
      "/LMTM/Clientes/Brachetta/VIDEO/PROYECTOS/Reciclaje/AUDIO/OFF/a.mp4",
      "/LMTM/Clientes/Dunod/VIDEO/PROYECTOS/JULIO_SOSA_8900/MAQUETA/a.mp4",
      "/LMTM/Clientes/Boero/VIDEO/TERMINADOS/NO_SUBIDO/a.mp4",
    ]) expect(esRutaDeCrudos(r)).toBe(false);
  });
});
