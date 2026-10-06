import type { DashboardSummary } from "@paperclipai/shared";
import { api } from "./client";

/** El pulso de la agencia. El semáforo de cartera se retiró: la Cartera vive en /cartera (B3). */
export interface DashboardAccion {
  serie: Array<{ date: string; spend: number; leads: number }>;
}

export const dashboardApi = {
  summary: (companyId: string) => api.get<DashboardSummary>(`/companies/${companyId}/dashboard`),
  /** El pulso de la cartera (30 días). Lo accionable vive en Hoy; la cartera, en /cartera. */
  accion: () => api.get<DashboardAccion>(`/dashboard/accion`),
};
