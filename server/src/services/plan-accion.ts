// LMTM-OS: triage rojo/amarillo/verde + Plan de acción por cliente (pedido 20/7).
//
// "Amarillo, rojo y verde serían la materialización de la salud de la cuenta
// pero más fácil de entender". Rojo = incumplimiento de cotización, malos
// insights, problemas abiertos — cada uno con su plan de acción. Son DOS
// planes distintos (decisión del usuario 20/7): en Growth el plan CORTO
// determinista para salir del rojo (salud, cumplimiento, intervenciones,
// oportunidades, radar del rubro — siempre fresco); en la ficha del cliente
// el reporte ESTRATÉGICO largo que escribe el agente semanalmente
// (deliverable "Plan de acción", rutina de Luna).

import type { Db } from "@paperclipai/db";
import { accountScores, adsAccountMappings, adsInsights, agentDeliverables, clientMemory, clients, competitors, decisiones, interventions, nicheReports, opportunities } from "@paperclipai/db";
import { and, desc, eq, gte, ilike, inArray, sql } from "drizzle-orm";
import { cotizadoVsRealizado } from "./cotizado.js";
import { clienteReal } from "./intel-common.js";
import { VIGENCIA_INTERVENCION_DIAS } from "./vigilantes.js";

/** "sin-datos": no hay ninguna señal medida. Antes caía en verde ("en orden,
 *  sostener") — afirmar que un cliente está bien sin haberlo mirado. */
export type Semaforo = "rojo" | "amarillo" | "verde" | "sin-datos";

/**
 * ¿El cumplimiento está midiendo, o está ciego?
 *
 * Se cuenta contra piezas de ClickUp etiquetadas, y esa etiqueta ya nos mintió
 * antes ("mandado a make" daba por publicado lo que no salía). Cuando la
 * etiqueta no se pone, trabajo real cuenta como cero, y ese cero no distingue
 * "no se hizo nada" de "no pudimos medir".
 *
 * El síntoma de ceguera es sistémico, no individual: si media cartera marca 0%,
 * lo que falla es el contador, no treinta clientes a la vez.
 */
export const MINIMO_PARA_JUZGAR = 5;
export const FRACCION_CIEGA = 0.4;

export function cumplimientoEstaCiego(valores: Array<number | null>): boolean {
  const medidos = valores.filter((v): v is number => v != null);
  if (medidos.length < MINIMO_PARA_JUZGAR) return false;
  return medidos.filter((v) => v === 0).length / medidos.length >= FRACCION_CIEGA;
}

export interface SenalesCliente {
  salud: number | null;
  cumplimientoPct: number | null;
  scorePauta: number | null;
  pautaCorre: boolean;
  maxLevel: number;
  /** Si el cumplimiento de TODA la cartera no es de fiar, acá no decide. */
  cumplimientoCiego: boolean;
}

/**
 * El color de un cliente.
 *
 * ROJO PIDE DOS SEÑALES, NO UNA. Antes alcanzaba con el cumplimiento por debajo
 * de 50, y el tablero quedó con 39 rojos sobre 59 — había clientes con salud 76
 * y 77 en rojo cuyo único problema era "Cumplimiento del cotizado: 0%".
 *
 * Un semáforo donde dos de cada tres están en rojo no ordena nada: se lee como
 * que está roto, y el que lo mira deja de creerle al resto de la pantalla. Eso
 * cuesta más que no tener semáforo.
 */
export function decidirSemaforo(s: SenalesCliente): Semaforo {
  const cumplMalo = !s.cumplimientoCiego && s.cumplimientoPct != null && s.cumplimientoPct < 50;
  const pautaRota = s.scorePauta != null && s.scorePauta < 40 && s.pautaCorre;
  const saludMala = s.salud != null && s.salud < 45;
  const saludFloja = s.salud != null && s.salud < 70;

  // Lo que no admite otra lectura pinta rojo solo.
  if (saludMala || s.maxLevel >= 5 || pautaRota) return "rojo";
  // El cumplimiento suma como SEGUNDA señal, nunca como única.
  if (cumplMalo && (saludFloja || s.maxLevel >= 4)) return "rojo";

  const algoMedido = s.salud != null || (s.cumplimientoPct != null && !s.cumplimientoCiego) || (s.scorePauta != null && s.pautaCorre) || s.maxLevel > 0;
  if (!algoMedido) return "sin-datos";

  const verde =
    (s.salud == null || s.salud >= 70) &&
    (s.cumplimientoCiego || s.cumplimientoPct == null || s.cumplimientoPct >= 85) &&
    s.maxLevel < 4 &&
    (s.scorePauta == null || s.scorePauta >= 70 || !s.pautaCorre);
  return verde ? "verde" : "amarillo";
}

