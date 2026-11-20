import { describe, expect, it } from "vitest";
import { seHaceSola } from "../autonomia.js";

describe("qué hace un agente solo (20/11)", () => {
  it("las optimizaciones de Google Ads se hacen en el momento", () => {
    for (const t of ["add_negative_keywords", "add_keywords_google"]) expect(seHaceSola(t, {}), t).toBe(true);
  });
  it("las de Meta van por el departamento (revalida con los números del día y deshace si empeora), no en el momento", () => {
    for (const t of ["set_budget", "shift_budget", "duplicate_winner"]) expect(seHaceSola(t, {}), t).toBe(false);
  });
  it("apagar o deshabilitar sigue esperando a una persona", () => {
    expect(seHaceSola("pause_ad_entity", { entityType: "campaign" })).toBe(false);
    expect(seHaceSola("pause_ad_entity", { entityType: "adset" })).toBe(false);
    expect(seHaceSola("pause_keywords_google", {})).toBe(false);
    expect(seHaceSola("proponer_cambio_web", { accion: "desactivar_plugin" })).toBe(false);
    expect(seHaceSola("proponer_cambio_web", { accion: "bajar_administrador" })).toBe(false);
  });
  it("en las webs, lo que arregla sin apagar; WordPress mayor, PHP y código esperan", () => {
    for (const a of ["quitar_spam", "reemplazar_texto", "crear_redireccion", "instalar_ssl", "forzar_https", "purgar_cache", "actualizar_plugins", "actualizar_temas"]) {
      expect(seHaceSola("proponer_cambio_web", { accion: a }), a).toBe(true);
    }
    expect(seHaceSola("proponer_cambio_web", { accion: "actualizar_wordpress" })).toBe(true);
    expect(seHaceSola("proponer_cambio_web", { accion: "actualizar_wordpress", soloMenor: false })).toBe(false);
    expect(seHaceSola("proponer_cambio_web", { accion: "version_php", version: "8.3" })).toBe(false);
    expect(seHaceSola("cambio_codigo", { accion: "proponer" })).toBe(false);
  });
});
