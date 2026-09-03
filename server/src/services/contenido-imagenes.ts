// LMTM-OS: generación de placas y carruseles (14/8).
//
// Cierra el circuito de "generar contenido": los tipos de imagen (Post, Photo
// Post, Carrusel, Tips y Trucos, Guia, Articulo, Blog) ya no quedan afuera.
//
// De dónde sale cada placa:
//  · Si el copy de la tarea trae bloques "SLIDE N — Texto: … / Visual: …" (el
//    formato que ya produce IDEA_CERRADA_SPEC), se usa ESO: el equipo escribió
//    el carrusel, no hay que reinventarlo.
//  · Si no, se le pide al modelo que arme los slides a partir del copy.
//
// Las fotos de producto y el avatar del cliente (pestaña Productos) se pasan
// como referencia visual para que la placa sea del cliente y no genérica.

import type { Db } from "@paperclipai/db";
import { clientBrand, clientProducts, clients } from "@paperclipai/db";
import { and, asc, eq } from "drizzle-orm";
import { aiNarrative } from "./agency-ops.js";
import { NON_LATIN_RE } from "./entrega-checks.js";
import { fileIdDeLink, referenciaLocal } from "./contenido-drive.js";
import { generarImagen, SinCreditos } from "./higgsfield.js";
import { modeloImagen, HAY_PERSONAS } from "./higgsfield-cli.js";
import { escenaDeRubro, esIngles, fraseNegativa, limpiarPrompt, marcaEnPrompt, recortar } from "./video-higgsfield.js";

export interface Slide {
  texto: string;
  visual: string;
}

export interface PlacaGenerada {
  url: string;
  slide: number;
  prompt: string;
  texto: string;
}


/**
 * Lee los bloques SLIDE que ya escribió el agente de ideas. El formato viene de
 * IDEA_CERRADA_SPEC: "SLIDE 1 — Texto: X / Visual: Y". Si el equipo ya definió
 * el carrusel, no hay razón para que el modelo lo invente de nuevo.
 */
export function parsearSlides(copy: string): Slide[] {
  const out: Slide[] = [];
  const re = /SLIDE\s*(\d+)\s*[—:-]\s*Texto\s*:\s*([\s\S]*?)(?:\/|\n)\s*Visual\s*:\s*([\s\S]*?)(?=\n\s*SLIDE\s*\d|\n\s*(?:DISEÑO|CTA|COPY)\s*:|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(copy)) !== null) {
    const texto = m[2].trim().replace(/^\[|\]$/g, "").slice(0, 200);
    const visual = recortar(m[3].trim().replace(/^\[|\]$/g, ""), 300);
    if (texto || visual) out.push({ texto, visual });
  }
  return out;
}

/**
 * Convierte los `Visual:` que escribió el equipo en prompts que el modelo pueda
 * usar.
 *
 * Lo que el equipo escribe son indicaciones de producción para un diseñador, en
 * español y a veces con acotaciones: "Foto del terreno vacío antes de la obra
 * (vista aérea o desde la vereda)", "Texto grande sobre fondo neutro". Pasadas
 * tal cual al modelo dan imágenes malas — y "Texto grande sobre fondo neutro" le
 * pide justo lo que no sabe hacer, escribir texto (encontrado 17/8 en el
 * carrusel de obra de GRUPO MA).
 *
 * El TEXTO de cada placa no se toca: eso lo escribió el equipo y va tal cual.
 */
