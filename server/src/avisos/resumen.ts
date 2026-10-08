// LMTM-OS: el resumen de las 9:00. El único mensaje del día que no es un incidente.
//
// Reemplaza al brief de las 8:00 y las 18:00, que eran dos mensajes por día
// escritos por un modelo (no se podía rastrear de dónde salía cada
// conclusión) más el digest del embudo pegado abajo. Éste es determinístico:
// cada línea es una decisión de la tabla, con su plata, y un link a Hoy, que
// es donde se decide. El mensaje sirve para saber si hay que abrir Hoy, no
// para leerlo entero.

import type { Db } from "@paperclipai/db";
import { waOutbox } from "@paperclipai/db";
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { datosDeHoy, type Hoy } from "../decisiones/hoy.js";
import { enviarResumenDiario, ORIGEN_RESUMEN } from "../services/wa-embudo.js";
import { diaLocal } from "./politica.js";
import { ORIGEN_INCIDENTES, urlDeHoy } from "./incidentes.js";

const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** "lunes 6 de octubre", en Buenos Aires. */
export function fechaLarga(d: Date): string {
  const [y, m, dd] = diaLocal(d).split("-").map(Number);
  const dia = new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
  return `${DIAS[dia]} ${dd} de ${MESES[m - 1]}`;
}

export interface Tendencia {
  title: string;
  url: string | null;
}

/**
 * Tendencias del día, para reenviar a clientes. Venían en el brief de las 8:00
 * (pedido del 18/7: "para pensar distinto y para reenviar") y se mudan acá
 * para no perderlas.
 */
export async function tendenciasDelDia(db: Db, ahora = new Date()): Promise<Tendencia[]> {
  const { trends } = await import("@paperclipai/db");
  const desde = new Date(ahora.getTime() - 86_400_000).toISOString().slice(0, 10);
  const filas = await db
    .select({ title: trends.title, url: trends.url })
    .from(trends)
    .where(and(gte(trends.day, desde), sql`${trends.tag} <> 'ignorar'`))
    .orderBy(desc(trends.createdAt))
    .limit(30)
    .catch(() => []);
  // Además de la forma, que el link conteste: una nota inventada da 404.
  const { linkResponde } = await import("../services/entrega-checks.js");
  const vivas: Tendencia[] = [];
  for (const t of elegirTendencias(filas, 10)) {
    if (await linkResponde(t.url!).catch(() => false)) vivas.push(t);
    if (vivas.length === 3) break;
  }
  return vivas;
}

/**
 * ¿El link apunta a una nota puntual y no a la portada o a una sección? Las
 * tendencias que salían para "reenviar a clientes" traían infobae.com/economia/
 * o trends.google.com/ como fuente de un dato concreto: no hay forma de
 * chequear de dónde salió (07/10/26).
 */
export function esUrlDeNota(url: string | null | undefined): boolean {
  if (!url) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  const partes = u.pathname.split("/").filter(Boolean);
  if (partes.length >= 2) return true;
  return partes.length === 1 && partes[0].split("-").length >= 3;
}

/**
 * ¿Nombra un año anterior? El 08/10/26 salieron como "tendencias de hoy" el
 * ICC de septiembre 2025 y una nota de ventas de octubre de 2025: los agentes
 * buscan con la fecha de su entrenamiento. ponytail: una nota de este año que
 * compara contra el anterior también queda afuera; se acepta.
 */
export function deAnioAnterior(texto: string, anio = new Date().getFullYear()): boolean {
  return [...texto.matchAll(/(?<![0-9])(20[0-9]{2})(?![0-9])/g)].some((m) => Number(m[1]) < anio);
}

/**
 * Las que se pueden reenviar a un cliente: con link a la nota (no a la
 * portada) y una por link. El 07/10 salían dos versiones de la misma noticia
 * con un link de Reuters que no existe; sin fuente verificable no se reenvía.
 */
