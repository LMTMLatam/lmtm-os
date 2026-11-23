// LMTM-OS: el cliente contra SUS competidores (16/11).
//
// Pedido de Naza: «revisiones de clientes y competidores, en ese sector hay que
// mejorar mucho». Había datos (475 competidores, ~5.000 publicaciones medidas con
// su ángulo) pero el único análisis era por rubro («qué le funciona a las
// inmobiliarias»): ningún agente podía responder qué hicieron los competidores de
// ESTE cliente en las últimas semanas frente a lo que hizo él. Carlos no hizo una
// sola revisión de competencia de un cliente en 14 días.
//
// Acá: en la ventana pedida, cuánto publicó el cliente y cada competidor, la mejor
// publicación de cada uno contra lo normal de SU propia cuenta (la misma vara que
// contenido-analisis: me gusta + comentarios×3 en Instagram) y los ángulos que la
// competencia usa con éxito y el cliente no tocó. Sin modelo: números y links.

import type { Db } from "@paperclipai/db";
import { clients, competenciaPosts, competitors } from "@paperclipai/db";
import { and, eq, gte, inArray } from "drizzle-orm";
import { nombreDeAngulo } from "./angulos-creativos.js";
import { MIN_NORMAL, mediana } from "./contenido-analisis.js";
import { SIN_TEXTO } from "./contenido-angulos.js";
import { MADURA_DIAS, usuarioDeCompetidor } from "./competencia-ig.js";
import { engagementDe } from "./organico-aprendizaje.js";

/** Publicaciones medidas que necesita una cuenta para tener «lo normal». */
const MIN_PARA_NORMAL = 6;
/** Para llamar «oportunidad» a un ángulo: la competencia lo usa rindiendo al menos esto contra su normal. */
const INDICE_OPORTUNIDAD = 1.5;
/** Días de historia para calcular lo normal de cada cuenta. */
const DIAS_NORMAL = 90;

export interface PostComp { fecha: string; angulo: string | null; formato: string | null; engagement: number; permalink: string | null; texto: string }
export interface CompetidorEntrada { nombre: string; usuario: string | null; posts: PostComp[]; esClienteDeLaAgencia?: boolean }

export interface ResultadoCompetencia {
  dias: number;
  desde: string;
  /** publicaciones null = no tenemos sus redes sincronizadas (no es «no publicó»). */
  cliente: { publicaciones: number | null; angulos: Array<{ angulo: string; nombre: string; n: number }> };
  competidores: Array<{
    nombre: string; usuario: string | null; publicaciones: number; normal: number | null;
    /** También es cliente de LMTM: sirve para el análisis interno, NUNCA se nombra frente a un cliente. */
    esClienteDeLaAgencia: boolean;
    mejor: { indice: number | null; angulo: string | null; formato: string | null; fecha: string; link: string | null; texto: string } | null;
    angulos: string[];
  }>;
  /** Lo que la competencia usa y le rinde, y el cliente no usó en la ventana. */
  oportunidades: Array<{ angulo: string; nombre: string; competidores: number; indiceMediano: number | null; ejemplo: string | null }>;
  sinDatos: string[];
  nota: string;
}

const nombre = (a: string) => nombreDeAngulo(a);
/** Por caracteres completos: un .slice parte en dos las letras «𝗩𝗘𝗡𝗧𝗔» y deja un \ud835 suelto en el JSON. */
const corto = (s: string) => Array.from(s).slice(0, 160).join("");

