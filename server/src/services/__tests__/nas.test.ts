import { describe, expect, it } from "vitest";
import { firmarLinkNas, rutaNas, verificarLinkNas } from "../nas.js";

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
