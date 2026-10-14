// LMTM-OS: adónde manda cada campaña y cómo rinde esa página en la web (14/10).
//
// Pedido: "que la optimización de campañas se compagine con la página web, que
// de ahí saque info, que todo se nutra entre sí".
//
// Hasta acá el media buyer juzgaba una campaña solo por sus números en Meta o
// Google. Con un CPL alto proponía pausar, aunque el problema estuviera
// DESPUÉS del clic: una página lenta o de la que la gente se va sin hacer nada.
// Esto le da a cada campaña su destino (WhatsApp, formulario de Meta,
// mensajes, perfil o una página de la web) y, si es la web, lo que dice
// Analytics de esa página con tráfico pago: visitas, cuántas interactúan y
// cuántos eventos clave.
//
// De dónde sale: Meta guarda el destino en el creativo (call_to_action y el
// link del object_story_spec); Google, en los final_urls del anuncio, colgado
// del grupo de anuncios (ads_adsets guarda la campaña como
// "customers/X/campaigns/ID", por eso se normaliza). Analytics: web_ranking
// tipo "landing" (28 días), solo los canales pagos.

import type { Db } from "@paperclipai/db";
import { sql } from "drizzle-orm";

/** publicacion = posteo promocionado: el anuncio es el post y no lleva a ningún lado (se mide por interacción, no por CPL). */
export type TipoDestino = "web" | "whatsapp" | "formulario" | "mensajes" | "perfil" | "llamada" | "publicacion";

const WA = /(api\.whatsapp\.com|wa\.me\/|whatsapp:\/\/)/i;
const MSG = /(m\.me\/|messenger\.com|messenger_doc|ig\.me\/)/i;
const RED = /(instagram\.com|facebook\.com|fb\.me\/|fb\.com\/|about\.meta\.com)/i;

/** El destino de un anuncio, por su JSON crudo. null = no se puede saber. Pura. */
export function destinoDeAnuncio(platform: string, raw: unknown): { tipo: TipoDestino; url: string | null } | null {
  const r = (raw ?? {}) as Record<string, any>;
  if (platform === "google") {
    const url = Array.isArray(r.final_urls) ? r.final_urls[0] : null;
    if (typeof url !== "string" || !url) return null;
    return WA.test(url) ? { tipo: "whatsapp", url: null } : { tipo: "web", url };
  }
  const c = (r.creative ?? {}) as Record<string, any>;
  if (JSON.stringify(c).includes("lead_gen_form_id")) return { tipo: "formulario", url: null };
  const cta = String(c.call_to_action_type ?? "");
  const spec = (c.object_story_spec ?? {}) as Record<string, any>;
  const link: string | null =
    spec.link_data?.link ?? spec.link_data?.call_to_action?.value?.link ?? spec.video_data?.call_to_action?.value?.link ?? spec.template_data?.link ??
    c.call_to_action?.value?.link ?? null;
  if (cta === "WHATSAPP_MESSAGE" || (link && WA.test(link))) return { tipo: "whatsapp", url: null };
  if (cta === "MESSAGE_PAGE" || cta === "INSTAGRAM_MESSAGE" || (link && MSG.test(link))) return { tipo: "mensajes", url: null };
  if (cta === "CALL_NOW") return { tipo: "llamada", url: null };
  if (cta === "VIEW_INSTAGRAM_PROFILE" || (link && RED.test(link))) return { tipo: "perfil", url: null };
  if (link && /^https?:\/\//i.test(link)) return { tipo: "web", url: link };
  // Solo la página o la cuenta de Instagram, sin botón ni link: es un posteo promocionado.
  if (!cta && (spec.page_id || spec.instagram_user_id) && !spec.link_data && !spec.video_data) return { tipo: "publicacion", url: null };
  return null;
}

/** La ruta de una URL como la guarda Analytics en landingPage: sin dominio, query ni barra final. Pura. */
export function rutaDe(url: string): string | null {
  try {
    const p = decodeURI(new URL(url).pathname).replace(/\/+$/, "");
    return p || "/";
  } catch {
    return null;
  }
}

export interface DestinoCampana {
  /** El destino de la mayoría de sus anuncios. */
  tipo: TipoDestino;
  /** Si va a la web: las rutas (hasta 3), de la más usada a la menos. */
  paginas: string[];
}

/** Junta los destinos de los anuncios por campaña. Pura. */
export function resumirDestinos(anuncios: Array<{ campaignId: string; destino: { tipo: TipoDestino; url: string | null } | null }>): Map<string, DestinoCampana> {
  const por = new Map<string, { tipos: Map<TipoDestino, number>; rutas: Map<string, number> }>();
  for (const a of anuncios) {
    if (!a.destino) continue;
    const x = por.get(a.campaignId) ?? { tipos: new Map(), rutas: new Map() };
    x.tipos.set(a.destino.tipo, (x.tipos.get(a.destino.tipo) ?? 0) + 1);
    const ruta = a.destino.url ? rutaDe(a.destino.url) : null;
    if (ruta) x.rutas.set(ruta, (x.rutas.get(ruta) ?? 0) + 1);
    por.set(a.campaignId, x);
  }
  const out = new Map<string, DestinoCampana>();
  for (const [id, x] of por) {
    const tipo = [...x.tipos].sort((a, b) => b[1] - a[1])[0][0];
    out.set(id, { tipo, paginas: tipo === "web" ? [...x.rutas].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([r]) => r) : [] });
  }
  return out;
}

