// LMTM: todo lo que espera un sí o un no (rediseño 20/11). Antes estaba repartido
// entre Hoy (decisiones de pauta y propuestas de los agentes) y Producción (piezas
// sin veredicto). Este módulo es liviano a propósito: el riel lo usa para el contador.

import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { decisionesApi, type Decision } from "../api/decisiones";
import { tocaLaPauta } from "./formato";

export interface Propuesta {
  clave: string;
  ids: string[];
  agentes: string[];
  clientId: string | null;
  cliente: string | null;
  slug: string | null;
  resumen: string;
  justificacion: string;
  createdAt: string;
}
export type GrupoPropuestas = "pauta" | "otras";

export const propuestasApi = {
  listar: (grupo: GrupoPropuestas) => api.get<{ propuestas: Propuesta[] }>(grupo === "otras" ? "/agentes/propuestas?grupo=otras" : "/agentes/propuestas"),
};

/** Puro. Las decisiones que piden un sí o un no (las que tocan la pauta); el resto se hace, no se aprueba. */
export function paraAprobar(decisiones: Decision[]): Decision[] {
  return decisiones.filter((d) => tocaLaPauta(d.accion));
}

export function useAprobaciones() {
  const hoy = useQuery({ queryKey: ["lmtm", "hoy"], queryFn: () => decisionesApi.hoy(), staleTime: 60_000, refetchInterval: 5 * 60_000 });
  const pauta = useQuery({ queryKey: ["lmtm", "propuestas", "pauta"], queryFn: () => propuestasApi.listar("pauta"), staleTime: 60_000 });
  const otras = useQuery({ queryKey: ["lmtm", "propuestas", "otras"], queryFn: () => propuestasApi.listar("otras"), staleTime: 60_000 });
  const piezas = useQuery({
    queryKey: ["lmtm", "contenido", "para-validar"],
    queryFn: () => api.get<{ videos: number; desde: string | null }>("/contenido/para-validar"),
    staleTime: 5 * 60_000,
  });
  const decisiones = paraAprobar(hoy.data?.decisiones ?? []);
  const n = {
    pauta: decisiones.length + (pauta.data?.propuestas.length ?? 0),
    contenido: piezas.data?.videos ?? 0,
    web: otras.data?.propuestas.length ?? 0,
  };
  return { decisiones, n, total: n.pauta + n.contenido + n.web, cargando: hoy.isLoading || pauta.isLoading || otras.isLoading || piezas.isLoading };
}
