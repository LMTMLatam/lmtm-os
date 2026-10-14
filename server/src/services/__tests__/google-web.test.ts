import { describe, expect, it } from "vitest";
import { diasGsc, elegirPorVisitas, elegirPropiedad, midiendoOtraUrl, elegirSitio, errorDeGoogle, hostDe, oportunidadesSeo, sumarDias, sumarVentana, ultimoDiaCompleto } from "../google-web.js";
import { propuestasWeb, type DatosWeb } from "../../decisiones/reglas/web.js";

const AHORA = new Date("2026-10-13T15:00:00Z"); // 13/10 12:00 en Buenos Aires

describe("de qué cliente es cada sitio", () => {
  it("dominio sin www, de URL o de propiedad de dominio", () => {
    expect(hostDe("https://www.Maers.com.ar/contacto")).toBe("maers.com.ar");
    expect(hostDe("maers.com.ar")).toBe("maers.com.ar");
    expect(hostDe("sc-domain:maers.com.ar")).toBe("maers.com.ar");
    expect(hostDe("")).toBeNull();
  });
  it("Search Console: dominio exacto, la propiedad de dominio gana, sin permiso no cuenta", () => {
    const sitios = [
      { sitio: "http://maers.com.ar/", permiso: "siteOwner", conexionId: "a" },
      { sitio: "sc-domain:maers.com.ar", permiso: "siteFullUser", conexionId: "a" },
      { sitio: "https://otro.com/", permiso: "siteOwner", conexionId: "a" },
    ];
    expect(elegirSitio("https://www.maers.com.ar/", sitios)?.sitio).toBe("sc-domain:maers.com.ar");
    expect(elegirSitio("https://maers.com.ar", [{ sitio: "https://maers.com.ar/", permiso: "siteUnverifiedUser", conexionId: "a" }])).toBeNull();
  });
  it("un subdominio no es el sitio de la agencia (CHARLOTT tiene de web crm.lmtmas.com)", () => {
    expect(elegirSitio("https://crm.lmtmas.com/", [{ sitio: "sc-domain:lmtmas.com", permiso: "siteOwner", conexionId: "a" }])).toBeNull();
  });
  it("Analytics: la única propiedad con un flujo de esa web; si hay dos, ninguna", () => {
    const p = (propiedad: string, hosts: string[]) => ({ propiedad, nombre: propiedad, cuenta: "x", hosts, conexionId: "a" });
    expect(elegirPropiedad("https://maers.com.ar", [p("properties/1", ["maers.com.ar"]), p("properties/2", ["otro.com"])]).elegida?.propiedad).toBe("properties/1");
    const doble = elegirPropiedad("https://maers.com.ar", [p("properties/1", ["maers.com.ar"]), p("properties/3", ["maers.com.ar"])]);
    expect(doble.elegida).toBeNull();
    expect(doble.candidatas).toHaveLength(2);
  });
});

describe("dos propiedades con la misma web", () => {
  it("se usa la que recibe visitas; si empatan o ninguna recibe, no se elige", () => {
    expect(elegirPorVisitas([{ p: "vieja", sesiones: 0 }, { p: "nueva", sesiones: 420 }])).toBe("nueva");
    expect(elegirPorVisitas([{ p: "a", sesiones: 0 }, { p: "b", sesiones: 0 }])).toBeNull();
    expect(elegirPorVisitas([{ p: "a", sesiones: 30 }, { p: "b", sesiones: 30 }])).toBeNull();
  });
});

describe("propiedad de Search Console que mide otra URL", () => {
  it("www vs sin www o http vs https: avisa; dominio o mismo origen: no", () => {
    expect(midiendoOtraUrl("https://www.maers.com.ar/", "https://maers.com.ar")).toBe("https://maers.com.ar");
    expect(midiendoOtraUrl("http://www.calidadaltecno.com.ar/", "https://calidadaltecno.com.ar")).toBe("https://calidadaltecno.com.ar");
    expect(midiendoOtraUrl("https://inbelt.com.ar/", "https://inbelt.com.ar")).toBeNull();
    expect(midiendoOtraUrl("sc-domain:maers.com.ar", "https://maers.com.ar")).toBeNull();
    expect(midiendoOtraUrl("https://www.maers.com.ar/", null)).toBeNull();
  });
});

