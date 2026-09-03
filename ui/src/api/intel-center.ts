import { api } from "./client";

// Centro de Inteligencia: intervenciones de los vigilantes + salud /100.

export interface Intervention {
  id: string;
  vigilante: string;
  kind: string;
  level: number; // 1-5 (nivel de interrupción)
  clientId: string | null;
  title: string;
  body: string | null;
  status: "open" | "sent" | "resolved" | "dismissed";
  evidence: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface SaludCliente {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  salud: { score: number; razones?: string[]; checkedAt?: string } | null;
}

export const intelCenterApi = {
  interventions: (status = "open,sent") =>
    api.get<{ interventions: Intervention[] }>(`/growth/interventions?status=${encodeURIComponent(status)}`),
  setStatus: (id: string, status: "resolved" | "dismissed" | "open") =>
    api.patch<Intervention>(`/growth/interventions/${id}`, { status }),
  saludClientes: () => api.get<{ clientes: SaludCliente[] }>("/growth/salud-clientes"),
};
