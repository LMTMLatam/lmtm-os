// LMTM: Config (fase C1). Por ahora, la puerta a cada ajuste que ya existe;
// cada uno se muda a la app cuando se rehace.

import { ChevronRight } from "lucide-react";
import { Link } from "@/lib/router";
import { MAS } from "./Shell";
import { Encabezado } from "./Shell";
import { Tarjeta, TituloFranja } from "./HoyApp";

const AJUSTES = [
  { to: "/company/settings/integrations/ads", titulo: "Conexiones de pauta", detalle: "Meta Ads y Google Ads de cada cliente" },
  { to: "/whatsapp", titulo: "WhatsApp", detalle: "Grupos de clientes, avisos y bot" },
  { to: "/company/settings/access", titulo: "Equipo y accesos", detalle: "Quién entra y con qué permisos" },
  { to: "/readiness", titulo: "Preparación de clientes", detalle: "Qué le falta a cada cliente para operar solo" },
  { to: "/company/settings", titulo: "Empresa", detalle: "Datos generales" },
] as const;

export function ConfigApp() {
  return (
    <>
      <Encabezado titulo="Config" />
      <div className="grid max-w-[960px] gap-6 px-4 md:grid-cols-2 md:px-8">
        <Tarjeta>
          <TituloFranja>Ajustes</TituloFranja>
          <ul>
            {AJUSTES.map((a) => (
              <li key={a.to} className="border-b border-l-linea last:border-b-0">
                <Link to={a.to} className="flex items-center gap-3 py-3 text-inherit hover:text-l-marca">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium">{a.titulo}</span>
                    <span className="block text-[12px] text-l-tinta-3">{a.detalle}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-l-tinta-3" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Tarjeta>
        <Tarjeta>
          <TituloFranja>Pantallas que todavía no se mudaron</TituloFranja>
          <ul>
            {MAS.map((m) => (
              <li key={m.to} className="border-b border-l-linea last:border-b-0">
                <Link to={m.to} className="flex items-center gap-3 py-3 text-[14px] text-inherit hover:text-l-marca">
                  <span className="flex-1">{m.label}</span>
                  <ChevronRight className="h-4 w-4 text-l-tinta-3" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Tarjeta>
      </div>
    </>
  );
}
