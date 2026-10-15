// LMTM-OS: ¿se están publicando de verdad las cosas? (15/10)
//
// Pedido: "toda la revisión de scripts y de que realmente se posteen las cosas
// no funcionó bien: tuvimos errores estos días que no fueron notificados ni
// solucionados" (se arreglaron a mano en la sesión "Posteos Agencia").
//
// LO QUE PASÓ Y NADIE VIO
//   · 06/10: venció la conexión de LinkedIn de Make; Make apagó 7 escenarios.
//   · 01→09/10: Clean Unity apagado (YouTube muerto), 8 posts en la cola.
//   · Reno: videos que Instagram rechaza con [500] desde el 18/09.
//   · Carruseles con video o Thumbs.db: Facebook e Instagram los rechazan.
//   · Mundo Inflable: post que llegó vencido a ClickUp y nunca se disparó.
// Make mostraba todo en verde (los manejadores de error atrapan la falla) y lo
// que sí detectaban los monitores llegaba como UNA línea al final del resumen.
//
// QUÉ MIRA ESTO, CON SEÑALES QUE ALGUIEN TUVO QUE PRODUCIR
//   · conexiones de Make vencidas o por vencer, con cuántos escenarios ACTIVOS
//     las usan (si vence, Make los apaga a todos al próximo post);
//   · escenario del cliente apagado con posts en la cola o programados;
//   · ejecuciones incompletas (posts que fallaron), con el motivo en castellano;
//   · comentarios de falla que Make deja en la tarea de ClickUp;
//   · posts listos que pasaron su hora y nunca se dispararon.
// Lo grave sale como aviso propio (nivel 5), no en una línea del resumen, y
// entra a Hoy como decisión: el piloto automático la vuelve tarea en ClickUp.

import type { Db } from "@paperclipai/db";
import { clients } from "@paperclipai/db";
import { clienteReal } from "./intel-common.js";

const DIA = 86_400_000;

export type TipoHallazgo = "conexion_por_vencer" | "conexion_caida" | "escenario_apagado" | "posts_fallidos" | "post_no_disparado";

export interface Hallazgo {
  tipo: TipoHallazgo;
  /** null = de la agencia (una conexión que usan muchos clientes). */
  clientId: string | null;
  cliente: string;
  grave: boolean;
  /** Lo que hay que hacer, en una frase. */
  que: string;
  detalle: string;
  /** Mismo hecho, misma clave: evita repetir el aviso. */
  clave: string;
}

/** Días antes del vencimiento en que se empieza a avisar; grave en los últimos 3. */
export const AVISO_VENCE_DIAS = 10;
export const GRAVE_VENCE_DIAS = 3;
/** Una incompleta más vieja que esto ya no es "estos días": va contada, no como alarma. */
export const FALLA_RECIENTE_DIAS = 7;

const fecha = (d: Date) => d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });
const red = (accountName: string) =>
  ({ facebook: "Facebook/Instagram", linkedin2: "LinkedIn", linkedin: "LinkedIn", youtube: "YouTube", pinterest2: "Pinterest", "google-restricted": "Google Drive" } as Record<string, string>)[accountName] ?? accountName;

/**
 * Conexiones en riesgo que usan escenarios ACTIVOS. Pura.
 *   · no verifica (verificada === false): el primer post que la use apaga ese
 *     escenario entero; no es grave mientras no haya posts para esa red, y si
 *     pasa lo agarra "escenario_apagado", que sí lo es;
 *   · vence en ≤ 10 días y verifica: avisar antes (grave en los últimos 3).
 * Un `expire` pasado con la conexión verificando NO se acusa: Make la renueva.
 */
