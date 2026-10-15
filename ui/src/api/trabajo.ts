// El trabajo de los agentes en un solo lugar. Ver server/src/services/trabajo.ts.
import { api } from "./client";

export type AreaTrabajo = "pauta" | "web" | "contenido" | "analisis" | "informe";
export type Plataforma = "meta" | "google" | "search_console" | "analytics";

export interface Resultado {
  estado: "midiendo" | "medido" | "sin_datos";
  metrica: "cpl" | "ctr" | "clics_google" | "eventos_clave";
  antes: number | null;
  despues: number | null;
  veredicto: "mejoro" | "igual" | "empeoro" | null;
  seMideEl: string | null;
}

export interface ItemTrabajo {
  id: string;
  clientId: string | null;
  cliente: string | null;
  clienteSlug: string | null;
  fecha: string;
  area: AreaTrabajo;
  plataforma: Plataforma | null;
  estado: "hecho" | "propuesto" | "descartado";
  quien: string;
  automatico: boolean;
  que: string;
  porque: string | null;
  siguiente: string | null;
  resultado: Resultado | null;
  enlace: string | null;
}

export interface ResumenTrabajo {
  hechos: number;
  propuestos: number;
  automaticos: number;
  medidos: number;
  mejoraron: number;
  igual: number;
  empeoraron: number;
  midiendo: number;
  porArea: Record<AreaTrabajo, { hechos: number; propuestos: number }>;
}

export interface OptimizacionPublica {
  fecha: string;
  plataforma: Plataforma | null;
  que: string;
  resultado: Resultado | null;
}

export const trabajoApi = {
  leer: (p: { clientId?: string; dias?: number }) => {
    const qs = new URLSearchParams();
    if (p.clientId) qs.set("clientId", p.clientId);
    if (p.dias) qs.set("dias", String(p.dias));
    return api.get<{ dias: number; items: ItemTrabajo[]; resumen: ResumenTrabajo }>(`/trabajo?${qs}`);
  },
};
