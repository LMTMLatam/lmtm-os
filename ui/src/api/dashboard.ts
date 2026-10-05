import type { DashboardSummary } from "@paperclipai/shared";
import { api } from "./client";

export interface TriageCliente {
  clientId: string; name: string; slug: string; salud: number | null; problemas: string[];
}
export interface DashboardAccion {
  triage: { rojo: TriageCliente[]; amarillo: TriageCliente[]; verdeCount: number };
  serie: Array<{ date: string; spend: number; leads: number }>;
}

export const dashboardApi = {
  summary: (companyId: string) => api.get<DashboardSummary>(`/companies/${companyId}/dashboard`),
  /** Estado de la cartera (semáforo y pulso). Lo accionable vive en Hoy. */
  accion: () => api.get<DashboardAccion>(`/dashboard/accion`),
};
