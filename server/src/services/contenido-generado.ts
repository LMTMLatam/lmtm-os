// LMTM-OS: Contenido generado — todo lo que produjeron Higgsfield y Magnific,
// con su link de Drive y lo que gastó cada herramienta (pedido 11/10).
//
// Dos fuentes:
//  · agent_deliverables (kind video/placa/carrusel/imagen): la PIEZA entregada,
//    con su link de Drive y su tarea de ClickUp.
//  · contenido_gastos: cada generación PAGADA (un reel son 3 filas, un carrusel
//    una por placa). Se cruza por `pieza` (id de tarea o `libre:<uuid>`).
// Lo que se pagó y no terminó en una pieza entregada se cuenta aparte: es la
// parte del gasto que no se ve mirando solo el Drive.
//
// También vive acá la generación LIBRE (sin tarea de ClickUp): la que pide
// Claude por el conector o una persona desde el panel. Va por el mismo
// despachador (plan → API → Magnific), se guarda en el Drive de Super Redes del
// cliente como siempre y queda registrada igual que lo demás.

import { randomUUID } from "node:crypto";
import type { Db } from "@paperclipai/db";
import { agentDeliverables, clients, contenidoGastos } from "@paperclipai/db";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { conGasto, generarImagen, generarVideo, type ContextoGasto, type Generado } from "./higgsfield.js";

const COMPANY_ID = "00000000-0000-4000-8000-000000000001";
export const KINDS_GENERADOS = ["video", "placa", "carrusel", "imagen"];

export interface FilaGasto {
  clientId: string | null;
  pieza: string | null;
  herramienta: string;
  origen: string;
  creditos: number | null;
  usd: number | null;
}

export interface TotalHerramienta {
  herramienta: string;
  generaciones: number;
  /** Suma de lo informado. null si ninguna generación informó costo. */
  creditos: number | null;
  usd: number | null;
  /** Generaciones sin costo informado: la suma de arriba NO las incluye. */
  sinCosto: number;
  /** Pagadas que no terminaron en una pieza entregada. */
  noEntregadas: number;
}

const sumar = (a: number | null, b: number | null) => (b == null ? a : (a ?? 0) + b);

/** Agrupa las generaciones por herramienta, por pieza y por cliente. Puro. */
export function resumirGastos(filas: FilaGasto[], entregadas: Set<string>) {
  const porHerramienta = new Map<string, TotalHerramienta>();
  const porPieza = new Map<string, TotalHerramienta[]>();
  const porCliente = new Map<string, TotalHerramienta[]>();
  const sumarEn = (m: Map<string, TotalHerramienta>, f: FilaGasto, noEntregada: boolean) => {
    const t = m.get(f.herramienta) ?? { herramienta: f.herramienta, generaciones: 0, creditos: null, usd: null, sinCosto: 0, noEntregadas: 0 };
    t.generaciones += 1;
    t.creditos = sumar(t.creditos, f.creditos);
    t.usd = sumar(t.usd, f.usd);
    if (f.creditos == null && f.usd == null) t.sinCosto += 1;
    if (noEntregada) t.noEntregadas += 1;
    m.set(f.herramienta, t);
  };
  const sub = new Map<string, Map<string, TotalHerramienta>>();
  const enGrupo = (grupo: string, clave: string, f: FilaGasto, noEntregada: boolean) => {
    const k = `${grupo}\u0000${clave}`;
    const m = sub.get(k) ?? new Map<string, TotalHerramienta>();
    sumarEn(m, f, noEntregada);
    sub.set(k, m);
  };
  for (const f of filas) {
    const noEntregada = !f.pieza || !entregadas.has(f.pieza);
    sumarEn(porHerramienta, f, noEntregada);
    if (f.pieza) enGrupo("p", f.pieza, f, noEntregada);
    if (f.clientId) enGrupo("c", f.clientId, f, noEntregada);
  }
  for (const [k, m] of sub) {
    const [grupo, clave] = k.split("\u0000");
    (grupo === "p" ? porPieza : porCliente).set(clave, [...m.values()]);
  }
  return { porHerramienta: [...porHerramienta.values()], porPieza, porCliente };
}

