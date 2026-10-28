// LMTM-OS: cliente de los modelos de NVIDIA (endpoint compatible con OpenAI).
//
// Dos modelos, cada uno para lo que sabe hacer:
//   kimi-k3    — VE IMÁGENES. Es lo único de la flota que puede mirar una placa
//                antes de que salga publicada.
//   deepseek-v4-pro — texto y análisis, sin reasoning_content y sin fuga de CJK,
//                que es el problema crónico de MiniMax en español.
//
// LA TRAMPA QUE ESTE MÓDULO EXISTE PARA EVITAR (ya pasó dos veces acá):
// kimi-k3 es un modelo de RAZONAMIENTO. Gasta tokens pensando antes de
// responder, y si el presupuesto no alcanza devuelve `content: null` con el
// texto en `reasoning_content` y `finish_reason: "length"`. HTTP 200. Medido el
// 11/9/26: con max_tokens 16 devolvió content null; con 4096 respondió bien.
// Es exactamente el bug que dejó a MiniMax devolviendo vacío durante semanas
// mientras todo figuraba en verde (ver aiNarrative / commit dac82cd).
//
// Por eso acá: (1) hay un piso de tokens que no se puede bajar por accidente, y
// (2) si aun así vuelve vacío se distingue del error de red — `motivo` dice cuál
// de los dos fue. Devolver null a secas es lo que hizo que nadie se enterara.

const BASE = (process.env.NVIDIA_BASE_URL?.trim() || "https://integrate.api.nvidia.com/v1").replace(/\/$/, "");

export const MODELO_VISION = process.env.NVIDIA_MODEL_VISION?.trim() || "moonshotai/kimi-k3";
/**
 * OJO: los modelos del catálogo de NVIDIA SE MUEREN con aviso corto.
 * `deepseek-v4-pro-0813` se integró el 11/9/26 y llegó a su end of life el
 * 14/9 a las 08:00 UTC — tres días. Devuelve HTTP **410 Gone** con el detalle,
 * no un 404, así que se ve claro en `detalle` si vuelve a pasar. El reemplazo
 * es flash, verificado el mismo día.
 */
export const MODELO_TEXTO = process.env.NVIDIA_MODEL_TEXTO?.trim() || "nvidia/nemotron-3-super-120b-a12b";
/**
 * 7/10/26: deepseek-v4-flash-0731 también murió (HTTP 410) y nadie se enteró:
 * aiNarrative caía a MiniMax en silencio y la voz de marca (marca-aprendida)
 * dejó de aprenderse. Reemplazo: nemotron-3-super (23 s, buen rioplatense).
 * Si el principal devuelve 404/410 se reintenta con este, rápido y vivo
 * (gpt-oss-20b, 3-11 s). deepseek-v4.1-flash y glm-5.3-flash no contestaban
 * en 180 s; kimi-k2.6 y mistral-large dan 404 para esta cuenta.
 */
export const MODELO_TEXTO_RESPALDO = process.env.NVIDIA_MODEL_TEXTO_RESPALDO?.trim() || "openai/gpt-oss-20b";

/** ¿El modelo ya no existe para esta cuenta? (fin de vida o no habilitado) */
export function modeloMuerto(r: Pick<RespuestaModelo, "motivo" | "detalle">): boolean {
  return r.motivo === "http" && /^(404|410)\b/.test(r.detalle ?? "");
}

/** Piso de tokens para un modelo de razonamiento. Por debajo de esto el
 *  razonamiento se come la respuesta y `content` vuelve vacío. Medido: 16 falla,
 *  4096 alcanza de sobra para una descripción de imagen (734 tokens reales). */
export const MIN_TOKENS_RAZONAMIENTO = 2048;

/** Sube cualquier presupuesto por debajo del piso. Pura para poder probarla:
 *  es la única defensa contra que alguien copie un `max_tokens: 300` de otro
 *  servicio y rompa todo en silencio. */
export function tokensSeguros(pedidos: number | undefined, esDeRazonamiento: boolean): number {
  const base = pedidos && pedidos > 0 ? pedidos : 4096;
  return esDeRazonamiento ? Math.max(base, MIN_TOKENS_RAZONAMIENTO) : base;
}