async function traducirVisuales(slides: Slide[], contexto: string, rubro: string | null): Promise<Slide[]> {
  const pendientes = slides.filter((s) => !esIngles(s.visual));
  if (pendientes.length === 0) return slides;

  const sistema = [
    "Convertís indicaciones de producción en prompts para un modelo de imagen.",
    "Te dan una lista numerada en español; devolvés SOLO un JSON array de strings, uno por entrada, en el MISMO orden y la misma cantidad.",
    "Cada string es un prompt en INGLÉS: sujeto concreto + escenario + LUZ (golden hour, soft window light, overcast…) + CÁMARA (35mm wide, 85mm portrait, low angle, overhead…) + estilo.",
    "Resolvé las acotaciones entre paréntesis eligiendo UNA opción; no las arrastres.",
    // El modelo cumplía a medias y devolvía "Large bold typography on clean
    // neutral background" — que le pide justo lo que no sabe hacer, escribir
    // (17/8, slide 7 del carrusel de obra). Se prohíbe nombrar texto.
    "Si la indicación pide texto, tipografía, infografía o placa de cierre, describí SOLO un fondo: superficie o escena limpia, con mucho espacio vacío. PROHIBIDO usar las palabras text, typography, headline, lettering, infographic, sign o poster — el texto lo pone diseño después y el modelo lo escribe mal.",
    "NO menciones marcas ni nombres propios de empresa. Frases positivas: 'tack sharp', nunca 'no blur'.",
  ].join(" ");
  const lista = pendientes.map((s, i) => `${i + 1}. ${s.visual}`).join("\n");

  const salida = await aiNarrative(sistema, `${contexto}\n\nIndicaciones:\n${lista}`);
  if (!salida) return slides;
  let traducidos: string[];
  try {
    const limpio = salida.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    traducidos = JSON.parse(limpio.slice(limpio.indexOf("["), limpio.lastIndexOf("]") + 1)) as string[];
  } catch {
    return slides;
  }
  // Si vuelve otra cantidad, no se sabe qué corresponde con qué: se deja como
  // estaba antes que emparejar mal y ponerle a una placa el visual de otra.
  if (!Array.isArray(traducidos) || traducidos.length !== pendientes.length) return slides;

  let i = 0;
  return slides.map((s) => {
    if (esIngles(s.visual)) return s;
    const nuevo = limpiarPrompt(String(traducidos[i++] ?? ""));
    const deRubro = { ...s, visual: `Clean commercial photo of ${escenaDeRubro(rubro)}, soft natural daylight, uncluttered background, tack sharp` };
    if (nuevo.length <= 15 || NON_LATIN_RE.test(nuevo)) return deRubro;
    // La traduccion se valida con las MISMAS reglas que el resto. Si sigue en
    // espanol o con una frase negativa, devolver el original no sirve (tambien
    // esta en espanol): se cae a una escena del rubro, en ingles, que es lo
    // peor aceptable. Se vio el 18/8: una placa del equipo llegaba en espanol
    // porque aca no habia chequeo de idioma, solo de largo y no-latinos.
    const neg = fraseNegativa(nuevo);
    const sano = neg
      ? nuevo.split(/(?<=[.,])\s+/).filter((frag) => !fraseNegativa(frag)).join(" ").trim()
      : nuevo;
    const candidato = { ...s, visual: recortar(sano, 300) };
    if (sano.length > 15 && !problemaDelSlide(candidato)) return candidato;
    return deRubro;
  });
}

/**
 * Qué tiene de malo el visual de un slide, o null si está bien.
 *
 * Las mismas reglas que se validan en video. El modelo cumple a veces sí y a
 * veces no con las mismas instrucciones (probado 18/8: la misma pieza devolvió
 * un carrusel limpio y otro con español y con "no ..."), así que no alcanza con
 * pedirlo: hay que revisarlo y volver a pedirlo.
 */
function problemaDelSlide(s: Slide): string | null {
  if (s.visual.length < 15) return "quedó vacío";
  if (NON_LATIN_RE.test(s.visual)) return "trae caracteres no latinos";
  if (!esIngles(s.visual)) return "está en español (el campo visual va en INGLÉS)";
  const neg = fraseNegativa(s.visual);
  if (neg) return `usa la frase negativa "${neg}…" (el modelo la lee como parte de la escena y mete justo eso)`;
  if (/\b(typography|lettering|infographic|poster|headline text)\b/i.test(s.visual)) return "le pide texto al modelo, que lo escribe mal";
  // La luz es la mitad de una foto y es lo primero que pide la guía de
  // Higgsfield. Estaba en las instrucciones y no se validaba: 1 de cada 8
  // placas salía sin ninguna (medido 18/8 corriendo la misma pieza 4 veces).
  // La CÁMARA no se exige: una placa de cierre sobre fondo liso no tiene lente
  // que valga, y pedirla dispararía reintentos al pedo.
  if (!/\b(light|lighting|golden hour|sunset|sunrise|overcast|backlit|daylight|lamp|neon|shadow|glow|lit)\b/i.test(s.visual)) {
    return "no dice nada de la LUZ (golden hour, soft window light, overcast diffused…)";
  }
  return null;
}