/** La pieza de un entregable: la tarea de ClickUp o la clave de la generación libre. */
const piezaDe = (metadata: unknown): string | null => {
  const m = (metadata ?? {}) as { pieza?: unknown; taskId?: unknown };
  return typeof m.pieza === "string" ? m.pieza : typeof m.taskId === "string" ? m.taskId : null;
};

export async function contenidoGenerado(db: Db, opts: { dias: number; clientId?: string | null }) {
  const desde = new Date(Date.now() - opts.dias * 86_400_000);
  const filtroCliente = opts.clientId ? [eq(agentDeliverables.clientId, opts.clientId)] : [];
  const piezas = await db.select({
    id: agentDeliverables.id, title: agentDeliverables.title, url: agentDeliverables.url,
    kind: agentDeliverables.kind, clientId: agentDeliverables.clientId, cliente: clients.name,
    metadata: agentDeliverables.metadata, createdAt: agentDeliverables.createdAt,
  })
    .from(agentDeliverables)
    .leftJoin(clients, eq(clients.id, agentDeliverables.clientId))
    .where(and(inArray(agentDeliverables.kind, KINDS_GENERADOS), gte(agentDeliverables.createdAt, desde), ...filtroCliente))
    .orderBy(desc(agentDeliverables.createdAt))
    .limit(500);

  const gastos = await db.select({
    clientId: contenidoGastos.clientId, pieza: contenidoGastos.pieza, herramienta: contenidoGastos.herramienta,
    origen: contenidoGastos.origen, creditos: contenidoGastos.creditos, usd: contenidoGastos.usd,
  })
    .from(contenidoGastos)
    .where(and(gte(contenidoGastos.createdAt, desde), ...(opts.clientId ? [eq(contenidoGastos.clientId, opts.clientId)] : [])));

  const entregadas = new Set(piezas.map((p) => piezaDe(p.metadata)).filter((x): x is string => !!x));
  const r = resumirGastos(gastos, entregadas);
  const origenDe = new Map(gastos.filter((g) => g.pieza).map((g) => [g.pieza!, g.origen]));

  const nombres = new Map((await db.select({ id: clients.id, name: clients.name }).from(clients)).map((c) => [c.id, c.name]));
  return {
    dias: opts.dias,
    totales: r.porHerramienta,
    porCliente: [...r.porCliente.entries()]
      .map(([clientId, herramientas]) => ({ clientId, cliente: nombres.get(clientId) ?? clientId, herramientas }))
      .sort((a, b) => b.herramientas.reduce((s, h) => s + h.generaciones, 0) - a.herramientas.reduce((s, h) => s + h.generaciones, 0)),
    piezas: piezas.map((p) => {
      const m = (p.metadata ?? {}) as Record<string, unknown>;
      const pieza = piezaDe(m);
      return {
        id: p.id, titulo: p.title, kind: p.kind, clientId: p.clientId, cliente: p.cliente,
        createdAt: p.createdAt,
        driveLink: (m.driveLink as string | undefined) ?? (p.url?.includes("drive.google") ? p.url : null),
        links: Array.isArray(m.links) ? (m.links as string[]) : [],
        taskUrl: (m.taskUrl as string | undefined) ?? null,
        prompt: typeof m.prompt === "string" ? m.prompt : null,
        origen: (pieza && origenDe.get(pieza)) ?? (m.origen as string | undefined) ?? null,
        // null = generada antes de que se registrara el gasto (11/10).
        gasto: pieza ? r.porPieza.get(pieza) ?? null : null,
      };
    }),
  };
}

// ── generación libre ────────────────────────────────────────────────────────

