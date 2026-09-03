// El criterio que estos tests protegen: dos salidas de la misma pieza en la
// misma red separadas por minutos son un duplicado; separadas por días son un
// repost a propósito y no hay que avisar nada.
import { describe, expect, it } from "vitest";
import { detectarEnGrupo, redDe } from "../publicaciones-duplicadas.js";

const t = (iso: string) => new Date(iso);

describe("redDe", () => {
  it("reconoce las dos redes", () => {
    expect(redDe("https://www.facebook.com/1658773249584677/posts/1724841976311137")).toBe("facebook");
    expect(redDe("https://www.instagram.com/p/DbmHq-WFAg6/")).toBe("instagram");
    expect(redDe("https://www.facebook.com/reel/928802502882810/")).toBe("facebook");
    expect(redDe("https://www.instagram.com/reel/Db4JTi-D-tc/")).toBe("instagram");
  });
  it("ignora lo que no reconoce", () => {
    expect(redDe(null)).toBeNull();
    expect(redDe("https://youtube.com/watch?v=x")).toBeNull();
  });
});

describe("detectarEnGrupo", () => {
  // El caso real de MAERS del 24/8: dos posteos DISTINTOS de Facebook, mismo
  // texto, mismo minuto.
  it("detecta el duplicado real de MAERS", () => {
    const r = detectarEnGrupo([
      { permalink: "https://www.facebook.com/1658773249584677/posts/1724841976311137", cuando: t("2026-08-24T23:00:10Z") },
      { permalink: "https://www.facebook.com/1658773249584677/posts/1724842049644463", cuando: t("2026-08-24T23:00:10Z") },
      { permalink: "https://www.instagram.com/p/AAA/", cuando: t("2026-08-24T23:00:11Z") },
      { permalink: "https://www.instagram.com/p/BBB/", cuando: t("2026-08-24T23:00:11Z") },
    ]);
    expect(r.map((x) => x.red).sort()).toEqual(["facebook", "instagram"]);
  });

  // Lo normal: la misma pieza sale una vez en cada red. No es duplicado.
  it("no marca un posteo que salió en Facebook y en Instagram", () => {
    expect(detectarEnGrupo([
      { permalink: "https://www.facebook.com/1658773249584677/posts/1704035068391828", cuando: t("2026-08-03T23:00:00Z") },
      { permalink: "https://www.instagram.com/p/DbmHq-WFAg6/", cuando: t("2026-08-03T23:00:01Z") },
    ])).toEqual([]);
  });

  // El copy evergreen de MAERS: mismo texto reusado durante semanas, a propósito.
  it("no marca un repost del mismo texto semanas después", () => {
    expect(detectarEnGrupo([
      { permalink: "https://www.facebook.com/x/posts/1", cuando: t("2026-07-02T23:01:00Z") },
      { permalink: "https://www.facebook.com/x/posts/2", cuando: t("2026-08-20T23:00:00Z") },
    ])).toEqual([]);
  });

  it("tampoco marca dos salidas del mismo día separadas por horas", () => {
    expect(detectarEnGrupo([
      { permalink: "https://www.facebook.com/x/posts/1", cuando: t("2026-08-24T13:00:00Z") },
      { permalink: "https://www.facebook.com/x/posts/2", cuando: t("2026-08-24T23:00:00Z") },
    ])).toEqual([]);
  });

  // Si el sync trajo la misma fila dos veces, es un problema nuestro, no del
  // cliente: no hay dos publicaciones, hay un permalink repetido.
  it("no marca el mismo permalink traído dos veces por el sync", () => {
    expect(detectarEnGrupo([
      { permalink: "https://www.facebook.com/x/posts/1", cuando: t("2026-08-24T23:00:00Z") },
      { permalink: "https://www.facebook.com/x/posts/1", cuando: t("2026-08-24T23:00:02Z") },
    ])).toEqual([]);
  });

  it("avisa una sola vez por red aunque haya salido tres veces", () => {
    const r = detectarEnGrupo([
      { permalink: "https://www.facebook.com/x/posts/1", cuando: t("2026-08-24T23:00:00Z") },
      { permalink: "https://www.facebook.com/x/posts/2", cuando: t("2026-08-24T23:00:01Z") },
      { permalink: "https://www.facebook.com/x/posts/3", cuando: t("2026-08-24T23:00:02Z") },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].enlaces).toHaveLength(2);
  });

  it("respeta la ventana que se le pase", () => {
    const salidas = [
      { permalink: "https://www.facebook.com/x/posts/1", cuando: t("2026-08-24T23:00:00Z") },
      { permalink: "https://www.facebook.com/x/posts/2", cuando: t("2026-08-24T23:30:00Z") },
    ];
    expect(detectarEnGrupo(salidas, 15)).toEqual([]);
    expect(detectarEnGrupo(salidas, 60)).toHaveLength(1);
  });
});