/**
 * Ultimo recurso para la LUZ: si despues del reintento una placa sigue sin
 * decir nada de iluminacion, se le agrega una por defecto en vez de gastar una
 * tercera llamada al modelo.
 *
 * Medido el 18/8: con reintento quedaba 1 de cada 32 sin luz, y una tercera
 * vuelta cuesta lo mismo que las dos anteriores para arreglar el 3%. Luz suave
 * de dia no arruina ninguna escena, asi que es un default seguro.
 */
function conLuzPorDefecto(s: Slide): Slide {
  if (!problemaDelSlide(s)) return s;
  const conLuz = { ...s, visual: `${s.visual}, soft natural daylight` };
  return problemaDelSlide(conLuz) ? s : conLuz;
}
/** Pide al modelo los slides cuando la tarea no los trae escritos. */
async function pedirSlides(
  contexto: string,
  cantidad: number,
): Promise<Slide[]> {
  const sistema = [
    cantidad === 1
      // Con la instrucción de carrusel y cantidad=1, "portada" y "CTA" caían en
      // la misma placa y el modelo elegía el CTA: salió "Escribinos o llamanos
      // para conocernos" como única placa de un post (17/8). Una placa sola es
      // el gancho, nunca el cierre.
      ? "Armás UNA placa para Instagram a partir de un brief. Es la única imagen: tiene que ser el GANCHO que frena el scroll, NO un CTA ni un cierre."
      : `Armás un carrusel de ${cantidad} placas para Instagram a partir de un brief. El slide 1 es la portada-gancho y el último es el CTA.`,
    'Devolvé SOLO un JSON array de exactamente ' + cantidad + ' objetos: [{"texto":"el texto EXACTO que va sobre la placa, máximo 12 palabras","visual":"qué se ve en la imagen, en inglés, concreto y sensorial"}]',
    "El campo texto va en español rioplatense. El campo visual va en INGLÉS.",
    // Guía oficial de Higgsfield (skill higgsfield-generate): sujeto + escenario
    // + estilo, con cámara y luz concretas. Sin esto salían visuales planos tipo
    // "Aerial view of empty construction site", sin lente ni luz.
    "Cada visual DEBE traer: sujeto concreto, escenario, una indicación de LUZ (golden hour, soft window light, overcast diffused light…) y una de CÁMARA (35mm wide, 85mm portrait, low angle, overhead flat lay…).",
    "En visual NO uses frases negativas ni menciones marcas ni logos.",
    // Misma razón que en traducirVisuales: nombrar texto hace que el modelo lo
    // dibuje, siempre mal escrito. La placa se genera limpia y diseño escribe encima.
    "PROHIBIDO nombrar en visual las palabras text, typography, headline, lettering, infographic, sign o poster: la imagen va limpia y el texto lo pone diseño después.",
  ].join(" ");
  const pedir = async (extra: string): Promise<Slide[]> => {
    const salida = await aiNarrative(extra ? `${sistema}\n\n${extra}` : sistema, contexto);
    if (!salida) return [];
    try {
      const limpio = salida.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
      const arr = JSON.parse(limpio.slice(limpio.indexOf("["), limpio.lastIndexOf("]") + 1));
      if (!Array.isArray(arr)) return [];
      return arr
        .map((x: { texto?: string; visual?: string }) => ({
          texto: String(x.texto ?? "").slice(0, 200),
          visual: recortar(limpiarPrompt(String(x.visual ?? "")), 300),
        }))
        .slice(0, cantidad);
    } catch {
      return [];
    }
  };

  const primero = await pedir("");
  const fallas = primero.map(problemaDelSlide);
  if (primero.length === 0 || fallas.every((f) => f === null)) return primero;

  // Se REPIDE el lote en vez de descartar las placas malas. Filtrarlas dejaba
  // el carrusel corto sin avisar: el equipo pedía 8 y le llegaban 7, con el
  // hilo cortado justo donde faltaba (18/8).
  const detalle = fallas
    .map((f, i) => (f ? `- placa ${i + 1}: ${f}` : null))
    .filter(Boolean).join("\n");
  console.warn(`[higgsfield] repido las placas, ${fallas.filter(Boolean).length}/${primero.length} con problemas`);
  const segundo = await pedir(`Tu respuesta anterior tuvo estos problemas:\n${detalle}\nReescribí el array ENTERO respetando todas las reglas.`);

  // Se elige el intento con menos fallas; empate, el segundo. Devolver algo
  // imperfecto es mejor que devolver nada y dejar la pieza sin generar.
  const fallas2 = segundo.map(problemaDelSlide).filter(Boolean).length;
  if (segundo.length === primero.length && fallas2 <= fallas.filter(Boolean).length) return segundo;
  return segundo.length > 0 && fallas2 < fallas.filter(Boolean).length ? segundo : primero;
}