export function conexionesEnRiesgo(
  conexiones: Array<{ id: number; name: string; accountName: string; expire: string | null; scenarioUsages?: Array<{ id: number; name: string }>; verificada?: boolean | null }>,
  activos: Set<number>,
  ahora: Date,
): Hallazgo[] {
  const out: Hallazgo[] = [];
  for (const c of conexiones) {
    const usan = (c.scenarioUsages ?? []).filter((s) => activos.has(s.id));
    if (usan.length === 0) continue;
    const nombres = usan.slice(0, 5).map((s) => s.name).join(", ") + (usan.length > 5 ? ` y ${usan.length - 5} más` : "");
    const comoArreglar = `En Make → Connections → «${c.name}» → Reauthorize, entrando con la cuenta que administra las páginas de los clientes (si se entra con otra, la conexión anda pero no publica).`;
    if (c.verificada === false) {
      out.push({
        tipo: "conexion_caida", clientId: null, cliente: "Agencia", grave: false,
        que: `Reautorizar la conexión de ${red(c.accountName)} «${c.name}» en Make: no verifica y la usan ${usan.length} escenarios activos`,
        detalle: `Make la prueba y falla. Mientras esos clientes no programen posts para ${red(c.accountName)} no pasa nada; el primero que lo haga apaga su escenario entero (pasó con LinkedIn el 06/10: 7 clientes caídos). La usan: ${nombres}. ${comoArreglar}`,
        clave: `conexion:${c.id}:caida`,
      });
      continue;
    }
    if (!c.expire) continue;
    const dias = Math.floor((Date.parse(c.expire) - ahora.getTime()) / DIA);
    if (dias < 0 || dias > AVISO_VENCE_DIAS) continue;
    out.push({
      tipo: "conexion_por_vencer", clientId: null, cliente: "Agencia", grave: dias <= GRAVE_VENCE_DIAS,
      que: `Reautorizar la conexión de ${red(c.accountName)} «${c.name}» en Make antes del ${fecha(new Date(c.expire))}: la usan ${usan.length} escenarios activos`,
      detalle: `Vence en ${dias} ${dias === 1 ? "día" : "días"}. Si vence, Make apaga entero cada escenario que la usa en su próximo post (pasó con LinkedIn el 06/10: 7 clientes caídos). La usan: ${nombres}. ${comoArreglar}`,
      clave: `conexion:${c.id}:vence`,
    });
  }
  return out;
}

/** El motivo de Make, en castellano y con qué hacer. Pura. */
export function explicarFalla(reason: string | null): string {
  const r = reason ?? "";
  if (/image format is not supported|36001/i.test(r)) return "el carrusel tiene algo que no es imagen JPG (un video, un PNG o un Thumbs.db): dejar solo JPG en la carpeta y el video como Reel aparte";
  if (/^\[5\d\d\]|internal error/i.test(r)) return "Instagram dio error interno al subir el archivo (suele ser un video pesado o en un formato raro); Make lo reintenta, y si se repite hay que achicarlo o subirlo a mano";
  if (/media id is not available|9007/i.test(r)) return "Instagram no terminó de procesar el video a tiempo; reintentar o subirlo a mano";
  if (/task_id/i.test(r)) return "llegó un disparo sin la tarea de ClickUp (el escenario recibió un post vacío)";
  if (/token|session|expired|OAuthException.*(190|102)/i.test(r)) return "la conexión de la red dejó de tener permiso: reautorizarla en Make";
  return r.replace(/\s+/g, " ").slice(0, 160) || "sin motivo informado";
}

/** Las incompletas recientes de un escenario, agrupadas por motivo. Pura. */
export function fallasRecientes(incompletas: Array<{ created: string; resolved: boolean; reason: string | null }>, ahora: Date): { recientes: number; viejas: number; motivos: Array<{ motivo: string; veces: number; ultima: string }> } {
  const sin = incompletas.filter((i) => !i.resolved);
  const limite = ahora.getTime() - FALLA_RECIENTE_DIAS * DIA;
  const rec = sin.filter((i) => Date.parse(i.created) >= limite);
  const por = new Map<string, { veces: number; ultima: string }>();
  for (const i of rec) {
    const m = explicarFalla(i.reason);
    const x = por.get(m) ?? { veces: 0, ultima: i.created };
    x.veces += 1;
    if (i.created > x.ultima) x.ultima = i.created;
    por.set(m, x);
  }
  return {
    recientes: rec.length,
    viejas: sin.length - rec.length,
    motivos: [...por].map(([motivo, x]) => ({ motivo, ...x })).sort((a, b) => b.veces - a.veces),
  };
}

/** Lo que dejó Make en la tarea cuando una red falló. Pura. */
export const FALLA_EN_COMENTARIO = /post was not succes|no se pudo publicar|failed to publish/i;

