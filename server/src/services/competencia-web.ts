// LMTM-OS: qué trabaja la competencia en su web (pedido de Marcos 23/11: «nutrir la competencia»).
//
// De la competencia se medía solo Instagram. 253 competidores tienen su sitio cargado y nadie lo
// leía. La portada de un sitio dice qué busca posicionar: el título, la descripción y los
// encabezados. Se lee la portada de cada dominio (una vez por semana), se sacan los términos que
// repiten VARIOS competidores del mismo cliente (uno solo es su marca, no un término del rubro) y
// se cruzan con lo que el cliente ya tiene: sus búsquedas de Search Console acá, y sus keywords
// de Google Ads en la auditoría (ads-keywords.ts).
//
// Sin modelo y sin herramientas pagas: es lo que el sitio declara, no su tráfico. No dice cuánto
// se busca cada término ni en qué puesto sale el competidor.

import type { Db } from "@paperclipai/db";
import { clients, competenciaWebs, competitors, webRanking } from "@paperclipai/db";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { hostDe } from "./google-web.js";
import { analizarHtml } from "./seo.js";

/** Sitios por vuelta y cada cuánto se vuelve a leer uno: una portada cambia poco. */
const POR_VUELTA = 60;
const DIAS_ENTRE_LECTURAS = 7;
/** Competidores distintos que tienen que repetir un término para que cuente. */
const MIN_COMPETIDORES = 2;

const NO_ES_WEB = /instagram\.com|facebook\.com|fb\.com|linktr\.ee|wa\.me|whatsapp\.com/i;

const VACIAS = new Set([
  // Artículos, preposiciones y demás: no cargan significado.
  "the", "and", "for", "con", "del", "las", "los", "una", "uno", "por", "para", "que", "sus", "tus", "mas", "sin", "son", "como",
  "desde", "hasta", "entre", "sobre", "todo", "toda", "todos", "todas", "este", "esta", "estos", "estas", "nuestro", "nuestra",
  "nuestros", "nuestras", "somos", "tenemos", "hace", "cada", "donde", "cuando", "muy", "ser", "hay", "tiene",
  // Relleno de cualquier portada.
  "inicio", "home", "bienvenido", "bienvenidos", "contacto", "contactanos", "sitio", "web", "oficial", "pagina", "www", "com",
  "conoce", "descubri", "descubre", "ver", "leer", "aqui", "click", "menu", "blog", "novedades", "quienes", "empresa",
  // Visto al probar con sitios reales (23/11): «propiedades destacadas», «últimas propiedades», «necesitás fabricar».
  "destacadas", "destacados", "ultimas", "ultimos", "necesitas",
  // Eslóganes: «la mejor opción» salía como término que trabajan dos inmobiliarias (MA PROPIEDADES 23/11).
  "mejor", "mejores", "opcion", "opciones", "confianza", "experiencia", "trayectoria", "compromiso", "anos",
]);

const sinAcentos = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
// shortcut: singular = sacar la "s" final; «alquileres» no empareja con «alquiler». Si molesta, un stemmer de verdad.
const raiz = (p: string) => (p.length > 4 && p.endsWith("s") ? p.slice(0, -1) : p);
/** Las palabras con significado de un texto, en su raíz. Puro. */
export const palabrasClave = (s: string): string[] =>
  sinAcentos(s).split(/[^a-z0-9]+/).filter((p) => p.length >= 3 && !VACIAS.has(p) && !/^\d+$/.test(p)).map(raiz);

export interface WebLeida { host: string; titulo: string | null; descripcion: string | null; encabezados: string[] }
export interface TerminoCompetencia {
  /** Como lo escribió el primer competidor que lo usa. */
  termino: string;
  /** Las raíces del término, para compararlo con búsquedas y keywords. */
  palabras: string[];
  competidores: number;
  hosts: string[];
}

/**
 * Los términos (de 2 y 3 palabras seguidas) que repiten al menos MIN_COMPETIDORES sitios.
 * Un término de 2 palabras que solo aparece dentro de uno de 3 con los mismos sitios no se repite. Puro.
 */