export function nvidiaConfigurado(): boolean {
  return Boolean(process.env.NVIDIA_API_KEY_VISION?.trim() || process.env.NVIDIA_API_KEY?.trim());
}

/** ¿Hay algún modelo que pueda mirar una imagen? (GPT o kimi) */
export function visionConfigurada(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim()) || nvidiaConfigurado();
}

/** Modelo de visión de OpenAI: el mismo que revisa los videos del Productor. */
export const MODELO_VISION_OPENAI = process.env.OPENAI_MODEL_VISION?.trim() || "gpt-6.1-terra";

async function verImagenOpenAI(
  instruccion: string,
  imagenUrl: string,
  clave: string,
  opts: { maxTokens?: number },
): Promise<RespuestaModelo> {
  try {
    // Sin temperature: los modelos que razonan solo aceptan la de fábrica.
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${clave}` },
      body: JSON.stringify({
        model: MODELO_VISION_OPENAI,
        messages: [{ role: "user", content: [{ type: "text", text: instruccion }, { type: "image_url", image_url: { url: imagenUrl } }] }],
        max_completion_tokens: tokensSeguros(opts.maxTokens, true),
      }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!r.ok) return { texto: null, motivo: "http", detalle: `${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}` };
    const j = (await r.json()) as { choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>; usage?: { total_tokens?: number } };
    const c = j.choices?.[0];
    const texto = (c?.message?.content ?? "").trim();
    if (texto) return { texto, tokens: j.usage?.total_tokens };
    return { texto: null, motivo: c?.finish_reason === "length" ? "razonamiento_sin_texto" : "vacio", detalle: `${MODELO_VISION_OPENAI} finish_reason=${c?.finish_reason ?? "?"}` };
  } catch (e) {
    return { texto: null, motivo: "red", detalle: e instanceof Error ? e.message : String(e) };
  }
}

/** El motivo por el que no hubo texto. Sirve para no confundir "el modelo no
 *  contestó" con "el modelo contestó y nos comimos la respuesta". */
export type MotivoVacio = "sin_clave" | "http" | "red" | "razonamiento_sin_texto" | "vacio";

export interface RespuestaModelo {
  texto: string | null;
  motivo?: MotivoVacio;
  /** Detalle para el log; nunca contiene la clave. */
  detalle?: string;
  tokens?: number;
}

type Contenido = string | Array<Record<string, unknown>>;

/**
 * Saca las mitades sueltas de pares sustitutos (un emoji o una letra en negrita
 * tipo "𝗘𝗡 𝗩𝗘𝗡𝗧𝗔" cortados por un .slice). JSON.stringify las escribe como
 * "\ud835" y NVIDIA rechaza el pedido entero con HTTP 400 ("unexpected end of
 * hex escape"): el 7/10 tiró 3 de cada 4 lotes del clasificador de ángulos.
 */
export function sinSustitutosSueltos(texto: string): string {
  return texto.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
}

const limpiarContenido = (c: Contenido): Contenido => (typeof c === "string" ? sinSustitutosSueltos(c) : c);

async function llamar(
  modelo: string,
  clave: string,
  mensajes: Array<{ role: string; content: Contenido }>,
  opts: { maxTokens?: number; temperature?: number; esDeRazonamiento?: boolean; timeoutMs?: number } = {},
): Promise<RespuestaModelo> {
  const max_tokens = tokensSeguros(opts.maxTokens, opts.esDeRazonamiento !== false);
  try {
    const r = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${clave}` },
      body: JSON.stringify({
        model: modelo,
        messages: mensajes.map((m) => ({ ...m, content: limpiarContenido(m.content) })),
        max_tokens,
        temperature: opts.temperature ?? 0.4,
        stream: false,
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 180_000),
    });
    if (!r.ok) {
      const cuerpo = await r.text().catch(() => "");
      return { texto: null, motivo: "http", detalle: `${r.status}: ${cuerpo.slice(0, 200)}` };
    }
    const j = (await r.json()) as {
      choices?: Array<{ message?: { content?: string | null; reasoning_content?: string | null }; finish_reason?: string }>;
      usage?: { total_tokens?: number };
    };
    const c = j.choices?.[0];
    const texto = (c?.message?.content ?? "").trim();
    if (texto) return { texto, tokens: j.usage?.total_tokens };

    // Vacío con razonamiento presente = el presupuesto se fue en pensar. Se
    // reporta distinto a propósito: es un problema de configuración nuestro, no
    // del modelo, y confundirlo con un fallo de red hace que nadie lo arregle.
    if (c?.message?.reasoning_content) {
      return {
        texto: null, motivo: "razonamiento_sin_texto",
        detalle: `${modelo} gastó el presupuesto razonando (finish_reason=${c.finish_reason}, max_tokens=${max_tokens}). Subir max_tokens.`,
      };
    }
    return { texto: null, motivo: "vacio", detalle: `finish_reason=${c?.finish_reason ?? "?"}` };
  } catch (e) {
    return { texto: null, motivo: "red", detalle: e instanceof Error ? e.message : String(e) };
  }
}

