// LMTM-OS: qué funciona en el orgánico de cada cliente (pedido 14/8).
//
// EL PROBLEMA QUE RESUELVE: teníamos 3.301 posts publicados y 1.187 con
// engagement real, pero la tool que usan los agentes (`get_client_organic_posts`)
// devolvía SOLO el texto de cada post — sin reacciones, comentarios ni shares.
// El agente veía qué publicó el cliente pero no qué le funcionó, así que las
// ideas salían genéricas por más historial que hubiera.
//
// Acá se destila la señal a algo accionable ("en esta cuenta el carrusel rinde
// 14% más que el reel") y se guarda en el brain del cliente, para que la lea
// cualquier agente y no solo el que pide los posts.

import type { Db } from "@paperclipai/db";
import { clientMemory, organicPostInsights, organicPosts } from "@paperclipai/db";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { upsertMemory } from "./customer-brain.js";

const COMPANY_ID = "00000000-0000-4000-8000-000000000001";
/** 180 días: con 90 varios clientes quedaban con 3-4 posts, muy poco para
 *  distinguir señal de ruido. */
const VENTANA_DIAS = 180;
/** Debajo de esto no se afirma nada: un tipo con 2 posts no es una tendencia. */
const MINIMO_POR_TIPO = 3;

export interface PostConRendimiento {
  id: string;
  texto: string;
  tipo: string | null;
  fecha: string | null;
  permalink: string | null;
  reacciones: number;
  comentarios: number;
  compartidos: number;
  /** Comentarios y compartidos pesan más: cuestan más que un like. */
  engagement: number;
}

export interface ResumenOrganico {
  posts: PostConRendimiento[];
  totalPosts: number;
  conMetricas: number;
  promedio: number;
  porTipo: Array<{ tipo: string; posts: number; promedio: number; vsCuenta: number }>;
  top: PostConRendimiento[];
  flojos: PostConRendimiento[];
}

const engagementDe = (r: number, c: number, s: number) => r + c * 3 + s * 5;

/** Posts del cliente con sus métricas, ordenados por rendimiento. */
export async function rendimientoOrganico(
  db: Db,
  clientId: string,
  opts: { dias?: number; limite?: number; pageIds?: string[] } = {},
): Promise<ResumenOrganico> {
  const dias = opts.dias ?? VENTANA_DIAS;
  const desde = new Date(Date.now() - dias * 86_400_000);
  const match = opts.pageIds?.length
    ? sql`(${organicPosts.clientId} = ${clientId} or ${organicPosts.pageId} in ${opts.pageIds})`
    : eq(organicPosts.clientId, clientId);

  const filas = await db
    .select({
      id: organicPosts.id,
      texto: organicPosts.message,
      story: organicPosts.story,
      tipo: organicPosts.postType,
      fecha: organicPosts.createdTime,
      permalink: organicPosts.permalinkUrl,
    })
    .from(organicPosts)
    .where(and(gte(organicPosts.createdTime, desde), match))
    .orderBy(desc(organicPosts.createdTime))
    .limit(400);

  if (filas.length === 0) {
    return { posts: [], totalPosts: 0, conMetricas: 0, promedio: 0, porTipo: [], top: [], flojos: [] };
  }

  const ids = filas.map((f) => f.id);
  const metricas = await db
    .select({ postId: organicPostInsights.postId, metric: organicPostInsights.metric, value: organicPostInsights.value })
    .from(organicPostInsights)
    .where(inArray(organicPostInsights.postId, ids));

  const porPost = new Map<string, Record<string, number>>();
  for (const m of metricas) {
    if (!m.postId) continue;
    const row = porPost.get(m.postId) ?? {};
    row[m.metric] = Number(m.value);
    porPost.set(m.postId, row);
  }

  const posts: PostConRendimiento[] = filas.map((f) => {
    const m = porPost.get(f.id) ?? {};
    const reacciones = m["post_reactions_by_type_total"] ?? 0;
    const comentarios = m["post_comments"] ?? m["comments"] ?? 0;
    const compartidos = m["post_shares"] ?? m["shares"] ?? 0;
    return {
      id: f.id,
      texto: (f.texto ?? f.story ?? "").slice(0, 300),
      tipo: f.tipo,
      fecha: f.fecha?.toISOString().slice(0, 10) ?? null,
      permalink: f.permalink,
      reacciones, comentarios, compartidos,
      engagement: engagementDe(reacciones, comentarios, compartidos),
    };
  });

  const conMetricas = posts.filter((p) => p.engagement > 0);
  const promedio = conMetricas.length ? conMetricas.reduce((a, p) => a + p.engagement, 0) / conMetricas.length : 0;

  const agrupado = new Map<string, PostConRendimiento[]>();
  for (const p of conMetricas) {
    const t = (p.tipo ?? "sin tipo").toLowerCase();
    agrupado.set(t, [...(agrupado.get(t) ?? []), p]);
  }
  const porTipo = [...agrupado.entries()]
    .filter(([, ps]) => ps.length >= MINIMO_POR_TIPO)
    .map(([tipo, ps]) => {
      const prom = ps.reduce((a, p) => a + p.engagement, 0) / ps.length;
      return { tipo, posts: ps.length, promedio: Math.round(prom * 10) / 10, vsCuenta: promedio > 0 ? Math.round((prom / promedio - 1) * 100) : 0 };
    })
    .sort((a, b) => b.promedio - a.promedio);

  const ordenados = [...conMetricas].sort((a, b) => b.engagement - a.engagement);
  return {
    posts: opts.limite ? posts.slice(0, opts.limite) : posts,
    totalPosts: posts.length,
    conMetricas: conMetricas.length,
    promedio: Math.round(promedio * 10) / 10,
    porTipo,
    top: ordenados.slice(0, 5),
    flojos: ordenados.slice(-3).reverse(),
  };
}