export function elegirTendencias(filas: Tendencia[], max = 3, anio = new Date().getFullYear()): Tendencia[] {
  const vistas = new Set<string>();
  const salida: Tendencia[] = [];
  for (const t of filas) {
    if (!esUrlDeNota(t.url) || vistas.has(t.url!) || deAnioAnterior(`${t.title} ${t.url}`, anio)) continue;
    vistas.add(t.url!);
    salida.push(t);
    if (salida.length === max) break;
  }
  return salida;
}

/** Lo que investigaron los agentes de las decisiones de hoy. Si falla, el resumen sale igual. */
async function hallazgos(db: Db, h: Pick<Hoy, "decisiones">): Promise<Map<string, string>> {
  const { hallazgosDeDecisiones } = await import("../agentes/cola.js");
  return hallazgosDeDecisiones(db, h.decisiones.map((d) => d.id)).catch(() => new Map<string, string>());
}

/** El encabezado del resumen. Puro: es lo que el dueño lee a las 9:00. */
export function armarResumen(
  h: Pick<Hoy, "incidentes" | "decisiones" | "esperando" | "plataParada" | "whatsapp"> & Partial<Pick<Hoy, "oportunidades">>,
  url: string,
  ahora = new Date(),
  tendencias: Tendencia[] = [],
  /** id de decisión → lo que encontró el agente (runner propio). */
  hallazgos: Map<string, string> = new Map(),
  /** Los lunes: qué contenido funcionó la semana pasada (contenido-analisis). */
  contenido: string | null = null,
): string {
  const lineas: string[] = [`*Hoy, ${fechaLarga(ahora)}*`, ""];

  // Primero lo que hay para ganar (pedido 08/10: "que las principales sean
  // oportunidades de contenido o de upsell, no todo saldo y frenar pauta").
  const oportunidades = h.oportunidades ?? [];
  if (oportunidades.length > 0) {
    lineas.push(`💡 Oportunidades (${oportunidades.length}):`);
    oportunidades.slice(0, 4).forEach((d, i) => lineas.push(`${i + 1}. *${d.cliente}* — ${d.que}`));
    if (oportunidades.length > 4) lineas.push(`y ${oportunidades.length - 4} más en Hoy.`);
    lineas.push("");
  }

  if (h.incidentes.length > 0) {
    const n = h.incidentes.length;
    lineas.push(`🔴 ${n === 1 ? "1 incidente" : `${n} incidentes`}:`);
    for (const i of h.incidentes.slice(0, 4)) {
      const hecha = i.estado === "ejecutada" ? " — marcada como hecha, todavía sin confirmar" : "";
      lineas.push(`• *${i.cliente}* — ${i.que}${i.arsPorDia ? ` (${pesos(i.arsPorDia)} por día)` : ""}${hecha}`);
    }
    if (n > 4) lineas.push(`• y ${n - 4} más`);
    lineas.push("");
  }

  if (h.plataParada != null && h.plataParada > 0) {
    lineas.push(`${pesos(h.plataParada)} por día parados.`, "");
  }

  // El saldo por cargar es un aviso al cliente, no una decisión: una línea.
  const saldos = h.decisiones.filter((d) => d.tipo === "saldo:bajo");
  const decisiones = h.decisiones.filter((d) => d.tipo !== "saldo:bajo");
  if (decisiones.length === 0) {
    lineas.push("No hay decisiones pendientes.");
  } else {
    lineas.push(decisiones.length === 1 ? "Para decidir:" : `Para decidir (${decisiones.length}), lo que más pesa:`);
    decisiones.slice(0, 3).forEach((d, i) => {
      lineas.push(`${i + 1}. *${d.cliente}* — ${d.que}${d.arsPorDia ? ` · ${pesos(d.arsPorDia)} por día` : ""}`);
      // Lo que ya averiguó el agente: la decisión llega con la causa, no solo con la pregunta.
      const hallazgo = hallazgos.get(d.id);
      if (hallazgo) lineas.push(`   ↳ ${unaLinea(hallazgo)}`);
    });
    const investigadas = decisiones.filter((d) => hallazgos.has(d.id)).length;
    if (investigadas > 0) {
      lineas.push(`Los agentes ya investigaron ${investigadas === 1 ? "1 de estas decisiones" : `${investigadas} de estas decisiones`}: lo que encontraron está en cada una.`);
    }
  }
  if (saldos.length > 0) {
    const cuenta = (d: (typeof saldos)[number]) => {
      const dias = d.porque?.datos?.find((x) => x.etiqueta === "Días hasta frenarse")?.valor;
      return `${d.cliente} (${d.que.includes("Google") ? "Google" : "Meta"}${dias != null ? `, ${dias} ${dias === 1 ? "día" : "días"}` : ""})`;
    };
    lineas.push("", `Saldo para avisarle al cliente: ${saldos.map(cuenta).join(", ")}.`);
  }
  if (h.esperando.length > 0) {
    lineas.push("", `${h.esperando.length} ${h.esperando.length === 1 ? "ya hecha espera" : "ya hechas esperan"} que el próximo dato lo confirme.`);
  }
  lineas.push("", `Decidir en Hoy: ${url}`);
  if (tendencias.length > 0) {
    lineas.push("", "Tendencias de hoy, para reenviar a clientes:");
    for (const t of tendencias) lineas.push(`• ${t.title}${t.url ? ` ${t.url}` : ""}`);
  }
  if (contenido) lineas.push("", contenido);
  return lineas.join("\n");
}

