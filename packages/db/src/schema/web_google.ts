// LMTM-OS: Search Console y Analytics 4 por cliente. Ver migración 0158_web_google.sql.

import { pgTable, uuid, text, timestamp, numeric, integer, date, index, uniqueIndex, primaryKey } from "drizzle-orm/pg-core";

export const googleWebConexiones = pgTable(
  "google_web_conexiones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull(),
    email: text("email").notNull(),
    refreshToken: text("refresh_token").notNull(),
    scopes: text("scopes").array(),
    /** activa | revocada | error */
    estado: text("estado").notNull().default("activa"),
    ultimoError: text("ultimo_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ cuentaIdx: uniqueIndex("google_web_conexiones_cuenta_idx").on(t.companyId, t.email) }),
);

export const webPropiedades = pgTable("web_propiedades", {
  clientId: uuid("client_id").primaryKey(),
  /** "sc-domain:ejemplo.com" o "https://www.ejemplo.com/" */
  gscSitio: text("gsc_sitio"),
  /** "properties/123456789" */
  ga4Propiedad: text("ga4_propiedad"),
  ga4Nombre: text("ga4_nombre"),
  /** null = la eligió el sistema; "panel:…"/"agente:…" = una persona, no se pisa. */
  fijadaPor: text("fijada_por"),
  ultimoError: text("ultimo_error"),
  sincronizadoAt: timestamp("sincronizado_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const webDiario = pgTable(
  "web_diario",
  {
    clientId: uuid("client_id").notNull(),
    fecha: date("fecha").notNull(),
    gscClics: integer("gsc_clics"),
    gscImpresiones: integer("gsc_impresiones"),
    gscPosicion: numeric("gsc_posicion", { mode: "number" }),
    gaSesiones: integer("ga_sesiones"),
    gaUsuarios: integer("ga_usuarios"),
    gaNuevos: integer("ga_nuevos"),
    gaComprometidas: integer("ga_comprometidas"),
    gaEventosClave: numeric("ga_eventos_clave", { mode: "number" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.clientId, t.fecha] }) }),
);

export const webRanking = pgTable(
  "web_ranking",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id").notNull(),
    /** consulta | pagina | canal | landing | fuente | evento */
    tipo: text("tipo").notNull(),
    clave: text("clave").notNull(),
    /** consulta → la página que rankea; landing → el canal. */
    detalle: text("detalle"),
    desde: date("desde").notNull(),
    hasta: date("hasta").notNull(),
    clics: integer("clics"),
    impresiones: integer("impresiones"),
    posicion: numeric("posicion", { mode: "number" }),
    sesiones: integer("sesiones"),
    usuarios: integer("usuarios"),
    eventosClave: numeric("eventos_clave", { mode: "number" }),
    /** Tasa de sesiones con interacción de GA4, 0..1. */
    compromiso: numeric("compromiso", { mode: "number" }),
  },
  (t) => ({ clienteTipoIdx: index("web_ranking_cliente_tipo_idx").on(t.clientId, t.tipo) }),
);
