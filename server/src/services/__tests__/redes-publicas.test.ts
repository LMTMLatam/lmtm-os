import { describe, expect, it } from "vitest";
import { idDePaginaFacebook, parsearPaginaFacebook, parsearPerfilInstagram, resumenParaAgente } from "../redes-publicas.js";

const nodo = (o: Record<string, unknown>) => ({ node: { id: "1", taken_at_timestamp: 1748622051, ...o } });

describe("lector propio: Instagram", () => {
  it("lee perfil y publicaciones; reel, carrusel y me gusta ocultos", () => {
    const p = parsearPerfilInstagram({
      data: {
        user: {
          username: "Hotel.Costa", full_name: "Hotel Costa", is_private: false, is_business_account: true,
          category_name: "Hotel", edge_followed_by: { count: 5400 },
          edge_owner_to_timeline_media: {
            edges: [
              nodo({ id: "11", shortcode: "AAA", product_type: "clips", is_video: true, edge_liked_by: { count: 120 }, edge_media_to_comment: { count: 4 }, edge_media_to_caption: { edges: [{ node: { text: "Atardecer" } }] } }),
              nodo({ id: "12", shortcode: "BBB", __typename: "GraphSidecar", edge_liked_by: { count: -1 }, edge_media_to_comment: { count: 2 } }),
              { node: { id: "13" } }, // sin fecha: se descarta
            ],
          },
        },
      },
    })!;
    expect(p).toMatchObject({ usuario: "hotel.costa", seguidores: 5400, privado: false, empresa: true, categoria: "Hotel" });
    expect(p.posts).toHaveLength(2);
    expect(p.posts[0]).toMatchObject({ formato: "reel", meGusta: 120, comentarios: 4, texto: "Atardecer", permalink: "https://www.instagram.com/reel/AAA/" });
    expect(p.posts[1]).toMatchObject({ formato: "carousel", meGusta: null, permalink: "https://www.instagram.com/p/BBB/" });
  });

  it("usuario que no existe o formato desconocido: null, nunca un perfil inventado", () => {
    expect(parsearPerfilInstagram({ data: { user: null }, status: "ok" })).toBeNull();
    expect(parsearPerfilInstagram({ algo: "distinto" })).toBeNull();
  });
});

describe("lector propio: Facebook", () => {
  it("saca la página de la URL cargada", () => {
    expect(idDePaginaFacebook("https://www.facebook.com/HotelCosta/")).toBe("hotelcosta");
    expect(idDePaginaFacebook("facebook.com/profile.php?id=1234567")).toBe("1234567");
    expect(idDePaginaFacebook("https://m.facebook.com/pg/inmo.sur/posts")).toBe("inmo.sur");
    expect(idDePaginaFacebook("https://www.facebook.com/groups/123")).toBeNull();
    expect(idDePaginaFacebook("www.hotelcosta.com.ar")).toBeNull();
    expect(idDePaginaFacebook("https://massa1950.com.ar/")).toBeNull();
    expect(idDePaginaFacebook("https://www.facebook.com/ads/library/?active_status=active&country=AR&view_all_page_id=100861396733459")).toBe("100861396733459");
    expect(idDePaginaFacebook("https://www.facebook.com/ads/library/?q=hotel")).toBeNull();
  });

  it("reacciones como me gusta, reel por el link, álbum es carrusel", () => {
    const p = parsearPaginaFacebook("hotelcosta", {
      name: "Hotel Costa", followers_count: 900,
      posts: { data: [
        { id: "a", message: "Hola", created_time: "2026-10-01T12:00:00+0000", permalink_url: "https://www.facebook.com/reel/9/", reactions: { summary: { total_count: 40 } }, comments: { summary: { total_count: 5 } } },
        { id: "b", created_time: "2026-10-02T12:00:00+0000", attachments: { data: [{ media_type: "album" }] } },
      ] },
    });
    expect(p).toMatchObject({ red: "facebook", nombre: "Hotel Costa", seguidores: 900 });
    expect(p.posts[0]).toMatchObject({ id: "fb:a", formato: "reel", meGusta: 40, comentarios: 5 });
    expect(p.posts[1]).toMatchObject({ formato: "carousel", meGusta: null, comentarios: null });
  });
});

describe("resumen para agentes", () => {
  it("cada publicación contra lo normal de su cuenta; null si oculta los me gusta", () => {
    const base = { red: "instagram" as const, usuario: "x", nombre: null, seguidores: 1, privado: false, empresa: null, categoria: null };
    const post = (meGusta: number | null) => ({ id: String(meGusta), texto: null, formato: "photo" as const, meGusta, comentarios: 0, publicadoAt: new Date("2026-10-01"), permalink: null });
    const r = resumenParaAgente({ ...base, posts: [post(10), post(20), post(40), post(null)] });
    expect(r.interaccionNormal).toBe(20);
    expect(r.publicaciones.map((p) => p.vecesLoNormal)).toEqual([0.5, 1, 2, null]);
  });
});
