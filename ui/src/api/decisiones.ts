import { api } from "./client";

// Mismo contrato que server/src/decisiones/tipos.ts y hoy.ts. La UI no puede
// importar del server, así que los tipos se repiten acá: si cambia uno, cambia
// el otro (AGENTS.md: contratos sincronizados).

export type EstadoDecision = "abierta" | "aprobada" | "ejecutada" | "verificada" | "descartada" | "vencida";
export type Responsable = "equipo" | "cliente" | "agente";

export interface Dato {
  etiqueta: string;
  valor: number | string | null;
  unidad?: "ars" | "ars_dia" | "pct" | "dias" | "veces" | "leads" | "texto";
}

export interface Porque {
  resumen: string;
  datos: Dato[];
  ventana?: { desde: string; hasta: string };
  nivel?: 5;
  nota?: string;
}

export type Accion =
  | { tipo: "presupuesto"; entityType: "campaign" | "adset"; entityId: string; nombre?: string; anterior?: number; nuevoDiario: number }
  | { tipo: "mover_presupuesto"; desde: { entityType: string; entityId: string }; hacia: { entityType: string; entityId: string }; monto: number }
  | { tipo: "duplicar"; adsetId: string; nombre?: string }
  | { tipo: "pausar"; entityType: "campaign" | "adset"; entityId: string; nombre?: string }
  | { tipo: "tarea"; titulo: string; descripcion?: string };

export interface ResultadoEjecucion {
  ok: boolean;
  detalle: string;
  ensayo: boolean;
  at: string;
  efecto?: Record<string, unknown>;
}

export interface Decision {
  id: string;
  clientId: string;
  cliente: string;
  clienteSlug: string;
  tipo: string;
  que: string;
  porque: Porque;
  arsPorDia: number | null;
  responsable: Responsable;
  estado: EstadoDecision;
  creadaPor: string;
  accion: (Accion & { resultado?: ResultadoEjecucion }) | null;
  venceAt: string | null;
  ejecutadaAt: string | null;
  createdAt: string;
}

export type EstadoFuente = "sin_conexion" | "fallando" | "sin_entrega" | "atrasada" | "ok";
export type Fuente = "meta_ads" | "google_ads" | "organico";

export interface Hoy {
  generado: string;
  ultimaCorrida: string | null;
  whatsapp: "conectado" | "conectando" | "desconectado" | "sin_dato";
  incidentes: Decision[];
  decisiones: Decision[];
  esperando: Decision[];
  sinMeta: Decision[];
  plataParada: number | null;
  /** Clientes que suman la plata parada (los mismos que se sumaron). */
  clientesParados: number;
  cobertura: { clientes: number; porFuente: Record<Fuente, Record<EstadoFuente, number>> } | null;
  /** Plata parada al cierre de cada corrida diaria, del día más viejo al más nuevo. */
  evolucion?: Array<{ fecha: string; plataParada: number | null }>;
}

export const decisionesApi = {
  hoy: () => api.get<Hoy>("/hoy"),
  /** Sin `confirmar` es ENSAYO: valida todo y no toca nada. */
  ensayar: (id: string) => api.post<{ decision: Decision; resultado: ResultadoEjecucion }>(`/decisiones/${id}/ejecutar`, {}),
  ejecutar: (id: string) => api.post<{ decision: Decision; resultado: ResultadoEjecucion }>(`/decisiones/${id}/ejecutar`, { confirmar: true }),
  hecha: (id: string) => api.post<{ decision: Decision }>(`/decisiones/${id}/hecha`, {}),
  descartar: (id: string, motivo: string) => api.post<{ decision: Decision }>(`/decisiones/${id}/descartar`, { motivo }),
};