/**
 * Nombres de los módulos para una persona. Sin esto el resumen dice
 * "sin-publicar 4". Lo que no está acá sale como "Otros avisos", nunca con el
 * nombre interno.
 */
const NOMBRE_ORIGEN: Record<string, string> = {
  incidentes: "Incidentes",
  "alertas-cliente (manual)": "Alertas de clientes",
  "prueba-gateway": "Pruebas del WhatsApp",
  "sin-publicar": "Clientes sin publicar",
  "cadena-publicacion": "Cadena de publicación",
  "publication-monitor": "Publicaciones",
  "sync-redes": "Conexión de redes",
  "inactividad-redes": "Redes sin actividad",
  "onboarding-trabado": "Altas trabadas",
  "vigilante-financiero": "Movimientos de gasto",
  "monitor-saldo": "Saldos",
  "agente:saldo": "Saldos (agentes)",
  "agente:reporte": "Reportes de agentes",
  "pauta-automatica": "Pauta automática",
  auditor: "Auditoría diaria",
  "make-disparos": "Make",
  "make-autoposter": "Make",
  "consistencia-metricas": "Chequeo de números",
  "contaminacion-clientes": "Datos cruzados entre clientes",
  "derivacion-tareas": "Tareas derivadas",
  "reporte-semanal": "Reporte semanal",
  "feedback-clientes": "Comentarios de clientes",
  "ideas-pendientes": "Ideas de contenido",
  "mesa-redonda": "Mesa redonda",
  diversificacion: "Diversificación de formatos",
  brief: "Brief",
};

export const nombreDeOrigen = (origen: string) => NOMBRE_ORIGEN[origen] ?? (origen === ORIGEN_RESUMEN ? "Resumen de las 9:00" : "Otros avisos");

/** Monitores cuyo aviso es el estado completo del momento: el más nuevo reemplaza a los anteriores. */
export const ORIGENES_FOTO: ReadonlySet<string> = new Set([
  "cadena-publicacion",
  "sin-publicar",
  "inactividad-redes",
  "make-autoposter",
  "make-disparos",
  "contaminacion-clientes",
  "diversificacion",
  "ideas-pendientes",
  "reporte-semanal",
  "onboarding-trabado",
]);

/** Cuántos avisos pendientes van con su texto; los demás, contados por tema. */
const MAX_LINEAS_CON_TEXTO = 12;

function unaLinea(texto: string): string {
  const limpio = texto.replace(/[*_]/g, "").replace(/\s+/g, " ").trim();
  return limpio.length > 140 ? `${limpio.slice(0, 137)}…` : limpio;
}

