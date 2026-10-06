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
import { urlDeHoy } from "./incidentes.js";

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
  return db
    .select({ title: trends.title, url: trends.url })
    .from(trends)
    .where(and(gte(trends.day, desde), sql`${trends.tag} <> 'ignorar'`))
    .orderBy(desc(trends.day))
    .limit(3)
    .catch(() => []);
}

/** El encabezado del resumen. Puro: es lo que el dueño lee a las 9:00. */
export function armarResumen(
  h: Pick<Hoy, "incidentes" | "decisiones" | "esperando" | "plataParada" | "whatsapp">,
  url: string,
  ahora = new Date(),
  tendencias: Tendencia[] = [],
): string {
  const lineas: string[] = [`*Hoy, ${fechaLarga(ahora)}*`, ""];

  if (h.incidentes.length > 0) {
    const n = h.incidentes.length;
    lineas.push(`🔴 ${n === 1 ? "1 incidente" : `${n} incidentes`}:`);
    for (const i of h.incidentes.slice(0, 4)) {
      lineas.push(`• *${i.cliente}* — ${i.que}${i.arsPorDia ? ` (${pesos(i.arsPorDia)} por día)` : ""}`);
    }
    if (n > 4) lineas.push(`• y ${n - 4} más`);
    lineas.push("");
  }

  if (h.plataParada != null && h.plataParada > 0) {
    lineas.push(`${pesos(h.plataParada)} por día parados.`, "");
  }

  if (h.decisiones.length === 0) {
    lineas.push("No hay decisiones pendientes.");
  } else {
    lineas.push(h.decisiones.length === 1 ? "Para decidir:" : `Para decidir (${h.decisiones.length}), lo que más pesa:`);
    h.decisiones.slice(0, 3).forEach((d, i) => {
      lineas.push(`${i + 1}. *${d.cliente}* — ${d.que}${d.arsPorDia ? ` · ${pesos(d.arsPorDia)} por día` : ""}`);
    });
  }
  if (h.esperando.length > 0) {
    lineas.push("", `${h.esperando.length} ${h.esperando.length === 1 ? "ya hecha espera" : "ya hechas esperan"} que el próximo dato lo confirme.`);
  }
  lineas.push("", `Decidir en Hoy: ${url}`);
  if (tendencias.length > 0) {
    lineas.push("", "Tendencias de hoy, para reenviar a clientes:");
    for (const t of tendencias) lineas.push(`• ${t.title}${t.url ? ` ${t.url}` : ""}`);
  }
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

const nombreDeOrigen = (origen: string) => NOMBRE_ORIGEN[origen] ?? "Otros avisos";

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
  if (todas.length === 0) return null;
  // Los monitores vuelven a encolar el mismo aviso cada hora (misma clave, el
  // texto cambia en "96d 19h" → "96d 20h"): sin esto el resumen repetía el mismo
  // aviso 4-5 veces. Uno por origen + clave, con el texto más nuevo (llegan del
  // más viejo al más nuevo).
  const porClave = new Map<string, { origen: string; nivel: number; texto?: string }>();
  for (const f of todas) {
    const k = `${f.origen}|${f.clave ?? f.texto ?? ""}`;
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

export async function mandarResumen(db: Db, ahora = new Date()): Promise<{ enviado: boolean; motivo?: string }> {
  if (await yaSalioHoy(db, ahora)) return { enviado: false, motivo: "ya salió hoy" };
  const hoy = await datosDeHoy(db);
  const encabezado = armarResumen(hoy, await urlDeHoy(db), ahora, await tendenciasDelDia(db, ahora));
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
  const texto = [armarResumen(hoy, await urlDeHoy(db), ahora, await tendenciasDelDia(db, ahora)), armarPendientesCortos(filas)].filter(Boolean).join("\n\n———\n\n");
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
