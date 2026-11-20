// La FICHA de un video viral (plan 17/11, fases 1.5 y 6): lo medido con vtool referencia + preguntas sí/no fijas que
// responde un modelo de visión mirando dos hojas (los primeros 3 s y el video entero) y la transcripción. Las mismas
// preguntas usó el estudio base (redes/estudio.py + Claude mirando): con ese set validado se toma el examen a los
// agentes (≥ 85 % de coincidencia) antes de que carguen plantillas solos.
import type { FormaDeVideo } from "@paperclipai/db";

/** autor de las filas del estudio que respondió una persona: solo contra esas se toma el examen (las del modelo no). */
export const AUTOR_PERSONA = "estudio:persona";

/** clave → pregunta. Cambiar una clave rompe la comparación con el set validado: sumar, no renombrar. */
export const PREGUNTAS_FICHA: Record<string, string> = {
  // Gancho (0–2 s)
  cara_primer_cuadro: "¿Se ve la cara de una persona en el primer cuadro?",
  texto_antes_1s: "¿Hay texto en pantalla (no subtítulo de lo que se dice) antes del segundo 1?",
  pregunta_en_gancho: "¿El gancho (lo que se dice o lee en 0–2 s) es una pregunta?",
  numero_en_gancho: "¿El gancho tiene un número, precio o dato concreto?",
  contraste_antes_despues: "¿El gancho muestra un contraste o un antes/después?",
  promesa_beneficio: "¿El gancho promete un beneficio o un resultado?",
  arranca_en_accion: "¿Arranca en medio de la acción, sin presentación ni saludo?",
  producto_o_lugar_1s: "¿Se ve el producto, el lugar o el resultado en el primer segundo?",
  movimiento_antes_1s: "¿Hay un movimiento fuerte de cámara, un zoom o un corte antes del segundo 1?",
  // Edición
  subtitulos_palabra: "¿Tiene subtítulos que aparecen de a pocas palabras (1–4)?",
  palabra_resaltada: "¿Los subtítulos resaltan alguna palabra con otro color o tamaño?",
  zoom_en_palabra: "¿Hay zooms o acercamientos en momentos clave (no solo el movimiento de la cámara)?",
  broll_sobre_voz: "¿Mientras alguien habla se ven otras imágenes (b-roll, insertos) sobre la voz?",
  motion_graficos: "¿Tiene motion graphics: tarjetas, números animados, flechas, íconos, títulos animados?",
  transiciones: "¿Tiene transiciones marcadas entre planos (barridos, deslizamientos, zoom de transición)?",
  // Sin preguntas de sonido (18/11): mirando hojas no se escucha; el volumen lo mide vtool referencia.
  voz_a_camara: "¿Alguien habla mirando a cámara (y no solo voz en off)?",
  filmado_con_celular: "¿Parece filmado con celular (no con cámara profesional, luces y lentes)?",
  // Contenido
  persona_del_negocio: "¿Aparece una persona del negocio (dueño, vendedor, empleado)?",
  muestra_precio: "¿Muestra o dice un precio?",
  humor: "¿Usa humor?",
  ensena_algo: "¿Enseña algo (consejo, cómo se hace, error a evitar)?",
  // 18/11: «resultado final» a secas confundía al modelo con la propiedad o el producto en venta (69 % en el examen).
  muestra_resultado: "¿Muestra un resultado logrado (obra terminada, antes/después, cliente usando el producto o contento, cifras conseguidas)? Mostrar lo que se vende no cuenta.",
  cta_explicito: "¿Pide una acción explícita (escribinos, comentá, link, guardalo)?",
  loop_final: "¿El final engancha con el principio (loop) o corta seco para que se repita?",
  marca_0_3s: "¿Se ve la marca o el logo del negocio en los primeros 3 s?",
};

/** Puro: la línea de `vtool referencia` → forma. null si el formato cambió (no inventa). */
export function leerReferencia(salida: string): FormaDeVideo | null {
  const m = /(\d+):(\d+(?:\.\d+)?)\s*\|\s*(\d+) cortes, plano medio ([\d.]+) s, primer corte (None|[\d.]+) s \| ([\d.]+) pal\/s \| (None|-?[\d.]+) LUFS \| brillo (None|\d+) sat (None|\d+)/.exec(salida);
  if (!m) return null;
  const n = (x: string) => (x === "None" ? null : Number(x));
  return {
    duracion: Math.round((Number(m[1]) * 60 + Number(m[2])) * 10) / 10, cortes: Number(m[3]), planoMedio: Number(m[4]),
    primerCorte: n(m[5]), palabrasPorSegundo: Number(m[6]), lufs: n(m[7]), brillo: n(m[8]), saturacion: n(m[9]),
  };
}

