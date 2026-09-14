// LMTM-OS: reglas de cada red, aplicadas ANTES de que el post llegue a su fecha.
//
// El pipeline genera contenido y lo deja en ClickUp; el despachador de Make lo
// manda al llegar `start_date`. Entre esas dos cosas no hay NADA que chequee que
// la pieza cumpla las reglas de la red destino: un copy de 900 caracteres para
// Pinterest (máximo 500), o un post a YouTube sin video, se descarta abajo — y
// la tarea igual queda etiquetada "mandado a make", porque esa etiqueta la pone
// ClickUp antes de que Make haga nada. Es el mismo verde mentiroso de siempre,
// una capa más arriba.
//
// SOBRE EL ORIGEN DE ESTAS REGLAS: se relevaron mirando qué valida Postiz
// (github.com/gitroomhq/postiz-app) para no olvidarse ninguna, pero los límites
// son de las plataformas —son hechos públicos y documentados por Meta, Google,
// LinkedIn y Pinterest— y esta implementación es propia. NO se copió código:
// Postiz es AGPL-3.0 y copiarlo obligaría a abrir LMTM-OS entero.

/** Los nombres que usa el campo "Plataformas" de ClickUp, normalizados. */
export type Red = "instagram" | "facebook" | "linkedin" | "youtube" | "pinterest" | "gmb" | "tiktok" | "x";

export interface ReglaRed {
  nombre: string;
  /** Tope de caracteres del texto que acompaña la pieza. */
  maxTexto: number;
  /** La red no acepta un post sin imagen ni video. */
  exigeMedia: boolean;
  /** Solo acepta video (YouTube). */
  soloVideo: boolean;
  /** Tope de piezas en un carrusel. null = no aplica. */
  maxCarrusel: number | null;
  /** Mínimo de piezas para que sea carrusel. */
  minCarrusel: number | null;
}

/**
 * Límites por red. Son los de las plataformas, no de LMTM.
 *
 * `maxTexto` de YouTube es el de la DESCRIPCIÓN; el título tiene su propio tope
 * de 100 en la UI aunque la API acepte más, y acá se valida el cuerpo, que es lo
 * que carga el equipo en "Copy o/y Subtitulo".
 */
export const REGLAS: Record<Red, ReglaRed> = {
  instagram: { nombre: "Instagram", maxTexto: 2200, exigeMedia: true, soloVideo: false, maxCarrusel: 10, minCarrusel: 2 },
  facebook: { nombre: "Facebook", maxTexto: 63_206, exigeMedia: false, soloVideo: false, maxCarrusel: null, minCarrusel: null },
  linkedin: { nombre: "LinkedIn", maxTexto: 3000, exigeMedia: false, soloVideo: false, maxCarrusel: null, minCarrusel: 2 },
  youtube: { nombre: "YouTube", maxTexto: 5000, exigeMedia: true, soloVideo: true, maxCarrusel: null, minCarrusel: null },
  pinterest: { nombre: "Pinterest", maxTexto: 500, exigeMedia: true, soloVideo: false, maxCarrusel: 5, minCarrusel: null },
  gmb: { nombre: "Google Business", maxTexto: 1500, exigeMedia: false, soloVideo: false, maxCarrusel: null, minCarrusel: null },
  tiktok: { nombre: "TikTok", maxTexto: 2200, exigeMedia: true, soloVideo: true, maxCarrusel: null, minCarrusel: null },
  x: { nombre: "X", maxTexto: 280, exigeMedia: false, soloVideo: false, maxCarrusel: 4, minCarrusel: null },
};

/**
 * El campo "Plataformas" lo cargan personas: viene con mayúsculas, acentos,
 * plurales y nombres viejos ("Google My Business", "Twitter"). Sin normalizar,
 * una red mal escrita se saltea el control sin que nadie lo note — que es peor
 * que no tener control.
 */
/** Minusculas, sin acentos y sin espacios al borde. Uno solo para todos los
 *  puntos donde se lee el campo Plataformas, que lo cargan personas. */
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

export function aRed(etiqueta: string): Red | null {
  const t = norm(etiqueta);
  if (/instagram|^ig\b/.test(t)) return "instagram";
  if (/facebook|^fb\b|^face\b/.test(t)) return "facebook";
  if (/linkedin/.test(t)) return "linkedin";
  if (/youtube|^yt\b/.test(t)) return "youtube";
  if (/pinterest/.test(t)) return "pinterest";
  // "Google" a secas en el campo Plataformas ES Google Business: los clientes
  // que lo tienen cargado publican por `google-my-business` en Make. Verificado
  // el 14/9/26 cruzando las etiquetas de ClickUp con los paquetes que usan los
  // escenarios (26 escenarios activos con ese paquete, 19 posts con la etiqueta).
  if (/^google$|google.*(business|my business|negocio)|^gmb\b|perfil de empresa/.test(t)) return "gmb";
  if (/tiktok|tik tok/.test(t)) return "tiktok";
  if (/twitter|^x$/.test(t)) return "x";
  return null;
}

