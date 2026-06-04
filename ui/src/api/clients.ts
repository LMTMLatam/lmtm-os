import { api } from "./client";

export type ClientStatus = "active" | "paused" | "offboarded" | "churned";
export type ClientTier = "starter" | "standard" | "growth" | "enterprise";

export interface Client {
  id: string;
  slug: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  status: ClientStatus;
  tier: ClientTier;
  ownerAgentId: string | null;
  primaryContactName: string | null;
  primaryContactEmail: string | null;
  primaryContactPhone: string | null;
  websiteUrl: string | null;
  industry: string | null;
  monthlyRetainerCents: number;
  currency: string;
  crmExternalId: string | null;
  planillaSource: string | null;
  planillaExternalId: string | null;
  planillaSyncedAt: string | null;
  onboardedAt: string | null;
  offboardedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClientsListResponse {
  clients: Client[];
}

export const clientsApi = {
  list: (status?: ClientStatus) => {
    const qs = status ? `?status=${status}` : "";
    return api.get<ClientsListResponse>(`/clients${qs}`);
  },
  get: (idOrSlug: string) => api.get<Client>(`/clients/${idOrSlug}`),
  create: (body: Partial<Client> & { name: string; slug: string }) =>
    api.post<Client>("/clients", body),
};