/** Puro: un .srt → texto completo y lo que se dice en los primeros 3 s. */
export function leerSrt(srt: string): { texto: string; gancho: string } {
  const cues = srt.replace(/\r/g, "").split(/\n\n+/).map((b) => {
    const l = b.split("\n");
    const t = /^(\d+):(\d+):(\d+),(\d+)/.exec(l[1] ?? "");
    return t ? { inicio: Number(t[1]) * 3600 + Number(t[2]) * 60 + Number(t[3]) + Number(t[4]) / 1000, texto: l.slice(2).join(" ").trim() } : null;
  }).filter((c): c is { inicio: number; texto: string } => !!c && !!c.texto);
  return { texto: cues.map((c) => c.texto).join(" ").slice(0, 3000), gancho: cues.filter((c) => c.inicio < 3).map((c) => c.texto).join(" ") };
}

/** Puro: lo que se le pide al modelo de visión. Los tipos van con su descripción: con solo el nombre el modelo
 *  coincidía con el estudio en 27 de 55 (18/11; confundía producto con promo). */
export function pedidoFicha(tipos: Array<{ slug: string; descripcion: string }>, transcripcion: { texto: string; gancho: string }): string {
  return [
    "Te paso UNA imagen con dos hojas de un video vertical de redes: a la izquierda los primeros 3 segundos (3 cuadros por segundo, en orden),",
    "a la derecha 16 cuadros parejos de todo el video. Y lo que se dice:",
    `- En los primeros 3 s: «${transcripcion.gancho || "(nada)"}»`,
    `- Todo: «${transcripcion.texto.slice(0, 1500) || "(sin voz)"}»`,
    "",
    "Respondé cada pregunta con true o false mirando las hojas y el texto. Si no se puede saber, false.",
    ...Object.entries(PREGUNTAS_FICHA).map(([k, q]) => `- ${k}: ${q}`),
    "",
    "tipo: el que mejor describe cómo está contado el video, uno de:",
    ...tipos.map((t) => `- ${t.slug}${t.descripcion ? `: ${t.descripcion}` : ""}`),
    "Si encaja en varios: primero el formato (tendencia, testimonio, antes-y-despues, tutorial, evento, promo), después lo que se",
    "muestra (recorrido, producto, detras-de-escena), y habla-a-camara solo si no encaja en otro.",
    "gancho: lo que se dice o se lee en los primeros 2 s, textual y corto.",
    'Respondé SOLO JSON: {"respuestas":{"clave":true,...},"tipo":"...","gancho":"..."}',
  ].join("\n");
}

/** Puro: la respuesta del modelo → respuestas válidas (solo las claves conocidas, solo booleanos), tipo y gancho. */
export function limpiarFicha(j: Record<string, unknown>, tipos: string[]): { respuestas: Record<string, boolean>; tipo: string | null; gancho: string | null; faltan: string[] } {
  const r = (j.respuestas && typeof j.respuestas === "object" ? j.respuestas : {}) as Record<string, unknown>;
  const respuestas: Record<string, boolean> = {};
  const faltan: string[] = [];
  for (const k of Object.keys(PREGUNTAS_FICHA)) {
    if (typeof r[k] === "boolean") respuestas[k] = r[k] as boolean;
    else faltan.push(k);
  }
  const tipo = typeof j.tipo === "string" && tipos.includes(j.tipo.trim().toLowerCase()) ? j.tipo.trim().toLowerCase() : null;
  const gancho = typeof j.gancho === "string" && j.gancho.trim() ? j.gancho.trim().slice(0, 300) : null;
  return { respuestas, tipo, gancho, faltan };
}

/** Puro: cuánto coincide una ficha con la validada (el examen de la fase 6). Solo cuentan las claves de las dos. */
export function coincidencia(a: Record<string, boolean>, b: Record<string, boolean>): { iguales: number; total: number; porcentaje: number | null } {
  const claves = Object.keys(PREGUNTAS_FICHA).filter((k) => typeof a[k] === "boolean" && typeof b[k] === "boolean");
  const iguales = claves.filter((k) => a[k] === b[k]).length;
  return { iguales, total: claves.length, porcentaje: claves.length ? Math.round((iguales / claves.length) * 1000) / 10 : null };
}
