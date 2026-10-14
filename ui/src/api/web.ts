// Search Console + Analytics por cliente. Ver server/src/routes/web-google.ts.
import { api } from "./client";

export interface WebConexion { id: string; email: string; estado: "activa" | "revocada" | "error"; ultimoError: string | null; updatedAt: string }
export interface WebEstado {
  conexiones: WebConexion[];
  resumen: { clientes: number; conWeb: number; conSearchConsole: number; conAnalytics: number };
  clientes: Array<{ clientId: string; nombre: string; slug: string; web: string | null; gscSitio: string | null; ga4Nombre: string | null; elegidaPorPersona: boolean; sincronizadoAt: string | null; error: string | null }>;
}
export interface WebInventario {
  sitios: string[];
  propiedades: Array<{ id: string; nombre: string; cuenta: string; webs: string[] }>;
  errores: Array<{ email: string; error: string }>;
}
type Ventana = { desde: string; hasta: string };
export interface WebRendimiento {
  cliente: string;
  web: string | null;
  sitioSearchConsole: string | null;
  propiedadAnalytics: { id: string; nombre: string | null } | null;
  elegidaPor: string | null;
  sincronizadoAt: string | null;
  error: string | null;
  searchConsole: null | {
    ventana: Ventana; clics: number | null; impresiones: number | null; posicionMedia: number | null; ctr: number | null; diasConDato: number;
    anterior: { clics: number | null; impresiones: number | null; posicionMedia: number | null };
    variacionClicsPct: number | null; variacionImpresionesPct: number | null;
    topBusquedas: Array<{ consulta: string; clics: number; impresiones: number; posicion: number | null }>;
    topPaginas: Array<{ pagina: string; clics: number | null; impresiones: number | null; posicion: number | null }>;
    oportunidades: Array<{ consulta: string; pagina: string | null; posicion: number; impresiones: number; clics: number }>;
  };
  analytics: null | {
    ventana: Ventana; sesiones: number | null; usuarios: number | null; usuariosNuevos: number | null; eventosClave: number | null; tasaInteraccionPct: number | null; diasConDato: number;
    anterior: { sesiones: number | null; usuarios: number | null; eventosClave: number | null };
    variacionSesionesPct: number | null; variacionEventosClavePct: number | null;
    canales: Array<{ canal: string; sesiones: number | null; eventosClave: number | null; interaccionPct: number | null }>;
    landings: Array<{ pagina: string; canal: string | null; sesiones: number | null; eventosClave: number | null; interaccionPct: number | null }>;
    fuentes: Array<{ fuente: string; sesiones: number | null; eventosClave: number | null }>;
    eventosClaveConfigurados: Array<{ evento: string; veces: number | null }>;
  };
  falta: string[];
}

export const webApi = {
  estado: () => api.get<WebEstado>("/web/estado"),
  inventario: (fresco = false) => api.get<WebInventario>(`/web/inventario${fresco ? "?fresco=1" : ""}`),
  rendimiento: (slug: string, dias = 28) => api.get<WebRendimiento | null>(`/clients/${slug}/web?dias=${dias}`),
  vincular: (slug: string, body: { gscSitio?: string | null; ga4Propiedad?: string | null; automatico?: boolean }) =>
    api.put<{ ok: boolean; error: string | null; web: WebRendimiento }>(`/clients/${slug}/web-propiedades`, body),
  sincronizar: () => api.post<{ ok: boolean }>("/web/sincronizar", {}),
  desconectar: (id: string) => api.delete<void>(`/web/conexiones/${id}`),
  conectarUrl: (companyId: string) => `/api/integrations/oauth/start?platform=google_web&companyId=${companyId}`,
};
