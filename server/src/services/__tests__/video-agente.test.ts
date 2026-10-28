import path from "node:path";
import { describe, expect, it } from "vitest";
import { NOMBRES_VIDEO, RAIZ, rutaSegura } from "../video-agente.js";
import { SKILLS_DE_TODOS } from "../company-skills.js";

describe("video-agente: rutas", () => {
  it("acepta solo rutas bajo la raíz de videos", () => {
    expect(rutaSegura(`${RAIZ}/ferrol/assets/voice/l1.wav`)).toBe(path.join(RAIZ, "ferrol", "assets", "voice", "l1.wav"));
    expect(rutaSegura("ferrol/index.html")).toBe(path.join(RAIZ, "ferrol", "index.html"));
    expect(rutaSegura(`${RAIZ}/../etc/passwd`)).toBeNull();
    expect(rutaSegura("/app/.ssh/crm_claude")).toBeNull();
    expect(rutaSegura(`${RAIZ}-otra/x.mp4`)).toBeNull();
    expect(rutaSegura(RAIZ)).toBeNull();
    expect(rutaSegura("")).toBeNull();
    expect(rutaSegura(42)).toBeNull();
  });

  it("expone las herramientas que nombra la skill lmtm-video", () => {
    for (const t of ["video_voz", "video_transcribir", "video_plano", "video_musica", "video_renderizar", "video_estado", "video_revisar", "video_entregar"]) {
      expect(NOMBRES_VIDEO.has(t)).toBe(true);
    }
  });
});

describe("skills de todos los agentes", () => {
  it("el núcleo incluye caveman y la de ahorro, no las 122", () => {
    expect(SKILLS_DE_TODOS.has("caveman")).toBe(true);
    expect(SKILLS_DE_TODOS.has("lmtm-ahorro-tokens")).toBe(true);
    expect(SKILLS_DE_TODOS.size).toBeLessThan(10);
  });
});
