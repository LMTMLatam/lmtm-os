import { describe, expect, it } from "vitest";
import { instagramEnHtml, usuarioDeCompetidor } from "../competencia-ig.js";
import {
  baseArchivo, codigoDeLink, estadoVisible, evidenciaDe, guiaDe, leerTipos, limpiarContenido, medirVideos, mezclarReglas, motivoDe, resolverCadena, slugDe, tiposPara, vigenteDe, type Viral,
} from "../video-tipos.js";

const dia = 86_400_000;
const ahora = new Date("2026-11-10T12:00:00Z");
const post = (usuario: string, interaccion: number, diasAtras: number, formato = "reel", id = `${usuario}-${interaccion}-${diasAtras}`) => ({
  id, usuario, formato, interaccion, fecha: new Date(ahora.getTime() - diasAtras * dia), permalink: null, texto: "x", tipo: "recorrido",
});

describe("Tipos de video (09/11)", () => {
  it("un video es viral contra lo normal de SU cuenta, no por números absolutos", () => {
    // Cuenta chica: lo normal es 10; un reel de 40 son 4 veces lo normal.
    const chica = [...Array.from({ length: 8 }, (_, i) => post("chica", 10, 10 + i, "photo")), post("chica", 40, 5)];
    // Cuenta grande: lo normal es 1000; un reel de 1500 son 1,5 veces.
    const grande = [...Array.from({ length: 8 }, (_, i) => post("grande", 1000, 10 + i, "photo")), post("grande", 1500, 5)];
    const m = medirVideos([...chica, ...grande], ahora);
    expect(m.find((p) => p.usuario === "chica")?.veces).toBe(4);
    expect(m.find((p) => p.usuario === "grande")?.veces).toBe(1.5);
  });

  it("sin publicaciones suficientes no hay «normal» y no se mide; lo viejo queda fuera de la ventana", () => {
    expect(medirVideos([post("poca", 10, 5), post("poca", 50, 6)], ahora)).toEqual([]);
    const cuenta = [...Array.from({ length: 8 }, (_, i) => post("c", 10, 10 + i, "photo")), post("c", 90, 120)];
    expect(medirVideos(cuenta, ahora)).toEqual([]);
  });

  it("la evidencia cuenta solo virales medidos y cuentas distintas", () => {
    const v = (id: string, cuenta: string, veces: number | null): Viral => ({ id, url: null, cuenta, nicho: "inmobiliaria", tipo: "recorrido", fecha: "", interaccion: null, normal: null, veces, texto: "", fuente: "sistema" });
    expect(evidenciaDe([v("1", "a", 4), v("2", "a", 3), v("3", "b", 5), v("4", "c", null), v("5", "d", 2)])).toEqual({ virales: 3, cuentas: 2, ids: ["1", "2", "3"] });
  });

  it("un agente no puede sacar ni cambiar las reglas de las personas", () => {
    const antes = [
      { id: "p1", texto: "Siempre el precio en pantalla", origen: "persona" as const },
      { id: "a1", texto: "Gancho con pregunta", origen: "agente" as const },
    ];
    const r = mezclarReglas(antes, [{ texto: "siempre el precio en pantalla" }, { texto: "Cortes cada 2 s", viral: "v9" }]);
    expect(r.map((x) => x.texto)).toEqual(["Siempre el precio en pantalla", "Cortes cada 2 s"]);
    expect(r[1]).toMatchObject({ origen: "agente", viral: "v9" });
  });

  it("el perfil sale con el formato del kit y con valores en rango", () => {
    const c = limpiarContenido({ objetivo: "Mostrar la propiedad", duracion: [20, 45], perfil: { reel: { pausa: 0.1, estilo: "neon", zoom: 0.5, sfx: true, vol_musica: -20 } } }, "inmobiliaria", "recorrido");
    expect(c.perfil).toEqual({ nombre: "inmobiliaria__recorrido", descripcion: "Mostrar la propiedad", reel: { pausa: 0.35, zoom: 0, sfx: true, vol_musica: -20 }, duracion: [20, 45] });
  });

  it("vigente = última aprobada; una aprobada hace más de 90 días es vieja", () => {
    const f = (version: number, estado: string, aprobadaAt: Date | null = null) => ({ version, estado, aprobadaAt } as never);
    expect((vigenteDe([f(1, "aprobada"), f(2, "borrador")]) as { version: number }).version).toBe(1);
    expect((vigenteDe([f(1, "borrador"), f(2, "lista")]) as { version: number }).version).toBe(2);
    expect(estadoVisible(f(1, "aprobada", new Date(ahora.getTime() - 100 * dia)), ahora)).toBe("vieja");
    expect(estadoVisible(null)).toBe("sin-plantilla");
  });

  it("el modelo solo puede contestar tipos del catálogo u «otro»", () => {
    const m = leerTipos('ok [{"i":0,"tipo":"recorrido"},{"i":1,"tipo":"inventado"},{"i":2,"tipo":"otro"},{"i":9,"tipo":"producto"}]', [0, 1, 2], new Set(["recorrido", "producto"]));
    expect([...m]).toEqual([[0, "recorrido"], [2, "otro"]]);
  });

  it("la guía marca las reglas del equipo", () => {
    const g = guiaDe("inmobiliaria", "recorrido", { reglas: [{ id: "1", texto: "Precio en pantalla", origen: "persona" }] });
    expect(g).toContain("Precio en pantalla _(del equipo: no se negocia)_");
  });

  it("links y usuarios: el Instagram puede estar en «sitio web» o enlazado desde la web", () => {
    expect(codigoDeLink("https://www.instagram.com/reel/C9xY_1/?igsh=1")).toBe("C9xY_1");
    expect(codigoDeLink("https://www.instagram.com/squadra/p/ABC/")).toBe("ABC");
    expect(usuarioDeCompetidor({ ig: null, web: "https://www.instagram.com/squadrapropiedades/" })).toBe("squadrapropiedades");
    expect(usuarioDeCompetidor({ ig: null, web: "https://lattuca.com.ar/" })).toBeNull();
    const html = '<a href="https://www.instagram.com/p/XYZ">x</a><a href="https://instagram.com/lattuca.prop/">ig</a><a href="https://www.instagram.com/lattuca.prop">ig</a><a href="https://instagram.com/otra">';
    expect(instagramEnHtml(html)).toBe("lattuca.prop");
    expect(instagramEnHtml("<p>sin redes</p>")).toBeNull();
  });

  it("alcance (11/11): la del cliente gana; si no tiene, hereda del rubro y después la general; las reglas se suman sin repetir", () => {
    const f = (nicho: string, version: number, estado: string, reglas: string[]) => ({
      nicho, version, estado, aprobadaAt: null,
      contenido: { objetivo: nicho, reglas: reglas.map((texto, i) => ({ id: `${nicho}${i}`, texto, origen: "persona" })) },
    } as never);
    const niveles = (cli: never[], rub: never[], gen: never[]) => [
      { clave: "cliente:reno", nombre: "RENO", versiones: cli },
      { clave: "amoblamientos", nombre: "amoblamientos", versiones: rub },
      { clave: "todos", nombre: "general", versiones: gen },
    ];
    const conTodo = resolverCadena(niveles([f("cliente:reno", 1, "borrador", ["Logo arriba"])], [f("amoblamientos", 2, "aprobada", ["Precio en pantalla", "logo arriba"])], [f("todos", 1, "aprobada", ["Subtítulos siempre"])]));
    expect(conTodo.efectiva?.clave).toBe("cliente:reno");
    expect(conTodo.heredada?.clave).toBe("amoblamientos");
    expect(conTodo.reglas.map((r) => [r.texto, r.desde ?? null])).toEqual([["Logo arriba", null], ["Precio en pantalla", "de amoblamientos"], ["Subtítulos siempre", "general"]]);
    const soloGeneral = resolverCadena(niveles([], [], [f("todos", 1, "aprobada", ["Subtítulos siempre"])]));
    expect(soloGeneral.propia).toBeNull();
    expect(soloGeneral.efectiva?.clave).toBe("todos");
    expect(resolverCadena(niveles([], [], [])).efectiva).toBeNull();
    // El cliente solo sumó una regla: la plantilla sigue siendo la del rubro, con la regla del cliente primero.
    const soloRegla = { nicho: "cliente:reno", version: 1, estado: "borrador", aprobadaAt: null, contenido: { reglas: [{ id: "r", texto: "Logo arriba", origen: "persona" }] } } as never;
    const r = resolverCadena(niveles([soloRegla], [f("amoblamientos", 1, "aprobada", ["Precio en pantalla"])], []));
    expect(r.efectiva?.clave).toBe("amoblamientos");
    expect(r.reglas.map((x) => x.texto)).toEqual(["Logo arriba", "Precio en pantalla"]);
  });

  it("tipos propios: un cliente ve los generales, los de su rubro y los suyos; nombres de archivo sin «:»", () => {
    const tipos = [{ slug: "promo", alcance: "todos" }, { slug: "obra", alcance: "amoblamientos" }, { slug: "showroom", alcance: "cliente:reno" }, { slug: "ajeno", alcance: "cliente:otro" }];
    expect(tiposPara(tipos, { cadena: ["cliente:reno", "amoblamientos", "todos"] }).map((t) => t.slug)).toEqual(["promo", "obra", "showroom"]);
    expect(tiposPara(tipos, { cadena: ["todos"] }).map((t) => t.slug)).toEqual(["promo"]);
    expect(baseArchivo("cliente:reno")).toBe("reno");
    expect(baseArchivo("todos")).toBe("general");
    expect(slugDe("  Promo Flash ¡Ya! ")).toBe("promo-flash-ya");
    expect(slugDe("Recorrido de Obra")).toBe("recorrido-de-obra");
  });
});

describe("Validación por plantilla (plan 17/11, fase 4.3)", () => {
  it("el motivo sale del botón del panel («Motivo: texto»); escrito a mano cuenta como «otro»", () => {
    expect(motivoDe("Gancho flojo: arranca con el logo")).toBe("Gancho flojo");
    expect(motivoDe("Toma mal elegida: se ve movida")).toBe("Toma mal elegida");
    expect(motivoDe("no me gustó la música")).toBe("otro");
    expect(motivoDe("Esto es un texto largo que tiene dos puntos: después")).toBe("otro");
    expect(motivoDe(null)).toBe("otro");
  });
});
