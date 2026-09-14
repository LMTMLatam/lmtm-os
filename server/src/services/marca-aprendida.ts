// LMTM-OS: aprender la voz de cada cliente de lo que YA publicó.
//
// La tabla `client_brand` (migración 0129) tiene el lugar exacto para esto —
// tono, palabras que usa, palabras que evita, mensaje, público, diferencial— y
// el generador de piezas ya la lee. Estaba VACÍA para los 59 clientes porque
// solo se llenaba a mano desde el panel y nadie la llenó. Resultado: cada pieza
// que generaba la flota salía genérica por más historial que hubiera.
//
// Acá se completa sola, leyendo los copys REALES que el cliente publicó. Es la
// otra mitad de `organico-aprendizaje.ts`: aquel aprende QUÉ le funciona
// (formatos, engagement), éste aprende CÓMO HABLA.
//
// DOS REGLAS QUE NO SE NEGOCIAN:
//
// 1. Lo que cargó una persona GANA. Si alguien definió el tono a mano, el
//    aprendizaje no lo pisa: el equipo conoce al cliente mejor que un promedio
//    de 200 posts, y que un proceso automático borre eso sin avisar es la forma
//    más rápida de que dejen de usar el panel.
//
// 2. Con pocos posts NO se infiere una voz. Una "identidad de marca" sacada de
//    cuatro publicaciones es una invención con formato de dato, y después la
//    flota genera meses de contenido apoyada en eso.

import type { Db } from "@paperclipai/db";
import { clientBrand, clients, organicPosts } from "@paperclipai/db";
import { and, desc, eq, gte, sql } from "drizzle-orm";

/** Ventana de historial. Igual que organico-aprendizaje: con 90 días varios
 *  clientes quedaban con 3-4 posts. */
export const VENTANA_DIAS = 180;
/** Piso de copys para animarse a describir una voz. Medido sobre los datos
 *  reales: los clientes con sync tienen entre 94 y 239 posts, así que 15 deja
 *  afuera solo a los que de verdad no tienen historial. */
export const MINIMO_COPYS = 15;
/** Un copy más corto que esto no aporta voz: es un pie de foto. */
const LARGO_MINIMO = 60;
/** Cuántos copys se le muestran al modelo, y cuánto de cada uno.
 *
 *  Calibrado contra el modelo real, no estimado: con 40 copys de 900 caracteres
 *  el pedido tardaba más de 180s y se cortaba por timeout en un cliente, y en
 *  otro el modelo se comió los 2048 tokens razonando antes de escribir el JSON.
 *  25 copys de 500 alcanzan de sobra para describir una voz y entran holgados. */
const MUESTRA = 25;
const LARGO_MUESTRA = 500;

/** Quién escribió la fila. El aprendizaje solo pisa lo suyo. */
export const AUTOR_APRENDIZAJE = "aprendizaje-automatico";

export interface MarcaAprendida {
  tono: string | null;
  palabrasSi: string[];
  palabrasNo: string[];
  mensaje: string | null;
  publico: string | null;
  diferencial: string | null;
}

export type MotivoSinAprender = "sin_historial" | "muestra_chica" | "modelo_sin_texto" | "respuesta_ilegible";

export interface ResultadoAprendizaje {
  aprendido: boolean;
  motivo?: MotivoSinAprender;
  copysUsados: number;
  /** Campos que NO se tocaron porque los había cargado una persona. */
  respetados: string[];
  marca?: MarcaAprendida;
}

/**
 * Decide qué escribir sin pisar lo humano.
 *
 * Pura para poder probarla: es la regla que evita que un proceso automático
 * borre el trabajo del equipo, y esa no puede depender de que haya DB.
 */
export function fusionar(
  actual: Partial<MarcaAprendida> | null,
  aprendida: MarcaAprendida,
  filaEsHumana: boolean,
): { aEscribir: Partial<MarcaAprendida>; respetados: string[] } {
  if (!actual || !filaEsHumana) return { aEscribir: aprendida, respetados: [] };

  const aEscribir: Partial<MarcaAprendida> = {};
  const respetados: string[] = [];
  const cargado = (v: unknown) => (Array.isArray(v) ? v.length > 0 : typeof v === "string" && v.trim() !== "");

  for (const campo of ["tono", "mensaje", "publico", "diferencial", "palabrasSi", "palabrasNo"] as const) {
    if (cargado(actual[campo])) respetados.push(campo);
    else (aEscribir as Record<string, unknown>)[campo] = aprendida[campo];
  }
  return { aEscribir, respetados };
}

/** El JSON que se le pide al modelo, y cómo se lee lo que devuelva. */
function leerMarca(raw: string): MarcaAprendida | null {
  const i = raw.indexOf("{");
  const f = raw.lastIndexOf("}");
  if (i === -1 || f <= i) return null;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(raw.slice(i, f + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 600) : null);
  const lista = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim().slice(0, 40)).slice(0, 15) : [];
  return {
    tono: texto(o.tono),
    palabrasSi: lista(o.palabrasSi),
    palabrasNo: lista(o.palabrasNo),
    mensaje: texto(o.mensaje),
    publico: texto(o.publico),
    diferencial: texto(o.diferencial),
  };
}

