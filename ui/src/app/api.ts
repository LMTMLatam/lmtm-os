import { api } from "../api/client";

// Mismo contrato que server/src/agentes (rutas.ts y correr.ts).

export type EstadoTrabajo = "pendiente" | "corriendo" | "hecho" | "fallo" | "cancelado";

export interface ResultadoAgente {
  resumen?: string;
  causa?: string;
  verificado?: string[];
  supuestos?: string[];
  siguientePaso?: { quien: "cliente" | "equipo" | "agente"; que: string };
  brief?: string;
}

export interface Trabajo {
  id: string;
  rol: string;
  clientId: string | null;
  motivo: "decision" | "horario" | "pedido";
  ref: string | null;
  estado: EstadoTrabajo;
  resultado: ResultadoAgente | null;
  error: string | null;
  turnos: number | null;
  tokensEntrada: number | null;
  tokensSalida: number | null;
  pedidoPor: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface PasoAgente {
  herramienta: string;
  entrada: unknown;
  salida: string;
  error?: boolean;
}

export interface TrabajoCompleto extends Trabajo {
  entrada: Record<string, unknown>;
  pasos: PasoAgente[];
}

export const agentesApi = {
  trabajos: (q: { clientId?: string; rol?: string; estado?: EstadoTrabajo; ref?: string; limite?: number } = {}) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v != null && v !== "") p.set(k, String(v));
    return api.get<{ trabajos: Trabajo[] }>(`/agentes/trabajos${p.size ? `?${p}` : ""}`);
  },
  trabajo: (id: string) => api.get<{ trabajo: TrabajoCompleto }>(`/agentes/trabajos/${id}`),
  pedir: (b: { rol: string; clientId?: string | null; pedido: string }) => api.post<{ id: string | null }>("/agentes/trabajos", b),
};

/** Los roles del runner y cómo se llaman para la persona. */
export const ROLES: Record<string, string> = {
  "media-buyer": "Media buyer",
  estratega: "Estratega",
};

export const nombreRol = (r: string) => ROLES[r] ?? r;