/**
 * Lo pendiente del embudo, una línea por aviso, lo de nivel más alto primero.
 * Va el texto y no solo la cuenta porque, después de mandarlo, se marca como
 * entregado y no hay otra pantalla que lo muestre: "Pauta automática 1" sin
 * decir que falló es perderlo. Solo si hay muchos, lo que sobra va contado.
 */
export function armarPendientesCortos(todas: Array<{ origen: string; nivel: number; texto?: string; clave?: string | null }>): string | null {
  // Los incidentes ya van arriba del resumen, leídos de Hoy (los vivos, no los
  // de ayer). Su fila del embudo se marca como agrupada igual, pero no se
  // repite abajo: el 06/10 salían dos veces.
  todas = todas.filter((f) => f.origen !== ORIGEN_INCIDENTES);
  if (todas.length === 0) return null;
  // Los monitores vuelven a encolar el mismo aviso cada hora (misma clave, el
  // texto cambia en "96d 19h" → "96d 20h"): sin esto el resumen repetía el mismo
  // aviso 4-5 veces. Uno por origen + clave, con el texto más nuevo (llegan del
  // más viejo al más nuevo).
  // Los que mandan la FOTO entera (la lista completa de hoy) cambian de clave
  // cuando cambia la lista, así que por clave seguían saliendo 4 "Make" y 2
  // "Cadena" el 07/10: de ésos vale solo el último.
  const porClave = new Map<string, { origen: string; nivel: number; texto?: string }>();
  for (const f of todas) {
    const k = ORIGENES_FOTO.has(f.origen) ? f.origen : `${f.origen}|${f.clave ?? f.texto ?? ""}`;
    const previa = porClave.get(k);
    porClave.set(k, { origen: f.origen, nivel: Math.max(f.nivel, previa?.nivel ?? f.nivel), texto: f.texto ?? previa?.texto });
  }
  const filas = [...porClave.values()];
  const orden = [...filas].sort((x, y) => y.nivel - x.nivel);
  const conTexto = orden.slice(0, MAX_LINEAS_CON_TEXTO);
  const sobran = orden.slice(MAX_LINEAS_CON_TEXTO);

  const partes = [`*Otros avisos desde ayer (${filas.length}):*`];
  for (const f of conTexto) partes.push(`• ${nombreDeOrigen(f.origen)}${f.texto ? `: ${unaLinea(f.texto)}` : ""}`);
  if (sobran.length > 0) {
    const porTema = new Map<string, number>();
    for (const f of sobran) porTema.set(nombreDeOrigen(f.origen), (porTema.get(nombreDeOrigen(f.origen)) ?? 0) + 1);
    const temas = [...porTema.entries()].sort((x, y) => y[1] - x[1]).map(([t, n]) => `${t} ${n}`);
    partes.push(`_y ${sobran.length} más: ${temas.join(" · ")}._`);
  }
  return partes.join("\n");
}

/** ¿Ya salió el resumen de hoy? Se mira el registro, no la memoria: sobrevive a un deploy. */
async function yaSalioHoy(db: Db, ahora: Date): Promise<boolean> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(waOutbox)
    .where(and(eq(waOutbox.clave, `${ORIGEN_RESUMEN}:${diaLocal(ahora)}`), eq(waOutbox.estado, "enviado")));
  return (r?.n ?? 0) > 0;
}

/** Solo los lunes: el análisis de contenido de la semana. Si falla, el resumen sale igual. */
async function contenidoDelLunes(db: Db, ahora: Date): Promise<string | null> {
  const { relojLocal } = await import("../agentes/cola.js");
  if (relojLocal(ahora).dia !== 1) return null;
  try {
    const { analisisContenido, armarContenidoSemanal } = await import("../services/contenido-analisis.js");
    return armarContenidoSemanal(await analisisContenido(db, 180), (await urlDeHoy(db)).replace(/\/hoy$/, "/contenido#que-funciona"));
  } catch {
    return null;
  }
}