/** Hasta 2 referencias visuales del cliente: la foto del producto que matchea
 *  con la pieza, y el avatar de marca. */
async function referenciasDe(
  db: Db,
  clientId: string,
  textoPieza: string,
): Promise<string[]> {
  const rutas: string[] = [];
  try {
    const productos = await db
      .select({ name: clientProducts.name, imageUrl: clientProducts.imageUrl, driveFileId: clientProducts.driveFileId })
      .from(clientProducts)
      .where(and(eq(clientProducts.clientId, clientId), eq(clientProducts.active, true)))
      .orderBy(asc(clientProducts.position));
    const t = textoPieza.toLowerCase();
    // El producto nombrado en la pieza gana; si no, el primero cargado.
    const elegido = productos.find((p) => p.name && t.includes(p.name.toLowerCase().slice(0, 12))) ?? productos[0];
    const fid = elegido?.driveFileId ?? fileIdDeLink(elegido?.imageUrl);
    if (fid) rutas.push(await referenciaLocal(fid, "producto.png"));
  } catch { /* sin producto, se sigue */ }
  try {
    const [c] = await db.select({ avatarUrl: clients.avatarUrl }).from(clients).where(eq(clients.id, clientId));
    const fid = fileIdDeLink(c?.avatarUrl);
    if (fid) rutas.push(await referenciaLocal(fid, "avatar.png"));
  } catch { /* sin avatar, se sigue */ }
  return rutas;
}

export interface EntradaPlacas {
  clientId: string;
  clienteNombre: string;
  rubro: string | null;
  tituloPieza: string;
  copy: string | null;
  producto: string | null;
  cantidad: number;
}

/**
 * Los slides y su prompt final, SIN generar ni pagar. Es lo que consume la
 * previsualización (`/api/video/prompt`): revisar qué se va a pedir antes de
 * gastar los créditos.
 */
export async function previsualizarPlacas(
  db: Db,
  input: EntradaPlacas,
): Promise<{ slides: Array<{ slide: number; texto: string; prompt: string; modelo: string }>; referencias: number }> {
  const slides = await armarSlides(input);
  const marca = await paletaDeMarca(db, input.clientId);
  const estilo = marca ?? (slides.length > 1 ? estiloDelCarrusel(input) : "");
  const refs = await referenciasDe(db, input.clientId, `${input.tituloPieza}\n${input.copy ?? ""}`);
  return {
    slides: slides.map((s, i) => {
      const prompt = promptDeSlide(s, input.clienteNombre, estilo);
      return { slide: i + 1, texto: s.texto, prompt, modelo: modeloImagen({ conReferencias: refs.length > 0, conPersonas: HAY_PERSONAS.test(prompt) }) };
    }),
    referencias: refs.length,
  };
}

/** El prompt que se le manda al modelo por cada placa. `cliente` se usa para
 *  detectar que el modelo no metió la marca (dispara ip_detected). */