describe("errores de Google", () => {
  it("API apagada: dice cuál y dónde habilitarla", () => {
    const e = errorDeGoogle(403, JSON.stringify({ error: { message: "x", details: [{ reason: "SERVICE_DISABLED", metadata: { serviceTitle: "Google Search Console API", activationUrl: "https://console.developers.google.com/apis/api/searchconsole.googleapis.com/overview?project=1" } }] } }));
    expect(e.codigo).toBe("api_apagada");
    expect(e.message).toContain("Google Search Console API");
    expect(e.message).toContain("project=1");
  });
});

describe("días de Search Console", () => {
  it("entre el primero y el último son 0 de verdad; después del último no hay dato", () => {
    const filas = [
      { keys: ["2026-10-01"], clicks: 3, impressions: 40, position: 7.25 },
      { keys: ["2026-10-03"], clicks: 1, impressions: 10, position: 9 },
    ];
    const d = diasGsc(filas, "2026-10-01");
    expect(d.map((x) => x.fecha)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(d[1]).toEqual({ fecha: "2026-10-02", clics: 0, impresiones: 0, posicion: null });
    expect(d[0].posicion).toBe(7.3);
    expect(diasGsc([], "2026-10-01")).toEqual([]);
  });
  it("ventanas que terminan donde el dato ya es final", () => {
    expect(ultimoDiaCompleto("gsc", AHORA)).toBe("2026-10-10");
    expect(ultimoDiaCompleto("ga", AHORA)).toBe("2026-10-11");
  });
});

type Dia = DatosWeb["dias"][number];
const dia = (fecha: string, o: Partial<Dia>): Dia => ({
  clientId: "c", fecha, gscClics: null, gscImpresiones: null, gscPosicion: null, gaSesiones: null, gaUsuarios: null, gaNuevos: null,
  gaComprometidas: null, gaEventosClave: null, updatedAt: new Date(), ...o,
});
const serie = (hasta: string, n: number, f: (i: number) => Partial<Dia>) => Array.from({ length: n }, (_, i) => dia(sumarDias(hasta, -i), f(i)));

describe("sumar una ventana", () => {
  it("null si la fuente no tiene días; posición ponderada por impresiones", () => {
    const ds = [dia("2026-10-01", { gscClics: 2, gscImpresiones: 100, gscPosicion: 4 }), dia("2026-10-02", { gscClics: 1, gscImpresiones: 300, gscPosicion: 8 })];
    const t = sumarVentana(ds, { desde: "2026-10-01", hasta: "2026-10-02" }, { desde: "2026-10-01", hasta: "2026-10-02" });
    expect(t.clics).toBe(3);
    expect(t.posicion).toBe(7);
    expect(t.sesiones).toBeNull();
    expect(t.diasConDato).toEqual({ gsc: 2, ga: 0 });
  });
});

describe("oportunidades de búsqueda", () => {
  it("posición 4 a 20 con impresiones; la mejor página por búsqueda", () => {
    const o = oportunidadesSeo([
      { clave: "aire acondicionado rosario", detalle: "/a", posicion: 8, impresiones: 500, clics: 4 },
      { clave: "aire acondicionado rosario", detalle: "/b", posicion: 12, impresiones: 120, clics: 0 },
      { clave: "maers", detalle: "/", posicion: 1, impresiones: 900, clics: 300 },
      { clave: "instalación split", detalle: "/c", posicion: 25, impresiones: 800, clics: 0 },
      { clave: "service aire", detalle: "/d", posicion: 6, impresiones: 50, clics: 0 },
    ]);
    expect(o).toEqual([{ consulta: "aire acondicionado rosario", pagina: "/a", posicion: 8, impresiones: 500, clics: 4 }]);
  });
});

describe("reglas de la web", () => {
  const base: DatosWeb = { clientId: "c", cliente: "MAERS", conGsc: true, conGa: true, conPauta: true, dias: [], consultas: [], landings: [], eventos: [] };
  const hastaG = ultimoDiaCompleto("gsc", AHORA);
  const hastaA = ultimoDiaCompleto("ga", AHORA);

  it("caída desde Google: solo con los 28 días medidos y volumen suficiente", () => {
    const dias = serie(hastaG, 28, (i) => ({ gscClics: i < 14 ? 3 : 8, gscImpresiones: 200, gscPosicion: 6 }));
    const p = propuestasWeb({ ...base, conGa: false, dias }, AHORA);
    expect(p.map((x) => x.tipo)).toEqual(["web:caida_google"]);
    expect(p[0].que).toContain("cayeron 63%");
    // Un día sin dato en la ventana: no se afirma nada.
    expect(propuestasWeb({ ...base, conGa: false, dias: dias.filter((_, i) => i !== 5) }, AHORA)).toEqual([]);
    // Poco volumen antes: tampoco.
    const chico = serie(hastaG, 28, (i) => ({ gscClics: i < 14 ? 1 : 4, gscImpresiones: 50, gscPosicion: 6 }));
    expect(propuestasWeb({ ...base, conGa: false, dias: chico }, AHORA)).toEqual([]);
  });

  it("búsquedas para subir: oportunidad con su tarea", () => {
    const consultas = ["a", "b", "c"].map((k) => ({ clave: `consulta ${k}`, detalle: "https://maers.com.ar/x", posicion: 9, impresiones: 300, clics: 2 }));
    const [p] = propuestasWeb({ ...base, conGa: false, consultas }, AHORA);
    expect(p.tipo).toBe("contenido:busquedas");
    expect(p.accion).toMatchObject({ tipo: "tarea" });
    expect((p.accion as { descripcion: string }).descripcion).toContain("→ /x");
  });

  it("pauta sin conversiones medidas: con los 28 días, visitas y 0 eventos clave", () => {
    const dias = serie(hastaA, 28, () => ({ gaSesiones: 20, gaComprometidas: 10, gaEventosClave: 0 }));
    const eventos = [{ clave: "page_view", sesiones: 900, eventosClave: 0 }, { clave: "click_whatsapp", sesiones: 40, eventosClave: 0 }];
    const p = propuestasWeb({ ...base, conGsc: false, dias, eventos }, AHORA);
    expect(p.map((x) => x.tipo)).toEqual(["web:sin_conversiones"]);
    expect((p[0].accion as { descripcion: string }).descripcion).toContain("click_whatsapp");
    expect(propuestasWeb({ ...base, conGsc: false, conPauta: false, dias, eventos }, AHORA)).toEqual([]);
    const conUna = dias.map((d, i) => (i === 3 ? { ...d, gaEventosClave: 1 } : d));
    expect(propuestasWeb({ ...base, conGsc: false, dias: conUna, eventos }, AHORA)).toEqual([]);
  });

  it("landing de pauta floja: mucho peor que el resto del sitio", () => {
    const dias = serie(hastaA, 28, () => ({ gaSesiones: 100, gaComprometidas: 60, gaEventosClave: 2 }));
    const landings = [
      { clave: "/promo", detalle: "Paid Social", sesiones: 400, compromiso: 0.2 },
      { clave: "/", detalle: "Organic Search", sesiones: 900, compromiso: 0.1 },
      { clave: "/chica", detalle: "Paid Search", sesiones: 50, compromiso: 0.05 },
    ];
    const p = propuestasWeb({ ...base, conGsc: false, dias, landings }, AHORA);
    expect(p.map((x) => x.tipo)).toEqual(["pauta:landing"]);
    expect(p[0].que).toContain("/promo (80% se va)");
    const conCampanas = propuestasWeb({ ...base, conGsc: false, dias, landings, campanasPorPagina: { "/promo": ["PROMO OCTUBRE"] } }, AHORA);
    expect(conCampanas[0].porque.resumen).toContain("«PROMO OCTUBRE»");
  });
});