export interface PedidoLibre {
  clientId: string;
  tipo: "video" | "imagen";
  /** En inglés: los modelos de video rinden mucho peor en castellano. */
  prompt: string;
  titulo?: string;
  /** Imagen de partida para el video (URL pública). */
  imagenUrl?: string | null;
  /** Solo imagen: "vertical" = 9:16 (historia/reel); si no, 3:4 (placa de feed). */
  formato?: "vertical" | "placa";
  /** Solo imagen: "magnific" fuerza Magnific; "auto" = plan → API → Magnific. */
  herramienta?: "auto" | "magnific";
  origen: ContextoGasto["origen"];
}

export interface ResultadoLibre {
  ok: boolean;
  driveLink?: string | null;
  url?: string;
  herramienta?: string;
  modelo?: string;
  creditos?: number | null;
  usd?: number | null;
  aviso?: string;
  error?: string;
}

export async function generarContenidoLibre(db: Db, p: PedidoLibre): Promise<ResultadoLibre> {
  const prompt = (p.prompt ?? "").trim();
  if (prompt.length < 10) return { ok: false, error: "El prompt es muy corto: describí la escena (sujeto, lugar, luz, cámara)." };
  if (prompt.length > 1500) return { ok: false, error: "El prompt pasa de 1500 caracteres." };
  if (p.tipo === "video" && p.herramienta === "magnific") return { ok: false, error: "Magnific genera imágenes, no video." };
  const [cliente] = await db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.id, p.clientId));
  if (!cliente) return { ok: false, error: "Cliente no encontrado." };

  const pieza = `libre:${randomUUID()}`;
  let g: Generado;
  try {
    g = await conGasto({ origen: p.origen, clientId: cliente.id, pieza }, () =>
      p.tipo === "video"
        ? generarVideo(db, prompt, { imagenUrl: p.imagenUrl ?? null })
        : generarImagen(db, prompt, { aspect: p.formato === "vertical" ? "9:16" : "3:4", soloMagnific: p.herramienta === "magnific" }));
  } catch (e) {
    return { ok: false, error: `No se pudo generar: ${(e instanceof Error ? e.message : String(e)).slice(0, 300)}` };
  }

  // Al Drive de Super Redes del cliente, como todo lo generado (VIDEOS / PLACAS).
  const titulo = (p.titulo?.trim() || prompt).replace(/[\\/:*?"<>|\n]/g, "-").slice(0, 70);
  const sello = new Date().toISOString().slice(0, 10);
  let driveLink: string | null = null;
  let aviso: string | undefined;
  try {
    const { subirDesdeUrl } = await import("./contenido-drive.js");
    const r = await subirDesdeUrl(db, {
      clientId: cliente.id, clienteNombre: cliente.name, url: g.url,
      nombreArchivo: `${titulo} — ${sello}.${p.tipo === "video" ? "mp4" : "png"}`,
      destino: p.tipo === "video" ? "videos" : "placas",
    });
    driveLink = r.link;
  } catch (e) {
    // El link del proveedor vence: se avisa para bajarlo a mano a tiempo.
    aviso = `No se pudo subir a Drive (${(e instanceof Error ? e.message : String(e)).slice(0, 150)}). El link directo vence: bajalo hoy.`;
  }

  await db.insert(agentDeliverables).values({
    companyId: COMPANY_ID,
    clientId: cliente.id,
    kind: p.tipo,
    title: `${p.tipo === "video" ? "Video" : "Imagen"}: ${titulo}`.slice(0, 200),
    content: prompt,
    url: driveLink ?? g.url,
    metadata: {
      pieza, origen: p.origen, prompt, herramienta: g.herramienta, modelo: g.modelo,
      creditos: g.creditos, usd: g.usd, driveLink, proveedorUrl: g.url, jobId: g.jobId ?? null,
    },
  });

  return { ok: true, driveLink, url: g.url, herramienta: g.herramienta, modelo: g.modelo, creditos: g.creditos, usd: g.usd, aviso };
}
