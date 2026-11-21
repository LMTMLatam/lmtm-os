// LMTM-OS: score de publicaciones (pedido 21/11).
//
// «Calificar las publicaciones por cuántos clientes llegaron por interactuar con ellas, cuáles funcionaron
// mejor para eso y cuáles fueron más virales.»
//
// QUÉ SE PUEDE MEDIR Y QUÉ NO
// - Consultas: las del anuncio que usa ESA publicación (publicación promocionada). Es exacto: lo cuenta Meta.
//   Una publicación que no se pautó no tiene 0 consultas: no tiene dato (null).
// - Intención: visitas al perfil, seguidores y toques en el perfil que Meta le atribuye a la publicación
//   (solo Instagram, no reels).
// - Viralidad: alcance, compartidos y guardados (solo Instagram, lo trae el sync desde el 21/11).
// - Interacción: la vara de siempre (organico-aprendizaje.ts).
// Quien vio una publicación y escribió por privado sin tocar nada no deja rastro en ningún lado: no se inventa.
//
// CÓMO SE CALIFICA
// Cada parte es el lugar de la publicación entre las de la MISMA cuenta y red (0 a 1). El score promedia las
// partes que esa publicación tiene medidas, con su peso, y dice cuáles fueron. Una cuenta chica y una grande
// quedan en la misma escala.

