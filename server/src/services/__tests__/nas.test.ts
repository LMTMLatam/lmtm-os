import { describe, expect, it } from "vitest";
import { firmarLinkArchivo, firmarLinkNas, rutaNas, verificarLinkArchivo, verificarLinkNas } from "../nas.js";
import { fueraDeEquipo, RAIZ } from "../video-agente.js";

describe("link firmado del NAS", () => {
  const ahora = 1_800_000_000_000;
  const s = "secreto";
  const ruta = "/LMTM/Clientes/Reno/VIDEO/a.b.mp4";

  it("devuelve la ruta mientras no vence (6 h)", () => {
    const f = firmarLinkNas(ruta, ahora, s)!;
    expect(verificarLinkNas(f.token, ahora + 5 * 3600_000, s)).toBe(ruta);
    expect(verificarLinkNas(f.token, ahora + 7 * 3600_000, s)).toBeNull();
  });

  it("rechaza otra clave, un cuerpo cambiado y basura", () => {
    const f = firmarLinkNas(ruta, ahora, s)!;
    const [, firma] = f.token.split(".");
    const otro = Buffer.from(JSON.stringify({ r: "/LMTM/otro.mp4", e: Math.floor(ahora / 1000) + 3600 })).toString("base64url");
    expect(verificarLinkNas(`${otro}.${firma}`, ahora, s)).toBeNull();
    expect(verificarLinkNas(f.token, ahora, "otra")).toBeNull();
    expect(verificarLinkNas("x", ahora, s)).toBeNull();
    expect(firmarLinkNas(ruta, ahora, null)).toBeNull();
  });

  it("no deja «..» en la ruta", () => {
    expect(rutaNas("/LMTM/../etc")).toBeNull();
  });
});

describe("lo que genera el equipo (13/11)", () => {
  const ahora = 1_800_000_000_000;

  it("un link de archivo generado no abre el NAS ni al revés", () => {
    const a = firmarLinkArchivo("/tmp/videos/equipo/x.mp4", ahora, "lmtm-archivo:s")!;
    expect(verificarLinkArchivo(a.token, ahora, "lmtm-archivo:s")).toBe("/tmp/videos/equipo/x.mp4");
    expect(verificarLinkNas(a.token, ahora, "lmtm-nas:s")).toBeNull();
    expect(verificarLinkArchivo(a.token, ahora + 7 * 3600_000, "lmtm-archivo:s")).toBeNull();
  });

  it("el conector del equipo solo escribe y baja bajo equipo/", () => {
    expect(fueraDeEquipo({ archivo: "equipo/brachetta/viernes13/clip-1.mp4", imagen: "https://x.com/a.jpg" })).toBeNull();
    expect(fueraDeEquipo({ archivo: `${RAIZ}/equipo/brachetta/voz.wav` })).toBeNull();
    expect(fueraDeEquipo({ archivo: "reno-placares/out.mp4" })).toMatch(/equipo\//);
    expect(fueraDeEquipo({ archivo: "equipo/../reno/out.mp4" })).toMatch(/equipo\//);
    expect(fueraDeEquipo({ archivo: "equipo/a.mp4", imagen: "reno/foto.jpg" })).toMatch(/imagen/);
    expect(fueraDeEquipo({ archivo: "equipo" })).toMatch(/equipo\//);
  });
});

import { originalDeProxy } from "../video-agente.js";

describe("proxies de cámara Sony (crudos_preparar, 18/11)", () => {
  it("del proxy al original", () => {
    expect(originalDeProxy("C0001S03.MP4")).toBe("C0001.MP4");
    expect(originalDeProxy("C0646S03.mp4")).toBe("C0646.mp4");
    expect(originalDeProxy("IMG_1234.MOV")).toBeNull();
  });
});
