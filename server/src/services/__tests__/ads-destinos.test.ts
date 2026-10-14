import { describe, expect, it } from "vitest";
import { destinoDeAnuncio, destinoParaAgente, resumirDestinos, rutaDe } from "../ads-destinos.js";

describe("adónde manda cada anuncio", () => {
  it("Meta: formulario, WhatsApp, mensajes, perfil y web", () => {
    expect(destinoDeAnuncio("meta", { creative: { call_to_action_type: "GET_QUOTE", object_story_spec: { link_data: { call_to_action: { value: { lead_gen_form_id: "1" } } } } } })?.tipo).toBe("formulario");
    expect(destinoDeAnuncio("meta", { creative: { call_to_action_type: "WHATSAPP_MESSAGE" } })?.tipo).toBe("whatsapp");
    expect(destinoDeAnuncio("meta", { creative: { call_to_action_type: "LEARN_MORE", object_story_spec: { link_data: { link: "https://api.whatsapp.com/send" } } } })?.tipo).toBe("whatsapp");
    expect(destinoDeAnuncio("meta", { creative: { call_to_action_type: "MESSAGE_PAGE" } })?.tipo).toBe("mensajes");
    expect(destinoDeAnuncio("meta", { creative: { call_to_action_type: "VIEW_INSTAGRAM_PROFILE" } })?.tipo).toBe("perfil");
    expect(destinoDeAnuncio("meta", { creative: { call_to_action_type: "LEARN_MORE", object_story_spec: { link_data: { link: "https://www.amoblamientosreno.com/cotizar" } } } }))
      .toEqual({ tipo: "web", url: "https://www.amoblamientosreno.com/cotizar" });
    expect(destinoDeAnuncio("meta", { creative: { object_story_spec: { page_id: "1", instagram_user_id: "2" } } })?.tipo).toBe("publicacion");
    expect(destinoDeAnuncio("meta", { creative: {} })).toBeNull();
  });
  it("Google: el final_url del anuncio", () => {
    expect(destinoDeAnuncio("google", { final_urls: ["https://www.mapropiedades.com.ar/index.php?x=1"] })?.tipo).toBe("web");
    expect(destinoDeAnuncio("google", {})).toBeNull();
  });
  it("la ruta como la guarda Analytics", () => {
    expect(rutaDe("https://www.amoblamientosreno.com/cotizar/?utm_source=fb")).toBe("/cotizar");
    expect(rutaDe("https://distrillantas.com.ar/")).toBe("/");
  });
  it("por campaña: el destino de la mayoría, y su página medida", () => {
    const d = resumirDestinos([
      { campaignId: "c1", destino: { tipo: "web", url: "https://x.com/cotizar" } },
      { campaignId: "c1", destino: { tipo: "web", url: "https://x.com/cotizar?a=1" } },
      { campaignId: "c1", destino: { tipo: "whatsapp", url: null } },
      { campaignId: "c2", destino: { tipo: "whatsapp", url: null } },
    ]);
    expect(d.get("c1")).toEqual({ tipo: "web", paginas: ["/cotizar"] });
    expect(destinoParaAgente(d.get("c2"), new Map())).toEqual({ tipo: "whatsapp" });
    const landings = new Map([["/cotizar", { sesiones: 300, interaccionPct: 22.5, eventosClave: 0, desde: "2026-09-14", hasta: "2026-10-11" }]]);
    expect(destinoParaAgente(d.get("c1"), landings)?.landing).toMatchObject({ pagina: "/cotizar", sesiones: 300, eventosClave: 0 });
    expect(destinoParaAgente(d.get("c1"), new Map())?.landing).toBeNull();
  });
});