/** Puro. `ahora` fija la ventana: [ahora − dias, ahora − MADURA_DIAS] para las de la competencia. */
export function compararCompetencia(
  propios: Array<{ fecha: string; angulo: string | null }> | null,
  comps: CompetidorEntrada[],
  dias: number,
  ahora = new Date(),
): ResultadoCompetencia {
  const desde = new Date(ahora.getTime() - dias * 86_400_000).toISOString().slice(0, 10);
  const enVentana = (f: string) => f >= desde;
  // «sin-texto» no es un ángulo: es la marca de una publicación sin texto para clasificar.
  const angulo = (a: string | null) => (a && a !== SIN_TEXTO ? a : null);
  const propiosV = propios ? propios.filter((p) => enVentana(p.fecha)) : [];
  const usadosPorCliente = new Set(propiosV.map((p) => angulo(p.angulo)).filter((a): a is string => !!a));
  const contar = new Map<string, number>();
  for (const p of propiosV) { const a = angulo(p.angulo); if (a) contar.set(a, (contar.get(a) ?? 0) + 1); }

  const porAngulo = new Map<string, { comps: Set<string>; indices: number[]; ejemplo: string | null; mejorIndice: number }>();
  const sinDatos: string[] = [];
  const competidores = comps.map((c) => {
    const ventana = c.posts.filter((p) => enVentana(p.fecha));
    const normalRaw = c.posts.length >= MIN_PARA_NORMAL ? mediana(c.posts.map((p) => p.engagement)) : null;
    const normal = normalRaw != null && normalRaw >= MIN_NORMAL ? normalRaw : null;
    if (!c.posts.length) sinDatos.push(c.nombre);
    const conIndice = ventana.map((p) => ({ ...p, indice: normal ? Math.round((p.engagement / normal) * 10) / 10 : null }));
    const mejor = [...conIndice].sort((a, b) => (b.indice ?? b.engagement) - (a.indice ?? a.engagement))[0];
    for (const p of conIndice) {
      const a = angulo(p.angulo);
      if (!a || p.indice == null) continue;
      const e = porAngulo.get(a) ?? { comps: new Set<string>(), indices: [], ejemplo: null, mejorIndice: 0 };
      e.comps.add(c.nombre);
      e.indices.push(p.indice);
      // El ejemplo nunca es de otro cliente de la agencia: el agente lo podría citar.
      if (p.indice > e.mejorIndice && !c.esClienteDeLaAgencia) { e.mejorIndice = p.indice; e.ejemplo = p.permalink; }
      porAngulo.set(a, e);
    }
    const am = mejor ? angulo(mejor.angulo) : null;
    return {
      nombre: c.nombre, usuario: c.usuario, publicaciones: ventana.length, normal: normal != null ? Math.round(normal) : null,
      esClienteDeLaAgencia: !!c.esClienteDeLaAgencia,
      mejor: mejor ? { indice: mejor.indice, angulo: am ? nombre(am) : null, formato: mejor.formato, fecha: mejor.fecha, link: mejor.permalink, texto: corto(mejor.texto) } : null,
      angulos: [...new Set(ventana.map((p) => angulo(p.angulo)).filter((a): a is string => !!a))].map(nombre),
    };
  }).sort((a, b) => b.publicaciones - a.publicaciones);

  const oportunidades = [...porAngulo.entries()]
    .filter(([a, e]) => !usadosPorCliente.has(a) && e.indices.length > 0 && mediana(e.indices) >= INDICE_OPORTUNIDAD)
    .map(([a, e]) => ({ angulo: a, nombre: nombre(a), competidores: e.comps.size, indiceMediano: Math.round(mediana(e.indices) * 10) / 10, ejemplo: e.ejemplo }))
    .sort((x, y) => y.competidores - x.competidores || (y.indiceMediano ?? 0) - (x.indiceMediano ?? 0))
    .slice(0, 5);

  return {
    dias, desde,
    cliente: { publicaciones: propios ? propiosV.length : null, angulos: [...contar].sort((a, b) => b[1] - a[1]).map(([a, n]) => ({ angulo: a, nombre: nombre(a), n })) },
    competidores, oportunidades, sinDatos,
    nota: `Índice = interacción de la publicación contra lo normal de SU cuenta (mediana de ${DIAS_NORMAL} días; 1 = lo normal, 2 = el doble). Las de la competencia de los últimos ${MADURA_DIAS} días todavía juntan interacción. «sinDatos»: competidores sin Instagram medido (handle mal cargado, cuenta privada o sin revisar): corregirlos en la ficha suma comparación.`,
  };
}

