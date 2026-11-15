// LMTM-OS: el cerebro de la empresa (plan 15/11, fase 1).
//
// Pedido de Naza: «que para Claude y las IA el conector sea el cerebro: que pueda
// buscar todo, la info del cliente, la marca, el tono… y que se sepa todo lo que
// hace la empresa». Hasta acá un agente tenía que encadenar 6–10 herramientas
// para saber quién es un cliente, y no había forma de preguntar «qué se hizo».
//
// Tres capas, una llamada cada una. Las usan el conector, los agentes y el panel:
// lo que lee la IA es lo mismo que ve la persona.
//  - empresa():   cómo trabaja la agencia (fijo, cerebro-agencia.ts) + equipo, rutinas
//                 y lecciones vivas.
//  - actividad(): todo lo que se hizo en un período, de todas las fuentes, en una lista.
//  - cliente():   la ficha completa de un cliente, con su cobertura (qué falta).
//
// Solo lee. Los números de pauta salen de `metricasCliente` (con sus guardas).

import { sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { metricasCliente } from "../metricas/index.js";
import { AGENCIA } from "./cerebro-agencia.js";
import { esSupuesto } from "./customer-brain.js";

type Fila = Record<string, unknown>;
const filas = (r: unknown): Fila[] => (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Fila[];
const s = (v: unknown) => (v == null ? "" : String(v));
const dia = (v: unknown) => (v ? new Date(String(v)).toISOString().slice(0, 10) : null);
const corto = (t: unknown, n: number) => { const x = s(t).replace(/\s+/g, " ").trim(); return x.length > n ? `${x.slice(0, n - 1)}…` : x; };

// ── cliente: resolución ─────────────────────────────────────────────────────

/** Encuentra un cliente por id, slug o nombre (aunque sea parcial). */
export async function resolverCliente(db: Db, q: string): Promise<{ id: string; name: string } | { error: string; opciones?: string[] }> {
  const t = q.trim();
  if (!t) return { error: "Falta el cliente." };
  const r = filas(await db.execute(sql`
    select id, name, status from clients
    where id::text = ${t} or slug = ${t.toLowerCase()} or name ilike ${"%" + t.replace(/[%_]/g, "") + "%"}
    order by (status = 'active') desc, (lower(trim(name)) = lower(${t})) desc, length(name) limit 6`));
  if (!r.length) return { error: `No encuentro un cliente «${t}». Usá lmtmListClients.` };
  const exacto = r.find((x) => s(x.id) === t || s(x.name).trim().toLowerCase() === t.toLowerCase());
  if (exacto || r.length === 1) return { id: s((exacto ?? r[0])!.id), name: s((exacto ?? r[0])!.name).trim() };
  return { error: `«${t}» coincide con varios clientes: decí cuál.`, opciones: r.map((x) => s(x.name).trim()) };
}

// ── memoria curada ──────────────────────────────────────────────────────────

/** Días que vive una memoria por tipo, si no está fijada. null = no vence. */
export const VIDA_MEMORIA: Record<string, number | null> = { context: null, fact: null, preference: null, decision: 180, performance: 90, event: 45, risk: 45 };

/**
 * La memoria que sirve hoy: fijadas primero, sin vencidas (por tipo), sin
 * repetidas (mismo arranque de texto) y con tope por tipo. Pura.
 */
export function curarMemoria<T extends { kind: string; key: string; content: string; pinned: boolean; confidence: unknown; updatedAt: Date | string }>(
  rows: T[], ahora = new Date(), topePorTipo = 8,
): Array<T & { supuesto: boolean }> {
  const vistos = new Set<string>();
  const porTipo = new Map<string, number>();
  const orden = [...rows].sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const out: Array<T & { supuesto: boolean }> = [];
  for (const m of orden) {
    // `null` = no vence; un tipo desconocido vive 90 días (ojo: `?? 90` convertía el null en 90).
    const vida = m.kind in VIDA_MEMORIA ? VIDA_MEMORIA[m.kind] : 90;
    if (!m.pinned && vida != null && ahora.getTime() - new Date(m.updatedAt).getTime() > vida * 86_400_000) continue;
    const firma = m.content.toLowerCase().replace(/[^a-záéíóúñ0-9]+/g, " ").trim().slice(0, 80);
    if (vistos.has(firma)) continue;
    vistos.add(firma);
    const n = porTipo.get(m.kind) ?? 0;
    if (!m.pinned && n >= topePorTipo) continue;
    porTipo.set(m.kind, n + 1);
    out.push({ ...m, supuesto: esSupuesto(m.confidence) });
  }
  return out;
}

// ── cobertura ───────────────────────────────────────────────────────────────

export interface Cobertura { porcentaje: number; tiene: string[]; falta: string[] }

/** Qué tiene y qué le falta a la ficha de un cliente para trabajarlo bien. Pura. */
export function cobertura(f: {
  tono: boolean; logo: boolean; colores: boolean; publico: boolean; diferencial: boolean; web: boolean;
  productos: number; competidores: number; nas: boolean; pauta: boolean; memoria: number;
}): Cobertura {
  const checks: Array<[string, boolean]> = [
    ["tono de la marca", f.tono], ["logo", f.logo], ["colores", f.colores], ["público", f.publico],
    ["diferencial", f.diferencial], ["web", f.web], ["productos o servicios cargados", f.productos > 0],
    ["competidores", f.competidores > 0], ["carpeta en el NAS", f.nas], ["cuenta de anuncios conectada", f.pauta],
    ["memoria (5 notas o más)", f.memoria >= 5],
  ];
  const tiene = checks.filter(([, ok]) => ok).map(([n]) => n);
  const falta = checks.filter(([, ok]) => !ok).map(([n]) => n);
  return { porcentaje: Math.round((100 * tiene.length) / checks.length), tiene, falta };
}

// ── capa cliente ────────────────────────────────────────────────────────────

export async function cliente(db: Db, clientId: string, ahora = new Date()) {
  const hoy = ahora.toISOString().slice(0, 10);
  const hace30 = new Date(ahora.getTime() - 29 * 86_400_000).toISOString().slice(0, 10);
  const [cli] = filas(await db.execute(sql`
    select id, name, slug, status, industry, website_url, metadata, clickup_folder_id, onboarded_at from clients where id = ${clientId}`));
  if (!cli) return null;
  const meta = (cli.metadata ?? {}) as Record<string, unknown>;
  const [marcaR, productosR, competidoresR, memoriaR, mapeosR, decisionesR, informeR, linkR, m30] = await Promise.all([
    db.execute(sql`select logo_url, colores, tipografias, tono, palabras_si, palabras_no, mensaje, publico, diferencial, notas, updated_by from client_brand where client_id = ${clientId}`),
    db.execute(sql`select name, description, drive_file_id, metadata->>'carpeta' carpeta from client_products where client_id = ${clientId} and active order by position, name limit 40`),
    db.execute(sql`select name, ig_handle, website from competitors where client_id = ${clientId} order by name limit 15`),
    db.execute(sql`select kind, key, content, pinned, confidence, updated_at "updatedAt" from client_memory where client_id = ${clientId} order by pinned desc, updated_at desc limit 300`),
    db.execute(sql`select platform, label, ad_account_id, page_id from ads_account_mappings where client_id = ${clientId}`),
    db.execute(sql`select tipo, que, porque, ars_por_dia, responsable, estado, created_at from decisiones where client_id = ${clientId} and estado in ('abierta','ejecutada') order by coalesce(ars_por_dia, 0) desc, created_at desc limit 8`),
    db.execute(sql`select semana, estado, publicado_at from informes_semanales where client_id = ${clientId} order by semana desc limit 1`),
    db.execute(sql`select slug from public_dashboards where client_id = ${clientId} and enabled limit 1`),
    metricasCliente(db, clientId, { desde: hace30, hasta: hoy }).catch(() => null),
  ]);
  const [marca] = filas(marcaR);
  const productos = filas(productosR);
  const competidores = filas(competidoresR);
  const memoriaTodas = filas(memoriaR) as Array<{ kind: string; key: string; content: string; pinned: boolean; confidence: unknown; updatedAt: string }>;
  const veredictos = memoriaTodas.filter((m) => m.key.startsWith("pieza-veredicto:"));
  const obligatorias = memoriaTodas.filter((m) => m.key.startsWith("obligatorio-"));
  // Tope 5 por tipo y 400 caracteres por nota: la ficha tiene que entrar entera en el contexto de un agente.
  const memoria = curarMemoria(memoriaTodas.filter((m) => !m.key.startsWith("pieza-veredicto:") && !m.key.startsWith("obligatorio-")), ahora, 5);
  const mapeos = filas(mapeosR);
  const nas = Array.isArray(meta.nas) ? (meta.nas as string[]) : [];
  const webs = [s(cli.website_url), ...(Array.isArray(meta.webs) ? (meta.webs as unknown[]).map((w) => s((w as { url?: unknown })?.url ?? w)) : [])].filter(Boolean);
  const cob = cobertura({
    tono: !!s(marca?.tono), logo: !!s(marca?.logo_url), colores: Array.isArray(marca?.colores) && (marca!.colores as unknown[]).length > 0,
    publico: !!s(marca?.publico), diferencial: !!s(marca?.diferencial), web: webs.length > 0,
    productos: productos.length, competidores: competidores.length, nas: nas.length > 0,
    pauta: mapeos.length > 0, memoria: memoriaTodas.length,
  });
  const [informe] = filas(informeR);
  const [link] = filas(linkR);
  return {
    id: s(cli.id), nombre: s(cli.name).trim(), slug: s(cli.slug), estado: s(cli.status), rubro: s(cli.industry) || null,
    grupo: s(meta.grupo) || null, alta: dia(cli.onboarded_at), ubicacion: meta.location ?? null,
    cobertura: cob,
    marca: marca ? {
      tono: s(marca.tono) || null, publico: s(marca.publico) || null, diferencial: s(marca.diferencial) || null,
      mensaje: s(marca.mensaje) || null, colores: marca.colores ?? [], tipografias: marca.tipografias ?? [],
      palabrasSi: marca.palabras_si ?? [], palabrasNo: marca.palabras_no ?? [], logo: s(marca.logo_url) || null,
      notas: s(marca.notas) || null, cargadaPor: s(marca.updated_by) || null,
    } : null,
    obligatorio: obligatorias.map((m) => m.content),
    loQueDijoElEquipoDePiezas: veredictos.map((m) => m.content).slice(0, 8),
    productos: { total: productos.length, lista: productos.slice(0, 25).map((p) => ({ nombre: s(p.name), descripcion: corto(p.description, 160) || null, carpetaDrive: s(p.carpeta) || null })) },
    material: {
      nas, drive: meta.superRedes ?? null,
      indiceNas: await (async () => {
        const [x] = filas(await db.execute(sql`select payload->>'actualizado' al,
            jsonb_array_length(coalesce(payload->'archivos', '[]'::jsonb)) archivos,
            (select count(*) from jsonb_array_elements(coalesce(payload->'archivos', '[]'::jsonb)) a where a->>'tipo' = 'video') videos,
            (select count(*) from jsonb_array_elements(coalesce(payload->'archivos', '[]'::jsonb)) a where a->>'tipo' = 'foto') fotos
          from client_context_cache where client_id = ${clientId} and source = 'nas-indice'`));
        return x ? { archivos: Number(x.archivos), videos: Number(x.videos), fotos: Number(x.fotos), actualizado: s(x.al).slice(0, 10) || null } : null;
      })(),
      comoBuscar: "Drive: lmtmBuscarMaterial (por lo que se ve) o lmtmGuiaContenido. NAS: lmtmNasBuscar con palabras (índice nocturno), lmtmNasListar para recorrer y lmtmNasLink para bajar.",
    },
    web: webs,
    redesYPauta: {
      cuentas: mapeos.map((m) => ({ plataforma: s(m.platform), cuenta: s(m.label) || s(m.ad_account_id), pagina: s(m.page_id) || null })),
      ultimos30Dias: m30 ? { inversion: m30.inversion, leads: m30.leads, cpl: m30.cpl, ventas: m30.ventas, clics: m30.clics, impresiones: m30.impresiones } : null,
      nota: "inversion null = sin pauta conectada; 0 = conectada y sin gasto. Para campaña por campaña: lmtmGetClientCampaigns.",
    },
    competidores: competidores.map((c) => ({ nombre: s(c.name), instagram: s(c.ig_handle) || null, web: s(c.website) || null })),
    decisiones: filas(decisionesR).map((d) => ({ tipo: s(d.tipo), que: corto(d.que, 200), porque: corto(d.porque, 200), arsPorDia: d.ars_por_dia ?? null, responsable: s(d.responsable) || null, estado: s(d.estado), desde: dia(d.created_at) })),
    memoria: memoria.map((m) => ({ tipo: m.kind, clave: m.key, texto: corto(m.content, 400), fijada: m.pinned, ...(m.supuesto ? { supuesto: true } : {}), al: dia(m.updatedAt) })),
    memoriaOmitida: memoriaTodas.length - memoria.length - veredictos.length - obligatorias.length,
    informeSemanal: informe ? { semana: s(informe.semana), estado: s(informe.estado), publicado: dia(informe.publicado_at) } : null,
    linkDelCliente: link ? `/public/dashboards/${s(link.slug)}/informe` : null,
    clickup: s(cli.clickup_folder_id) ? `https://app.clickup.com/9013352440/v/f/${s(cli.clickup_folder_id)}` : null,
    actividadReciente: await actividad(db, { clientId, dias: 14, limite: 12, ahora }),
  };
}

// ── capa actividad ──────────────────────────────────────────────────────────

export interface Hecho { fecha: string; tipo: string; cliente: string | null; quien: string | null; que: string; resultado: string | null; link: string | null }

/**
 * Todo lo que se hizo en un período, de todas las fuentes, en una lista. Los
 * «planes» de los agentes no entran salvo que se pidan: no son trabajo entregado.
 */
export async function actividad(db: Db, o: { dias?: number; desde?: string; clientId?: string | null; tipo?: string | null; limite?: number; conPlanes?: boolean; ahora?: Date } = {}) {
  const ahora = o.ahora ?? new Date();
  const desde = o.desde ? new Date(`${o.desde}T00:00:00-03:00`) : new Date(ahora.getTime() - (o.dias ?? 7) * 86_400_000);
  // Texto con cast: postgres-js no acepta un Date como parámetro de sql crudo.
  const desdeIso = desde.toISOString();
  const c = o.clientId ?? null;
  const limite = Math.min(300, Math.max(1, o.limite ?? 60));
  const porCliente = (col: string) => (c ? sql`and ${sql.raw(col)} = ${c}` : sql``);
  const [cnt, ent, dec, acc, tar, inf, pub, gas, cor] = await Promise.all([
    // Conteos reales del período (la lista de abajo tiene tope por fuente).
    db.execute(sql`select
      (select count(*) from agent_deliverables d where d.created_at >= ${desdeIso}::timestamptz ${porCliente("d.client_id")} ${o.conPlanes ? sql`` : sql`and d.kind not in ('plan','descartado')`}) pieza,
      (select count(*) from decisiones d where coalesce(d.verificada_at, d.ejecutada_at) >= ${desdeIso}::timestamptz ${porCliente("d.client_id")}) decision,
      (select count(*) from agent_actions x where x.created_at >= ${desdeIso}::timestamptz ${porCliente("x.client_id")}) accion,
      (select count(*) from issues i where i.status = 'done' and i.completed_at >= ${desdeIso}::timestamptz ${porCliente("i.client_id")}) tarea,
      (select count(*) from informes_semanales s where s.publicado_at >= ${desdeIso}::timestamptz ${porCliente("s.client_id")}) informe,
      (select count(*) from organic_posts p where p.created_time >= ${desdeIso}::timestamptz ${porCliente("p.client_id")}) publicacion,
      (select coalesce(jsonb_object_agg(persona, n), '{}'::jsonb) from (select details->>'persona' persona, count(*) n from activity_log
        where action = 'conector.herramienta' and created_at >= ${desdeIso}::timestamptz group by 1) u) conector`),
    db.execute(sql`select d.created_at f, d.kind, d.title, d.url, d.metadata->'revision'->>'apto' apto, d.metadata->'veredicto'->>'sirve' sirve, cl.name cli, a.name quien
      from agent_deliverables d left join clients cl on cl.id = d.client_id left join agents a on a.id = d.agent_id
      where d.created_at >= ${desdeIso}::timestamptz ${porCliente("d.client_id")} ${o.conPlanes ? sql`` : sql`and d.kind not in ('plan','descartado')`}
      order by d.created_at desc limit ${limite}`),
    db.execute(sql`select coalesce(d.verificada_at, d.ejecutada_at) f, d.estado, d.tipo, d.que, d.responsable, cl.name cli
      from decisiones d left join clients cl on cl.id = d.client_id
      where coalesce(d.verificada_at, d.ejecutada_at) >= ${desdeIso}::timestamptz ${porCliente("d.client_id")} order by 1 desc limit ${limite}`),
    db.execute(sql`select x.created_at f, x.kind, x.entity_type, x.detail, x.outcome, cl.name cli, a.name quien
      from agent_actions x left join clients cl on cl.id = x.client_id left join agents a on a.id = x.agent_id
      where x.created_at >= ${desdeIso}::timestamptz ${porCliente("x.client_id")} order by 1 desc limit ${limite}`),
    db.execute(sql`select i.completed_at f, i.identifier, i.title, cl.name cli, a.name quien
      from issues i left join clients cl on cl.id = i.client_id left join agents a on a.id = i.assignee_agent_id
      where i.status = 'done' and i.completed_at >= ${desdeIso}::timestamptz ${porCliente("i.client_id")} order by 1 desc limit ${limite}`),
    db.execute(sql`select s.publicado_at f, s.semana, cl.name cli, s.publicado_por quien
      from informes_semanales s left join clients cl on cl.id = s.client_id
      where s.publicado_at >= ${desdeIso}::timestamptz ${porCliente("s.client_id")} order by 1 desc limit ${limite}`),
    db.execute(sql`select p.created_time f, p.platform, p.post_type, p.message, p.permalink_url, cl.name cli
      from organic_posts p left join clients cl on cl.id = p.client_id
      where p.created_time >= ${desdeIso}::timestamptz ${porCliente("p.client_id")} order by 1 desc limit ${limite}`),
    db.execute(sql`select coalesce(sum(usd), 0) usd, coalesce(sum(creditos), 0) creditos, count(*) n from contenido_gastos g where g.created_at >= ${desdeIso}::timestamptz ${porCliente("g.client_id")}`),
    db.execute(sql`select count(*) total, count(*) filter (where r.status = 'succeeded') bien from heartbeat_runs r
      ${c ? sql`join issues i on i.id::text = r.context_snapshot->>'issueId' and i.client_id = ${c}` : sql``}
      where r.created_at >= ${desdeIso}::timestamptz`),
  ]);
  const hechos: Hecho[] = [
    ...filas(ent).map((r) => ({
      fecha: s(r.f), tipo: `pieza:${s(r.kind)}`, cliente: s(r.cli).trim() || null, quien: s(r.quien) || null, que: corto(r.title, 160),
      resultado: r.sirve != null ? (r.sirve === "true" ? "sirvió" : "no sirvió") : r.apto != null ? (r.apto === "true" ? "pasó el control" : "no pasó el control") : null,
      link: s(r.url) || null,
    })),
    ...filas(dec).map((r) => ({ fecha: s(r.f), tipo: `decision:${s(r.estado)}`, cliente: s(r.cli).trim() || null, quien: s(r.responsable) || null, que: corto(r.que, 200), resultado: s(r.estado), link: null })),
    ...filas(acc).map((r) => ({ fecha: s(r.f), tipo: `accion:${s(r.kind)}`, cliente: s(r.cli).trim() || null, quien: s(r.quien) || null, que: corto(typeof r.detail === "string" ? r.detail : JSON.stringify(r.detail ?? {}), 200), resultado: r.outcome == null ? null : corto(typeof r.outcome === "string" ? r.outcome : JSON.stringify(r.outcome), 120), link: null })),
    ...filas(tar).map((r) => ({ fecha: s(r.f), tipo: "tarea:hecha", cliente: s(r.cli).trim() || null, quien: s(r.quien) || null, que: `${s(r.identifier)} ${corto(r.title, 160)}`, resultado: "hecha", link: null })),
    ...filas(inf).map((r) => ({ fecha: s(r.f), tipo: "informe:publicado", cliente: s(r.cli).trim() || null, quien: s(r.quien) || null, que: `Informe semanal ${s(r.semana)}`, resultado: "publicado", link: null })),
    ...filas(pub).map((r) => ({ fecha: s(r.f), tipo: `publicacion:${s(r.platform) || "red"}`, cliente: s(r.cli).trim() || null, quien: null, que: corto(r.message, 140) || s(r.post_type), resultado: "publicado", link: s(r.permalink_url) || null })),
  ]
    .filter((h) => h.fecha && (!o.tipo || h.tipo.startsWith(o.tipo)))
    .sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha));
  const [n] = filas(cnt);
  const conteo: Record<string, number> = {};
  for (const k of ["pieza", "decision", "accion", "tarea", "informe", "publicacion"]) conteo[k] = Number(n?.[k] ?? 0);
  const [g] = filas(gas);
  const [cr] = filas(cor);
  return {
    desde: desde.toISOString(),
    resumen: {
      ...conteo,
      gastoContenidoUsd: Number(g?.usd ?? 0) || null,
      creditosContenido: Number(g?.creditos ?? 0),
      corridasDeAgentes: Number(cr?.total ?? 0),
      corridasBien: Number(cr?.bien ?? 0),
      // Llamadas al conector de Claude por persona (desde los links por persona, 15/11).
      usoDelConector: c ? undefined : (n?.conector ?? {}),
    },
    nota: "El resumen cuenta todo el período; la lista trae lo más reciente (tope por fuente). Publicaciones = posts reales de Instagram y Facebook sincronizados; pueden llegar con horas de atraso.",
    hechos: hechos.slice(0, limite).map((h) => ({ ...h, fecha: h.fecha.slice(0, 16).replace("T", " ") })),
  };
}