const PROMPT = [
  "Sos analista de marca de una agencia. Te paso publicaciones REALES de un cliente.",
  "Describí cómo habla esa marca, basándote SOLO en lo que ves. No inventes nada que no esté.",
  "",
  "Respondé ÚNICAMENTE con JSON:",
  '{"tono":"cómo habla, 1-2 frases","palabrasSi":["palabras y expresiones que usa de verdad"],',
  '"palabrasNo":["registros que NO usa, deducidos de su estilo"],"mensaje":"qué promete, 1 frase",',
  '"publico":"a quién le habla, 1 frase","diferencial":"qué lo distingue, 1 frase"}',
  "",
  "palabrasSi tienen que ser palabras que aparezcan en los textos, no sinónimos tuyos.",
  "Si algo no se puede deducir de lo que te paso, poné null (o [] para las listas).",
  "Todo en español rioplatense.",
].join("\n");

/**
 * Aprende la voz de un cliente de sus publicaciones reales.
 *
 * Solo lee `organic_posts`, que son los copys que de verdad salieron. Los 33
 * clientes sin sync orgánico quedan sin aprender y se reportan como tales — no
 * se les inventa una identidad a partir de nada.
 */
export async function aprenderMarca(db: Db, clientId: string): Promise<ResultadoAprendizaje> {
  const desde = new Date(Date.now() - VENTANA_DIAS * 86_400_000);
  const posts = await db
    .select({ message: organicPosts.message })
    .from(organicPosts)
    .where(and(
      eq(organicPosts.clientId, clientId),
      gte(organicPosts.createdTime, desde),
      sql`length(coalesce(${organicPosts.message}, '')) >= ${LARGO_MINIMO}`,
    ))
    .orderBy(desc(organicPosts.createdTime))
    .limit(MUESTRA);

  if (posts.length === 0) return { aprendido: false, motivo: "sin_historial", copysUsados: 0, respetados: [] };
  if (posts.length < MINIMO_COPYS) {
    return { aprendido: false, motivo: "muestra_chica", copysUsados: posts.length, respetados: [] };
  }

  const [cli] = await db.select({ name: clients.name }).from(clients).where(eq(clients.id, clientId)).limit(1);
  const cuerpo = [
    `Cliente: ${cli?.name ?? "(sin nombre)"}`,
    "",
    ...posts.map((p, n) => `--- publicación ${n + 1} ---\n${(p.message ?? "").slice(0, LARGO_MUESTRA)}`),
  ].join("\n");

  const { analizarTexto } = await import("./nvidia-modelos.js");
  const r = await analizarTexto(PROMPT, cuerpo, { maxTokens: 6000, temperature: 0.3 });
  if (!r.texto) {
    console.warn(`[marca] ${cli?.name ?? clientId}: el modelo no devolvió texto (${r.motivo}) ${r.detalle ?? ""}`);
    return { aprendido: false, motivo: "modelo_sin_texto", copysUsados: posts.length, respetados: [] };
  }
  const marca = leerMarca(r.texto);
  if (!marca) return { aprendido: false, motivo: "respuesta_ilegible", copysUsados: posts.length, respetados: [] };

  const [fila] = await db.select().from(clientBrand).where(eq(clientBrand.clientId, clientId)).limit(1);
  const filaEsHumana = Boolean(fila && fila.updatedBy && fila.updatedBy !== AUTOR_APRENDIZAJE);
  const { aEscribir, respetados } = fusionar(fila ?? null, marca, filaEsHumana);

  if (Object.keys(aEscribir).length === 0) {
    return { aprendido: false, copysUsados: posts.length, respetados, marca };
  }

  const valores = {
    clientId,
    ...aEscribir,
    // Solo se marca como automática si la fila entera lo es. Pisar el autor de
    // una fila que cargó una persona le sacaría su propio candado.
    updatedBy: filaEsHumana ? fila?.updatedBy : AUTOR_APRENDIZAJE,
    updatedAt: new Date(),
  };
  await db.insert(clientBrand).values(valores as never).onConflictDoUpdate({
    target: clientBrand.clientId,
    set: { ...aEscribir, updatedAt: new Date() } as never,
  });

  return { aprendido: true, copysUsados: posts.length, respetados, marca };
}

/** Barrido por todos los clientes activos. */
export async function aprenderTodas(db: Db): Promise<{
  aprendidos: number;
  sinHistorial: number;
  muestraChica: number;
  fallados: number;
}> {
  const activos = await db.select({ id: clients.id }).from(clients).where(eq(clients.status, "active"));
  let aprendidos = 0, sinHistorial = 0, muestraChica = 0, fallados = 0;
  for (const c of activos) {
    try {
      const r = await aprenderMarca(db, c.id);
      if (r.aprendido) aprendidos += 1;
      else if (r.motivo === "sin_historial") sinHistorial += 1;
      else if (r.motivo === "muestra_chica") muestraChica += 1;
      else if (r.motivo) fallados += 1;
    } catch (e) {
      fallados += 1;
      console.warn(`[marca] ${c.id} falló:`, e instanceof Error ? e.message : e);
    }
  }
  return { aprendidos, sinHistorial, muestraChica, fallados };
}
