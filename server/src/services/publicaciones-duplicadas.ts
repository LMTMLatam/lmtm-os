// LMTM-OS: detector de publicaciones que salieron dos veces.
//
// El 26/8/26 MAERS avisó que le salían posteos duplicados. Eran reales: el
// 24/8 a las 20:00 el mismo texto salió en DOS posteos distintos de Facebook
// (ids 1724841976311137 y 1724842049644463) más dos de Instagram. La causa está
// fuera de nuestro alcance — algo llama dos veces al webhook de Make, con ~100
// ms de diferencia, y ni ClickUp expone sus automatizaciones por API ni Make
// deja editar el escenario sin reenviar el blueprint entero.
//
// Lo que sí controlamos es enterarnos. En 90 días hubo 25 publicaciones
// duplicadas repartidas en 10 clientes y nadie lo vio: las corridas de Make
// figuran en verde y el duplicado solo se nota mirando la red del cliente.
//
// OJO con el criterio: un mismo texto publicado dos veces NO es un duplicado
// si pasaron días — el equipo reusa piezas evergreen a propósito (hay un copy
// de MAERS repetido seis veces entre julio y agosto, legítimo). El duplicado
// se reconoce porque las dos salidas caen en la MISMA red, en la MISMA página,
// separadas por minutos.

import type { Db } from "@paperclipai/db";
import { sql } from "drizzle-orm";
import { createClientTask } from "./client-tasks.js";

/** Dos salidas separadas por menos que esto son un doble disparo, no un repost. */
export const MINUTOS_JUNTAS = 15;
/** Ventana que se revisa en cada pasada. */
export const DIAS_MIRADOS = 3;
/** Tope de tareas por corrida, para no inundar si algo se descontrola. */
export const TOPE_POR_CORRIDA = 10;

export interface Duplicado {
  clientId: string;
  cliente: string;
  red: string;
  cuando: Date;
  texto: string;
  enlaces: string[];
}

/** Qué red es cada permalink. Lo que no reconocemos no se evalúa. */
export function redDe(permalink: string | null): "facebook" | "instagram" | null {
  if (!permalink) return null;
  if (permalink.includes("facebook.com")) return "facebook";
  if (permalink.includes("instagram.com")) return "instagram";
  return null;
}

/**
 * Agrupa las salidas de una misma pieza y devuelve las que se repitieron en la
 * misma red dentro de la ventana. Se exporta aparte de la consulta para poder
 * probar el criterio sin base.
 */
export function detectarEnGrupo(
  salidas: Array<{ permalink: string | null; cuando: Date }>,
  minutosJuntas = MINUTOS_JUNTAS,
): Array<{ red: string; enlaces: string[]; cuando: Date }> {
  const porRed = new Map<string, Array<{ permalink: string; cuando: Date }>>();
  for (const s of salidas) {
    const red = redDe(s.permalink);
    if (!red || !s.permalink) continue;
    const lista = porRed.get(red) ?? [];
    lista.push({ permalink: s.permalink, cuando: s.cuando });
    porRed.set(red, lista);
  }

  const out: Array<{ red: string; enlaces: string[]; cuando: Date }> = [];
  for (const [red, lista] of porRed) {
    // un mismo permalink contado dos veces es la misma publicación, no un duplicado
    const unicos = [...new Map(lista.map((x) => [x.permalink, x])).values()]
      .sort((a, b) => a.cuando.getTime() - b.cuando.getTime());
    if (unicos.length < 2) continue;
    for (let i = 1; i < unicos.length; i++) {
      const minutos = (unicos[i].cuando.getTime() - unicos[i - 1].cuando.getTime()) / 60_000;
      if (minutos > minutosJuntas) continue;
      out.push({
        red,
        enlaces: [unicos[i - 1].permalink, unicos[i].permalink],
        cuando: unicos[i - 1].cuando,
      });
      break; // con avisar una vez por red y pieza alcanza
    }
  }
  return out;
}

export async function buscarDuplicados(db: Db, dias = DIAS_MIRADOS): Promise<Duplicado[]> {
  const filas = (await db.execute(sql`
    select o.client_id as "clientId", c.name as cliente, o.page_id as "pageId",
           o.message, o.permalink_url as permalink, o.created_time as cuando
    from organic_posts o
    join clients c on c.id = o.client_id
    where o.created_time > now() - (${dias} || ' days')::interval
      and coalesce(o.message, '') <> ''
      and o.permalink_url is not null
    order by o.created_time
  `)) as unknown as Array<{
    clientId: string; cliente: string; pageId: string | null;
    message: string; permalink: string; cuando: Date;
  }>;

  const grupos = new Map<string, typeof filas>();
  for (const f of filas) {
    const clave = `${f.clientId}|${f.pageId ?? ""}|${f.message}`;
    const g = grupos.get(clave) ?? [];
    g.push(f);
    grupos.set(clave, g);
  }

  const dups: Duplicado[] = [];
  for (const g of grupos.values()) {
    for (const hit of detectarEnGrupo(g.map((x) => ({ permalink: x.permalink, cuando: new Date(x.cuando) })))) {
      dups.push({
        clientId: g[0].clientId,
        cliente: g[0].cliente,
        red: hit.red,
        cuando: hit.cuando,
        texto: g[0].message.replace(/\s+/g, " ").trim().slice(0, 90),
        enlaces: hit.enlaces,
      });
    }
  }
  return dups;
}

/** Una sola tarea por pieza: una repetición en Facebook y en Instagram es el mismo problema. Pura. */
export function agruparPorPieza(dups: Duplicado[]): Duplicado[][] {
  const grupos = new Map<string, Duplicado[]>();
  for (const d of dups) {
    const clave = `${d.clientId}|${d.texto}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), d]);
  }
  return [...grupos.values()];
}

export async function avisarDuplicados(db: Db): Promise<{ encontrados: number; avisados: number }> {
  const dups = await buscarDuplicados(db);
  let avisados = 0;
  for (const grupo of agruparPorPieza(dups).slice(0, TOPE_POR_CORRIDA)) {
    const d = grupo[0];
    const fecha = d.cuando.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    await createClientTask(db, {
      clientId: d.clientId,
      // createClientTask deduplica por (cliente, título, abierta): mientras la
      // tarea siga abierta no se repite el aviso. [HUMANO]: ningún agente puede
      // borrar un posteo ni ver quién lo subió, y despertarlo solo gasta corridas.
      title: `[HUMANO] Publicación repetida: ${d.cliente} — "${d.texto.slice(0, 40)}"`,
      description:
        `La misma pieza salió más de una vez en la misma red, con minutos de diferencia.\n\n` +
        `• Texto: "${d.texto}…"\n` +
        `• Cuándo: ${fecha}\n` +
        grupo.map((g) => `• ${g.red}:\n${g.enlaces.map((e) => `   - ${e}`).join("\n")}`).join("\n") +
        `\n\nQué hacer: decidir cuál queda y borrar la otra de la red del cliente.\n\n` +
        `Cómo saber de dónde vino: mirá las corridas del escenario del cliente en Make a esa hora. ` +
        `Dos corridas pegadas son un doble disparo (revisar automatizaciones duplicadas en ClickUp). ` +
        `Sin corridas a esa hora, la pieza se subió por fuera de Make.`,
    });
    avisados += 1;
  }
  return { encontrados: dups.length, avisados };
}