/** Clave del modelo de visión; cae a la general si no hay una dedicada. */
const claveVision = () => process.env.NVIDIA_API_KEY_VISION?.trim() || process.env.NVIDIA_API_KEY?.trim() || "";
/** Idem para texto. Se separan porque son cuotas del free tier distintas: con
 *  una sola clave, un pico de visión deja sin presupuesto al análisis. */
const claveTexto = () => process.env.NVIDIA_API_KEY_TEXTO?.trim() || process.env.NVIDIA_API_KEY?.trim() || "";

/**
 * Mirar una imagen y responder sobre ella.
 *
 * `imagenUrl` tiene que ser accesible públicamente o un data: URI — el modelo la
 * descarga del lado de NVIDIA, así que una URL de Drive con permiso restringido
 * falla aunque en el navegador se vea.
 */
export async function verImagen(
  instruccion: string,
  imagenUrl: string,
  opts: { maxTokens?: number } = {},
): Promise<RespuestaModelo> {
  // 28/10: kimi ya no está; con OPENAI_API_KEY mira GPT (también razona: mismo piso).
  const openai = process.env.OPENAI_API_KEY?.trim();
  if (openai) return verImagenOpenAI(instruccion, imagenUrl, openai, opts);
  const clave = claveVision();
  if (!clave) return { texto: null, motivo: "sin_clave", detalle: "falta NVIDIA_API_KEY_VISION" };
  return llamar(MODELO_VISION, clave, [{
    role: "user",
    content: [
      { type: "text", text: instruccion },
      { type: "image_url", image_url: { url: imagenUrl } },
    ],
  }], { ...opts, esDeRazonamiento: true });
}

/**
 * Análisis de texto.
 *
 * Se trata como modelo de razonamiento A PROPÓSITO, aunque alguno no lo sea:
 * aplicarle el piso de tokens a un modelo que no razona no cuesta nada (solo le
 * da más aire), y NO aplicárselo a uno que sí razona pierde la respuesta entera
 * en silencio con HTTP 200. El costo de equivocarse es asimétrico, así que se
 * elige el lado barato.
 *
 * Esto no es teórico: `deepseek-v4-pro` no devolvía `reasoning_content` y su
 * reemplazo `deepseek-v4-flash` SÍ. Con el flag en false, cambiar de modelo
 * habría reintroducido el bug del content vacío sin tocar una línea del guard.
 */
export async function analizarTexto(
  system: string,
  usuario: string,
  opts: { maxTokens?: number; temperature?: number; modelo?: string } = {},
): Promise<RespuestaModelo> {
  const clave = claveTexto();
  if (!clave) return { texto: null, motivo: "sin_clave", detalle: "falta NVIDIA_API_KEY_TEXTO" };
  const mensajes = [
    { role: "system", content: system },
    { role: "user", content: usuario },
  ];
  const modelo = opts.modelo ?? MODELO_TEXTO;
  const r = await llamar(modelo, clave, mensajes, { ...opts, esDeRazonamiento: true });
  if (!modeloMuerto(r) || modelo === MODELO_TEXTO_RESPALDO) return r;
  console.warn(`[nvidia] ${modelo} no existe más (${(r.detalle ?? "").slice(0, 80)}): uso ${MODELO_TEXTO_RESPALDO}`);
  return llamar(MODELO_TEXTO_RESPALDO, clave, mensajes, { ...opts, esDeRazonamiento: true });
}
