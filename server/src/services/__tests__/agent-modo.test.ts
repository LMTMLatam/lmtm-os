// La regla que estos tests protegen: un agente en modo consulta NO puede llamar
// a nada que escriba o mande algo hacia afuera, ni siquiera a una tool que el
// sistema no conozca. Y el default no puede cambiarle el comportamiento a la
// flota que ya está corriendo.
import { describe, expect, it } from "vitest";
import {
  esDeAccion,
  mensajeDeBloqueo,
  modoDeAgente,
  puedeUsar,
  MODO_POR_DEFECTO,
} from "../agent-modo.js";
import { normalizeAgentPermissions, defaultPermissionsForRole } from "../agent-permissions.js";

describe("esDeAccion", () => {
  it.each([
    "get_issue",
    "list_clients",
    "get_client_brain",
    "get_client_ads_performance",
    "get_client_balance",
    "portfolio_snapshot",
    "search_hooks",
    "clickup_list_tasks",
    "sheets_read",
    "get_team_status",
  ])("%s solo lee", (tool) => {
    expect(esDeAccion(tool)).toBe(false);
  });

  // Las que le pueden romper algo a un cliente si el modelo se equivoca.
  it.each([
    "pause_ad_entity",
    "send_whatsapp_report",
    "send_balance_alert",
    "clickup_create_task",
    "create_client_task",
    "sheets_append",
    "post_comment",
    "set_issue_status",
    "set_licitacion_estado",
    "delegate_to_agent",
    "remember_about_client",
    "crm_request",
  ])("%s es acción", (tool) => {
    expect(esDeAccion(tool)).toBe(true);
  });

  it("una tool de plugin desconocida se asume acción", () => {
    expect(esDeAccion("meta_publicar_creativo")).toBe(true);
    expect(esDeAccion("cualquier_cosa_nueva")).toBe(true);
  });

  it("pero respeta el prefijo de lectura en las de plugin", () => {
    expect(esDeAccion("get_meta_campaigns")).toBe(false);
    expect(esDeAccion("list_ad_accounts")).toBe(false);
    expect(esDeAccion("meta.get_insights")).toBe(false);
  });

  it("un nombre vacío o basura es acción", () => {
    expect(esDeAccion("")).toBe(true);
    expect(esDeAccion("   ")).toBe(true);
  });
});

describe("modoDeAgente", () => {
  it("solo 'consulta' activa el modo restringido", () => {
    expect(modoDeAgente({ modo: "consulta" })).toBe("consulta");
  });

  it.each([
    ["accion explícito", { modo: "accion" }],
    ["permisos vacíos", {}],
    ["valor inventado", { modo: "solo-lectura" }],
    ["null", null],
    ["undefined", undefined],
    ["un string", "consulta"],
  ])("%s cae en el default", (_caso, permisos) => {
    expect(modoDeAgente(permisos)).toBe(MODO_POR_DEFECTO);
  });

  it("el default es accion, así la flota actual no cambia", () => {
    expect(MODO_POR_DEFECTO).toBe("accion");
  });
});

describe("puedeUsar", () => {
  it("en accion puede con todo", () => {
    expect(puedeUsar("accion", "pause_ad_entity")).toBe(true);
    expect(puedeUsar("accion", "get_issue")).toBe(true);
  });

  it("en consulta lee pero no escribe", () => {
    expect(puedeUsar("consulta", "get_client_brain")).toBe(true);
    expect(puedeUsar("consulta", "pause_ad_entity")).toBe(false);
    expect(puedeUsar("consulta", "send_whatsapp_report")).toBe(false);
  });
});

describe("mensajeDeBloqueo", () => {
  it("nombra la tool y dice qué hacer en su lugar", () => {
    const msg = mensajeDeBloqueo("pause_ad_entity");
    expect(msg).toContain("pause_ad_entity");
    expect(msg).toContain("modo consulta");
    expect(msg.toLowerCase()).toContain("persona");
  });
});

describe("permisos normalizados", () => {
  it("el modo sobrevive a la normalización", () => {
    expect(normalizeAgentPermissions({ modo: "consulta" }, "general").modo).toBe("consulta");
  });

  it("un modo inválido cae en el default y no rompe", () => {
    expect(normalizeAgentPermissions({ modo: "cualquiera" }, "general").modo).toBe(MODO_POR_DEFECTO);
  });

  it("sigue respetando canCreateAgents", () => {
    expect(defaultPermissionsForRole("ceo").canCreateAgents).toBe(true);
    expect(defaultPermissionsForRole("general").canCreateAgents).toBe(false);
    expect(normalizeAgentPermissions({ canCreateAgents: true, modo: "consulta" }, "general")).toEqual({
      canCreateAgents: true,
      modo: "consulta",
    });
  });
});
