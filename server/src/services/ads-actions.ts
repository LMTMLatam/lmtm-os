// LMTM-OS: write actions against the ad platforms (the "agents act, not just
// propose" loop). Las palancas soportadas son las que BAJAN o REDIRIGEN gasto,
// nunca las que lo suben:
//   - PAUSE de campaña o conjunto (Meta y Google)
//   - palabras clave negativas a nivel campaña (Google)
//   - pausar keywords que gastan sin convertir (Google)
//
// Guards enforced in code (a prompt can't bypass them):
//  - the entity must belong to the given client (looked up in our synced
//    ads_campaigns / ads_adsets), so an agent can never touch another client's
//    account or a made-up id;
//  - nunca reanudar, crear, subir presupuesto ni borrar por este camino;
//  - the caller must pass approved=true (human sign-off), same pattern as the
//    CRM proxy;
//  - no se puede negativizar la propia marca del cliente. Sin este guard la
//    auditoría del 3/9/26 iba a apagar "distrillantas pilar/beiro/merlo/
//    liniers/avellaneda" — calidad 10/10, el mejor tráfico de la cuenta. Ver
//    `esTerminoDeMarca` en ads-keywords.ts.
// Every action is recorded as a proposal→outcome row so we can later measure
// whether the pause actually improved the client's numbers.

import type { Db } from "@paperclipai/db";
import { adsCampaigns, adsAdsets, adsConnections, agentActions, clients } from "@paperclipai/db";
import { and, eq } from "drizzle-orm";
import { withFreshAccessToken } from "./ads/token-refresh.js";
import { mutate, searchStream } from "./ads/providers/google.js";
import { esTerminoDeMarca } from "./ads-keywords.js";

const GRAPH = "https://graph.facebook.com/v21.0";

/** Tope por llamada. Un lote más grande que esto no es una optimización, es un
 *  cambio de estrategia, y eso lo mira una persona antes. */
export const MAX_POR_LLAMADA = 50;

export interface AdActionResult {
  ok: boolean;
  approvalRequired?: boolean;
  error?: string;
  entity?: { type: string; id: string; name: string | null; clientId: string };
}

