// NAS por WebDAV: la respuesta del PROPFIND de QNAP y el freno de rutas.
import { describe, expect, it } from "vitest";
import { leerPropfind, rutaNas } from "../services/nas.js";

const XML = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">
<D:response><D:href>/LMTM/Clientes/RENO/</D:href><D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop></D:propstat></D:response>
<D:response><D:href>/LMTM/Clientes/RENO/Cocina%20Nueva/</D:href><D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype><D:getlastmodified>Mon, 02 Nov 2026 10:00:00 GMT</D:getlastmodified></D:prop></D:propstat></D:response>
<D:response><D:href>http://100.106.250.26:5000/LMTM/Clientes/RENO/C6132.MP4</D:href><D:propstat><D:prop><D:resourcetype/><D:getcontentlength>1534000000</D:getcontentlength></D:prop></D:propstat></D:response>
</D:multistatus>`;

describe("leerPropfind", () => {
  it("saca la carpeta pedida, decodifica nombres y pone carpetas primero", () => {
    const items = leerPropfind(XML, "/LMTM/Clientes/RENO/");
    expect(items.map((i) => i.nombre)).toEqual(["Cocina Nueva", "C6132.MP4"]);
    expect(items[0]).toMatchObject({ carpeta: true, mb: null, ruta: "/LMTM/Clientes/RENO/Cocina Nueva" });
    expect(items[1]).toMatchObject({ carpeta: false, mb: 1534, ruta: "/LMTM/Clientes/RENO/C6132.MP4" });
  });
  it("entiende el prefijo en minúscula", () => {
    const xml = `<d:multistatus xmlns:d="DAV:"><d:response><d:href>/LMTM/a.jpg</d:href><d:propstat><d:prop><d:getcontentlength>200000</d:getcontentlength></d:prop></d:propstat></d:response></d:multistatus>`;
    expect(leerPropfind(xml, "/LMTM")).toEqual([{ nombre: "a.jpg", ruta: "/LMTM/a.jpg", carpeta: false, mb: 0.2, modificado: null }]);
  });
});

describe("rutaNas", () => {
  it("normaliza y frena «..»", () => {
    expect(rutaNas("LMTM/Clientes")).toBe("/LMTM/Clientes");
    expect(rutaNas("\\LMTM\\x")).toBe("/LMTM/x");
    expect(rutaNas("/LMTM/../homes")).toBeNull();
    expect(rutaNas("")).toBeNull();
  });
});
