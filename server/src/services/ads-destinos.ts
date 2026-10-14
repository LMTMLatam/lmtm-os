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

/** El destino de cada campaña del cliente (id de campaña como en ads_insights). */
export async function destinosDeCampanas(db: Db, clientId: string): Promise<Map<string, DestinoCampana>> {
  const r = await db.execute(sql`
    select coalesce(c.campaign_id, regexp_replace(s.campaign_id, '^.*/campaigns/', '')) as campaign_id, c.platform, c.raw
    from ads_creatives c left join ads_adsets s on s.id = c.adset_id
    where c.client_id = ${clientId}`);
  return resumirDestinos(filas<{ campaign_id: string | null; platform: string; raw: unknown }>(r)
    .filter((f) => f.campaign_id)
    .map((f) => ({ campaignId: f.campaign_id!, destino: destinoDeAnuncio(f.platform, f.raw) })));
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
