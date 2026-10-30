import path from "node:path";
import { describe, expect, it } from "vitest";
import { NOMBRES_VIDEO, RAIZ, idDeDrive, rutaSegura } from "../video-agente.js";
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
    for (const t of ["video_voz", "video_transcribir", "video_plano", "video_musica", "video_renderizar", "video_estado", "video_revisar", "video_entregar", "drive_bajar", "encargar_al_productor"]) {
      expect(NOMBRES_VIDEO.has(t)).toBe(true);
    }
  });

  it("saca el id de cualquier link de Drive", () => {
    // El pedido de RENO del 29/10 traía un link de carpeta con ?usp=sharing.
    expect(idDeDrive("https://drive.google.com/drive/folders/1CCIKDR6h-A4pe0fiLCGE4YWEtDnuBxSl?usp=sharing")).toBe("1CCIKDR6h-A4pe0fiLCGE4YWEtDnuBxSl");
    expect(idDeDrive("https://drive.google.com/drive/u/2/folders/1dlDPTGcskdVU8L35EMlC6pBBKSmQdaQx")).toBe("1dlDPTGcskdVU8L35EMlC6pBBKSmQdaQx");
    expect(idDeDrive("https://drive.google.com/file/d/1A9dKa_OcqvKPqh0z8r9mqCC1TCFAOUSq/view")).toBe("1A9dKa_OcqvKPqh0z8r9mqCC1TCFAOUSq");
    expect(idDeDrive("https://drive.google.com/open?id=1A9dKa_OcqvKPqh0z8r9mqCC1TCFAOUSq")).toBe("1A9dKa_OcqvKPqh0z8r9mqCC1TCFAOUSq");
    expect(idDeDrive("1A9dKa_OcqvKPqh0z8r9mqCC1TCFAOUSq")).toBe("1A9dKa_OcqvKPqh0z8r9mqCC1TCFAOUSq");
    expect(idDeDrive("https://instagram.com/reno")).toBeNull();
  });
});

describe("skills de todos los agentes", () => {
  it("el núcleo incluye caveman y la de ahorro, no las 122", () => {
    expect(SKILLS_DE_TODOS.has("caveman")).toBe(true);
    expect(SKILLS_DE_TODOS.has("lmtm-ahorro-tokens")).toBe(true);
    expect(SKILLS_DE_TODOS.size).toBeLessThan(10);
  });
});

describe("video-agente: voz", () => {
  it("pcmAWav arma un wav válido de 16 bits mono", async () => {
    const { pcmAWav } = await import("../video-agente.js");
    const pcm = Buffer.alloc(48000); // 1 s a 24 kHz
    const wav = pcmAWav(pcm, 24000);
    expect(wav.length).toBe(44 + 48000);
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
    expect(wav.readUInt32LE(24)).toBe(24000); // tasa
    expect(wav.readUInt16LE(34)).toBe(16); // bits
    expect(wav.readUInt32LE(40)).toBe(48000); // datos
  });
});
