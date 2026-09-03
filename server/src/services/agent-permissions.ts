import { MODO_POR_DEFECTO, type ModoAgente } from "./agent-modo.js";

export type NormalizedAgentPermissions = Record<string, unknown> & {
  canCreateAgents: boolean;
  /** "consulta" = solo lee. "accion" = además escribe. Ver agent-modo.ts. */
  modo: ModoAgente;
};

export function defaultPermissionsForRole(role: string): NormalizedAgentPermissions {
  return {
    canCreateAgents: role === "ceo",
    modo: MODO_POR_DEFECTO,
  };
}

export function normalizeAgentPermissions(
  permissions: unknown,
  role: string,
): NormalizedAgentPermissions {
  const defaults = defaultPermissionsForRole(role);
  if (typeof permissions !== "object" || permissions === null || Array.isArray(permissions)) {
    return defaults;
  }

  const record = permissions as Record<string, unknown>;
  return {
    canCreateAgents:
      typeof record.canCreateAgents === "boolean"
        ? record.canCreateAgents
        : defaults.canCreateAgents,
    modo: record.modo === "consulta" ? "consulta" : defaults.modo,
  };
}