/** ¿El formato cargado en "Tipo de Contenido" es un video? */
export function esVideo(formato: string | null | undefined): boolean {
  if (!formato) return false;
  return /reel|video|v[ií]deo|short|clip|tiktok/i.test(formato);
}

/** ¿Y es un carrusel? */
export function esCarrusel(formato: string | null | undefined): boolean {
  if (!formato) return false;
  return /carrusel|carousel|slides?/i.test(formato);
}

export interface PiezaAValidar {
  /** Etiquetas tal cual vienen del campo "Plataformas". */
  redes: string[];
  /** Largo del texto que va a acompañar la pieza. */
  largoTexto: number;
  /** "Tipo de Contenido": Reel, Carrusel, Placa, Story… */
  formato: string | null;
  /** Cuántas piezas tiene. null = no se sabe (no se inventa un veredicto). */
  cantidadPiezas?: number | null;
}

export interface ProblemaRed {
  red: Red;
  problema: string;
}

/**
 * Redes que existen y que el equipo carga en "Plataformas", pero que el
 * despachador de Make (escenario 1427144) **descarta en silencio**: no tiene
 * ruta para ellas y la tarea igual queda etiquetada como enviada.
 *
 * No son un error de carga — son un agujero del pipeline. Se reportan aparte de
 * las mal escritas porque se arreglan distinto: una se corrige en la tarea, la
 * otra se corrige en Make.
 */
export const REDES_SIN_RUTA = ["whatsapp", "reddit", "threads", "bluesky", "telegram"] as const;

function sinRuta(t: string): string | null {
  if (/whatsapp|^wsp\b|^wa\b/.test(t)) return "WhatsApp";
  if (/reddit/.test(t)) return "Reddit";
  if (/threads/.test(t)) return "Threads";
  if (/bluesky|^bsky\b/.test(t)) return "Bluesky";
  if (/telegram/.test(t)) return "Telegram";
  return null;
}

/**
 * Qué va a fallar cuando esta pieza llegue a su fecha.
 *
 * Devuelve UN problema por red y por causa, en el orden en que conviene
 * arreglarlos. Una red que no se reconoce NO se reporta como problema de la
 * pieza — se reporta aparte, porque el que hay que arreglar es el campo.
 */
export function validarPieza(p: PiezaAValidar): { problemas: ProblemaRed[]; redesDesconocidas: string[]; redesSinRuta: string[] } {
  const problemas: ProblemaRed[] = [];
  const redesDesconocidas: string[] = [];
  const redesSinRuta: string[] = [];
  const vistas = new Set<Red>();

  for (const etiqueta of p.redes) {
    const red = aRed(etiqueta);
    if (!red) {
      const t = norm(etiqueta);
      const conocida = sinRuta(t);
      if (conocida) redesSinRuta.push(conocida);
      else if (etiqueta.trim()) redesDesconocidas.push(etiqueta.trim());
      continue;
    }
    if (vistas.has(red)) continue;
    vistas.add(red);
    const r = REGLAS[red];

    if (p.largoTexto > r.maxTexto) {
      problemas.push({
        red,
        problema: `El texto tiene ${p.largoTexto} caracteres y ${r.nombre} acepta ${r.maxTexto}. Sobran ${p.largoTexto - r.maxTexto}.`,
      });
    }

    if (r.soloVideo && p.formato && !esVideo(p.formato)) {
      problemas.push({
        red,
        problema: `${r.nombre} solo publica video y el Tipo de Contenido es "${p.formato}".`,
      });
    }

    // Las cantidades solo se juzgan cuando se conocen: sin el dato, decir que
    // está bien es tan falso como decir que está mal.
    if (typeof p.cantidadPiezas === "number") {
      if (r.exigeMedia && p.cantidadPiezas === 0) {
        problemas.push({ red, problema: `${r.nombre} no acepta un post sin imagen ni video.` });
      }
      if (esCarrusel(p.formato)) {
        if (r.maxCarrusel !== null && p.cantidadPiezas > r.maxCarrusel) {
          problemas.push({
            red,
            problema: `El carrusel tiene ${p.cantidadPiezas} piezas y ${r.nombre} acepta ${r.maxCarrusel}.`,
          });
        }
        if (r.minCarrusel !== null && p.cantidadPiezas > 0 && p.cantidadPiezas < r.minCarrusel) {
          problemas.push({
            red,
            problema: `Un carrusel de ${r.nombre} necesita al menos ${r.minCarrusel} piezas y tiene ${p.cantidadPiezas}.`,
          });
        }
      }
    }
  }

  return {
    problemas,
    redesDesconocidas: [...new Set(redesDesconocidas)],
    redesSinRuta: [...new Set(redesSinRuta)],
  };
}

/** El tope más chico entre las redes elegidas: lo que tiene que respetar el copy
 *  para servir a todas. Es el número que necesita quien escribe. */
export function topeDeTexto(redes: string[]): { tope: number; red: string } | null {
  let mejor: { tope: number; red: string } | null = null;
  for (const e of redes) {
    const red = aRed(e);
    if (!red) continue;
    const r = REGLAS[red];
    if (!mejor || r.maxTexto < mejor.tope) mejor = { tope: r.maxTexto, red: r.nombre };
  }
  return mejor;
}
