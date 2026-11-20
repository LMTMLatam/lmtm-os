import { describe, expect, it } from "vitest";
import { armarPedido, leerRespuesta, redDeLink, resumenVideos, type VideoDeRed } from "../redes.js";
import { limpiarMedicion, viralDeFila } from "../video-tipos.js";

describe("lmtm-redes: cliente", () => {
  it("por Tailscale (100.x) va por el proxy con la URL absoluta; una PC de prueba, directo", () => {
    const t = armarPedido("http://100.106.250.26:8790", "/v2/tiktok/video", { url: "https://x/y", vacio: "" }, "127.0.0.1:1055");
    expect(t).toEqual({ host: "127.0.0.1", port: 1055, path: "http://100.106.250.26:8790/v2/tiktok/video?url=https%3A%2F%2Fx%2Fy" });
    const d = armarPedido("http://127.0.0.1:8791", "/salud", {}, "127.0.0.1:1055");
    expect(d).toEqual({ host: "127.0.0.1", port: 8791, path: "/salud" });
  });

  it("un 429 es «frenó, no insistas» con la hora; 401 es el token; lo demás, el error", () => {
    expect(leerRespuesta(200, '{"a":1}')).toEqual({ ok: true, datos: { a: 1 } });
    const f = leerRespuesta(429, '{"error":"bloqueado","red":"instagram","motivo":"429","reintentar":"2026-11-18T03:00:00+00:00"}');
    expect(f.ok).toBe(false);
    expect(!f.ok && f.mensaje).toMatch(/instagram frenó.*No insistas.*2026-11-18T03:00/);
    expect(!leerRespuesta(401, "{}").ok && (leerRespuesta(401, "{}") as { mensaje: string }).mensaje).toMatch(/token/);
    expect((leerRespuesta(502, "Bad gateway") as { mensaje: string }).mensaje).toMatch(/502: Bad gateway/);
  });

  it("reconoce TikTok e Instagram y nada más", () => {
    expect(redDeLink("https://www.tiktok.com/@a/video/1")).toBe("tiktok");
    expect(redDeLink("https://vm.tiktok.com/ZM123/")).toBe("tiktok");
    expect(redDeLink("https://www.instagram.com/reel/Dfa9enbt3Qf/")).toBe("instagram");
    expect(redDeLink("https://youtube.com/shorts/x")).toBeNull();
  });

  it("el resumen ordena por veces y abrevia vistas", () => {
    const v = (id: string, veces: number | null, vistas: number | null): VideoDeRed =>
      ({ red: "tiktok", id, url: `u${id}`, autor: "a", vistas, veces, mediana_autor: 1000, fecha: "2026-11-01", duracion: 30 });
    const r = resumenVideos([v("1", 1.2, 1200), v("2", 64, 81_000), v("3", null, null)]).split("\n");
    expect(r[0]).toMatch(/^64× · 81 mil vistas \(mediana 1 mil\) · @a/);
    expect(r[2]).toMatch(/^s\/m · \? vistas/);
  });
});

describe("virales medidos (0163)", () => {
  it("limpiarMedicion: red conocida, números ≥ 0, fecha ISO; lo raro queda en null", () => {
    expect(limpiarMedicion({ red: "youtube" })).toBeNull();
    expect(limpiarMedicion(null)).toBeNull();
    const m = limpiarMedicion({ red: "TikTok", vistas: "81000", me_gusta: -3, mediana_autor: 1267, veces: 63.93, publicado: "2025-07-07", pais: "ar", control: "si" })!;
    expect(m).toMatchObject({ red: "tiktok", vistas: 81000, meGusta: null, medianaAutor: 1267, veces: 63.93, publicado: "2025-07-07", pais: "AR", control: false });
    expect(limpiarMedicion({ red: "instagram", publicado: "07/07/2025" })!.publicado).toBeNull();
  });

  it("viralDeFila: con medición es evidencia (veces); sin, «sin medir»; el control se marca", () => {
    const base = {
      id: "f1", url: "https://www.tiktok.com/@a/video/1", cuenta: "a", nicho: "Inmobiliaria", tipo: "recorrido", fuente: "estudio",
      autor: "x", postId: null, gancho: "Si trabajás en capital", notas: null, forma: null, respuestas: null,
      red: "tiktok", pais: "AR", vistas: 81000, meGusta: 900, comentarios: 10, compartidos: 400, guardados: 200,
      medianaAutor: 1267, veces: 63.93, publicado: "2025-07-07", texto: "4 ambientes", control: false, createdAt: new Date("2026-11-17T00:00:00Z"),
    };
    const v = viralDeFila(base as never);
    expect(v).toMatchObject({ nicho: "inmobiliaria", veces: 63.93, interaccion: 81000, normal: 1267, fecha: "2025-07-07", fuente: "estudio", red: "tiktok", control: false });
    const sin = viralDeFila({ ...base, veces: null, vistas: null, medianaAutor: null, publicado: null, fuente: "agente" } as never);
    expect(sin).toMatchObject({ veces: null, interaccion: null, normal: null, fecha: "2026-11-17", fuente: "agente" });
    expect(viralDeFila({ ...base, control: true, veces: 0.8 } as never).control).toBe(true);
  });
});