export function terminosDeLaCompetencia(webs: WebLeida[]): TerminoCompetencia[] {
  const vistos = new Map<string, { termino: string; palabras: string[]; hosts: Set<string> }>();
  for (const w of webs) {
    // Cada trozo aparte: «Inmobiliaria Pérez | Alquileres en Funes» no forma «pérez alquileres».
    const trozos = [w.titulo, w.descripcion, ...w.encabezados].flatMap((t) => (t ?? "").split(/[|·•–—:;,.!?()\n]| - /));
    for (const trozo of trozos) {
      const todas = sinAcentos(trozo).split(/[^a-z0-9]+/).filter(Boolean);
      const utiles = todas.map((p, i) => ({ p, i })).filter(({ p }) => p.length >= 3 && !VACIAS.has(p) && !/^\d+$/.test(p));
      for (const n of [2, 3]) {
        for (let i = 0; i + n <= utiles.length; i++) {
          const tramo = utiles.slice(i, i + n);
          const palabras = tramo.map((x) => raiz(x.p));
          if (new Set(palabras).size < n) continue;
          const k = palabras.join(" ");
          // Se muestra como está escrito, con sus preposiciones: «venta de lotes», no «venta lotes».
          const v = vistos.get(k) ?? { termino: todas.slice(tramo[0].i, tramo[n - 1].i + 1).join(" "), palabras, hosts: new Set<string>() };
          v.hosts.add(w.host);
          vistos.set(k, v);
        }
      }
    }
  }
  const repetidos = [...vistos.values()].filter((v) => v.hosts.size >= MIN_COMPETIDORES);
  const tres = repetidos.filter((v) => v.palabras.length === 3);
  return repetidos
    .filter((v) => v.palabras.length === 3 || !tres.some((t) => t.hosts.size === v.hosts.size && v.palabras.every((p) => t.palabras.includes(p))))
    .map((v) => ({ termino: v.termino, palabras: v.palabras, competidores: v.hosts.size, hosts: [...v.hosts].sort() }))
    .sort((a, b) => b.competidores - a.competidores || b.palabras.length - a.palabras.length || a.termino.localeCompare(b.termino));
}

/** ¿Algún texto trae todas las palabras del término? Puro. */
export function loCubre(termino: Pick<TerminoCompetencia, "palabras">, textos: string[]): boolean {
  return textos.some((t) => { const p = new Set(palabrasClave(t)); return termino.palabras.every((x) => p.has(x)); });
}

export interface WebCompetencia {
  /** Competidores con sitio cargado y cuántos se pudieron leer. */
  conWeb: number;
  leidas: number;
  /** Lo que repiten varios competidores, con el mejor puesto del cliente en Google para esa búsqueda (null = no aparece). */
  terminos: Array<{ termino: string; competidores: number; hosts: string[]; posicionDelCliente: number | null }>;
  /** false = el cliente no tiene Search Console: posicionDelCliente va siempre null y no significa «no aparece». */
  conSearchConsole: boolean;
  /** Solo los que el cliente no tiene en la primera página: lo que le falta. */
  faltan: number;
  nota: string;
}

/** Puro: los términos de la competencia contra las búsquedas de Search Console del cliente. */
export function cruzarConBusquedas(
  terminos: TerminoCompetencia[],
  consultas: Array<{ clave: string; posicion: number | null }> | null,
): WebCompetencia["terminos"] {
  const propias = (consultas ?? []).filter((c) => c.posicion != null).map((c) => ({ palabras: new Set(palabrasClave(c.clave)), posicion: c.posicion! }));
  return terminos.map((t) => {
    const mejores = propias.filter((c) => t.palabras.every((p) => c.palabras.has(p))).map((c) => c.posicion);
    return { termino: t.termino, competidores: t.competidores, hosts: t.hosts, posicionDelCliente: mejores.length ? Math.min(...mejores) : null };
  });
}

/** Las webs leídas de los competidores de un cliente (una por dominio). */
export async function websDeCompetidores(db: Db, clientId: string): Promise<{ conWeb: number; webs: WebLeida[] }> {
  const filas = await db.select({ web: competitors.website }).from(competitors).where(and(eq(competitors.clientId, clientId), isNotNull(competitors.website)));
  const hosts = [...new Set(filas.filter((f) => !NO_ES_WEB.test(f.web ?? "")).map((f) => hostDe(f.web)).filter((h): h is string => !!h))];
  if (!hosts.length) return { conWeb: 0, webs: [] };
  // Vale lo último que se leyó bien aunque la última lectura haya fallado.
  const leidas = (await db.select().from(competenciaWebs).where(inArray(competenciaWebs.host, hosts)))
    .filter((l) => l.titulo || l.descripcion || (l.encabezados ?? []).length > 0);
  return { conWeb: hosts.length, webs: leidas.map((l) => ({ host: l.host, titulo: l.titulo, descripcion: l.descripcion, encabezados: l.encabezados ?? [] })) };
}