const filas = <T>(r: unknown) => (Array.isArray(r) ? r : (r as { rows?: unknown[] }).rows ?? []) as T[];

/** Lo que Meta dice del conjunto (destination_type) es la fuente principal. */
const POR_DESTINATION_TYPE: Record<string, TipoDestino> = {
  WHATSAPP: "whatsapp",
  MESSENGER: "mensajes", INSTAGRAM_DIRECT: "mensajes",
  MESSAGING_MESSENGER_WHATSAPP: "mensajes", MESSAGING_INSTAGRAM_DIRECT_MESSENGER: "mensajes",
  MESSAGING_INSTAGRAM_DIRECT_WHATSAPP: "mensajes", MESSAGING_INSTAGRAM_DIRECT_MESSENGER_WHATSAPP: "mensajes",
  ON_AD: "formulario", WEBSITE: "web", PHONE_CALL: "llamada",
  ON_POST: "publicacion", ON_PAGE: "publicacion", ON_VIDEO: "publicacion", ON_EVENT: "publicacion",
  INSTAGRAM_PROFILE: "perfil", FACEBOOK_PAGE: "perfil", INSTAGRAM_PROFILE_AND_FACEBOOK_PAGE: "perfil",
};
/** Objetivos que buscan consultas: un anuncio sin link ahí no es un posteo promocionado. */
const OBJETIVOS_DE_CONSULTAS = new Set(["OUTCOME_LEADS", "LEAD_GENERATION", "MESSAGES", "CONVERSIONS", "OUTCOME_SALES"]);

/**
 * El destino final de una campaña. Primero lo que dice Meta del conjunto; si
 * no está (sync viejo), lo de los anuncios, pero un anuncio sin link en una
 * campaña de leads o mensajes queda sin dato: decir "posteo promocionado" ahí
 * haría que no se la juzgue por leads (14/10: 15 propuestas así). Pura.
 */
export function ajustarDestino(porAnuncios: TipoDestino | undefined, destinationTypes: string[], objetivo: string | null): TipoDestino | null {
  const cuenta = new Map<TipoDestino, number>();
  for (const dt of destinationTypes) {
    const t = POR_DESTINATION_TYPE[dt];
    if (t) cuenta.set(t, (cuenta.get(t) ?? 0) + 1);
  }
  if (cuenta.size) return [...cuenta].sort((a, b) => b[1] - a[1])[0][0];
  if (porAnuncios === "publicacion" && objetivo && OBJETIVOS_DE_CONSULTAS.has(objetivo)) return null;
  return porAnuncios ?? null;
}

