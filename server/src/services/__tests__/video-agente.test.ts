import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MOVIMIENTOS, chequearVariedad } from "../video-variedad.js";
import { NOMBRES_VIDEO, RAIZ, ejecutarHerramientaVideo, elegirVozElevenLabs, idDeDrive, rutaSegura } from "../video-agente.js";
import { SKILLS_DE_TODOS } from "../company-skills.js";
import { proveedorDelProxy } from "@paperclipai/adapter-claude-local/server";

describe("variedad de las piezas", () => {
  const yo = { idPieza: "a", movimiento: "pulso", ganchoTipo: "dato", pilar: "vitrina", insertos: ["numero", "lista"] };
  const otra = (x: object) => ({ titulo: "otra", idPieza: "b", movimiento: "relato", ganchoTipo: "pregunta", pilar: "educativo", insertos: [], ...x });

  it("no repite el estilo en las últimas piezas del cliente y dice cuáles quedan libres", () => {
    const r = chequearVariedad(yo, [otra({ movimiento: "ficha" }), otra({ movimiento: "pulso" })], []);
    expect(r.problemas.join()).toContain("«pulso»");
    expect(r.libres).toEqual(["directo", "relato", "vitrina"]);
    expect(chequearVariedad(yo, [otra({}), otra({}), otra({}), otra({ movimiento: "pulso" })], []).problemas).toEqual([]);
  });
  it("no repite la secuencia de insertos, pero el orden cuenta y sin insertos no hay secuencia", () => {
    expect(chequearVariedad(yo, [otra({ insertos: ["numero", "lista"] })], []).problemas.join()).toContain("secuencia");
    expect(chequearVariedad(yo, [otra({ insertos: ["lista", "numero"] })], []).problemas).toEqual([]);
    expect(chequearVariedad({ ...yo, insertos: [] }, [otra({ insertos: [] })], []).problemas).toEqual([]);
  });
  it("un pedido de cambios no se compara contra sí mismo y lo viejo sin ficha no cuenta", () => {
    expect(chequearVariedad(yo, [otra({ idPieza: "a", movimiento: "pulso", insertos: ["numero", "lista"] })], []).problemas).toEqual([]);
    expect(chequearVariedad(yo, [{ titulo: "vieja" }], []).problemas).toEqual([]);
  });
  it("entre clientes del mismo rubro solo avisa", () => {
    const r = chequearVariedad(yo, [], [{ titulo: "x", cliente: "Otro", movimiento: "pulso", insertos: ["numero", "lista"] }]);
    expect(r.problemas).toEqual([]);
    expect(r.avisos.join()).toContain("Otro");
  });
  it("rechaza lo que no es de la lista", () => {
    expect(chequearVariedad({ ...yo, movimiento: "x", ganchoTipo: "y", pilar: "z" }, [], []).problemas).toHaveLength(3);
  });
  it("los estilos del servidor son los de la plantilla", () => {
    const motion = fs.readFileSync(path.resolve(__dirname, "../../../../docker/video-skills/lmtm-video/plantilla/motion.mjs"), "utf8");
    const bloque = motion.slice(motion.indexOf("export const MOVIMIENTOS"), motion.indexOf("export const TIPOS_INSERTO"));
    expect([...bloque.matchAll(/^  (\w+): \{/gm)].map((m) => m[1])).toEqual(MOVIMIENTOS);
  });
});

describe("costo de las corridas", () => {
  it("por un proxy no se usa el total de la CLI", () => {
    expect(proveedorDelProxy({ ANTHROPIC_BASE_URL: "http://127.0.0.1:4000" })).toBe("litellm");
    expect(proveedorDelProxy({ ANTHROPIC_BASE_URL: "https://api.minimax.io/anthropic" })).toBe("minimax");
    expect(proveedorDelProxy({ ANTHROPIC_BASE_URL: "https://api.anthropic.com" })).toBeNull();
    expect(proveedorDelProxy({})).toBeNull();
  });
});

describe("video-agente: ElevenLabs", () => {
  it("elige la voz por nombre o id y si no existe lista las propias", () => {
    const voces = [
      { voice_id: "a1", name: "RENO", category: "cloned" },
      { voice_id: "b2", name: "Agustina - Young, Professional & Warm", category: "professional", labels: { accent: "argentine" } },
      { voice_id: "c3", name: "Roger - Laid-Back", category: "premade", labels: { accent: "american" } },
    ];
    expect(elegirVozElevenLabs(voces, "reno")).toEqual({ id: "a1" });
    expect(elegirVozElevenLabs(voces, "b2")).toEqual({ id: "b2" });
    expect(elegirVozElevenLabs(voces, "Agustina")).toEqual({ id: "b2" });
    const no = elegirVozElevenLabs(voces, "Otra") as { opciones: string };
    expect(no.opciones).toContain("RENO (clonada)");
    expect(no.opciones).toContain("Agustina");
    expect(no.opciones).not.toContain("Roger");
    expect(elegirVozElevenLabs(voces, "")).toHaveProperty("opciones");
  });

  it("sin clave avisa y no gasta nada, en voz y en música", async () => {
    const antes = process.env.ELEVENLABS_API_KEY;
    delete process.env.ELEVENLABS_API_KEY;
    const db = {} as never;
    const ctx = { agentId: "a", companyId: "c" };
    const voz = await ejecutarHerramientaVideo(db, ctx, "video_voz", { texto: "Hola", archivo: `${RAIZ}/x/l1.wav`, proveedor: "elevenlabs" });
    const musica = await ejecutarHerramientaVideo(db, ctx, "video_musica", { prompt: "música cálida sin voces", archivo: `${RAIZ}/x/m.mp3`, proveedor: "elevenlabs" });
    if (antes) process.env.ELEVENLABS_API_KEY = antes;
    expect(voz).toMatchObject({ ok: false, content: expect.stringContaining("ELEVENLABS_API_KEY") });
    expect(musica).toMatchObject({ ok: false, content: expect.stringContaining("ELEVENLABS_API_KEY") });
  });
});

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
    for (const t of ["video_voz", "video_transcribir", "video_plano", "video_musica", "video_renderizar", "video_estado", "video_revisar", "video_entregar", "drive_bajar", "encargar_al_productor", "video_describir", "video_retomar"]) {
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