// Estándar del reporte estratégico (pedido 20/7: "más personalizado, ideas más
// creativas, qué funciona en su nicho, contrastando con sus competidores").
// Se usa en el issue del botón "Regenerar" y es el MISMO texto que lleva la
// rutina "Plan de acción por cliente" (si se cambia acá, actualizar la rutina
// vía PATCH /routines/:id).
export const PLAN_ACCION_SPEC = [
  "Estructura OBLIGATORIA del reporte (markdown):",
  "## Radiografía — los números clave de ESTE cliente (orgánico, pauta, cumplimiento de lo cotizado), 3-4 frases con datos reales.",
  "## Qué funciona en el rubro — benchmark CTR/CPL, formato ganador, y lo que muestran los referentes EXTERNOS del radar del rubro: nombralos con su link (vienen en lmtmGetNicheIntel).",
  "## Contraste con competidores — mínimo 2 POR NOMBRE (lmtmGetClientCompetitors y/o referentes del radar): qué hacen ellos que les funciona y este cliente NO está haciendo; y qué hueco del rubro nadie cubre y este cliente puede ocupar.",
  "## Ideas creativas — 4 a 6, LISTAS PARA PRODUCIR. Cada una: [Formato] + el gancho textual listo (las 2 primeras líneas, escritas en la voz del cliente según su brain) + por qué va a funcionar PARA ESTE cliente (el dato del nicho o del competidor que la respalda, con link si viene del radar).",
  "## Fallos → solución — cada problema abierto (incumplimiento, avisos fatigados, cadencia caída, intervenciones) con SU fix concreto, no un consejo general.",
  "## Acciones de la semana — 3 a 5, medibles y priorizadas, con quién la ejecuta.",
  "",
  "REGLAS ANTI-GENÉRICO:",
  "- PROHIBIDO el consejo que le sirve a cualquier cliente ('subir la cadencia', 'mejorar el engagement', 'diversificar formatos') sin anclarlo a un dato propio: nombre de campaña o post real, número, competidor.",
  "- Nombrá mínimo 2 competidores o referentes POR NOMBRE con qué les está funcionando.",
  "- Las ideas se escriben en la voz del cliente (brain: tono, público, restricciones). Si el brain está vacío, decilo y la primera acción es nutrirlo.",
  "- Nada inventado: números de las tools, links SOLO los que devuelven las tools. Citá origen y fecha.",
].join("\n");

export interface PlanAccionCliente {
  clientId: string;
  name: string;
  slug: string;
  industry: string | null;
  semaforo: Semaforo;
  salud: number | null;
  scorePauta: number | null;
  cumplimientoPct: number | null;
  problemas: string[];
  acciones: string[];
  /** Dónde está parado, con lo medido (pauta y orgánico). null = nada medido. */
  etapa: string | null;
  reporteAgente: { title: string; content: string; createdAt: string } | null;
}

// Cache stale-while-revalidate (fluidez, pedido 23/7): el cómputo completo
// cuesta 15-20s frío (planilla Google + ~40 listas de ClickUp). NUNCA se lo
// hacemos pagar a un request: si hay cache — aunque esté vencido — se sirve al
// instante y el recálculo corre atrás (dedupeado). Solo el primer hit tras un
// boot espera, y el warmer de app.ts lo paga antes de que llegue un humano.
let cache: { at: number; rows: PlanAccionCliente[] } | null = null;
let inflight: Promise<PlanAccionCliente[]> | null = null;
const TTL = 5 * 60_000;