/** Palabras del copy que aparecen mucho más en los buenos que en los flojos. */
function ganchosQueFuncionan(top: PostConRendimiento[], resto: PostConRendimiento[]): string[] {
  // Lista larga a propósito. Con la corta salía "quienes, siguen, historias,
  // cambian, forma, pero" (BRACHETTA, 17/8): palabras de relleno que el agente
  // de ideas leía como si fueran el tema del cliente.
  const STOP = new Set((
    "de la el los las un una unos unas y o u en con para por que del al es son era ser esta este " +
    "estos estas su sus se lo le les nos te tu tus mi mis nuestro nuestra mas más pero como cuando " +
    "donde quien quienes cual cuales todo toda todos todas otro otra cada mismo misma muy tan ya " +
    "hay han has hemos fue fueron sido siendo tiene tienen tener hacer hace hacen puede pueden " +
    "sigue siguen sigo forma formas parte partes vez veces cosa cosas hoy dia dias año años mes " +
    "meses sobre entre desde hasta sin solo tambien ademas porque aqui alli asi bien nueva nuevo " +
    "gran grande mejor mejores"
  ).split(" "));
  const contar = (ps: PostConRendimiento[]) => {
    const c = new Map<string, number>();
    for (const p of ps) {
      const vistas = new Set(
        p.texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
          .split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !STOP.has(w)),
      );
      for (const w of vistas) c.set(w, (c.get(w) ?? 0) + 1);
    }
    return c;
  };
  // Con 3-4 posts arriba, "aparece en 2" es ruido: cualquier palabra pasaba.
  // Se exige que esté en al menos el 40% de los mejores.
  if (top.length < 4 || resto.length === 0) return [];
  const minTop = Math.max(2, Math.ceil(top.length * 0.4));
  const cTop = contar(top), cResto = contar(resto);
  return [...cTop.entries()]
    .filter(([w, n]) => n >= minTop && n / top.length > ((cResto.get(w) ?? 0) / resto.length) * 1.8)
    .sort((a, b) => b[1] - a[1]).slice(0, 6).map(([w]) => w);
}

/**
 * Destila el rendimiento a un texto corto y accionable, y lo guarda en el brain
 * del cliente. Es lo que después lee CUALQUIER agente, no solo el de ideas.
 * Devuelve null si el cliente no tiene señal suficiente — mejor no decir nada
 * que inventar una tendencia con 4 posts.
 */
