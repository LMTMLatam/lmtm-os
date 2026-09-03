import type { DashboardSummary } from "@paperclipai/shared";
import { api } from "./client";

export interface TriageCliente {
  clientId: string; name: string; slug: string; salud: number | null; problemas: string[];
}
export interface FilaAccion {
  identifier?: string | null; title: string; priority?: string; updatedAt?: string;
  id?: string; severity?: string; createdAt?: string;
  clientId: string | null; clienteNombre: string | null; clienteSlug: string | null;
  /** Sólo en la cola humana: quién se trabó, qué dijo y hace cuánto. */
  agente?: string | null; motivo?: string | null; diasParado?: number;
}
export interface DashboardAccion {
  triage: { rojo: TriageCliente[]; amarillo: TriageCliente[]; verdeCount: number };
  humanas: FilaAccion[];
  /** Cuántas hay en total: la lista viene recortada. */
  humanasTotal?: number;
  alertas: FilaAccion[];
  serie: Array<{ date: string; spend: number; leads: number }>;
}

export const dashboardApi = {
  summary: (companyId: string) => api.get<DashboardSummary>(`/companies/${companyId}/dashboard`),
  /** Centro de mando: todo lo accionable del panel principal en una request. */
  accion: () => api.get<DashboardAccion>(`/dashboard/accion`),
};