/** El destino de cada campaña del cliente (id de campaña como en ads_insights). */
export async function destinosDeCampanas(db: Db, clientId: string): Promise<Map<string, DestinoCampana>> {
  const [anuncios, conjuntos, campanas] = await Promise.all([
    db.execute(sql`
      select coalesce(c.campaign_id, regexp_replace(s.campaign_id, '^.*/campaigns/', '')) as campaign_id, c.platform, c.raw
      from ads_creatives c left join ads_adsets s on s.id = c.adset_id
      where c.client_id = ${clientId}`),
    db.execute(sql`
      select regexp_replace(campaign_id, '^.*/campaigns/', '') as campaign_id, raw->>'destination_type' as dt
      from ads_adsets where client_id = ${clientId} and raw ? 'destination_type'`),
    db.execute(sql`select id, objective from ads_campaigns where client_id = ${clientId}`),
  ]);
  const base = resumirDestinos(filas<{ campaign_id: string | null; platform: string; raw: unknown }>(anuncios)
    .filter((f) => f.campaign_id)
    .map((f) => ({ campaignId: f.campaign_id!, destino: destinoDeAnuncio(f.platform, f.raw) })));
  const dts = new Map<string, string[]>();
  for (const f of filas<{ campaign_id: string; dt: string }>(conjuntos)) dts.set(f.campaign_id, [...(dts.get(f.campaign_id) ?? []), f.dt]);
  const objetivos = new Map(filas<{ id: string; objective: string | null }>(campanas).map((c) => [c.id, c.objective]));
  const out = new Map<string, DestinoCampana>();
  for (const id of new Set([...base.keys(), ...dts.keys()])) {
    const tipo = ajustarDestino(base.get(id)?.tipo, dts.get(id) ?? [], objetivos.get(id) ?? null);
    if (tipo) out.set(id, { tipo, paginas: tipo === "web" ? base.get(id)?.paginas ?? [] : [] });
  }
  return out;
}

export interface LandingPaga {
  sesiones: number;
  /** % de las visitas pagas que interactuaron. */
  interaccionPct: number | null;
  eventosClave: number | null;
  desde: string;
  hasta: string;
}

/** Lo que dice Analytics de cada página con tráfico pago (28 días), por ruta. */
export async function landingsPagas(db: Db, clientId: string): Promise<Map<string, LandingPaga>> {
  const r = await db.execute(sql`
    select clave, sesiones, compromiso, eventos_clave, desde::text, hasta::text from web_ranking
    where client_id = ${clientId} and tipo = 'landing' and detalle ~* '^(paid|cross-network)'`);
  const por = new Map<string, { s: number; comp: number; ev: number; evMedido: boolean; desde: string; hasta: string }>();
  for (const f of filas<{ clave: string; sesiones: number | null; compromiso: string | null; eventos_clave: string | null; desde: string; hasta: string }>(r)) {
    const ruta = f.clave.startsWith("/") ? (f.clave.replace(/\/+$/, "") || "/") : f.clave;
    const s = Number(f.sesiones ?? 0);
    const x = por.get(ruta) ?? { s: 0, comp: 0, ev: 0, evMedido: false, desde: f.desde, hasta: f.hasta };
    x.s += s;
    x.comp += f.compromiso != null ? Number(f.compromiso) * s : 0;
    if (f.eventos_clave != null) { x.ev += Number(f.eventos_clave); x.evMedido = true; }
    por.set(ruta, x);
  }
  const out = new Map<string, LandingPaga>();
  for (const [ruta, x] of por) {
    out.set(ruta, {
      sesiones: x.s,
      interaccionPct: x.s > 0 ? Math.round((x.comp / x.s) * 1000) / 10 : null,
      eventosClave: x.evMedido ? x.ev : null,
      desde: x.desde, hasta: x.hasta,
    });
  }
  return out;
}

/** Destino + página, listo para mostrarle a un agente. Pura. */
export function destinoParaAgente(d: DestinoCampana | undefined, landings: Map<string, LandingPaga>) {
  if (!d) return null;
  if (d.tipo !== "web") return { tipo: d.tipo };
  const pagina = d.paginas.find((p) => landings.has(p)) ?? d.paginas[0] ?? null;
  return { tipo: d.tipo, paginas: d.paginas, landing: pagina && landings.has(pagina) ? { pagina, ...landings.get(pagina)! } : null };
}

/** Por página de la web: las campañas que gastaron en 28 días y mandan ahí (nombres). */
export async function campanasPorPagina(db: Db, clientId: string): Promise<Record<string, string[]>> {
  const [destinos, r] = await Promise.all([
    destinosDeCampanas(db, clientId),
    db.execute(sql`
      select campaign_id, max(campaign_name) as nombre from ads_insights
      where client_id = ${clientId} and date >= current_date - 28 and spend > 0 and campaign_id is not null
      group by campaign_id`),
  ]);
  const out: Record<string, string[]> = {};
  for (const f of filas<{ campaign_id: string; nombre: string | null }>(r)) {
    for (const p of destinos.get(f.campaign_id)?.paginas ?? []) (out[p] ??= []).push(f.nombre ?? f.campaign_id);
  }
  return out;
}
