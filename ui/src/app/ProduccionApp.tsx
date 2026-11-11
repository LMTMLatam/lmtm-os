// LMTM: «Producción» (pedido 11/11: "una sección solo para eso, junto con
// contenido generado, que dentro de eso estén las pestañas"). Dos pestañas:
// Tipos de video (plantillas generales, por rubro y por cliente) y Contenido
// generado (lo que hizo el Productor, Higgsfield y Magnific).

import { NavLink } from "@/lib/router";
import { Encabezado } from "./Shell";
import { TiposDeVideo } from "./TiposDeVideo";

export const PESTANAS_PRODUCCION = [
  { to: "/produccion/tipos", label: "Tipos de video" },
  { to: "/produccion/generado", label: "Contenido generado" },
] as const;

export function PestanasProduccion() {
  return (
    <nav className="-mt-2 mb-5 flex gap-1 border-b border-l-linea px-4 md:px-8" aria-label="Producción">
      {PESTANAS_PRODUCCION.map((p) => (
        <NavLink
          key={p.to}
          to={p.to}
          className={({ isActive }) =>
            `-mb-px min-h-10 border-b-2 px-3 pt-2 text-[14px] ${isActive ? "border-l-marca font-semibold text-l-marca" : "border-transparent text-l-tinta-2 hover:text-l-tinta"}`
          }
        >
          {p.label}
        </NavLink>
      ))}
    </nav>
  );
}

export function TiposDeVideoApp() {
  return (
    <>
      <Encabezado titulo="Producción" bajada="Cómo se edita cada tipo de video, para todos, por rubro o para un cliente" />
      <PestanasProduccion />
      <div className="px-4 pb-10 md:px-8">
        <TiposDeVideo />
      </div>
    </>
  );
}
