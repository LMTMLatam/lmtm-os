// Comparar contenido entre cuentas sin premiar al que tiene más seguidores
// (pedido 7/10). Cada publicación se mide contra lo normal de SU cuenta.
import { describe, expect, it } from "vitest";
import { analizarPublicaciones, mediana, MIN_POR_CUENTA, type PublicacionMedida } from "../contenido-analisis.js";
import { leerClasificacion } from "../contenido-angulos.js";

let n = 0;
function pub(clientId: string, engagement: number, extra: Partial<PublicacionMedida> = {}): PublicacionMedida {
  n += 1;
  return {
    id: `p${n}`, clientId, cliente: clientId.toUpperCase(), slug: clientId, nicho: "inmobiliaria",
    red: "instagram", formato: "reel", angulo: "vitrina", engagement, fecha: "2026-09-01",
    permalink: `https://www.instagram.com/p/${n}`, texto: `post ${n}`, ...extra,
  };
}
/** Una cuenta con `base` de interacción normal y algunas publicaciones de otro ángulo. */
function cuenta(id: string, base: number, especiales: Array<{ angulo: string; engagement: number }>): PublicacionMedida[] {
  const normales = Array.from({ length: MIN_POR_CUENTA }, () => pub(id, base));
  return [...normales, ...especiales.map((e) => pub(id, e.engagement, { angulo: e.angulo }))];
}

describe("analizarPublicaciones", () => {
  it("la cuenta grande no gana por tamaño: se compara contra lo normal de cada una", () => {
    // Cuenta grande: lo normal es 1000 y "cliente-real" saca 1500 (1,5×).
    // Cuenta chica: lo normal es 10 y "cliente-real" saca 30 (3×).
    const pubs = [
      ...cuenta("grande", 1000, Array.from({ length: 3 }, () => ({ angulo: "cliente-real", engagement: 1500 }))),
      ...cuenta("chica", 10, Array.from({ length: 3 }, () => ({ angulo: "cliente-real", engagement: 30 }))),
    ];
    const a = analizarPublicaciones(pubs, 180);
    const cr = a.angulos.find((f) => f.clave === "cliente-real")!;
    expect(cr.cuentas).toBe(2);
    expect(cr.publicaciones).toBe(6);
    expect(cr.mejor.cliente).toBe("CHICA"); // 3× gana a 1,5× aunque 30 < 1500
    expect(cr.mejor.indice).toBe(3);
  });

  it("no afirma nada con una sola cuenta", () => {
    const pubs = cuenta("unica", 10, Array.from({ length: 6 }, () => ({ angulo: "mito", engagement: 50 })));
    expect(analizarPublicaciones(pubs, 180).angulos.find((f) => f.clave === "mito")).toBeUndefined();
  });

  it("una cuenta con menos publicaciones que el mínimo no tiene 'normal' y no entra", () => {
    const pubs = Array.from({ length: MIN_POR_CUENTA - 1 }, () => pub("nueva", 100));
    expect(analizarPublicaciones(pubs, 180).publicaciones).toBe(0);
  });

  it("si lo normal de la cuenta es casi cero, no se inventa un índice", () => {
    // Página de Facebook con 1 interacción por post: un post con 430 no es "430×".
    const pubs = [...Array.from({ length: MIN_POR_CUENTA }, () => pub("muda", 1)), pub("muda", 430)];
    expect(analizarPublicaciones(pubs, 180).publicaciones).toBe(0);
  });

  it("propone el ángulo que funciona en el rubro y la cuenta no usa", () => {
    const pubs = [
      ...cuenta("a", 10, Array.from({ length: 3 }, () => ({ angulo: "detras-de-escena", engagement: 40 }))),
      ...cuenta("b", 20, Array.from({ length: 3 }, () => ({ angulo: "detras-de-escena", engagement: 60 }))),
      ...cuenta("c", 10, []), // nunca lo usó
    ];
    const a = analizarPublicaciones(pubs, 180);
    const c = a.clientes.find((x) => x.clientId === "c")!;
    expect(c.oportunidad?.angulo).toBe("detras-de-escena");
    expect(c.oportunidad?.usosPropios).toBe(0);
    expect(a.clientes.find((x) => x.clientId === "a")!.oportunidad?.angulo).not.toBe("detras-de-escena");
  });

  it("para reutilizar: solo lo que dobló lo normal, con piso de interacción, y máximo 3 por cuenta", () => {
    const pubs = cuenta("x", 10, [
      ...Array.from({ length: 5 }, () => ({ angulo: "mito", engagement: 40 })),
      { angulo: "mito", engagement: 15 }, // 1,5×: no
    ]);
    const r = analizarPublicaciones(pubs, 180).reutilizar;
    expect(r).toHaveLength(3);
    expect(r.every((e) => e.indice >= 2)).toBe(true);
  });

  it("mediana", () => {
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([4, 1, 3, 2])).toBe(2.5);
    expect(mediana([])).toBe(0);
  });
});

describe("leerClasificacion", () => {
  it("acepta solo ids de ángulo conocidos y posiciones que se mandaron", () => {
    const m = leerClasificacion('ok: [{"i":0,"angulo":"mito"},{"i":1,"angulo":"inventado"},{"i":7,"angulo":"vitrina"}]', [0, 1, 2]);
    expect([...m]).toEqual([[0, "mito"]]);
  });
  it("respuesta ilegible = nada clasificado (no se adivina)", () => {
    expect(leerClasificacion("no sé", [0]).size).toBe(0);
  });
});