export async function pauseAdEntity(
  db: Db,
  input: { clientId: string; entityType: "campaign" | "adset"; entityId: string; agentId?: string | null; approved?: boolean },
): Promise<AdActionResult> {
  const { clientId, entityType, entityId } = input;

  // 1) Ownership: the entity must be one we've synced for THIS client.
  const table = entityType === "campaign" ? adsCampaigns : adsAdsets;
  const [row] = await db.select({ id: table.id, name: table.name, connectionId: table.connectionId, clientId: table.clientId })
    .from(table).where(and(eq(table.id, entityId), eq(table.clientId, clientId))).limit(1);
  if (!row) return { ok: false, error: `No encontré ${entityType} ${entityId} para este cliente (o no está sincronizado). No se puede actuar sobre entidades ajenas o inexistentes.` };

  // 2) Human sign-off (same gate as CRM writes and every spend-affecting action).
  if (!input.approved) {
    return {
      ok: false, approvalRequired: true,
      entity: { type: entityType, id: entityId, name: row.name, clientId },
      error: `Pausar ${entityType} "${row.name}" MUEVE plata real. Proponé la pausa en el issue con la justificación (gasto sin conversiones, etc.) y esperá OK humano; recién ahí ejecutá con approved=true.`,
    };
  }

  // 3) Resolve the connection token and write status=PAUSED.
  if (!row.connectionId) return { ok: false, error: "La entidad no tiene conexión asociada (conexión borrada/reemplazada)." };
  const [conn] = await db.select().from(adsConnections).where(eq(adsConnections.id, row.connectionId)).limit(1);
  if (!conn?.accessToken) return { ok: false, error: "No hay token de la conexión." };

  if (conn.platform === "google") {
    // En Google el conjunto es el grupo de anuncios, que se sincroniza aparte;
    // por este camino solo pausamos campañas para no adivinar a qué recurso
    // apunta un id de conjunto.
    if (entityType !== "campaign") {
      return { ok: false, error: "En Google solo se puede pausar la campaña por esta vía (el conjunto es el grupo de anuncios y se maneja distinto)." };
    }
    const cuenta = await cuentaDeCampana(db, entityId, clientId);
    if (!cuenta) return { ok: false, error: "No pude resolver la cuenta de Google de esa campaña." };
    try {
      const fresca = await withFreshAccessToken(db, conn);
      await mutate(fresca, cuenta, "campaigns", [{
        update: { resourceName: `customers/${cuenta}/campaigns/${entityId}`, status: "PAUSED" },
        updateMask: "status",
      }]);
      await db.insert(agentActions).values({
        clientId, agentId: input.agentId ?? null, kind: "pause_ad_entity",
        entityType, entityId, detail: { name: row.name, plataforma: "google", cuenta },
      }).catch(() => {});
      return { ok: true, entity: { type: entityType, id: entityId, name: row.name, clientId } };
    } catch (e) {
      return { ok: false, error: `Google rechazó la pausa: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  if (conn.platform !== "meta") return { ok: false, error: `Plataforma no soportada para escritura: ${conn.platform}.` };

  try {
    const r = await fetch(`${GRAPH}/${entityId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "PAUSED", access_token: conn.accessToken }),
    });
    const text = await r.text();
    if (!r.ok) return { ok: false, error: `Meta rechazó la pausa (${r.status}): ${text.slice(0, 250)}` };

    // Record the action (proposal→outcome ledger).
    await db.insert(agentActions).values({
      clientId, agentId: input.agentId ?? null, kind: "pause_ad_entity",
      entityType, entityId, detail: { name: row.name },
    }).catch(() => {});

    return { ok: true, entity: { type: entityType, id: entityId, name: row.name, clientId } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Customer id de Google de una campaña, verificando que sea de ESTE cliente.
 *  Devolver null es la respuesta segura: sin cuenta confirmada no se escribe. */
async function cuentaDeCampana(db: Db, campaignId: string, clientId: string): Promise<string | null> {
  const [c] = await db
    .select({ adAccountId: adsCampaigns.adAccountId, platform: adsCampaigns.platform })
    .from(adsCampaigns)
    .where(and(eq(adsCampaigns.id, campaignId), eq(adsCampaigns.clientId, clientId)))
    .limit(1);
  if (!c || c.platform !== "google") return null;
  const cid = c.adAccountId.replace(/^act_/i, "").replace(/-/g, "").trim();
  return cid || null;
}

export interface ResultadoNegativas {
  ok: boolean;
  approvalRequired?: boolean;
  error?: string;
  /** Términos que SÍ se mandaron (o se mandarían, en ensayo). */
  aplicados?: string[];
  /** Términos rechazados por ser de la marca, con el motivo a la vista. */
  rechazadosPorMarca?: string[];
  ensayo?: boolean;
}

/**
 * Agrega palabras clave negativas a nivel campaña en Google Ads.
 *
 * Es la palanca más segura que existe: solo puede REDUCIR gasto, y se revierte
 * borrando el criterio. Aun así pasa por la misma firma humana que la pausa,
 * porque cambia a quién se le muestra el anuncio.
 *
 * `ensayo: true` manda la operación con validateOnly — Google la valida entera
 * y no guarda nada. Sirve para que el agente confirme que el lote es válido
 * antes de pedir la aprobación.
 */
export async function agregarNegativas(
  db: Db,
  input: {
    clientId: string;
    campaignId: string;
    terminos: string[];
    agentId?: string | null;
    approved?: boolean;
    ensayo?: boolean;
  },
): Promise<ResultadoNegativas> {
  const { clientId, campaignId } = input;
  const pedidos = [...new Set(input.terminos.map((t) => t.trim()).filter(Boolean))];
  if (pedidos.length === 0) return { ok: false, error: "No mandaste ningún término." };
  if (pedidos.length > MAX_POR_LLAMADA) {
    return { ok: false, error: `Son ${pedidos.length} términos y el tope por llamada es ${MAX_POR_LLAMADA}. Partilo en tandas o revisá si no te estás pasando de una optimización a un cambio de estrategia.` };
  }

  // 1) Dueño: la campaña tiene que ser de este cliente y estar sincronizada.
  const [camp] = await db
    .select({ name: adsCampaigns.name, connectionId: adsCampaigns.connectionId })
    .from(adsCampaigns)
    .where(and(eq(adsCampaigns.id, campaignId), eq(adsCampaigns.clientId, clientId)))
    .limit(1);
  if (!camp) return { ok: false, error: `No encontré la campaña ${campaignId} para este cliente (o no está sincronizada).` };

  // 2) Guard de marca: no se negativiza el nombre del propio cliente.
  const [cli] = await db.select({ name: clients.name }).from(clients).where(eq(clients.id, clientId)).limit(1);
  const rechazadosPorMarca = cli ? pedidos.filter((t) => esTerminoDeMarca(cli.name, t)) : [];
  const aplicables = pedidos.filter((t) => !rechazadosPorMarca.includes(t));
  if (aplicables.length === 0) {
    return {
      ok: false, rechazadosPorMarca,
      error: `Todos los términos nombran a la propia marca (${rechazadosPorMarca.join(", ")}). Esa gente ya te está buscando por nombre: si no figura conversión es casi siempre porque convierte por teléfono, WhatsApp o en el local y el píxel no lo ve. Negativizarlas apaga el mejor tráfico de la cuenta — el problema a resolver es la medición.`,
    };
  }

  // 3) Firma humana.
  if (!input.approved && !input.ensayo) {
    return {
      ok: false, approvalRequired: true, rechazadosPorMarca, aplicados: aplicables,
      error: `Agregar ${aplicables.length} negativa(s) a "${camp.name}" cambia a quién se le muestra el anuncio. Proponelo en el issue con el gasto que libera y esperá OK humano; recién ahí ejecutá con approved=true.`,
    };
  }

  if (!camp.connectionId) return { ok: false, error: "La campaña no tiene conexión asociada." };
  const [conn] = await db.select().from(adsConnections).where(eq(adsConnections.id, camp.connectionId)).limit(1);
  if (!conn?.accessToken) return { ok: false, error: "No hay token de la conexión." };
  if (conn.platform !== "google") return { ok: false, error: `Las negativas por campaña son de Google (esta conexión es ${conn.platform}).` };

  const cuenta = await cuentaDeCampana(db, campaignId, clientId);
  if (!cuenta) return { ok: false, error: "No pude resolver la cuenta de Google de esa campaña." };

  try {
    const fresca = await withFreshAccessToken(db, conn);
    await mutate(fresca, cuenta, "campaignCriteria", aplicables.map((t) => ({
      create: {
        campaign: `customers/${cuenta}/campaigns/${campaignId}`,
        negative: true,
        keyword: { text: t, matchType: "PHRASE" },
      },
    })), { validateOnly: input.ensayo === true });

    if (!input.ensayo) {
      await db.insert(agentActions).values({
        clientId, agentId: input.agentId ?? null, kind: "add_negative_keywords",
        entityType: "campaign", entityId: campaignId,
        detail: { name: camp.name, cuenta, terminos: aplicables, rechazadosPorMarca },
      }).catch(() => {});
    }
    return { ok: true, aplicados: aplicables, rechazadosPorMarca, ensayo: input.ensayo === true };
  } catch (e) {
    return { ok: false, error: `Google rechazó las negativas: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export interface ResultadoPausaKeywords {
  ok: boolean;
  approvalRequired?: boolean;
  error?: string;
  pausadas?: string[];
  noEncontradas?: string[];
  protegidasPorMarca?: string[];
  ensayo?: boolean;
}

/**
 * Pausa keywords que gastan sin convertir, por TEXTO.
 *
 * Se recibe el texto y no un id a propósito: es lo que produce la auditoría, y
 * obliga a resolver el criterio contra la cuenta del cliente antes de escribir
 * — o sea que un texto inventado no encuentra nada y no pasa nada, en vez de
 * pausar un recurso ajeno por un id mal copiado.
 */
export async function pausarKeywords(
  db: Db,
  input: {
    clientId: string;
    textos: string[];
    agentId?: string | null;
    approved?: boolean;
    ensayo?: boolean;
  },
): Promise<ResultadoPausaKeywords> {
  const { clientId } = input;
  const pedidos = [...new Set(input.textos.map((t) => t.trim().toLowerCase()).filter(Boolean))];
  if (pedidos.length === 0) return { ok: false, error: "No mandaste ninguna keyword." };
  if (pedidos.length > MAX_POR_LLAMADA) {
    return { ok: false, error: `Son ${pedidos.length} keywords y el tope por llamada es ${MAX_POR_LLAMADA}.` };
  }

  // Marca protegida, igual que en las negativas y por el mismo motivo.
  const [cli] = await db.select({ name: clients.name }).from(clients).where(eq(clients.id, clientId)).limit(1);
  const protegidasPorMarca = cli ? pedidos.filter((t) => esTerminoDeMarca(cli.name, t)) : [];
  const candidatas = pedidos.filter((t) => !protegidasPorMarca.includes(t));
  if (candidatas.length === 0) {
    return {
      ok: false, protegidasPorMarca,
      error: "Todas las keywords pedidas son de la propia marca. Pausarlas apaga a la gente que te busca por nombre; si no registran conversión, revisá la medición antes.",
    };
  }

  if (!input.approved && !input.ensayo) {
    return {
      ok: false, approvalRequired: true, protegidasPorMarca,
      error: `Pausar ${candidatas.length} keyword(s) MUEVE plata real. Proponelo en el issue con el gasto sin conversiones de cada una y esperá OK humano; recién ahí ejecutá con approved=true.`,
    };
  }

  // Una campaña cualquiera del cliente alcanza para llegar a la cuenta y a la
  // conexión: las keywords viven en la misma cuenta de Google.
  const [camp] = await db
    .select({ connectionId: adsCampaigns.connectionId, adAccountId: adsCampaigns.adAccountId })
    .from(adsCampaigns)
    .where(and(eq(adsCampaigns.clientId, clientId), eq(adsCampaigns.platform, "google")))
    .limit(1);
  if (!camp?.connectionId) return { ok: false, error: "El cliente no tiene campañas de Google sincronizadas." };
  const cuenta = camp.adAccountId.replace(/^act_/i, "").replace(/-/g, "").trim();

  const [conn] = await db.select().from(adsConnections).where(eq(adsConnections.id, camp.connectionId)).limit(1);
  if (!conn?.accessToken) return { ok: false, error: "No hay token de la conexión." };

  try {
    const fresca = await withFreshAccessToken(db, conn);
    // Resolver texto -> resource name DENTRO de la cuenta del cliente.
    const filas = await searchStream(fresca, cuenta, `
      SELECT ad_group_criterion.resource_name, ad_group_criterion.keyword.text
      FROM keyword_view
      WHERE ad_group_criterion.status = 'ENABLED'`);
    const porTexto = new Map<string, string>();
    for (const f of filas) {
      const agc = (f as Record<string, Record<string, unknown>>).ad_group_criterion ?? {};
      const kw = (agc.keyword ?? {}) as Record<string, unknown>;
      const t = String(kw.text ?? "").trim().toLowerCase();
      const rn = String(agc.resource_name ?? "");
      if (t && rn && !porTexto.has(t)) porTexto.set(t, rn);
    }

    const encontradas = candidatas.filter((t) => porTexto.has(t));
    const noEncontradas = candidatas.filter((t) => !porTexto.has(t));
    if (encontradas.length === 0) {
      return { ok: false, noEncontradas, protegidasPorMarca, error: "Ninguna de esas keywords está activa en la cuenta del cliente. No se tocó nada." };
    }

    await mutate(fresca, cuenta, "adGroupCriteria", encontradas.map((t) => ({
      update: { resourceName: porTexto.get(t), status: "PAUSED" },
      updateMask: "status",
    })), { validateOnly: input.ensayo === true });

    if (!input.ensayo) {
      await db.insert(agentActions).values({
        clientId, agentId: input.agentId ?? null, kind: "pause_keywords",
        entityType: "keyword", entityId: cuenta,
        detail: { cuenta, pausadas: encontradas, noEncontradas, protegidasPorMarca },
      }).catch(() => {});
    }
    return { ok: true, pausadas: encontradas, noEncontradas, protegidasPorMarca, ensayo: input.ensayo === true };
  } catch (e) {
    return { ok: false, error: `Google rechazó la pausa de keywords: ${e instanceof Error ? e.message : String(e)}` };
  }
}
