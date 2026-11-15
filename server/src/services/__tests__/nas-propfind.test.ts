import { describe, expect, it } from "vitest";
import { leerPropfind } from "../nas.js";

describe("leerPropfind", () => {
  it("decodifica las entidades XML del href (caso «Bis & Junín», 15/11)", () => {
    const xml = `<?xml version="1.0"?><D:multistatus xmlns:D="DAV:">
      <D:response><D:href>/LMTM/Clientes/Dunod/</D:href><D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop></D:propstat></D:response>
      <D:response><D:href>/LMTM/Clientes/Dunod/Bv.%20Avellaneda%20100%20Bis%20&amp;%20Jun%C3%ADn/</D:href><D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop></D:propstat></D:response>
      <D:response><D:href>/LMTM/Clientes/Dunod/a.mp4</D:href><D:propstat><D:prop><D:resourcetype/><D:getcontentlength>2000000</D:getcontentlength></D:prop></D:propstat></D:response>
    </D:multistatus>`;
    const items = leerPropfind(xml, "/LMTM/Clientes/Dunod");
    expect(items.map((i) => i.ruta)).toEqual(["/LMTM/Clientes/Dunod/Bv. Avellaneda 100 Bis & Junín", "/LMTM/Clientes/Dunod/a.mp4"]);
    expect(items[1]).toMatchObject({ carpeta: false, mb: 2 });
  });
});
