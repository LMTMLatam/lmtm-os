// LMTM-OS: qué contenido funciona, comparando TODAS las cuentas (pedido 7/10).
//
// "Que el equipo proponga ángulos que funcionan, formatos según el nicho, un
// análisis de mejora constante: qué reutilizar, comparar ángulos, siempre entre
// todas las cuentas buscando lo mejor."
//
// CÓMO SE COMPARA SIN MENTIR
// Una cuenta con 20.000 seguidores tiene más interacción que una con 800 haga lo
// que haga. Comparar interacción cruda entre cuentas premia al grande, no al
// ángulo. Por eso cada publicación se mide contra LO NORMAL DE SU PROPIA CUENTA
// en esa red (la mediana de sus últimos meses): índice 2 = el doble de lo que
// esa cuenta suele sacar. Ese índice sí se puede comparar entre cuentas.
//
// Lo que NO hay: alcance ni impresiones (Meta no las da para estas cuentas).
// La interacción es reacciones + comentarios×3 + compartidos×5, la misma vara
// que organico-aprendizaje.ts.
//
// Nada se afirma con poca muestra: un ángulo "funciona" con al menos
// MIN_PUBLICACIONES publicaciones de MIN_CUENTAS cuentas distintas.

import type { Db } from "@paperclipai/db";
import { clients, organicPostInsights, organicPosts } from "@paperclipai/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { clienteReal } from "./intel-common.js";
import { engagementDe } from "./organico-aprendizaje.js";
import { nombreDeAngulo } from "./angulos-creativos.js";
import { SIN_TEXTO } from "./contenido-angulos.js";

/** Publicaciones con métricas que necesita una cuenta en una red para tener "lo normal". */
export const MIN_POR_CUENTA = 8;
/** Para afirmar que un ángulo o formato funciona. */
export const MIN_PUBLICACIONES = 6;
export const MIN_CUENTAS = 2;
/** Lo normal de una cuenta tiene que ser al menos esto para medir contra ella.
 *  Muchas páginas de Facebook sacan 1 interacción por post: contra eso, un post
 *  con 430 daba "172 veces lo normal", un número cierto pero que no enseña nada. */
export const MIN_NORMAL = 5;
/** Una publicación "para reutilizar" rindió al menos esto contra su cuenta. */
export const INDICE_DESTACADO = 2;

export interface PublicacionMedida {
  id: string;
  clientId: string;
  cliente: string;
  slug: string;
  nicho: string | null;
  red: "instagram" | "facebook";
  formato: string;
  angulo: string | null;
  engagement: number;
  fecha: string;
  permalink: string | null;
  texto: string;
}

export interface Ejemplo {
  clientId: string; cliente: string; slug: string; red: string; formato: string;
  angulo: string | null; anguloNombre: string | null;
  indice: number; engagement: number; fecha: string; permalink: string | null; texto: string;
}

export interface Fila {
  clave: string;
  nombre: string;
  publicaciones: number;
  cuentas: number;
  /** Mediana del índice: 1 = lo normal de cada cuenta. */
  indice: number;
  mejor: Ejemplo;
}

export interface Oportunidad {
  angulo: string; nombre: string;
  indiceEnNicho: number; publicacionesNicho: number; cuentasNicho: number;
  usosPropios: number;
}

export interface AnalisisContenido {
  generadoAt: string;
  dias: number;
  publicaciones: number;
  cuentas: number;
  clasificadas: number;
  angulos: Fila[];
  formatos: Fila[];
  nichos: Array<{ nicho: string; cuentas: number; publicaciones: number; angulos: Fila[]; formatos: Fila[] }>;
  reutilizar: Ejemplo[];
  /** Publicaciones de los últimos 7 días que doblaron lo normal de su cuenta. */
  recientes: Ejemplo[];
  clientes: Array<{
    clientId: string; cliente: string; slug: string; nicho: string | null;
    publicaciones: number;
    top: Ejemplo[];
    /** Su mejor publicación de las últimas dos semanas que dobló lo normal (para repetirla u ofrecer pauta). */
    mejorReciente: Ejemplo | null;
    mejorAngulo: Fila | null;
    oportunidad: Oportunidad | null;
  }>;
}

