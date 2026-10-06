import { api } from "./client";
import type { Decision } from "./decisiones";

// Mismo contrato que server/src/decisiones/informe.ts, informes-store.ts e
// informe-publico.ts. La UI no importa del server: si cambia uno, cambia el otro.

export type EstadoObjetivo = "en_objetivo" | "arriba" | "muy_arriba" | "sin_dato";
export type EstadoInforme = "borrador" | "observado" | "aprobado" | "publicado";

export interface NumerosInforme {
  desde: string;
  hasta: string;
  inversion: number | null;
  leads: number | null;
  cpl: number | null;
  calificados: number | null;
  costoPorCalificado: number | null;
  ventas: number | null;
  costoPorVenta: number | null;
  objetivo: number | null;
  objetivoFuente: "cliente" | "historial" | null;
  anterior: { inversion: number | null; leads: number | null; cpl: number | null };
  leadsDudosos: boolean;
}

export interface Narrativa {
  resumen: string;
  hicimos: string[];
  aprendimos: string[];
  proximos: string[];
  pedidos: string[];
}

export interface InformePublico {
  cliente: string;
  semana: { desde: string; hasta: string };
  primeraSemana: string;
  numeros: NumerosInforme;
  medida: "calificado" | "lead";
  estado: EstadoObjetivo;
  tendencia: Array<{ desde: string; inversion: number | null; leads: number | null; cpl: number | null }>;
  campanas: Array<{ nombre: string; plataforma: "meta" | "google"; inversion: number; leads: number; cpl: number | null; estado: EstadoObjetivo; leadsDudosos: boolean }> | null;
  pedidos: string[];
  narrativa: Narrativa | null;
  publicadoAt: string | null;
}

export interface Informe {
  id: string;
  clientId: string;
  semana: string;
  narrativa: Narrativa;
  numeros: NumerosInforme;
  estado: EstadoInforme;
  escritoPor: string;
  auditoria: { ok: boolean; fallas: string[]; at: string } | null;
  publicadoAt: string | null;
  texto: Narrativa;
}

/** El link público no usa sesión: va sin credenciales, como el resto del panel público. */
export async function informePublico(slug: string, semana?: string): Promise<InformePublico> {
  const qs = semana ? `?semana=${encodeURIComponent(semana)}` : "";
  const r = await fetch(`/api/public/dashboards/${encodeURIComponent(slug)}/informe${qs}`, { credentials: "omit" });
  if (r.status === 404) throw new Error("Este link no existe o está desactivado.");
  if (!r.ok) throw new Error("No se pudo armar el informe. Probá de nuevo en un rato.");
  return r.json();
}

export const informesApi = {
  listar: (clientId: string) => api.get<{ informes: Informe[] }>(`/informes?clientId=${clientId}`),
  publicar: (id: string) => api.post<{ informe: Informe }>(`/informes/${id}/publicar`, {}),
  retirar: (id: string) => api.post<{ informe: Informe }>(`/informes/${id}/retirar`, {}),
};

export interface ResumenCliente {
  semana: NumerosInforme;
  estado: EstadoObjetivo;
  medida: "calificado" | "lead";
  embudo: {
    desde: string;
    hasta: string;
    inversion: number | null;
    leads: number | null;
    calificados: number | null;
    ventas: number | null;
    cpl: number | null;
    costoPorCalificado: number | null;
    costoPorVenta: number | null;
  };
  decisiones: Decision[];
  hechas: Decision[];
  informe: {
    id: string;
    semana: string;
    estado: EstadoInforme;
    escritoPor: string;
    fallas: string[];
    texto: Narrativa;
    publicadoAt: string | null;
  } | null;
  linkPublico: string | null;
}

export const clientesApi = {
  resumen: (clientId: string) => api.get<ResumenCliente>(`/clientes/${clientId}/resumen`),
};

export interface FilaCartera {
  clientId: string;
  cliente: string;
  slug: string;
  plataEnRiesgo: number | null;
  semana: { inversion: number | null; leads: number | null; cpl: number | null; objetivo: number | null; objetivoFuente: "cliente" | "historial" | null; leadsDudosos: boolean; cplAnterior: number | null };
  estado: EstadoObjetivo;
  fuentesConProblemas: Array<{ fuente: "meta_ads" | "google_ads" | "organico"; estado: "sin_conexion" | "fallando" | "sin_entrega" | "atrasada" | "ok" }>;
  sinPauta: boolean;
  decisiones: number;
  proxima: { id: string; que: string; arsPorDia: number | null; responsable: "equipo" | "cliente" | "agente" } | null;
  informe: EstadoInforme | null;
}

export interface Cartera {
  semana: { desde: string; hasta: string };
  clientes: FilaCartera[];
  sinLeer: string[];
}

export const carteraApi = {
  leer: () => api.get<Cartera>("/cartera"),
};
