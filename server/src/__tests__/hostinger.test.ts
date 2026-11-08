import { describe, expect, it } from "vitest";
import { accionDesdeParametros, esAccionWeb, hostDe, pedidoDeAccion, websDelDominio, type WebHostinger } from "../services/hostinger.js";

const web = (domain: string, username = "u1"): WebHostinger => ({ domain, username, website_type: "wordpress", is_enabled: true });

describe("dueño de la web", () => {
  it("normaliza la web de la Marca", () => {
    expect(hostDe("https://www.Lmtm.com.ar/")).toBe("lmtm.com.ar");
    expect(hostDe("lmtm.com.ar")).toBe("lmtm.com.ar");
    expect(hostDe(null)).toBe("");
  });

  it("toma el dominio y sus subdominios, nunca uno que solo termina igual", () => {
    const webs = [web("sustenta.ar"), web("cuentas.sustenta.ar"), web("nosustenta.ar"), web("otra.com")];
    expect(websDelDominio("sustenta.ar", webs).map((w) => w.domain)).toEqual(["sustenta.ar", "cuentas.sustenta.ar"]);
    expect(websDelDominio("", webs)).toEqual([]);
  });
});

describe("acciones permitidas", () => {
  it("rechaza lo que no está en la lista cerrada", () => {
    expect(typeof accionDesdeParametros({ accion: "borrar_web" })).toBe("string");
    expect(typeof accionDesdeParametros({ accion: "actualizar_plugins", plugins: [] })).toBe("string");
    expect(typeof accionDesdeParametros({ accion: "actualizar_plugins", plugins: ["../x"] })).toBe("string");
    expect(typeof accionDesdeParametros({ accion: "version_php", version: "8" })).toBe("string");
  });

  it("actualizar WordPress es versión menor salvo que se pida otra cosa", () => {
    expect(accionDesdeParametros({ accion: "actualizar_wordpress" })).toEqual({ accion: "actualizar_wordpress", soloMenor: true });
  });

  it("arma el pedido exacto y exige WordPress donde hace falta", () => {
    const w = web("lmtm.com.ar", "u9");
    const a = accionDesdeParametros({ accion: "actualizar_plugins", plugins: ["wpforms-lite"] });
    if (typeof a === "string") throw new Error(a);
    expect(pedidoDeAccion(w, { id: "7", username: "u9", domain: "lmtm.com.ar", directory: "" }, a)).toEqual({
      method: "POST", path: "/api/hosting/v1/accounts/u9/wordpress/7/plugins/update", body: { plugins: ["wpforms-lite"] },
    });
    expect(typeof pedidoDeAccion(w, null, a)).toBe("string");
    expect(pedidoDeAccion(w, null, { accion: "forzar_https" })).toEqual({
      method: "PATCH", path: "/api/hosting/v1/accounts/u9/websites/lmtm.com.ar/ssl/https-redirect/toggle", body: { is_enabled: true },
    });
  });

  it("un payload de aprobación mal formado no se ejecuta", () => {
    expect(esAccionWeb({ clientId: "c", dominio: "d", accion: { accion: "borrar_web" } })).toBe(false);
    expect(esAccionWeb({ clientId: "c", dominio: "d", accion: { accion: "purgar_cache" } })).toBe(true);
  });
});