/** «MA Propiedades», «  ma propiedades » → «ma propiedades». Puro. */
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export async function competenciaDeCliente(db: Db, clientId: string, dias = 30) {
  const [cl] = await db.select({ name: clients.name }).from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!cl) throw new Error("No existe ese cliente.");
  const filas = await db.select({ nombre: competitors.name, ig: competitors.igHandle, web: competitors.website })
    .from(competitors).where(eq(competitors.clientId, clientId));
  // Competidores que también son clientes de LMTM (DUNOD tiene cargados a MA Propiedades y a Ramasco).
  const otros = (await db.select({ name: clients.name }).from(clients).where(eq(clients.status, "active")))
    .map((c) => norm(c.name)).filter((n) => n.length >= 4 && n !== norm(cl.name));
  const esDeLaAgencia = (nombre: string) => { const n = norm(nombre); return otros.some((o) => n === o || n.startsWith(`${o} `) || o.startsWith(`${n} `)); };
  const conUsuario = filas.map((f) => ({ nombre: f.nombre.trim(), usuario: usuarioDeCompetidor(f), esClienteDeLaAgencia: esDeLaAgencia(f.nombre) }));
  const usuarios = [...new Set(conUsuario.map((c) => c.usuario).filter((u): u is string => !!u))];
  const desdeNormal = new Date(Date.now() - DIAS_NORMAL * 86_400_000);
  const hasta = new Date(Date.now() - MADURA_DIAS * 86_400_000);
  const posts = usuarios.length
    ? await db.select().from(competenciaPosts).where(and(inArray(competenciaPosts.usuario, usuarios), gte(competenciaPosts.publicadoAt, desdeNormal)))
    : [];
  const porUsuario = new Map<string, PostComp[]>();
  for (const p of posts) {
    if (p.meGusta == null || p.publicadoAt > hasta) continue;
    const l = porUsuario.get(p.usuario) ?? [];
    l.push({ fecha: p.publicadoAt.toISOString().slice(0, 10), angulo: p.angulo, formato: p.formato, engagement: engagementDe(p.meGusta ?? 0, p.comentarios ?? 0, 0), permalink: p.permalink, texto: (p.texto ?? "").replace(/\s+/g, " ").trim() });
    porUsuario.set(p.usuario, l);
  }
  const { organicPosts } = await import("@paperclipai/db");
  // Sin ninguna publicación sincronizada en 180 días no se sabe si publicó: es «sin dato», no 0.
  const filasPropias = await db.select({ fecha: organicPosts.createdTime, angulo: organicPosts.angulo }).from(organicPosts)
    .where(and(eq(organicPosts.clientId, clientId), gte(organicPosts.createdTime, new Date(Date.now() - 180 * 86_400_000))));
  const propios = filasPropias.length
    ? filasPropias.filter((p) => p.fecha).map((p) => ({ fecha: p.fecha!.toISOString().slice(0, 10), angulo: p.angulo }))
    : null;
  const r = compararCompetencia(propios, conUsuario.map((c) => ({ ...c, posts: c.usuario ? porUsuario.get(c.usuario) ?? [] : [] })), dias);
  // Lo último que publicaron (23/11: «que se renueve todo el tiempo con lo último»): las cuentas se releen todos
  // los días. Acá entran también las de los últimos días, que todavía juntan interacción: por eso van sin índice.
  const deUsuario = new Map(conUsuario.filter((c) => c.usuario).map((c) => [c.usuario!, c]));
  // Hasta 2 por cuenta: una inmobiliaria que sube 5 avisos por día tapaba a todas las demás.
  const porCuenta = new Map<string, number>();
  const ultimas = [...posts].sort((a, b) => b.publicadoAt.getTime() - a.publicadoAt.getTime())
    .filter((p) => { const n = porCuenta.get(p.usuario) ?? 0; porCuenta.set(p.usuario, n + 1); return n < 2; })
    .slice(0, 12).map((p) => ({
    competidor: deUsuario.get(p.usuario)?.nombre ?? `@${p.usuario}`,
    esClienteDeLaAgencia: !!deUsuario.get(p.usuario)?.esClienteDeLaAgencia,
    fecha: p.publicadoAt.toISOString().slice(0, 10),
    formato: p.formato,
    angulo: p.angulo && p.angulo !== SIN_TEXTO ? nombreDeAngulo(p.angulo) : null,
    meGusta: p.meGusta, comentarios: p.comentarios, link: p.permalink,
    texto: corto((p.texto ?? "").replace(/\s+/g, " ").trim()),
  }));
  const { webDeLaCompetencia } = await import("./competencia-web.js");
  return { clienteNombre: cl.name.trim(), ...r, ultimas, web: await webDeLaCompetencia(db, clientId) };
}