function promptDeSlide(s: Slide, cliente = "", estilo = ""): string {
  let visual = s.visual;
  // Se borra SOLO la palabra de la marca, no la frase que la contiene. Borrar la
  // frase entera dejaba prompts sin sujeto — "Distrillantas storefront, soft
  // overcast light, 24mm wide angle" quedaba en "soft overcast light, 24mm wide
  // angle", una imagen de nada (17/8). Sin sujeto el modelo inventa cualquier cosa.
  for (let i = 0; i < 3; i++) {
    const marca = marcaEnPrompt(visual, cliente);
    if (!marca) break;
    visual = visual
      .replace(new RegExp(`\\b${marca.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b['’]?s?`, "gi"), "")
      .replace(/\s{2,}/g, " ")
      .replace(/\s+([,.])/g, "$1")
      .replace(/^[\s,]+/, "")
      .trim();
  }
  return promptCrudo(visual.length > 15 ? { ...s, visual } : s, estilo);
}

function promptCrudo(s: Slide, estilo = ""): string {
  // El texto de la placa NO va en el prompt: los modelos escriben mal y con
  // faltas. La imagen se genera limpia y el texto lo pone diseño encima
  // (queda en el comentario de ClickUp para que sepan qué escribir).
  return recortar([
    s.visual,
    estilo,
    "vertical social media format, clean composition with empty space for a headline",
  ].filter(Boolean).join(", "), 800);
}

/**
 * Un carrusel tiene que parecer UNA producción, no seis fotos de bancos
 * distintos.
 *
 * Cada placa se genera en una llamada aparte, así que sin esto el slide 1 sale
 * en clave cálida documental y el 5 en estudio frío — el lector pasa el dedo y
 * ve otra marca. Se fija una "columna vertebral" de estilo (paleta + registro
 * fotográfico) y se le pega a TODAS las placas del mismo carrusel. Es lo primero
 * que haría a mano si generara las seis yo.
 *
 * Determinista a propósito: mismo cliente y misma pieza → mismo estilo, así una
 * regeneración parcial no desentona con las placas que ya se aprobaron.
 */
/**
 * La paleta REAL del cliente, si la cargaron en la pestaña Marca.
 *
 * Es lo primero que separa una placa "del cliente" de una imagen de banco: sin
 * esto se elegía una paleta al azar de una lista fija, y el carrusel quedaba
 * coherente consigo mismo pero ajeno a la marca (18/8).
 */