const FORMATO: Record<string, string> = { reel: "reel", reels: "reel", video: "video", carousel: "carrusel", carousel_album: "carrusel", photo: "foto", image: "foto", feed: "foto", status: "texto" };
export const nombreFormato = (tipo: string | null): string => FORMATO[(tipo ?? "").toLowerCase()] ?? (tipo ? tipo.toLowerCase() : "sin tipo");

export function mediana(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

type ConIndice = PublicacionMedida & { indice: number };

function ejemplo(p: ConIndice): Ejemplo {
  return {
    clientId: p.clientId, cliente: p.cliente, slug: p.slug, red: p.red, formato: p.formato,
    angulo: p.angulo, anguloNombre: p.angulo ? nombreDeAngulo(p.angulo) : null,
    indice: r2(p.indice), engagement: p.engagement, fecha: p.fecha, permalink: p.permalink, texto: p.texto.slice(0, 220),
  };
}

function agrupar(ps: ConIndice[], clave: (p: ConIndice) => string | null, nombre: (k: string) => string, min: { publicaciones: number; cuentas: number }): Fila[] {
  const g = new Map<string, ConIndice[]>();
  for (const p of ps) {
    const k = clave(p);
    if (!k) continue;
    g.set(k, [...(g.get(k) ?? []), p]);
  }
  const filas: Fila[] = [];
  for (const [k, arr] of g) {
    const cuentas = new Set(arr.map((p) => p.clientId)).size;
    if (arr.length < min.publicaciones || cuentas < min.cuentas) continue;
    const mejor = arr.reduce((a, b) => (b.indice > a.indice ? b : a));
    filas.push({ clave: k, nombre: nombre(k), publicaciones: arr.length, cuentas, indice: r2(mediana(arr.map((p) => p.indice))), mejor: ejemplo(mejor) });
  }
  return filas.sort((a, b) => b.indice - a.indice);
}

const claveAngulo = (p: ConIndice) => (p.angulo && p.angulo !== SIN_TEXTO ? p.angulo : null);
const claveFormato = (p: ConIndice) => `${p.red === "instagram" ? "Instagram" : "Facebook"} · ${p.formato}`;

/** Puro: todo el análisis a partir de las publicaciones medidas. */
export function analizarPublicaciones(pubs: PublicacionMedida[], dias: number, ahora = new Date()): AnalisisContenido {
  // 1) Lo normal de cada cuenta en cada red.
  const porCuentaRed = new Map<string, PublicacionMedida[]>();
  for (const p of pubs) {
    const k = `${p.clientId}|${p.red}`;
    porCuentaRed.set(k, [...(porCuentaRed.get(k) ?? []), p]);
  }
  const medidas: ConIndice[] = [];
  for (const arr of porCuentaRed.values()) {
    if (arr.length < MIN_POR_CUENTA) continue;
    const normal = mediana(arr.map((p) => p.engagement));
    if (normal < MIN_NORMAL) continue; // lo normal es casi cero: no hay contra qué medir
    for (const p of arr) medidas.push({ ...p, indice: p.engagement / normal });
  }

  const global = { publicaciones: MIN_PUBLICACIONES, cuentas: MIN_CUENTAS };
  const angulos = agrupar(medidas, claveAngulo, nombreDeAngulo, global);
  const formatos = agrupar(medidas, claveFormato, (k) => k, global);

  // 2) Por nicho: solo los que tienen al menos dos cuentas medidas.
  const porNicho = new Map<string, ConIndice[]>();
  for (const p of medidas) if (p.nicho) porNicho.set(p.nicho, [...(porNicho.get(p.nicho) ?? []), p]);
  const nichos = [...porNicho.entries()]
    .map(([nicho, arr]) => ({
      nicho,
      cuentas: new Set(arr.map((p) => p.clientId)).size,
      publicaciones: arr.length,
      angulos: agrupar(arr, claveAngulo, nombreDeAngulo, global),
      formatos: agrupar(arr, claveFormato, (k) => k, global),
    }))
    .filter((n) => n.cuentas >= MIN_CUENTAS)
    .sort((a, b) => b.cuentas - a.cuentas);

  // 3) Para reutilizar: lo que rindió el doble de lo normal de su cuenta. Con un
  // piso de interacción, si no "2 contra 1" pasa por destacado. Máximo 3 por cuenta.
  const porCliente = new Map<string, number>();
  const reutilizar = medidas
    .filter((p) => p.indice >= INDICE_DESTACADO && p.engagement >= 10)
    .sort((a, b) => b.indice - a.indice)
    .filter((p) => {
      const n = porCliente.get(p.clientId) ?? 0;
      if (n >= 3) return false;
      porCliente.set(p.clientId, n + 1);
      return true;
    })
    .slice(0, 40)
    .map(ejemplo);

  // 3b) Lo de la última semana, para el resumen de los lunes (máximo 2 por cuenta).
  const desdeSemana = new Date(ahora.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  const porClienteSemana = new Map<string, number>();
  const recientes = medidas
    .filter((p) => p.fecha >= desdeSemana && p.indice >= INDICE_DESTACADO && p.engagement >= 10)
    .sort((a, b) => b.indice - a.indice)
    .filter((p) => {
      const k = porClienteSemana.get(p.clientId) ?? 0;
      if (k >= 2) return false;
      porClienteSemana.set(p.clientId, k + 1);
      return true;
    })
    .slice(0, 5)
    .map(ejemplo);

  // 4) Por cliente: sus mejores, su mejor ángulo y el que funciona en su rubro y no usa.
  const nichoPorNombre = new Map(nichos.map((n) => [n.nicho, n]));
  const clientesMap = new Map<string, ConIndice[]>();
  for (const p of medidas) clientesMap.set(p.clientId, [...(clientesMap.get(p.clientId) ?? []), p]);
  const desdeDos = new Date(ahora.getTime() - 14 * 86_400_000).toISOString().slice(0, 10);
  const clientes = [...clientesMap.values()].map((arr) => {
    const c = arr[0];
    const reciente = arr
      .filter((p) => p.fecha.slice(0, 10) >= desdeDos && p.indice >= INDICE_DESTACADO && p.engagement >= 10)
      .reduce<ConIndice | null>((m, p) => (!m || p.indice > m.indice ? p : m), null);
    const propios = agrupar(arr, claveAngulo, nombreDeAngulo, { publicaciones: 3, cuentas: 1 });
    const usos = new Map<string, number>();
    for (const p of arr) { const k = claveAngulo(p); if (k) usos.set(k, (usos.get(k) ?? 0) + 1); }
    const delNicho = c.nicho ? nichoPorNombre.get(c.nicho) : undefined;
    const candidata = delNicho?.angulos.find((f) => f.indice >= 1.2 && (usos.get(f.clave) ?? 0) <= 1 && f.mejor.clientId !== c.clientId) ?? null;
    return {
      clientId: c.clientId, cliente: c.cliente, slug: c.slug, nicho: c.nicho,
      publicaciones: arr.length,
      top: [...arr].sort((a, b) => b.indice - a.indice).slice(0, 3).map(ejemplo),
      mejorReciente: reciente ? ejemplo(reciente) : null,
      mejorAngulo: propios[0] ?? null,
      oportunidad: candidata
        ? { angulo: candidata.clave, nombre: candidata.nombre, indiceEnNicho: candidata.indice, publicacionesNicho: candidata.publicaciones, cuentasNicho: candidata.cuentas, usosPropios: usos.get(candidata.clave) ?? 0 }
        : null,
    };
  }).sort((a, b) => a.cliente.localeCompare(b.cliente));

  return {
    generadoAt: ahora.toISOString(),
    dias,
    publicaciones: medidas.length,
    cuentas: new Set(medidas.map((p) => p.clientId)).size,
    clasificadas: medidas.filter((p) => claveAngulo(p)).length,
    angulos, formatos, nichos, reutilizar, recientes, clientes,
  };
}

/** Las publicaciones reales de los clientes, con su interacción. */
export async function cargarPublicaciones(db: Db, dias: number): Promise<PublicacionMedida[]> {
  const desde = new Date(Date.now() - dias * 86_400_000);
  const v = (m: string) => sql<string | null>`max(case when ${organicPostInsights.metric} = ${m} then ${organicPostInsights.value} end)`;
  const filas = await db
    .select({
      id: organicPosts.id,
      clientId: organicPosts.clientId,
      cliente: clients.name,
      slug: clients.slug,
      nicho: clients.industry,
      permalink: organicPosts.permalinkUrl,
      tipo: organicPosts.postType,
      angulo: organicPosts.angulo,
      fecha: organicPosts.createdTime,
      texto: organicPosts.message,
      reacciones: v("post_reactions_by_type_total"),
      comentarios: v("post_comments"),
      compartidos: v("post_shares"),
    })
    .from(organicPosts)
    .innerJoin(clients, eq(clients.id, organicPosts.clientId))
    .innerJoin(organicPostInsights, eq(organicPostInsights.postId, organicPosts.id))
    .where(and(gte(organicPosts.createdTime, desde), clienteReal()))
    .groupBy(organicPosts.id, clients.id);
  return filas
    .filter((f) => f.clientId)
    .map((f) => ({
      id: f.id,
      clientId: f.clientId as string,
      cliente: f.cliente.trim(),
      slug: f.slug,
      nicho: f.nicho,
      red: /instagram\.com/.test(f.permalink ?? "") ? "instagram" as const : "facebook" as const,
      formato: nombreFormato(f.tipo),
      angulo: f.angulo,
      engagement: engagementDe(Number(f.reacciones ?? 0), Number(f.comentarios ?? 0), Number(f.compartidos ?? 0)),
      fecha: f.fecha ? f.fecha.toISOString().slice(0, 10) : "",
      permalink: f.permalink,
      texto: (f.texto ?? "").replace(/\s+/g, " ").trim(),
    }));
}

let cache: { at: number; dias: number; data: AnalisisContenido } | null = null;

/** El análisis, guardado 30 minutos (las métricas se leen de Meta de noche). */
export async function analisisContenido(db: Db, dias = 180, fresco = false): Promise<AnalisisContenido> {
  if (!fresco && cache && cache.dias === dias && Date.now() - cache.at < 30 * 60_000) return cache.data;
  const data = analizarPublicaciones(await cargarPublicaciones(db, dias), dias);
  cache = { at: Date.now(), dias, data };
  return data;
}

// Un decimal, igual que el panel: "1,9×".
const veces = (x: number) => `${x.toFixed(x >= 10 ? 0 : 1).replace(".", ",")}×`;
const linea = (f: Fila) => `${f.nombre} ${veces(f.indice)} (${f.publicaciones} publicaciones, ${f.cuentas} cuenta${f.cuentas === 1 ? "" : "s"})`;
const citar = (e: Ejemplo) => `${e.cliente}, ${e.fecha}, ${e.red} ${e.formato}${e.anguloNombre ? `, ángulo ${e.anguloNombre}` : ""}: ${veces(e.indice)} — "${e.texto.slice(0, 110)}"${e.permalink ? ` ${e.permalink}` : ""}`;

/**
 * Lo que leen los agentes de contenido (ideas, calendario, radar del rubro).
 * Puro. Solo lo que tiene muestra suficiente; si no hay nada, lo dice.
 */
export function textoParaAgente(a: AnalisisContenido, opts: { nicho?: string | null; clientId?: string | null } = {}): string {
  const out: string[] = [
    `QUÉ FUNCIONA EN ORGÁNICO — datos reales de ${a.cuentas} cuentas, últimos ${a.dias} días.`,
    "Índice = interacción de la publicación contra lo normal de SU cuenta (1× = lo normal, 2× = el doble). Interacción = reacciones + comentarios×3 + compartidos×5; no hay alcance.",
  ];
  const n = opts.nicho ? a.nichos.find((x) => x.nicho.toLowerCase() === opts.nicho!.toLowerCase()) : undefined;
  if (n) {
    out.push("", `En el rubro "${n.nicho}" (${n.cuentas} cuentas, ${n.publicaciones} publicaciones):`);
    if (n.angulos.length) {
      out.push(`- Ángulos que más rinden: ${n.angulos.slice(0, 3).map(linea).join("; ")}.`);
      const flojos = n.angulos.filter((f) => f.indice < 0.9).slice(-2);
      if (flojos.length) out.push(`- Rinden menos que lo normal: ${flojos.map(linea).join("; ")}.`);
    } else out.push("- Ángulos: todavía sin muestra suficiente en este rubro.");
    if (n.formatos.length) out.push(`- Formatos: ${n.formatos.map((f) => `${f.clave} ${veces(f.indice)} (${f.publicaciones})`).join("; ")}.`);
  } else if (opts.nicho) {
    out.push("", `En el rubro "${opts.nicho}" no hay dos cuentas con datos suficientes: se usa lo de todas las cuentas.`);
  }
  if (a.angulos.length) out.push("", `En todas las cuentas, los ángulos que más rinden: ${a.angulos.slice(0, 4).map(linea).join("; ")}.`);
  if (a.formatos.length) out.push(`Formatos en todas las cuentas: ${a.formatos.map((f) => `${f.clave} ${veces(f.indice)}`).join("; ")}.`);

  const c = opts.clientId ? a.clientes.find((x) => x.clientId === opts.clientId) : undefined;
  if (c) {
    out.push("", `Esta cuenta (${c.publicaciones} publicaciones medidas):`);
    if (c.mejorAngulo) out.push(`- Su mejor ángulo: ${linea(c.mejorAngulo)}.`);
    if (c.top.length) out.push("- Sus publicaciones que mejor rindieron (para reutilizar con otro formato o una vuelta nueva):", ...c.top.map((e) => `  · ${citar(e)}`));
    if (c.oportunidad) out.push(`- Oportunidad: en su rubro "${c.oportunidad.nombre}" rinde ${veces(c.oportunidad.indiceEnNicho)} (${c.oportunidad.publicacionesNicho} publicaciones de ${c.oportunidad.cuentasNicho} cuentas) y esta cuenta lo usó ${c.oportunidad.usosPropios} ${c.oportunidad.usosPropios === 1 ? "vez" : "veces"}.`);
  } else if (opts.clientId) {
    out.push("", "Esta cuenta no tiene publicaciones suficientes leídas para medirla: apoyate en el rubro.");
  }
  if (a.reutilizar.length && !c) out.push("", "Publicaciones que doblaron lo normal de su cuenta:", ...a.reutilizar.slice(0, 5).map((e) => `  · ${citar(e)}`));
  out.push("", "Usalo así: proponé desde los ángulos y formatos que rinden, citá el dato (rubro, índice, ejemplo) y no inventes números que no estén acá.");
  return out.join("\n");
}

/**
 * El bloque de contenido del resumen de los lunes (mejora constante: qué rindió
 * la semana y qué ángulo conviene repetir). Puro. null si no hay nada medido.
 */
export function armarContenidoSemanal(a: AnalisisContenido, url: string): string | null {
  if (!a.recientes.length && !a.angulos.length) return null;
  const lineas: string[] = [];
  if (a.recientes.length) {
    lineas.push("Lo que mejor funcionó la semana pasada (contra lo normal de cada cuenta):");
    for (const e of a.recientes) {
      lineas.push(`• *${e.cliente}* — ${e.red === "instagram" ? "Instagram" : "Facebook"} ${e.formato}${e.anguloNombre ? `, ${e.anguloNombre}` : ""}: ${veces(e.indice)}${e.permalink ? ` ${e.permalink}` : ""}`);
    }
  } else {
    lineas.push("La semana pasada ninguna publicación dobló lo normal de su cuenta.");
  }
  const top = a.angulos[0];
  if (top) lineas.push(`El ángulo que más rinde en todas las cuentas: ${top.nombre} (${veces(top.indice)}, ${top.publicaciones} publicaciones de ${top.cuentas} cuentas).`);
  lineas.push(`Detalle y qué probar en cada cliente: ${url}`);
  return lineas.join("\n");
}