export async function destilarOrganico(db: Db, clientId: string): Promise<string | null> {
  const r = await rendimientoOrganico(db, clientId);
  if (r.conMetricas < 8) return null;

  const lineas: string[] = [];
  lineas.push(`Sobre ${r.conMetricas} publicaciones con datos de los últimos ${VENTANA_DIAS} días (engagement promedio ${r.promedio}, contando comentarios ×3 y compartidos ×5):`);

  // "sin tipo" no es un formato que alguien pueda proponer: sale del ranking de
  // mejor/peor y se explica aparte, si no el consejo queda inservible
  // ("el que peor rinde: sin tipo").
  const formatosReales = r.porTipo.filter((t) => t.tipo !== "sin tipo");
  if (formatosReales.length >= 2) {
    const mejor = formatosReales[0], peor = formatosReales[formatosReales.length - 1];
    lineas.push(`- Formato que mejor rinde: **${mejor.tipo}** (${mejor.promedio} de promedio, ${mejor.vsCuenta >= 0 ? "+" : ""}${mejor.vsCuenta}% vs la cuenta, ${mejor.posts} posts).`);
    // Solo vale llamarlo "el peor" si la diferencia es real, no ruido.
    if (peor.tipo !== mejor.tipo && peor.promedio < mejor.promedio * 0.75) {
      lineas.push(`- El que peor rinde: **${peor.tipo}** (${peor.promedio}, ${peor.vsCuenta}%). Antes de proponer más de este formato, mirá si vale la pena.`);
    } else if (peor.tipo !== mejor.tipo) {
      lineas.push(`- **${peor.tipo}** rinde parecido (${peor.promedio}): los dos formatos funcionan, elegí por el mensaje y no por el formato.`);
    }
  } else if (formatosReales.length === 1) {
    lineas.push(`- Casi todo lo publicado es **${formatosReales[0].tipo}** — no hay con qué comparar. Probar otro formato daría información nueva.`);
  }

  const ganchos = ganchosQueFuncionan(r.top, r.flojos.concat(r.posts.filter((p) => p.engagement > 0 && p.engagement < r.promedio).slice(0, 10)));
  if (ganchos.length >= 3) {
    lineas.push(`- Palabras que aparecen en los posts que mejor andan: ${ganchos.join(", ")}.`);
  }

  if (r.top[0]) {
    lineas.push(`- El mejor post del período (${r.top[0].engagement} de engagement): "${r.top[0].texto.slice(0, 120).replace(/\s+/g, " ")}…"`);
  }

  const sinTipo = r.porTipo.find((t) => t.tipo === "sin tipo");
  if (sinTipo && sinTipo.vsCuenta < -50) {
    lineas.push(`- OJO: ${sinTipo.posts} publicaciones sin formato identificado rinden ${sinTipo.vsCuenta}% — probablemente son fotos sueltas sin trabajo de diseño.`);
  }

  const contenido = lineas.join("\n");
  await upsertMemory(db, {
    companyId: COMPANY_ID, clientId, kind: "performance",
    key: "organico-que-funciona", content: contenido, source: "organic_posts", confidence: 0.9,
  });
  return contenido;
}

/** Corre el destilado para todos los clientes con posts. Devuelve cuántos
 *  quedaron con memoria nueva. */
export async function destilarTodos(db: Db): Promise<{ evaluados: number; conSenal: number }> {
  const filas = await db
    .select({ clientId: organicPosts.clientId })
    .from(organicPosts)
    .where(sql`${organicPosts.clientId} is not null`)
    .groupBy(organicPosts.clientId);
  let conSenal = 0;
  for (const f of filas) {
    if (!f.clientId) continue;
    try {
      if (await destilarOrganico(db, f.clientId)) conSenal++;
    } catch (e) {
      console.warn(`[organico] destilado falló para ${f.clientId}:`, e instanceof Error ? e.message : e);
    }
  }
  return { evaluados: filas.length, conSenal };
}

/** Lo aprendido, para inyectar en prompts sin volver a calcular. */
export async function memoriaOrganica(db: Db, clientId: string): Promise<string | null> {
  const [m] = await db
    .select({ content: clientMemory.content })
    .from(clientMemory)
    .where(and(eq(clientMemory.clientId, clientId), eq(clientMemory.key, "organico-que-funciona")))
    .orderBy(desc(clientMemory.createdAt))
    .limit(1);
  return m?.content ?? null;
}
