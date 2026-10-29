import { describe, expect, it } from "vitest";
import { blueprintParaCliente } from "../make.js";

const plantilla = {
  name: "AutoPoster: Plantilla Clientes",
  flow: [
    { id: 1, module: "gateway:CustomWebHook", parameters: { hook: 715332, maxResults: 1 } },
    {
      id: 4,
      module: "builtin:BasicRouter",
      routes: [
        {
          flow: [
            {
              id: 7,
              module: "facebook-pages:CreatePostWithPhotos",
              parameters: { __IMTCONN__: 2558417 },
              mapper: { page_id: "636508449541659", message: "{{1.copy}}" },
              onerror: [{ id: 284, module: "clickup:postATaskComment", mapper: { comment_text: "{{7.error.message}}" } }],
            },
            { id: 9, module: "linkedin:CreateTextShare", mapper: { organization: "urn:li:organization:105437351" } },
            { id: 36, module: "pinterest:createPin", mapper: { board_id: "{{1.board}}" } },
          ],
        },
      ],
    },
  ],
};

describe("blueprintParaCliente — la copia para un cliente nuevo", () => {
  const copia = blueprintParaCliente(plantilla, 999, "Randstad");
  const ruta = copia.flow[1].routes![0].flow!;

  it("apunta al webhook del cliente y lleva su nombre", () => {
    expect(copia.flow[0].parameters).toEqual({ hook: 999, maxResults: 1 });
    expect(copia.name).toBe("Randstad");
  });

  it("no hereda la página ni la empresa de nadie", () => {
    expect(ruta[0].mapper!.page_id).toBe("");
    expect(ruta[1].mapper!.organization).toBe("");
  });

  it("no toca lo mapeado ni las conexiones", () => {
    expect(ruta[0].mapper!.message).toBe("{{1.copy}}");
    expect(ruta[0].parameters!.__IMTCONN__).toBe(2558417);
    expect(ruta[2].mapper!.board_id).toBe("{{1.board}}");
    expect(ruta[0].onerror![0].mapper!.comment_text).toBe("{{7.error.message}}");
  });

  it("no modifica la plantilla", () => {
    expect(plantilla.flow[0].parameters!.hook).toBe(715332);
    expect(plantilla.flow[1].routes![0].flow![0].mapper!.page_id).toBe("636508449541659");
  });
});
