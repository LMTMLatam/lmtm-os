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
export const MODELO_TEXTO = process.env.NVIDIA_MODEL_TEXTO?.trim() || "deepseek-ai/deepseek-v4-pro-0813";

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
        messages: mensajes,
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

/** Análisis de texto. No es de razonamiento, así que no necesita el piso. */
export async function analizarTexto(
  system: string,
  usuario: string,
  opts: { maxTokens?: number; temperature?: number } = {},
): Promise<RespuestaModelo> {
  const clave = claveTexto();
  if (!clave) return { texto: null, motivo: "sin_clave", detalle: "falta NVIDIA_API_KEY_TEXTO" };
  return llamar(MODELO_TEXTO, clave, [
    { role: "system", content: system },
    { role: "user", content: usuario },
  ], { ...opts, esDeRazonamiento: false });
}