export async function revisarPosteos(db: Db, ahora = new Date()): Promise<{ hallazgos: Hallazgo[]; ciego: boolean }> {
  const make = await import("./make.js");
  if (!make.makeConfigured()) return { hallazgos: [], ciego: true };
  let escenarios: Awaited<ReturnType<typeof make.makeListScenarios>>;
  try {
    escenarios = await make.makeListScenarios();
  } catch (e) {
    console.warn("[salud-posteos] no se pudo leer Make:", e instanceof Error ? e.message : e);
    return { hallazgos: [], ciego: true };
  }
  const hallazgos: Hallazgo[] = [];

  // 1) Conexiones.
  const activos = new Set(escenarios.filter((s) => s.isActive).map((s) => s.id));
  try {
    const conexiones = await make.makeConexiones();
    // Se verifica en vivo solo lo que usa algún escenario activo.
    for (const c of conexiones as Array<Awaited<ReturnType<typeof make.makeConexiones>>[number] & { verificada?: boolean | null }>) {
      if ((c.scenarioUsages ?? []).some((s) => activos.has(s.id))) c.verificada = await make.makeConexionVerifica(c.id);
    }
    hallazgos.push(...conexionesEnRiesgo(conexiones, activos, ahora));
  } catch (e) {
    console.warn("[salud-posteos] no se pudieron leer las conexiones:", e instanceof Error ? e.message : e);
  }

  // 2-5) Cliente por cliente.
  const { getRedesCalendar, comentariosDeTarea } = await import("./clickup-sync.js");
  const lista = await db.select({ id: clients.id, name: clients.name }).from(clients).where(clienteReal());
  for (const c of lista) {
    const nombre = c.name.trim();
    const sc = make.matchScenario(c.name, escenarios);

    let cal: Awaited<ReturnType<typeof getRedesCalendar>> = null;
    try {
      cal = await getRedesCalendar(db, c.id, ahora.getTime() - 3 * DIA, ahora.getTime() + 7 * DIA);
    } catch {
      cal = null;
    }
    const proximos = cal ? cal.filter((p) => Date.parse(p.date) > ahora.getTime() && p.readyToPublish).length : null;

    // Escenario apagado con posts esperando.
    if (sc && !sc.isActive) {
      const cola = sc.hookId ? await make.makeColaDelWebhook(sc.hookId).catch(() => null) : null;
      if ((cola ?? 0) > 0 || (proximos ?? 0) > 0) {
        hallazgos.push({
          tipo: "escenario_apagado", clientId: c.id, cliente: nombre, grave: true,
          que: `Encender el escenario de ${nombre} en Make: está apagado${cola ? ` y tiene ${cola} ${cola === 1 ? "post trabado" : "posts trabados"} en la cola` : ""}${proximos ? ` (${proximos} programados esta semana)` : ""}`,
          detalle: `El escenario «${sc.name}» está apagado: lo que le manda el despachador queda en la cola y no se publica. Make lo apaga solo cuando falla una conexión. Revisar en su historial qué conexión falló, arreglarla y encenderlo.${cola && cola > 1 ? ` Al encenderlo salen los ${cola} de la cola juntos: si alguno ya no corresponde, borrarlo de la cola antes.` : ""}`,
          clave: `escenario_apagado:${c.id}`,
        });
      }
    }

    // Posts que fallaron (incompletas).
    if (sc && (sc.dlqCount ?? 0) > 0) {
      try {
        const f = fallasRecientes(await make.makeIncompletas(sc.id), ahora);
        if (f.recientes > 0) {
          const ult = f.motivos.map((m) => m.ultima).sort().at(-1)!;
          hallazgos.push({
            tipo: "posts_fallidos", clientId: c.id, cliente: nombre, grave: true,
            que: `${f.recientes} ${f.recientes === 1 ? "post de" : "posts de"} ${nombre} no ${f.recientes === 1 ? "salió" : "salieron"} (el último, ${fecha(new Date(ult))})`,
            detalle: f.motivos.map((m) => `${m.veces} × ${m.motivo}`).join("; ") + `.${f.viejas ? ` Además hay ${f.viejas} fallas sin resolver de antes.` : ""} Están en Make → «${sc.name}» → Ejecuciones incompletas.`,
            clave: `posts_fallidos:${c.id}:${ult.slice(0, 10)}`,
          });
        }
      } catch { /* no se pudo leer: no se acusa */ }
    }

    if (!cal) continue;
    // Posts listos que pasaron su hora y nunca se dispararon (Mundo Inflable 130).
    const vencidos = cal.filter((p) => {
      const t = Date.parse(p.date);
      return t < ahora.getTime() - 3600_000 && t > ahora.getTime() - 3 * DIA && !p.sentToMake && p.readyToPublish && !/publicad|complete|cerrad|closed/i.test(p.status);
    });
    if (vencidos.length) {
      const a4 = vencidos.filter((p) => new Date(p.date).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Argentina/Buenos_Aires" }) === "04:00").length;
      hallazgos.push({
        tipo: "post_no_disparado", clientId: c.id, cliente: nombre, grave: true,
        que: `Reprogramar ${vencidos.length === 1 ? "un post" : `${vencidos.length} posts`} de ${nombre} que ${vencidos.length === 1 ? "pasó su hora y no salió" : "pasaron su hora y no salieron"}`,
        detalle: vencidos.slice(0, 5).map((p) => `«${p.name}» (${fecha(new Date(p.date))})`).join(", ") +
          `. ClickUp no dispara un post cuya hora ya pasó: si se carga o se mueve para el mismo día, llega vencido (el script pasa la planilla a ClickUp una vez por día).` +
          (a4 ? ` ${a4 === vencidos.length ? "Están" : `${a4} están`} a las 04:00: la planilla de este cliente probablemente no tiene el encabezado "Horario" y todos sus posts salen a esa hora.` : ""),
        clave: `post_no_disparado:${c.id}:${vencidos.map((p) => p.id).sort().join(",")}`,
      });
    }

    // Fallas que Make dejó como comentario en la tarea (Facebook/LinkedIn).
    const disparados = cal.filter((p) => p.sentToMake && Date.parse(p.date) > ahora.getTime() - 2 * DIA && Date.parse(p.date) < ahora.getTime());
    const conFalla: string[] = [];
    for (const p of disparados.slice(0, 15)) {
      try {
        const coms = await comentariosDeTarea(p.id);
        const m = coms.find((x) => FALLA_EN_COMENTARIO.test(x.texto));
        if (m) conFalla.push(`«${p.name}»: ${m.texto.replace(/\s+/g, " ").slice(0, 80)}`);
      } catch { /* sin comentarios legibles: no se acusa */ }
    }
    if (conFalla.length) {
      hallazgos.push({
        tipo: "posts_fallidos", clientId: c.id, cliente: nombre, grave: true,
        que: `${conFalla.length === 1 ? "Un post" : `${conFalla.length} posts`} de ${nombre} no ${conFalla.length === 1 ? "salió" : "salieron"} en alguna red`,
        detalle: `${conFalla.join("; ")}. Make lo deja como comentario y marca la corrida en verde. Si es LinkedIn en varios clientes a la vez, la conexión se reautorizó con una cuenta que no administra las páginas.`,
        clave: `comentario_falla:${c.id}:${conFalla.join("|").slice(0, 200)}`,
      });
    }
  }
  return { hallazgos, ciego: false };
}

/** Avisa lo grave como aviso propio (nivel 5, una vez por hecho) y lo demás al resumen. */
export async function avisarPosteos(db: Db, hallazgos: Hallazgo[]): Promise<void> {
  const graves = hallazgos.filter((h) => h.grave);
  if (graves.length === 0) return;
  const { avisarAlEquipo } = await import("./wa-embudo.js");
  const lineas = ["*🚨 Publicación: esto no está saliendo*", ""];
  for (const h of graves.slice(0, 10)) lineas.push(`• *${h.cliente}* — ${h.que}.\n  _${h.detalle.slice(0, 280)}_`);
  if (graves.length > 10) lineas.push(`_y ${graves.length - 10} más en Hoy._`);
  await avisarAlEquipo(db, {
    origen: "salud-posteos",
    nivel: 5,
    clave: `salud-posteos:${graves.map((h) => h.clave).sort().join("|").slice(0, 400)}`,
    texto: lineas.join("\n"),
  }).catch((e) => console.warn("[salud-posteos] no se pudo avisar:", e instanceof Error ? e.message : e));
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Cada 3 horas, de 8 a 22 (Buenos Aires). */
export function initSaludPosteos(db: Db): void {
  if (timer) return;
  const vuelta = async () => {
    const hora = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date()));
    if (hora < 8 || hora > 22) return;
    const r = await revisarPosteos(db);
    if (r.ciego) return;
    console.log(`[salud-posteos] ${r.hallazgos.length} hallazgos (${r.hallazgos.filter((h) => h.grave).length} graves)`);
    await avisarPosteos(db, r.hallazgos);
  };
  const correr = () => void vuelta().catch((e) => console.warn("[salud-posteos] falló:", e instanceof Error ? e.message : e));
  setTimeout(correr, 12 * 60_000);
  timer = setInterval(correr, 3 * 3600_000);
}