import type { Db } from "@paperclipai/db";
import { adsAccountMappings, adsCreatives, adsInsights, organicPostInsights, organicPosts } from "@paperclipai/db";
import { and, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import { engagementDe } from "./organico-aprendizaje.js";

export const PESOS = { consultas: 40, viralidad: 25, intencion: 20, interaccion: 15 } as const;
export type Parte = keyof typeof PESOS;
/** Publicaciones de la misma red con el dato para poder decir «esta está arriba». */
export const MIN_MUESTRA = 5;

export interface PostMedido {
  id: string;
  red: "instagram" | "facebook";
  interaccion: number;
  /** null = Meta no lo dio para esta publicación. */
  alcance: number | null;
  difusion: number | null;
  intencion: number | null;
  /** null = no se pautó. */
  consultas: number | null;
}

export interface Puntaje { score: number | null; partes: Partial<Record<Parte, number>> }

/** Puro. Fracción de `xs` que es menor o igual a `x`. */
const lugar = (x: number, xs: number[]) => xs.filter((y) => y <= x).length / xs.length;

/** Puro. El score 0-100 de cada publicación contra las de su misma red. */
export function puntuar(posts: PostMedido[]): Map<string, Puntaje> {
  const out = new Map<string, Puntaje>();
  for (const red of ["instagram", "facebook"] as const) {
    const grupo = posts.filter((p) => p.red === red);
    const con = (f: (p: PostMedido) => number | null) => grupo.map(f).filter((v): v is number => v != null);
    const muestra = { interaccion: con((p) => p.interaccion), alcance: con((p) => p.alcance), difusion: con((p) => p.difusion), intencion: con((p) => p.intencion), consultas: con((p) => p.consultas) };
    const medible = (k: keyof typeof muestra) => muestra[k].length >= MIN_MUESTRA;
    for (const p of grupo) {
      const partes: Partial<Record<Parte, number>> = {};
      if (medible("interaccion")) partes.interaccion = lugar(p.interaccion, muestra.interaccion);
      if (p.alcance != null && medible("alcance")) {
        const a = lugar(p.alcance, muestra.alcance);
        partes.viralidad = p.difusion != null && medible("difusion") ? (a + lugar(p.difusion, muestra.difusion)) / 2 : a;
      }
      if (p.intencion != null && medible("intencion")) partes.intencion = lugar(p.intencion, muestra.intencion);
      // Las pautadas suelen ser pocas: no se exige muestra. Pautada sin consultas vale 0, no «la peor de 3».
      if (p.consultas != null) partes.consultas = p.consultas > 0 ? lugar(p.consultas, muestra.consultas) : 0;
      const claves = Object.keys(partes) as Parte[];
      const peso = claves.reduce((a, k) => a + PESOS[k], 0);
      out.set(p.id, { score: peso ? Math.round((claves.reduce((a, k) => a + PESOS[k] * partes[k]!, 0) / peso) * 100) : null, partes });
    }
  }
  return out;
}

export interface PublicacionConScore extends PostMedido, Puntaje {
  formato: string | null;
  fecha: string | null;
  permalink: string | null;
  texto: string;
  vistas: number | null;
  compartidos: number | null;
  guardados: number | null;
  visitasPerfil: number | null;
  seguidores: number | null;
  gasto: number | null;
}

export async function scorePublicaciones(db: Db, clientId: string, dias = 90): Promise<{ dias: number; publicaciones: PublicacionConScore[]; conAlcance: number; pautadas: number }> {
  const desde = new Date(Date.now() - dias * 86_400_000);
  const paginas = await db.select({ pageId: adsAccountMappings.pageId }).from(adsAccountMappings).where(eq(adsAccountMappings.clientId, clientId));
  const pageIds = [...new Set(paginas.map((m) => m.pageId).filter((x): x is string => !!x))];
  const filas = await db
    .select({ id: organicPosts.id, texto: organicPosts.message, story: organicPosts.story, formato: organicPosts.postType, fecha: organicPosts.createdTime, permalink: organicPosts.permalinkUrl })
    .from(organicPosts)
    .where(and(gte(organicPosts.createdTime, desde), pageIds.length ? or(eq(organicPosts.clientId, clientId), inArray(organicPosts.pageId, pageIds)) : eq(organicPosts.clientId, clientId)))
    .orderBy(desc(organicPosts.createdTime))
    .limit(400);
  if (!filas.length) return { dias, publicaciones: [], conAlcance: 0, pautadas: 0 };

  const ids = filas.map((f) => f.id);
  const metricas = await db.select({ postId: organicPostInsights.postId, metric: organicPostInsights.metric, value: organicPostInsights.value }).from(organicPostInsights).where(inArray(organicPostInsights.postId, ids));
  const m = new Map<string, Record<string, number>>();
  for (const x of metricas) if (x.postId) m.set(x.postId, { ...m.get(x.postId), [x.metric]: Number(x.value) });

  // Los anuncios que usan una de estas publicaciones, con sus consultas y su gasto de siempre.
  const crea = (k: string) => sql<string | null>`${adsCreatives.raw}->'creative'->>${sql.raw(`'${k}'`)}`;
  const anuncios = await db
    .select({ id: adsCreatives.id, a: crea("effective_instagram_media_id"), b: crea("source_instagram_media_id"), c: crea("effective_object_story_id") })
    .from(adsCreatives)
    .where(and(eq(adsCreatives.clientId, clientId), sql`${adsCreatives.raw}->'creative' ?| array['effective_instagram_media_id','source_instagram_media_id','effective_object_story_id']`));
  const postDe = new Map<string, string>();
  const idSet = new Set(ids);
  for (const ad of anuncios) {
    const post = [ad.a, ad.b, ad.c].find((x) => x && idSet.has(x));
    if (post) postDe.set(ad.id, post);
  }
  const pauta = new Map<string, { consultas: number; gasto: number }>();
  if (postDe.size) {
    const sumas = await db
      .select({ adId: adsInsights.adId, leads: sql<number>`coalesce(sum(${adsInsights.leads}), 0)::int`, gasto: sql<number>`coalesce(sum(${adsInsights.spend}), 0)::float` })
      .from(adsInsights)
      .where(and(eq(adsInsights.clientId, clientId), inArray(adsInsights.adId, [...postDe.keys()])))
      .groupBy(adsInsights.adId);
    for (const post of postDe.values()) if (!pauta.has(post)) pauta.set(post, { consultas: 0, gasto: 0 });
    for (const s of sumas) {
      const p = pauta.get(postDe.get(s.adId!)!)!;
      p.consultas += s.leads;
      p.gasto += s.gasto;
    }
  }

  const suma = (...xs: Array<number | undefined>) => (xs.every((x) => x == null) ? null : xs.reduce<number>((a, x) => a + (x ?? 0), 0));
  const medidos = filas.map((f) => {
    const x = m.get(f.id) ?? {};
    const red = /instagram\.com/.test(f.permalink ?? "") ? ("instagram" as const) : ("facebook" as const);
    const compartidos = x["ig_shares"] ?? (red === "facebook" ? x["post_shares"] : undefined) ?? null;
    return {
      id: f.id, red,
      // La vara de siempre, sin los compartidos de Instagram: los viejos no los tienen y quedarían abajo por eso.
      interaccion: engagementDe(x["post_reactions_by_type_total"] ?? 0, x["post_comments"] ?? 0, x["post_shares"] ?? 0),
      alcance: x["ig_reach"] ?? null,
      difusion: suma(x["ig_shares"], x["ig_saved"]),
      intencion: suma(x["ig_profile_visits"], x["ig_follows"], x["ig_profile_activity"]),
      consultas: pauta.get(f.id)?.consultas ?? null,
      formato: f.formato, fecha: f.fecha?.toISOString().slice(0, 10) ?? null, permalink: f.permalink,
      texto: (f.texto ?? f.story ?? "").slice(0, 200),
      vistas: x["ig_views"] ?? null, compartidos, guardados: x["ig_saved"] ?? null,
      visitasPerfil: x["ig_profile_visits"] ?? null, seguidores: x["ig_follows"] ?? null,
      gasto: pauta.get(f.id)?.gasto ?? null,
    };
  });
  const puntajes = puntuar(medidos);
  const publicaciones = medidos.map((p) => ({ ...p, ...puntajes.get(p.id)! })).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  return { dias, publicaciones, conAlcance: medidos.filter((p) => p.alcance != null).length, pautadas: pauta.size };
}
