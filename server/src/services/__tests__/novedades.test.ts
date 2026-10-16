import { describe, expect, it } from "vitest";
import { elegir, mensajeParaCliente, novedadDeOptimizacion, novedadDeOrganico, novedadesDePauta, novedadesDeWeb, type DiaPauta } from "../novedades.js";
import { sumarDias } from "../google-web.js";

const HASTA = "2026-10-14";

/** 84 días: `semana(k)` da leads e inversión por día de la semana k (0 = la última). */
function serie(semana: (k: number) => { leads: number; inversion: number }): DiaPauta[] {
  const out: DiaPauta[] = [];
  for (let i = 0; i < 84; i++) {
    const k = Math.floor(i / 7);
    const s = semana(k);
    out.push({ fecha: sumarDias(HASTA, -i), leads: s.leads, inversion: s.inversion });
  }
  return out;
}
const tipos = (xs: Array<{ tipo: string }>) => xs.map((x) => x.tipo).sort();

describe("novedades de pauta", () => {
  it("semana récord de consultas, sin repetir 'subieron' de la misma semana", () => {
    const n = novedadesDePauta(serie((k) => (k === 0 ? { leads: 6, inversion: 6000 } : { leads: 3, inversion: 3000 })), HASTA);
    expect(tipos(n)).toContain("mejor_semana");
    expect(tipos(n)).not.toContain("consultas_suben_semana");
    expect(n.find((x) => x.tipo === "mejor_semana")!.detalle).toContain("42 consultas del 8/10 al 14/10");
  });

  it("más consultas no es noticia si cada una costó mucho más", () => {
    // +50% consultas pero el triple de inversión: cada consulta, el doble.
    const n = novedadesDePauta(serie((k) => (k === 0 ? { leads: 3, inversion: 9000 } : k === 1 ? { leads: 2, inversion: 2000 } : { leads: 4, inversion: 4000 })), HASTA);
    expect(tipos(n)).not.toContain("consultas_suben_semana");
  });

  it("más barato no es noticia si llegaron muchas menos", () => {
    const n = novedadesDePauta(serie((k) => (k === 0 ? { leads: 2, inversion: 1000 } : { leads: 4, inversion: 4000 })), HASTA);
    expect(tipos(n)).not.toContain("costo_baja_semana");
  });

  it("costo más bajo y por debajo del objetivo, con los números del período", () => {
    const n = novedadesDePauta(serie((k) => (k === 0 ? { leads: 4, inversion: 2000 } : { leads: 4, inversion: 4000 })), HASTA, { objetivo: 900 });
    expect(tipos(n)).toEqual(expect.arrayContaining(["mejor_costo", "debajo_objetivo"]));
    const costo = n.find((x) => x.tipo === "mejor_costo")!;
    expect(costo.detalle).toContain("$500 por consulta");
    expect(costo.detalle).toContain("$1.000");
  });

  it("sin volumen no hay noticia", () => {
    expect(novedadesDePauta(serie((k) => (k === 0 ? { leads: 1, inversion: 1000 } : { leads: 0.2, inversion: 1000 })), HASTA)).toEqual([]);
  });

  it("dice dónde cuando se dejó afuera una plataforma", () => {
    const n = novedadesDePauta(serie((k) => (k === 0 ? { leads: 6, inversion: 6000 } : { leads: 3, inversion: 3000 })), HASTA, { donde: " en Meta" });
    expect(n[0].titular).toMatch(/ en Meta$/);
  });
});

describe("novedades de web", () => {
  const AHORA = new Date("2026-10-15T15:00:00Z"); // Search Console hasta el 12/10
  const dias = (antes: number, ahora: number, hueco = false) =>
    Array.from({ length: 56 }, (_, i) => {
      const fecha = sumarDias("2026-10-12", -i);
      return { fecha, gscClics: hueco && i === 3 ? null : i < 28 ? ahora : antes, gscImpresiones: i < 28 ? ahora * 40 : antes * 40, gscPosicion: 8 } as never;
    });

  it("más visitas desde Google, 28 contra 28", () => {
    const n = novedadesDeWeb(dias(2, 3), AHORA);
    expect(n.map((x) => x.tipo)).toEqual(["google_visitas", "google_visibilidad"]);
    expect(n[0].titular).toBe("50% más visitas a la web desde Google");
  });
  it("con un día sin medir, nada", () => {
    expect(novedadesDeWeb(dias(2, 3, true), AHORA)).toEqual([]);
  });
});

describe("orgánico, optimizaciones y mensaje", () => {
  const post = (i: number, reacciones: number, red: "instagram" | "facebook" = "instagram") => ({
    fecha: sumarDias(HASTA, -i * 8), reacciones, comentarios: 0, compartidos: 0, texto: `post ${i}`, red,
  });

  it("la publicación destacada contra la mediana de la cuenta, con interacciones reales", () => {
    const posts = Array.from({ length: 10 }, (_, i) => post(i, 10));
    posts[1].reacciones = 35;
    posts[1].comentarios = 5;
    posts[7].reacciones = 90; // el récord de los 3 meses es otro, más viejo
    const n = novedadDeOrganico(posts, HASTA)!;
    expect(n.titular).toBe("Una publicación tuvo 4,0 veces la interacción habitual");
    expect(n.detalle).toBe("La del 6/10 en Instagram («post 1»): 35 reacciones, 5 comentarios. Una publicación típica de la cuenta tiene 10 interacciones.");
    expect(novedadDeOrganico(posts.slice(0, 5), HASTA)).toBeNull();
  });

  it("en una cuenta chica no dice 300 veces; y la mejor de 3 meses se dice así", () => {
    const posts = Array.from({ length: 10 }, (_, i) => post(i, 1, "facebook"));
    posts[0].reacciones = 300;
    expect(novedadDeOrganico(posts, HASTA)?.titular).toBe("La publicación con más interacción de los últimos 3 meses");
    posts[5].reacciones = 400;
    expect(novedadDeOrganico(posts, HASTA)?.titular).toBe("Una publicación tuvo más de 10 veces la interacción habitual");
  });

  it("una optimización solo si bajó el costo", () => {
    expect(novedadDeOptimizacion({ kind: "pause_ad_entity", entityType: "adset", nombre: "LLANTAS", antes: 1000, despues: 800 })?.titular)
      .toBe("Después de pausar el conjunto «LLANTAS», cada consulta cuesta 20% menos");
    expect(novedadDeOptimizacion({ kind: "pause_ad_entity", entityType: "adset", nombre: "x", antes: 800, despues: 900 })).toBeNull();
  });

  it("elige una por tipo, las más fuertes, y arma el WhatsApp", () => {
    const n = elegir([
      { tipo: "a", area: "pauta", titular: "A", detalle: "a.", fuerza: 1 },
      { tipo: "b", area: "web", titular: "B", detalle: "b.", fuerza: 3 },
      { tipo: "b", area: "web", titular: "B2", detalle: "b2.", fuerza: 2 },
    ]);
    expect(n.map((x) => x.titular)).toEqual(["B", "A"]);
    expect(mensajeParaCliente("RENO", n)).toContain("• *B.* b.");
    expect(mensajeParaCliente("RENO", [])).toBeNull();
  });
});
