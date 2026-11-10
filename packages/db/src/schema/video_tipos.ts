import { pgTable, uuid, text, jsonb, timestamp, index, uniqueIndex, integer, boolean } from "drizzle-orm/pg-core";

// LMTM-OS: «Tipos de video» (pedido 09/11). Cómo se edita cada tipo de video en
// cada nicho, a partir de los virales medidos de la competencia. Migración 0161.

/** Catálogo editable de tipos de video (recorrido, producto, testimonio...). */
export const videoTipos = pgTable("video_tipos", {
  slug: text("slug").primaryKey(),
  nombre: text("nombre").notNull(),
  descripcion: text("descripcion").notNull().default(""),
  orden: integer("orden").notNull().default(100),
  activo: boolean("activo").notNull().default(true),
});

/** Lo que mide `vtool referencia` de un video; null = no se pudo medir. */
export type FormaDeVideo = {
  duracion?: number | null; cortes?: number | null; planoMedio?: number | null; primerCorte?: number | null;
  palabrasPorSegundo?: number | null; lufs?: number | null; brillo?: number | null; saturacion?: number | null;
};

/**
 * Virales cargados a mano por el equipo o por un agente. Los automáticos NO
 * están acá: salen de competencia_posts (video-tipos.ts). post_id enlaza con
 * la publicación medida cuando la cuenta se pudo leer; sin eso es "sin medir".
 */
export const videoVirales = pgTable("video_virales", {
  id: uuid("id").primaryKey().defaultRandom(),
  url: text("url").notNull(),
  cuenta: text("cuenta").notNull(),
  nicho: text("nicho").notNull(),
  tipo: text("tipo").notNull(),
  fuente: text("fuente").notNull().default("equipo"), // equipo | agente
  autor: text("autor"),
  postId: text("post_id"),
  gancho: text("gancho"),
  notas: text("notas"),
  forma: jsonb("forma").$type<FormaDeVideo>(),
  respuestas: jsonb("respuestas").$type<Record<string, boolean>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  urlIdx: uniqueIndex("video_virales_url_idx").on(t.url),
  nichoTipoIdx: index("video_virales_nicho_tipo_idx").on(t.nicho, t.tipo),
}));

export type ReglaDeVideo = { id: string; texto: string; origen: "persona" | "agente"; autor?: string; viral?: string };

export type PerfilVtool = {
  nombre: string; descripcion: string;
  reel: { pausa?: number; estilo?: string; zoom?: number; sfx?: boolean; vol_musica?: number; vol_sfx?: number };
  duracion?: [number, number];
};

export type ContenidoPlantilla = {
  objetivo?: string;
  duracion?: [number, number];
  estructura?: Array<{ tramo: string; desde: number; hasta: number; que: string }>;
  ganchos?: Array<{ formula: string; viral?: string }>;
  edicion?: { cortes?: string; subtitulos?: string; zoom?: string; sfx?: string; musica?: string; look?: string; planos?: string };
  promptIa?: string;
  noHacer?: string[];
  reglas?: ReglaDeVideo[];
  perfil?: PerfilVtool;
};

/** Una fila por versión. La vigente es la última aprobada; si no hay, la última. */
export const videoPlantillas = pgTable("video_plantillas", {
  id: uuid("id").primaryKey().defaultRandom(),
  nicho: text("nicho").notNull(),
  tipo: text("tipo").notNull(),
  version: integer("version").notNull(),
  estado: text("estado").notNull().default("borrador"), // borrador | lista | aprobada
  contenido: jsonb("contenido").$type<ContenidoPlantilla>().notNull().default({}),
  evidencia: jsonb("evidencia").$type<{ virales: number; cuentas: number; ids: string[] }>().notNull().default({ virales: 0, cuentas: 0, ids: [] }),
  autor: text("autor").notNull(),
  motivo: text("motivo"),
  aprobadaPor: text("aprobada_por"),
  aprobadaAt: timestamp("aprobada_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  versionIdx: uniqueIndex("video_plantillas_version_idx").on(t.nicho, t.tipo, t.version),
}));