export async function mandarResumen(db: Db, ahora = new Date()): Promise<{ enviado: boolean; motivo?: string }> {
  if (await yaSalioHoy(db, ahora)) return { enviado: false, motivo: "ya salió hoy" };
  const hoy = await datosDeHoy(db);
  const encabezado = armarResumen(hoy, await urlDeHoy(db), ahora, await tendenciasDelDia(db, ahora), await hallazgos(db, hoy), await contenidoDelLunes(db, ahora));
  // Una sola lectura de lo pendiente: lo que se resume es exactamente lo que
  // después se marca como agrupado.
  const filas = await db
    .select({ id: waOutbox.id, origen: waOutbox.origen, nivel: waOutbox.nivel, texto: waOutbox.texto, clave: waOutbox.clave })
    .from(waOutbox)
    .where(eq(waOutbox.estado, "pendiente"))
    .orderBy(desc(waOutbox.nivel), asc(waOutbox.createdAt));
  return enviarResumenDiario(db, encabezado, { texto: armarPendientesCortos(filas), ids: filas.map((f) => f.id) });
}

/** El texto que saldría ahora, sin mandarlo. Para verificar en producción. */
export async function ensayarResumen(db: Db, ahora = new Date()): Promise<{ texto: string; pendientes: number }> {
  const hoy = await datosDeHoy(db);
  const filas = await db
    .select({ origen: waOutbox.origen, nivel: waOutbox.nivel, texto: waOutbox.texto, clave: waOutbox.clave })
    .from(waOutbox)
    .where(eq(waOutbox.estado, "pendiente"))
    .orderBy(desc(waOutbox.nivel), asc(waOutbox.createdAt));
  const texto = [armarResumen(hoy, await urlDeHoy(db), ahora, await tendenciasDelDia(db, ahora), await hallazgos(db, hoy), await contenidoDelLunes(db, ahora)), armarPendientesCortos(filas)].filter(Boolean).join("\n\n———\n\n");
  return { texto, pendientes: filas.length };
}

/** Hora del resumen, en Buenos Aires. */
export const HORA_RESUMEN = 9;
/**
 * Hasta qué hora se sigue intentando si a las 9 no salió (deploy justo en esa
 * hora, gateway caído). Pasado el mediodía ya no es "el de la mañana": lo
 * pendiente espera al de mañana, no se pierde.
 */
export const HORA_LIMITE_RESUMEN = 12;

/** ¿Toca intentar el resumen a esta hora? `yaSalioHoy` evita que salga dos veces. */
export function tocaResumen(hora: number): boolean {
  return hora >= HORA_RESUMEN && hora < HORA_LIMITE_RESUMEN;
}

let reloj: ReturnType<typeof setInterval> | null = null;

/** Programa el resumen diario. `LMTM_RESUMEN_DIARIO=off` lo apaga sin deploy. */
export function initResumenDiario(db: Db): void {
  if (reloj || process.env.LMTM_RESUMEN_DIARIO === "off") return;
  const tick = async () => {
    const ahora = new Date();
    const hora = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", hourCycle: "h23" }).format(ahora));
    // Si el servidor arranca a las 15:00 no tiene que mandar el de la mañana tarde.
    if (!tocaResumen(hora)) return;
    const r = await mandarResumen(db, ahora).catch((e) => ({ enviado: false, motivo: e instanceof Error ? e.message : String(e) }));
    if (r.enviado || r.motivo !== "ya salió hoy") console.log(`[resumen] ${r.enviado ? "enviado" : `no salió: ${r.motivo}`}`);
  };
  // Un intento poco después de arrancar: con solo el intervalo, un deploy a
  // las 9:52 hacía el primer intento a las 10:02 y antes ése era el día perdido.
  setTimeout(() => void tick(), 90_000);
  reloj = setInterval(() => void tick(), 10 * 60_000);
  console.log("[resumen] programado (9:00 de Buenos Aires)");
}
