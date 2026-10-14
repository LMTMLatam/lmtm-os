// LMTM-OS: análisis SEO de la web de un cliente (pedido 13/10: "los agentes
// deben poder hacer análisis SEO").
//
// Lee la home como la ve Google: título, descripción, encabezados, canónica,
// indexación, datos estructurados, imágenes sin texto alternativo, robots.txt y
// sitemap. Si PageSpeed Insights contesta, suma la velocidad en celular y los
// Core Web Vitals reales (los de Chrome, no una simulación). Devuelve los
// problemas ordenados por lo que más pesa. Solo lectura: no toca la web.

export interface ProblemaSeo { gravedad: "alta" | "media" | "baja"; que: string; detalle: string }

export interface AnalisisSeo {
  url: string;
  urlFinal: string;
  estado: number;
  https: boolean;
  msCarga: number;
  kb: number;
  titulo: string | null;
  descripcion: string | null;
  h1: string[];
  h2: number;
  canonica: string | null;
  noindex: boolean;
  idioma: string | null;
  viewport: boolean;
  openGraph: boolean;
  datosEstructurados: string[];
  imagenes: number;
  imagenesSinAlt: number;
  palabras: number;
  enlacesInternos: number;
  robotsTxt: boolean | null;
  sitemap: boolean | null;
  /** null = PageSpeed no contestó (cuota o tiempo). */
  pagespeed: { performance: number | null; seo: number | null; lcpMs: number | null; cls: number | null; inpMs: number | null; datosReales: boolean } | null;
  problemas: ProblemaSeo[];
}