function recompute(db: Db): Promise<PlanAccionCliente[]> {
  if (!inflight) {
    inflight = computeAll(db)
      .then((rows) => { cache = { at: Date.now(), rows }; return rows; })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

export async function triageGrowth(db: Db): Promise<{ rojo: PlanAccionCliente[]; amarillo: PlanAccionCliente[]; verde: PlanAccionCliente[]; sinDatos: PlanAccionCliente[] }> {
  let rows: PlanAccionCliente[];
  if (cache) {
    rows = cache.rows;
    if (Date.now() - cache.at > TTL) void recompute(db).catch(() => {});
  } else {
    rows = await recompute(db);
  }
  return {
    rojo: rows.filter((r) => r.semaforo === "rojo"),
    amarillo: rows.filter((r) => r.semaforo === "amarillo"),
    verde: rows.filter((r) => r.semaforo === "verde"),
    sinDatos: rows.filter((r) => r.semaforo === "sin-datos"),
  };
}

/** Precalienta el triage (lo llama el warmer del boot y el tick periódico). */
export function warmTriage(db: Db): void {
  void recompute(db).catch((e) => console.warn(`[plan-accion] warm falló: ${e instanceof Error ? e.message : String(e)}`));
}

export async function planAccionCliente(db: Db, clientId: string): Promise<PlanAccionCliente | null> {
  const t = await triageGrowth(db);
  const row = [...t.rojo, ...t.amarillo, ...t.verde, ...t.sinDatos].find((r) => r.clientId === clientId) ?? null;
  if (!row) return null;
  // El reporte del agente se busca fresco (no vive en el cache de 5 min).
  const [rep] = await db.select({ title: agentDeliverables.title, content: agentDeliverables.content, createdAt: agentDeliverables.createdAt })
    .from(agentDeliverables)
    .where(sql`${agentDeliverables.clientId} = ${clientId} and ${agentDeliverables.title} ilike 'Plan de acción%'`)
    .orderBy(desc(agentDeliverables.createdAt)).limit(1);
  return { ...row, reporteAgente: rep ? { title: rep.title, content: rep.content ?? "", createdAt: new Date(rep.createdAt).toISOString() } : null };
}

async function computeAll(db: Db): Promise<PlanAccionCliente[]> {
  const activos = await db.select({
    id: clients.id, name: clients.name, slug: clients.slug, industry: clients.industry,
    salud: sql<{ score?: number; razones?: string[] } | null>`${clients.metadata}->'salud'`,
  }).from(clients).where(clienteReal());

  // Cumplimiento del cotizado (planilla + Instagram/ClickUp; cacheado adentro).
  const cot = await cotizadoVsRealizado(db, { months: 1 }).catch(() => null);
  const cotByClient = new Map((cot?.rows ?? []).filter((r) => r.clientId).map((r) => [r.clientId as string, r]));

  // Score de pauta (último accountScores).
  const d3 = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
  const scoreRows = await db.select().from(accountScores).where(gte(accountScores.date, d3)).orderBy(desc(accountScores.date));
  const pauta = new Map<string, number>();
  for (const s of scoreRows) {
    if (pauta.has(s.clientId)) continue;
    // components.noAds = sin pauta corriendo → no hay score que juzgar.
    if ((s.components as { noAds?: boolean } | null)?.noAds) continue;
    pauta.set(s.clientId, Number(s.healthScore ?? 0));
  }

  // Estado REAL de cada cliente, para poder desmentir al radar del rubro.
  // El informe de nicho se escribe una vez y su consejo queda congelado: el de
  // automotor es del 5/8 y le dice a BRACHETTA "cargar brain (no tiene memoria
  // aún) y mapear cuenta Meta" cuando tiene 55 memorias y la cuenta mapeada
  // hace rato. Un consejo falso en el plan de acción quema la confianza en todo
  // el resto del panel (18/8).
  const conBrain = new Set(
    (await db.select({ clientId: clientMemory.clientId }).from(clientMemory).groupBy(clientMemory.clientId))
      .map((r) => r.clientId).filter((x): x is string => !!x),
  );
  const conMapeo = new Set(
    (await db.select({ clientId: adsAccountMappings.clientId }).from(adsAccountMappings))
      .map((r) => r.clientId).filter((x): x is string => !!x),
  );

  // Intervenciones abiertas y VIGENTES por cliente. Sin el corte, 536 avisos
  // de más de 21 días (saldos del 3/9 ya recargados) se leían como problemas
  // de hoy y pintaban de rojo (7/10).
  const ints = await db.select({ clientId: interventions.clientId, level: interventions.level, title: interventions.title, body: interventions.body })
    .from(interventions).where(and(
      inArray(interventions.status, ["open", "sent"]),
      gte(interventions.createdAt, new Date(Date.now() - VIGENCIA_INTERVENCION_DIAS * 86_400_000)),
    ));
  const intsByClient = new Map<string, Array<{ level: number; title: string; body: string | null }>>();
  for (const i of ints) {
    if (!i.clientId) continue;
    const arr = intsByClient.get(i.clientId) ?? [];
    arr.push({ level: Number(i.level), title: i.title, body: i.body ?? null });
    intsByClient.set(i.clientId, arr);
  }

  // Oportunidades activas (para acciones en positivo). SOLO recientes: una
  // oportunidad de efeméride ("Día del Padre") nunca se cierra sola y quedaba
  // colgada meses en el semáforo (LMTM-3004, 29/7).
  const opps = await db.select({ clientId: opportunities.clientId, title: opportunities.title })
    .from(opportunities)
    .where(and(
      sql`${opportunities.status} not in ('done','dismissed','descartada','expired')`,
      gte(opportunities.createdAt, new Date(Date.now() - 21 * 86_400_000)),
    ))
    .orderBy(desc(opportunities.priority)).limit(300);
  const oppsByClient = new Map<string, string[]>();
  for (const o of opps) {
    if (!o.clientId) continue;
    const arr = oppsByClient.get(o.clientId) ?? [];
    if (arr.length < 3) arr.push(o.title);
    oppsByClient.set(o.clientId, arr);
  }

  // Movidas del último radar del rubro (planPorCliente).
  const radars = await db.select().from(nicheReports).orderBy(desc(nicheReports.week), desc(nicheReports.updatedAt)).limit(30);
  const radarByNiche = new Map<string, (typeof radars)[number]>();
  for (const r of radars) if (!radarByNiche.has(r.niche)) radarByNiche.set(r.niche, r);

  // ¿El cumplimiento está midiendo, o está ciego?
  //
  // Se cuenta contra las piezas de ClickUp etiquetadas, y esa etiqueta ya nos
  // mintió antes (ver la revisión de la flota: "mandado a make" daba por
  // publicado lo que no salía). Cuando la etiqueta no se pone, trabajo real
  // cuenta como cero — y un cero así no distingue "no se hizo nada" de "no
  // pudimos medir".
  //
  // El síntoma de que está ciego es sistémico, no individual: si media cartera
  // marca 0%, lo que falla es el contador, no treinta clientes a la vez. En ese
  // caso el número se sigue mostrando pero NO decide el semáforo.
  // Solo el conteo de ClickUp puede estar ciego; el de Instagram es lectura de la red.
  const valoresCumpl = [...cotByClient.values()].filter((r) => r.fuente === "clickup").map((r) => r.cumplimientoPct ?? null);
  const cumplimientoCiego = cumplimientoEstaCiego(valoresCumpl);
  if (cumplimientoCiego) {
    const conCumpl = valoresCumpl.filter((v) => v != null);
    const enCero = conCumpl.filter((v) => v === 0).length;
    console.warn(
      `[plan-accion] cumplimiento IGNORADO para el semáforo: ${enCero} de ${conCumpl.length} clientes marcan 0%. ` +
        `Eso es el contador de piezas de ClickUp, no la agencia.`,
    );
  }

  // Lo propio y lo de la competencia, medido (contenido-analisis.ts y
  // competencia-ig.ts): el plan se arma con SU contenido, no con consejos
  // que le sirven a cualquiera (pedido 08/10: "100% personalizado según
  // dónde se encuentre parado el cliente").
  const { analisisContenido } = await import("./contenido-analisis.js");
  const { analisisCompetencia } = await import("./competencia-ig.js");
  const contenido = await analisisContenido(db, 180).catch(() => null);
  const competencia = await analisisCompetencia(db).catch(() => null);
  const contenidoDe = new Map((contenido?.clientes ?? []).map((x) => [x.clientId, x]));
  // Lo que el motor ya encontró en la pauta de cada cliente (con nombre de campaña).
  const decsPauta = await db.select({ clientId: decisiones.clientId, que: decisiones.que })
    .from(decisiones)
    .where(and(inArray(decisiones.estado, ["abierta", "aprobada"]), sql`${decisiones.tipo} like 'pauta:%'`))
    .orderBy(desc(decisiones.arsPorDia));
  const pautaDe = new Map<string, string[]>();
  for (const d of decsPauta) pautaDe.set(d.clientId, [...(pautaDe.get(d.clientId) ?? []), d.que]);
  const conCompetidoresIg = new Set(
    (await db.select({ clientId: competitors.clientId }).from(competitors).where(sql`${competitors.igHandle} is not null and ${competitors.igHandle} <> ''`))
      .map((r) => r.clientId),
  );
  // Pauta que corre de verdad: gasto en ads_insights en 30 días (la planilla no tiene a todos).
  const conGasto = new Set(
    (await db.select({ clientId: adsInsights.clientId }).from(adsInsights)
      .where(and(gte(adsInsights.date, new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)), sql`${adsInsights.spend} > 0`))
      .groupBy(adsInsights.clientId))
      .map((r) => r.clientId).filter((id): id is string => !!id),
  );
  const x = (n: number) => `${n.toFixed(1).replace(".", ",")}×`;

  const out: PlanAccionCliente[] = [];
  for (const c of activos) {
    const salud = typeof c.salud?.score === "number" ? c.salud.score : null;
    const razones = Array.isArray(c.salud?.razones) ? c.salud.razones : [];
    const cotRow = cotByClient.get(c.id) ?? null;
    const cumpl = cotRow?.cumplimientoPct ?? null;
    const ciegoAca = cumplimientoCiego && cotRow?.fuente === "clickup";
    const fuenteCumpl = cotRow?.fuente === "instagram" ? "publicaciones leídas de Instagram" : "etiqueta de ClickUp, sin verificar en la red";
    const score = pauta.get(c.id) ?? null;
    const clientInts = (intsByClient.get(c.id) ?? []).sort((a, b) => b.level - a.level);
    const maxLevel = clientInts[0]?.level ?? 0;

    const problemas: string[] = [];
    const acciones: string[] = [];

    if (cumpl != null && cumpl < 85) {
      problemas.push(
        ciegoAca
          ? `Cumplimiento del cotizado: ${cumpl}% (sin verificar — el contador de ClickUp marca 0% en media cartera)`
          : `Cumplimiento del cotizado: ${cumpl}% (${fuenteCumpl})`,
      );
      const faltanP = Math.max(0, (cotRow?.esperadoMes.posteos ?? 0) - (cotRow?.realizado.posteosMes ?? 0));
      const faltanV = Math.max(0, (cotRow?.esperadoMes.videos ?? 0) - (cotRow?.realizado.videosMes ?? 0));
      if (faltanP + faltanV > 0) acciones.push(`Ponerse al día con lo vendido: faltan ${faltanP} posteos y ${faltanV} videos del período.`);
    }
    if (salud != null && salud < 70) {
      problemas.push(`Salud ${salud}/100${razones.length ? `: ${razones.slice(0, 2).join("; ")}` : ""}`);
    }
    // Score de pauta bajo solo cuenta como señal si la pauta CORRE de verdad:
    // score 0 con $0 de spend es casi siempre cuenta sin mapear, no pauta rota.
    const spendPeriodo = (cotRow?.realizado.spendMeta ?? 0) + (cotRow?.realizado.spendGoogle ?? 0);
    const pautaCorre = spendPeriodo > 0 || conGasto.has(c.id);
    if (score != null && score < 70 && pautaCorre) problemas.push(`Pauta ${score}/100`);
    // La pauta con nombre de campaña, de las decisiones del motor. Sin eso no
    // va ninguna acción de pauta: "revisar la pauta" le sirve a cualquiera.
    for (const q of (pautaDe.get(c.id) ?? []).slice(0, 2)) acciones.push(`Pauta: ${q}`);
    for (const i of clientInts.slice(0, 3)) {
      // El problema NO se repite como acción. Antes salía "⚠ cuenta sin
      // actividad hace 48h" en problemas y "Resolver ya: cuenta sin actividad
      // hace 48h" en acciones: la misma línea dos veces, con un prefijo. El
      // problema ya se ve arriba; la acción tiene que decir QUÉ hacer, y eso
      // vive en el cuerpo de la intervención, no en su título (18/8).
      problemas.push(`⚠ ${i.title}`);
      if (i.level >= 4) {
        const primeraLinea = (i.body ?? "").split("\n").map((l) => l.trim()).find((l) => l.length > 15);
        // Una línea que termina en ":" es el encabezado de una lista: sola no dice qué hacer.
        if (primeraLinea && !primeraLinea.endsWith(":")) acciones.push(primeraLinea.slice(0, 220));
      }
    }
    if ((cotRow?.cotizado.pautaMeta || cotRow?.cotizado.pautaGoogle) && (cotRow?.realizado.spendMeta ?? 0) + (cotRow?.realizado.spendGoogle ?? 0) === 0) {
      // Sin cuenta conectada, $0 no es "no se invirtió": es que no lo vemos.
      if (conMapeo.has(c.id)) {
        problemas.push("Pauta cotizada pero $0 invertidos en el período");
        acciones.push("Activar la pauta cotizada: hay presupuesto vendido sin correr.");
      } else {
        problemas.push("Pauta cotizada, pero la cuenta de anuncios no está conectada: no podemos ver cuánto se invierte");
        acciones.push("Conectar la cuenta de anuncios del cliente (Config → Conexiones de pauta).");
      }
    }
    // Las oportunidades de CONTENIDO no van al plan de acción: su lugar es la
    // lista de ClickUp, donde el equipo las produce. Acá aparecían como
    // "Oportunidad: Contenido para Día de la Industria" y nadie las trabajaba
    // desde el panel — es la duplicación que marcó el usuario (18/8).
    for (const o of oppsByClient.get(c.id) ?? []) {
      if (/^contenido |idea|posteo|carrusel|reel|efem[eé]ride/i.test(o)) continue;
      acciones.push(`Oportunidad: ${o.replace(/s+/g, " ").slice(0, 200)}`);
    }
    const radar = c.industry ? radarByNiche.get(c.industry) : null;
    const plan = radar?.sections?.planPorCliente?.find((p) => p.clientId === c.id || p.cliente.toLowerCase().includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(p.cliente.toLowerCase()));
    for (const m of plan?.movidas ?? []) {
      // Se descarta la movida cuyo supuesto ya no se cumple. Solo se verifica
      // lo que se puede probar con datos propios: si afirma que falta el brain
      // o el mapeo y en realidad están, la línea se cae.
      const afirmaSinBrain = /no tiene memoria|sin memoria|cargar brain|brain (del cliente )?vac/i.test(m);
      const afirmaSinMapeo = /mapear (la )?cuenta|sin cuenta mapeada|cuenta sin mapear/i.test(m);
      if (afirmaSinBrain && conBrain.has(c.id)) continue;
      if (afirmaSinMapeo && conMapeo.has(c.id)) continue;
      acciones.push(`Radar del rubro: ${m}`);
    }

    const semaforo: Semaforo = decidirSemaforo({
      salud,
      cumplimientoPct: cumpl,
      scorePauta: score,
      pautaCorre,
      maxLevel,
      cumplimientoCiego: ciegoAca,
    });

    // Contenido: lo suyo que funcionó, su ángulo, el del rubro y el de la competencia.
    const cont = contenidoDe.get(c.id);
    const delContenido: string[] = [];
    const r = cont?.mejorReciente;
    if (r) {
      const pieza = `su ${r.formato} de ${r.red === "instagram" ? "Instagram" : "Facebook"} del ${r.fecha.slice(8, 10)}/${r.fecha.slice(5, 7)}`;
      delContenido.push(`Repetir lo que funcionó: ${pieza} sacó ${x(r.indice)} lo normal de la cuenta${r.anguloNombre ? ` (ángulo «${r.anguloNombre}»)` : ""}; ${pautaCorre ? "probarlo también como anuncio" : "es la pieza para ofrecerle pauta"}.`);
    }
    if (cont?.mejorAngulo && cont.mejorAngulo.indice >= 1.2) {
      delContenido.push(`Su mejor ángulo: «${cont.mejorAngulo.nombre}» rinde ${x(cont.mejorAngulo.indice)} lo normal en ${cont.mejorAngulo.publicaciones} publicaciones: que no falte en el calendario.`);
    }
    if (cont?.oportunidad) {
      const o = cont.oportunidad;
      delContenido.push(`Probar «${o.nombre}»: en ${c.industry} rinde ${x(o.indiceEnNicho)} lo normal (${o.publicacionesNicho} publicaciones de ${o.cuentasNicho} cuentas) y lo usó ${o.usosPropios === 1 ? "una vez" : `${o.usosPropios} veces`}.`);
    }
    const compNicho = c.industry ? competencia?.nichos.find((n) => n.nicho.toLowerCase() === c.industry!.toLowerCase()) : undefined;
    const compAngulo = compNicho?.angulos.find((f) => f.indice >= 1.2);
    if (compAngulo) {
      delContenido.push(`A la competencia del rubro le funciona «${compAngulo.nombre}»: ${x(compAngulo.indice)} lo normal en ${compAngulo.publicaciones} publicaciones de ${compAngulo.cuentas} cuentas${compAngulo.mejor.permalink ? ` (ejemplo: ${compAngulo.mejor.permalink})` : ""}. Tomar el ángulo, no el texto.`);
    }
    if (!cont && semaforo !== "sin-datos") delContenido.push("Todavía no se puede medir qué le funciona en redes: hay menos de 8 publicaciones leídas o la interacción normal es casi nula (menos de 5 por publicación). Revisar que su Instagram o Facebook esté conectado.");
    if (!conCompetidoresIg.has(c.id)) {
      delContenido.push("Cargar el Instagram de 3 competidores (ficha → Competencia): sin eso no hay con qué compararlo.");
    }
    // Sin pauta, el contenido manda: va primero.
    if (pautaCorre) acciones.push(...delContenido);
    else acciones.unshift(...delContenido);

    const etapa = pautaCorre && cont
      ? `Pauta corriendo y orgánico medido (${cont.publicaciones} publicaciones)`
      : pautaCorre
        ? "Pauta corriendo; sus redes no tienen publicaciones suficientes leídas"
        : cont
          ? `Sin pauta en el período; orgánico medido (${cont.publicaciones} publicaciones)`
          : null;

    if (acciones.length === 0 && semaforo !== "sin-datos") acciones.push(cont ? "En orden con lo medido." : "Para proponer contenido con datos falta leer sus redes: conectar su Instagram o Facebook.");
    if (semaforo === "sin-datos") {
      problemas.push("No hay nada medido: ni pauta corriendo, ni cuenta de redes leída, ni calendario con fechas.");
      acciones.unshift("Conectar lo que falte para poder medir (pauta, página/Instagram, calendario Redes con fechas).");
    }

    out.push({
      clientId: c.id, name: c.name, slug: c.slug, industry: c.industry,
      semaforo, salud, scorePauta: score, cumplimientoPct: cumpl,
      // Tres avisos con el mismo cuerpo daban la misma acción tres veces.
      problemas: [...new Set(problemas)], acciones: [...new Set(acciones)], etapa, reporteAgente: null,
    });
  }
  // Peores primero dentro de cada grupo (por salud, luego cumplimiento).
  out.sort((a, b) => (a.salud ?? 100) - (b.salud ?? 100) || (a.cumplimientoPct ?? 999) - (b.cumplimientoPct ?? 999));
  return out;
}