async function paletaDeMarca(db: Db, clientId: string): Promise<string | null> {
  try {
    const [m] = await db.select({ colores: clientBrand.colores, tono: clientBrand.tono })
      .from(clientBrand).where(eq(clientBrand.clientId, clientId));
    const cols = (m?.colores ?? []).filter((c) => /^#?[0-9a-f]{3,8}$/i.test(c)).slice(0, 4);
    if (cols.length === 0) return null;
    return `brand color palette ${cols.join(", ")}`;
  } catch {
    return null;
  }
}

function estiloDelCarrusel(input: EntradaPlacas): string {
  const PALETAS = [
    "warm neutral palette of sand, cream and soft terracotta",
    "cool palette of slate blue, off-white and muted steel",
    "earthy palette of olive, warm gray and pale wood tones",
    "clean palette of soft white, pale blue and light concrete",
  ];
  const semilla = [...`${input.clientId}${input.tituloPieza}`].reduce((a, c) => a + c.charCodeAt(0), 0);
  // Todo concreto. "consistent look across the whole set" se sacó: el modelo
  // genera UNA imagen por vez y no ve el resto, así que era una instrucción que
  // no puede ejecutar ocupando lugar en el prompt. Lo que de verdad amarra las
  // placas entre sí es la paleta y el grading, que sí son ejecutables.
  return [
    PALETAS[semilla % PALETAS.length],
    "natural film-like color grading, gentle contrast, subtle grain",
  ].join(", ");
}

/** Decide los slides: los que escribió el equipo, los que pide el modelo, o el
 *  fallback determinista. Compartido por la generación y la previsualización. */
async function armarSlides(input: EntradaPlacas): Promise<Slide[]> {
  const contexto = [
    `Cliente: ${input.clienteNombre}${input.rubro ? ` (${input.rubro})` : ""}`,
    `Pieza: ${input.tituloPieza}`,
    input.producto ? `Producto: ${input.producto}` : "",
    input.copy ? `Copy: ${input.copy.slice(0, 1500)}` : "",
  ].filter(Boolean).join("\n");

  let slides: Slide[] = [];
  if (input.cantidad > 1) slides = parsearSlides(input.copy ?? "");
  // Si el equipo escribió los SLIDES, manda SU cantidad: pedía 4 y salían 5
  // porque el default pisaba lo escrito (14/8). Lo que está en la tarea gana.
  if (slides.length >= 2) input = { ...input, cantidad: slides.length };
  if (slides.length < input.cantidad) {
    // También para UNA placa: el nombre de la tarea es "Posteo 45" y no dice
    // nada de qué se ve. El contenido real está en el Copy y en el producto —
    // sacar el visual de ahí es lo que separa una placa usable de una imagen
    // de banco (bug encontrado probando el 14/8: usaba el título).
    const pedidos = await pedirSlides(contexto, input.cantidad);
    if (pedidos.length >= Math.min(2, input.cantidad)) slides = pedidos;
  }
  if (slides.length === 0) {
    // Fallback sin LLM.
    //
    // Antes pegaba el COPY, que esta en espanol: el prompt salia bilingue y con
    // las frases negativas del copy adentro ("No dejes que..."), sin pasar por
    // ningun validador porque este camino los saltea todos. Se vio el 18/8
    // cuando el modelo no respondio dos veces seguidas y la pieza salio con UNA
    // placa en espanol.
    //
    // El producto solo se usa si YA viene en ingles; si no, una escena del
    // rubro, igual que hace el fallback de video.
    const producto = (input.producto ?? "").trim();
    const base = producto && esIngles(producto) && !fraseNegativa(producto)
      ? producto
      : escenaDeRubro(input.rubro);
    slides = [{
      texto: "",
      visual: `Clean commercial photo of ${base}, soft natural daylight, uncluttered background, tack sharp, premium social media style`,
    }];
  }
  slides = slides.slice(0, Math.max(1, input.cantidad));
  // Solo hace falta cuando los slides vinieron de la tarea: los que pide
  // `pedirSlides` ya salen en inglés.
  return (await traducirVisuales(slides, contexto, input.rubro)).map(conLuzPorDefecto);
}

/**
 * Genera N placas. `cantidad` = 1 para un post simple, 3-10 para un carrusel.
 * Devuelve las que salieron bien: una placa fallada no tira abajo el resto.
 */
export async function generarPlacas(db: Db, input: EntradaPlacas): Promise<PlacaGenerada[]> {
  const slides = await armarSlides(input);
  const marca = await paletaDeMarca(db, input.clientId);
  const estilo = marca ?? (slides.length > 1 ? estiloDelCarrusel(input) : "");
  const refs = await referenciasDe(db, input.clientId, `${input.tituloPieza}\n${input.copy ?? ""}`);
  const out: PlacaGenerada[] = [];
  let ultimoError: string | null = null;

  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];
    const prompt = promptDeSlide(s, input.clienteNombre, estilo);

    try {
      // 3:4, no 4:5: el API rechaza 4:5 aunque su openapi publicado diga que lo
      // acepta (verificado 15/8, devuelve literal_error).
      const r = await generarImagen(db, prompt, { referencias: refs });
      out.push({ url: r.url, slide: i + 1, prompt, texto: s.texto });
    } catch (e) {
      if (e instanceof SinCreditos) throw e;
      ultimoError = (e instanceof Error ? e.message : String(e)).slice(0, 400);
      console.warn(`[higgsfield] placa ${i + 1}/${slides.length} falló:`, ultimoError);
    }
  }
  // Sin esto, un fallo de la CLI llegaba al equipo como "ninguna placa salió
  // bien" y había que ir a los logs de Railway para saber por qué.
  if (out.length === 0 && ultimoError) throw new Error(ultimoError);
  return out;
}