/** Para la ficha, los agentes y Claude: qué trabaja la competencia de ESTE cliente en su web y qué le falta a él. */
export async function webDeLaCompetencia(db: Db, clientId: string): Promise<WebCompetencia> {
  const { conWeb, webs } = await websDeCompetidores(db, clientId);
  const consultas = await db.select({ clave: webRanking.clave, posicion: webRanking.posicion }).from(webRanking)
    .where(and(eq(webRanking.clientId, clientId), eq(webRanking.tipo, "consulta")));
  const conSearchConsole = consultas.length > 0;
  const terminos = cruzarConBusquedas(terminosDeLaCompetencia(webs), conSearchConsole ? consultas : null).slice(0, 20);
  return {
    conWeb, leidas: webs.length, terminos, conSearchConsole,
    faltan: conSearchConsole ? terminos.filter((t) => t.posicionDelCliente == null || t.posicionDelCliente > 10).length : 0,
    nota: [
      `Términos que repiten al menos ${MIN_COMPETIDORES} competidores en el título, la descripción o los encabezados de su portada (${webs.length} de ${conWeb} sitios leídos; se releen cada ${DIAS_ENTRE_LECTURAS} días). Es lo que el sitio declara, no cuánto se busca.`,
      conSearchConsole
        ? "posicionDelCliente: su mejor puesto en Google para una búsqueda con esas palabras (28 días); null = no aparece entre sus búsquedas."
        : "El cliente no tiene Search Console vinculado: no se puede decir en qué puesto está para cada término.",
    ].join(" "),
  };
}

/** Lo que se guarda de una portada: título, descripción y los h1 y h2. Puro. */
export function portadaDe(html: string, url: string): Pick<WebLeida, "titulo" | "descripcion" | "encabezados"> {
  const a = analizarHtml(html, url);
  const h2 = [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)].map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim()).filter(Boolean);
  return { titulo: a.titulo?.slice(0, 300) ?? null, descripcion: a.descripcion?.slice(0, 500) ?? null, encabezados: [...a.h1, ...h2].map((t) => t.slice(0, 200)).slice(0, 25) };
}

const UA = "Mozilla/5.0 (compatible; LMTM-OS; +https://lmtmas.com)";
let corriendo = false;

/** Lee las portadas que nunca se leyeron o que hace más de una semana que no se leen. */
export async function leerWebsCompetencia(db: Db): Promise<{ leidas: number; fallidas: number }> {
  if (corriendo) return { leidas: 0, fallidas: 0 };
  corriendo = true;
  try {
    const filas = await db.select({ web: competitors.website }).from(competitors)
      .innerJoin(clients, eq(clients.id, competitors.clientId))
      .where(and(eq(clients.status, "active"), isNotNull(competitors.website)));
    const urlDe = new Map<string, string>();
    for (const f of filas) {
      const web = (f.web ?? "").trim();
      const host = NO_ES_WEB.test(web) ? null : hostDe(web);
      if (host && !urlDe.has(host)) urlDe.set(host, /^https?:\/\//i.test(web) ? web : `https://${web}`);
    }
    const ya = new Map((await db.select({ host: competenciaWebs.host, revisadoAt: competenciaWebs.revisadoAt }).from(competenciaWebs)).map((r) => [r.host, r.revisadoAt.getTime()]));
    const limite = Date.now() - DIAS_ENTRE_LECTURAS * 86_400_000;
    const tanda = [...urlDe].filter(([h]) => (ya.get(h) ?? 0) < limite).sort((a, b) => (ya.get(a[0]) ?? 0) - (ya.get(b[0]) ?? 0)).slice(0, POR_VUELTA);
    let leidas = 0, fallidas = 0;
    for (const [host, url] of tanda) {
      let estado = "ok";
      let datos: Pick<WebLeida, "titulo" | "descripcion" | "encabezados"> | null = null;
      try {
        const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(12_000), headers: { "User-Agent": UA } });
        if (!r.ok) estado = `HTTP ${r.status}`;
        else datos = portadaDe((await r.text()).slice(0, 2_000_000), url);
      } catch (e) {
        estado = (e instanceof Error ? e.message : String(e)).slice(0, 200);
      }
      if (datos) leidas += 1; else fallidas += 1;
      // Si falla, queda lo último que se leyó bien: un sitio caído un día no borra lo que se sabía.
      await db.insert(competenciaWebs).values({ host, estado, revisadoAt: new Date(), ...(datos ?? {}) })
        .onConflictDoUpdate({ target: competenciaWebs.host, set: { estado, revisadoAt: new Date(), ...(datos ?? {}) } });
    }
    return { leidas, fallidas };
  } finally {
    corriendo = false;
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Cada hora una vuelta: los sitios nuevos primero (un competidor recién cargado se lee en la hora), después una vez por semana. */
export function initCompetenciaWeb(db: Db): void {
  if (timer) return;
  const vuelta = () => {
    void leerWebsCompetencia(db)
      .then((r) => { if (r.leidas || r.fallidas) console.log(`[competencia-web] ${r.leidas} sitios leídos, ${r.fallidas} sin leer`); })
      .catch((e) => console.warn("[competencia-web] falló:", e instanceof Error ? e.message : e));
  };
  setTimeout(vuelta, 6 * 60_000);
  timer = setInterval(vuelta, 3600_000);
}