// ── capa agencia ────────────────────────────────────────────────────────────

export async function empresa(db: Db) {
  const [ag, ru, le, cl, us] = await Promise.all([
    db.execute(sql`select a.name, a.title, a.role, a.status,
        (select count(*) from heartbeat_runs r where r.agent_id = a.id and r.created_at > now() - interval '7 days') corridas7,
        (select count(*) from heartbeat_runs r where r.agent_id = a.id and r.created_at > now() - interval '7 days' and r.status = 'succeeded') bien7
      from agents a where a.status <> 'terminated' order by a.name`),
    db.execute(sql`select r.title, r.status, a.name agente, r.last_triggered_at from routines r left join agents a on a.id = r.assignee_agent_id order by r.status, r.title`),
    db.execute(sql`select pattern, occurrences, last_seen_at from learnings where scope = 'team' and coalesce(confidence, 0.7) >= 0.6
      order by occurrences desc nulls last, last_seen_at desc nulls last limit 15`),
    db.execute(sql`select count(*) filter (where status = 'active') activos, count(*) filter (where status <> 'active') otros from clients`),
    db.execute(sql`select count(*) from company_memberships where status = 'active'`),
  ]);
  const [c] = filas(cl);
  const [u] = filas(us);
  return {
    comoTrabajamos: AGENCIA,
    clientes: { activos: Number(c?.activos ?? 0), otros: Number(c?.otros ?? 0), comoVerUno: "lmtmCliente con el nombre del cliente." },
    personasConAcceso: Number(u?.count ?? 0),
    agentes: filas(ag).filter((a) => !/^Claude \(/.test(s(a.name))).map((a) => ({
      nombre: s(a.name), puesto: s(a.title) || s(a.role), estado: s(a.status),
      corridas7Dias: Number(a.corridas7), bien7Dias: Number(a.bien7),
    })),
    rutinas: filas(ru).map((r) => ({ nombre: s(r.title), estado: s(r.status), agente: s(r.agente) || null, ultima: dia(r.last_triggered_at) })),
    leccionesDelEquipo: filas(le).map((l) => corto(l.pattern, 300)),
    paraSaberMas: {
      actividad: "lmtmActividad: qué se hizo (filtrable por cliente, tipo y días).",
      cliente: "lmtmCliente: la ficha completa de un cliente.",
      publicacion: "lmtmGetCadenaPublicacion: si cada cliente está publicando, medido por efecto.",
      material: "lmtmBuscarMaterial (Drive) y lmtmNasListar (NAS).",
    },
  };
}