const UA = "Mozilla/5.0 (compatible; LMTM-OS SEO; +https://lmtmas.com)";
const limpiar = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const atributo = (tag: string, nombre: string) => tag.match(new RegExp(`${nombre}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1] ?? null;

/** Lo que se puede afirmar del HTML. Pura: es lo que se prueba. */
export function analizarHtml(html: string, url: string): Omit<AnalisisSeo, "url" | "urlFinal" | "estado" | "msCarga" | "kb" | "robotsTxt" | "sitemap" | "pagespeed" | "problemas" | "https"> {
  const meta = (nombre: string) => {
    for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
      const t = m[0];
      if ((atributo(t, "name") ?? atributo(t, "property") ?? "").toLowerCase() === nombre) return atributo(t, "content");
    }
    return null;
  };
  const host = (() => { try { return new URL(url).hostname; } catch { return ""; } })();
  const cuerpo = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ");
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const links = [...html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["']/gi)].map((m) => m[1]);
  const tipos = new Set<string>();
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    for (const t of m[1].matchAll(/"@type"\s*:\s*"([^"]+)"/g)) tipos.add(t[1]);
  }
  return {
    titulo: html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ? limpiar(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)![1]) || null : null,
    descripcion: meta("description"),
    h1: [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => limpiar(m[1])).filter(Boolean).slice(0, 5),
    h2: [...html.matchAll(/<h2\b/gi)].length,
    canonica: (() => { const l = html.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i)?.[0]; return l ? atributo(l, "href") : null; })(),
    noindex: /noindex/i.test(meta("robots") ?? ""),
    idioma: html.match(/<html\b[^>]*\blang=["']([^"']+)["']/i)?.[1] ?? null,
    viewport: meta("viewport") != null,
    openGraph: meta("og:title") != null || meta("og:image") != null,
    datosEstructurados: [...tipos].slice(0, 10),
    imagenes: imgs.length,
    imagenesSinAlt: imgs.filter((t) => !(atributo(t, "alt") ?? "").trim()).length,
    palabras: limpiar(cuerpo).split(" ").filter((w) => w.length > 1).length,
    enlacesInternos: links.filter((h) => h.startsWith("/") || (host && h.includes(host))).length,
  };
}

/** Los problemas, de lo que más pesa a lo que menos. Pura. */
export function problemasSeo(a: Omit<AnalisisSeo, "problemas">): ProblemaSeo[] {
  const p: ProblemaSeo[] = [];
  if (a.estado >= 400) p.push({ gravedad: "alta", que: "La web no carga", detalle: `Responde HTTP ${a.estado}.` });
  if (a.noindex) p.push({ gravedad: "alta", que: "Google tiene prohibido indexarla", detalle: "La home tiene meta robots noindex: no aparece en búsquedas." });
  if (!a.https) p.push({ gravedad: "alta", que: "Sin HTTPS", detalle: "Chrome la marca como no segura y Google la penaliza." });
  if (!a.titulo) p.push({ gravedad: "alta", que: "Sin título", detalle: "Falta <title>: es lo que Google muestra como enlace." });
  else if (a.titulo.length > 65) p.push({ gravedad: "baja", que: "Título largo", detalle: `${a.titulo.length} caracteres: Google corta cerca de 60.` });
  else if (a.titulo.length < 15) p.push({ gravedad: "media", que: "Título muy corto", detalle: `"${a.titulo}" no dice qué hace ni dónde.` });
  if (!a.descripcion) p.push({ gravedad: "media", que: "Sin descripción", detalle: "Falta meta description: Google arma una con cualquier texto de la página." });
  else if (a.descripcion.length > 160) p.push({ gravedad: "baja", que: "Descripción larga", detalle: `${a.descripcion.length} caracteres: se corta cerca de 155.` });
  if (a.h1.length === 0) p.push({ gravedad: "media", que: "Sin H1", detalle: "La página no tiene un encabezado principal." });
  else if (a.h1.length > 1) p.push({ gravedad: "baja", que: `${a.h1.length} H1`, detalle: "Conviene uno solo, con el servicio y la zona." });
  if (!a.viewport) p.push({ gravedad: "alta", que: "No está adaptada a celular", detalle: "Falta meta viewport: en celular se ve como escritorio achicado." });
  if (a.pagespeed?.performance != null && a.pagespeed.performance < 50) p.push({ gravedad: "alta", que: "Lenta en celular", detalle: `PageSpeed ${a.pagespeed.performance}/100.${a.pagespeed.lcpMs ? ` El contenido principal tarda ${(a.pagespeed.lcpMs / 1000).toFixed(1)} s en aparecer.` : ""}` });
  else if (a.pagespeed?.performance != null && a.pagespeed.performance < 80) p.push({ gravedad: "media", que: "Velocidad mejorable en celular", detalle: `PageSpeed ${a.pagespeed.performance}/100.` });
  if (a.sitemap === false) p.push({ gravedad: "media", que: "Sin sitemap.xml", detalle: "Google tarda más en encontrar las páginas nuevas." });
  if (a.datosEstructurados.length === 0) p.push({ gravedad: "media", que: "Sin datos estructurados", detalle: "Sin schema (LocalBusiness, Organization…) no salen dirección, horario ni reseñas en Google." });
  if (a.imagenesSinAlt > 0) p.push({ gravedad: a.imagenesSinAlt > 10 ? "media" : "baja", que: `${a.imagenesSinAlt} de ${a.imagenes} imágenes sin texto alternativo`, detalle: "Google no las entiende y no aparecen en Imágenes." });
  if (!a.canonica) p.push({ gravedad: "baja", que: "Sin URL canónica", detalle: "Puede haber versiones duplicadas de la misma página." });
  if (!a.openGraph) p.push({ gravedad: "baja", que: "Sin Open Graph", detalle: "Al compartir el link en WhatsApp o redes sale sin imagen ni título." });
  if (a.palabras < 250 && a.estado < 400) p.push({ gravedad: "media", que: "Poco texto", detalle: `${a.palabras} palabras en la home: Google no tiene de qué entender a qué se dedica.` });
  if (a.robotsTxt === false) p.push({ gravedad: "baja", que: "Sin robots.txt", detalle: "No es grave, pero es donde se le indica a Google el sitemap." });
  const orden = { alta: 0, media: 1, baja: 2 };
  return p.sort((x, y) => orden[x.gravedad] - orden[y.gravedad]);
}

/** ¿Existe el archivo? Por su contenido: muchas webs contestan 200 con una página común a lo que no tienen. */
async function existe(url: string, contenido: RegExp): Promise<boolean | null> {
  try {
    const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(10_000), headers: { "User-Agent": UA } });
    if (!r.ok) return r.status === 404 || r.status === 410 ? false : null;
    return contenido.test((await r.text()).slice(0, 5_000));
  } catch {
    return null;
  }
}

async function pageSpeed(url: string): Promise<AnalisisSeo["pagespeed"]> {
  try {
    const q = new URLSearchParams({ url, strategy: "mobile" });
    q.append("category", "performance");
    q.append("category", "seo");
    const key = process.env.GOOGLE_PAGESPEED_KEY?.trim();
    if (key) q.set("key", key);
    const r = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${q}`, { signal: AbortSignal.timeout(70_000) });
    if (!r.ok) return null;
    const j = (await r.json()) as {
      lighthouseResult?: { categories?: Record<string, { score?: number }>; audits?: Record<string, { numericValue?: number }> };
      loadingExperience?: { metrics?: Record<string, { percentile?: number }> };
    };
    const cat = j.lighthouseResult?.categories ?? {};
    const real = j.loadingExperience?.metrics ?? {};
    const lab = j.lighthouseResult?.audits ?? {};
    const pct = (s?: number) => (typeof s === "number" ? Math.round(s * 100) : null);
    return {
      performance: pct(cat.performance?.score), seo: pct(cat.seo?.score),
      lcpMs: real.LARGEST_CONTENTFUL_PAINT_MS?.percentile ?? lab["largest-contentful-paint"]?.numericValue ?? null,
      cls: real.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile != null ? real.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100 : (lab["cumulative-layout-shift"]?.numericValue ?? null),
      inpMs: real.INTERACTION_TO_NEXT_PAINT?.percentile ?? null,
      datosReales: Object.keys(real).length > 0,
    };
  } catch {
    return null;
  }
}

/** Analiza la home de una web. */
export async function analizarSeo(url: string): Promise<AnalisisSeo> {
  const u = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  const t0 = Date.now();
  const r = await fetch(u, { redirect: "follow", signal: AbortSignal.timeout(20_000), headers: { "User-Agent": UA } });
  const html = await r.text();
  const ms = Date.now() - t0;
  const final = r.url || u;
  const origen = new URL(final).origin;
  const [robotsTxt, sitemap, ps] = await Promise.all([
    existe(`${origen}/robots.txt`, /user-agent|disallow|sitemap:/i),
    existe(`${origen}/sitemap.xml`, /<urlset|<sitemapindex/i),
    pageSpeed(final),
  ]);
  const base = {
    url: u, urlFinal: final, estado: r.status, https: final.startsWith("https://"), msCarga: ms,
    kb: Math.round(Buffer.byteLength(html) / 1024), ...analizarHtml(html, final), robotsTxt, sitemap, pagespeed: ps,
  };
  return { ...base, problemas: problemasSeo(base) };
}
